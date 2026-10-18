import {
  mkdir,
  readFile,
  writeFile,
  rename,
  readdir,
  rm,
} from 'node:fs/promises';
import { join } from 'node:path';
import { hashContent, normalizeLaw, officialUrl } from './model.js';
import {
  parseDocument,
  discoverPage,
  catalogUrl,
  linkedDocumentResources,
} from './ingest.js';
import { getSource, buildCoverage } from './registry.js';

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export async function atomicJson(path, value) {
  const temp = `${path}.${process.pid}.${hashContent(String(Math.random())).slice(0, 8)}.tmp`;
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temp, path);
}
async function jsonFile(path, fallback) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') {
      return fallback;
    }
    throw error;
  }
}
export class CollectionStore {
  constructor(root) {
    this.root = root;
  }
  async init() {
    await Promise.all(
      ['raw', 'http', 'laws', 'runs'].map((name) =>
        mkdir(join(this.root, name), { recursive: true })
      )
    );
  }
  async putRaw(bytes) {
    await this.init();
    const hash = hashContent(bytes);
    await writeFile(join(this.root, 'raw', `${hash}.bin`), bytes);
    return hash;
  }
  async raw(hash) {
    if (!/^[a-f0-9]{64}$/.test(hash)) {
      throw new Error('Invalid raw evidence hash');
    }
    const bytes = new Uint8Array(
      await readFile(join(this.root, 'raw', `${hash}.bin`))
    );
    if (hashContent(bytes) !== hash) {
      throw new Error('Raw evidence checksum mismatch');
    }
    return bytes;
  }
  async cache(url, value) {
    await this.init();
    const path = join(this.root, 'http', `${hashContent(url)}.json`);
    if (value !== undefined) {
      await atomicJson(path, value);
    }
    return jsonFile(path, null);
  }
  async put(law) {
    await this.init();
    const key = hashContent(`${law.id}\0${law.language}`);
    const path = join(this.root, 'laws', `${key}.json`);
    const saved = await jsonFile(path, { versions: [] });
    const version = hashContent(
      JSON.stringify([
        law.contentHash,
        law.sourceVersion,
        law.effectiveFrom,
        law.effectiveTo,
        law.title,
        law.status,
      ])
    );
    const unchanged = saved.versions.some(
      (record) => record.version === version
    );
    if (!unchanged) {
      saved.versions.push({ version, law });
    }
    saved.current = law;
    await atomicJson(path, saved);
    return { unchanged };
  }
  async versions(id, language) {
    return (
      await jsonFile(
        join(this.root, 'laws', `${hashContent(`${id}\0${language}`)}.json`),
        { versions: [] }
      )
    ).versions;
  }
  async corpus() {
    await this.init();
    const laws = [];
    for (const name of (await readdir(join(this.root, 'laws')))
      .filter((file) => file.endsWith('.json'))
      .sort()) {
      const record = await jsonFile(join(this.root, 'laws', name), null);
      laws.push(record.current);
    }
    return {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      laws,
      coverage: buildCoverage(laws),
    };
  }
  async lock() {
    await this.init();
    try {
      await mkdir(join(this.root, '.collection-lock'));
    } catch (error) {
      if (error.code === 'EEXIST') {
        throw new Error(
          'Another collection is running; remove stale .collection-lock only after verifying no collector is active'
        );
      }
      throw error;
    }
  }
  async unlock() {
    await rm(join(this.root, '.collection-lock'), {
      recursive: true,
      force: true,
    });
  }
}
function allowedUrl(url, source) {
  const value = new URL(officialUrl(url));
  if (
    ![source.origin, ...(source.allowedOrigins ?? [])].includes(value.origin)
  ) {
    throw new Error(
      `URL is outside the official source allowlist: ${value.origin}`
    );
  }
  return value.href;
}
export function robotsAllowed(text, url, userAgent = 'LegalAssistant') {
  const groups = [];
  let current = null;
  for (const line of text.split(/\r?\n/)) {
    const parts = line
      .replace(/#.*$/, '')
      .match(/^\s*([\w-]+)\s*:\s*(.*?)\s*$/);
    if (!parts) {
      continue;
    }
    const key = parts[1].toLowerCase(),
      value = parts[2];
    if (key === 'user-agent') {
      if (!current || current.rules.length) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
    } else if (current && ['allow', 'disallow'].includes(key) && value) {
      current.rules.push({ allow: key === 'allow', path: value });
    }
  }
  const agent = userAgent.toLowerCase();
  const specific = groups.filter((group) =>
    group.agents.some((name) => name !== '*' && agent.includes(name))
  );
  const selected = specific.length
    ? specific
    : groups.filter((group) => group.agents.includes('*'));
  const path = new URL(url).pathname + new URL(url).search;
  const rules = selected
    .flatMap((group) => group.rules)
    .filter((rule) => {
      const expression = rule.path
        .split('*')
        .map((part) => part.replace(/[.+?^{}()|[\]\\]/g, '\\$&'))
        .join('.*')
        .replace(/\$$/, '$');
      return new RegExp(`^${expression}`).test(path);
    })
    .sort(
      (a, b) =>
        b.path.length - a.path.length || Number(b.allow) - Number(a.allow)
    );
  return rules[0]?.allow ?? true;
}
export class SourceClient {
  constructor({
    store,
    fetchImpl = globalThis.fetch,
    respectRobots = true,
    retries = 2,
    sleep = pause,
    maxBytes = 32_000_000,
    timeoutMs = 30000,
    debug = () => {},
  }) {
    Object.assign(this, {
      store,
      fetchImpl,
      respectRobots,
      retries,
      sleep,
      maxBytes,
      timeoutMs,
      debug,
    });
    this.lastRequest = new Map();
    this.robots = new Map();
  }
  async get(url, source) {
    await this.checkRobots(url, source);
    return this.request(url, source);
  }
  async postJson(url, value, source) {
    await this.checkRobots(url, source);
    return this.request(url, source, {
      method: 'POST',
      body: JSON.stringify(value),
    });
  }
  async checkRobots(url, source) {
    allowedUrl(url, source);
    if (this.respectRobots && !new URL(url).pathname.endsWith('/robots.txt')) {
      const origin = new URL(url).origin;
      if (!this.robots.has(origin)) {
        const robots = await this.request(`${origin}/robots.txt`, source, {
          robots: true,
        });
        this.robots.set(origin, new TextDecoder().decode(robots.bytes));
      }
      if (!robotsAllowed(this.robots.get(origin), url)) {
        throw new Error(`robots.txt disallows collection: ${url}`);
      }
    }
  }
  async request(url, source, { robots = false, method = 'GET', body } = {}) {
    let current = allowedUrl(url, source);
    const key = method === 'GET' ? url : `${method}\n${url}\n${body}`;
    const cached = await this.store.cache(key);
    for (let redirect = 0; redirect < 6; redirect++) {
      const result = await this.attempt(
        current,
        source,
        method === 'GET' ? cached : null,
        robots,
        { method, body }
      );
      if (result.redirect) {
        if (method !== 'GET') {
          throw new Error(
            'POST catalog redirects require explicit endpoint verification'
          );
        }
        const target = new URL(result.redirect, current);
        if (
          target.protocol === 'http:' &&
          current.startsWith('https:') &&
          target.hostname === new URL(current).hostname
        ) {
          target.protocol = 'https:';
        }
        current = allowedUrl(target.href, source);
        if (!robots) {
          await this.checkRobots(current, source);
        }
        continue;
      }
      if (result.status === 304) {
        if (!cached) {
          throw new Error('Source returned 304 without cached evidence');
        }
        return {
          ...cached,
          bytes: await this.store.raw(cached.rawHash),
          fromCache: true,
        };
      }
      const rawHash = await this.store.putRaw(result.bytes);
      const value = {
        url,
        finalUrl: current,
        rawHash,
        contentType: result.contentType,
        etag: result.etag,
        lastModified: result.lastModified,
        retrievedAt: new Date().toISOString(),
      };
      await this.store.cache(key, value);
      return { ...value, bytes: result.bytes, fromCache: false };
    }
    throw new Error('Official source redirect limit exceeded');
  }
  async throttle(url, source) {
    const origin = new URL(url).origin;
    const delay = Math.max(
      0,
      (this.lastRequest.get(origin) ?? 0) +
        (source.intervalMs ?? 1500) -
        Date.now()
    );
    if (delay) {
      await this.sleep(delay);
    }
    this.lastRequest.set(origin, Date.now());
  }
  async attempt(url, source, cached, robots, options) {
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      await this.throttle(url, source);
      const headers = requestHeaders(cached, options.body);
      this.debug({ event: 'request', url, attempt });
      try {
        const response = await this.fetchImpl(url, {
          redirect: 'manual',
          headers,
          ...options,
          signal: AbortSignal.timeout(this.timeoutMs),
        });
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          await response.body?.cancel();
          return { redirect: response.headers.get('location') };
        }
        if (response.status === 304) {
          return { status: 304 };
        }
        if (robots && response.status === 404) {
          return { bytes: new Uint8Array(), contentType: 'text/plain' };
        }
        if (
          [429, 500, 502, 503, 504].includes(response.status) &&
          attempt < this.retries
        ) {
          const wait = retryDelay(response, attempt);
          await response.body?.cancel();
          await this.sleep(
            Math.min(60000, Math.max(0, Number.isFinite(wait) ? wait : 1000))
          );
          continue;
        }
        if (!response.ok) {
          await response.body?.cancel();
          throw new Error(`HTTP ${response.status}: ${url}`);
        }
        return readResponse(response, this.maxBytes);
      } catch (error) {
        // HTTP denials, data budgets and schema failures must not be retried as transport errors.
        if (terminalError(error, attempt, this.retries)) {
          throw error;
        }
        await this.sleep(1000 * 2 ** attempt);
      }
    }
    throw new Error('Source retry budget exhausted');
  }
}
export class Collector {
  constructor({ store, client, debug = () => {} }) {
    Object.assign(this, { store, client, debug });
  }
  async collect(manifest, { maxDocuments = 100 } = {}) {
    if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.entries)) {
      throw new Error('Expected schemaVersion 1 source manifest with entries');
    }
    if (!Number.isInteger(maxDocuments) || maxDocuments < 1) {
      throw new Error('maxDocuments must be a positive integer');
    }
    await this.store.lock();
    const result = {
      startedAt: new Date().toISOString(),
      status: 'success',
      collected: 0,
      unchanged: 0,
      errors: [],
      remaining: Math.max(0, manifest.entries.length - maxDocuments),
    };
    try {
      for (const entry of manifest.entries.slice(0, maxDocuments)) {
        try {
          const source = getSource(entry.sourceId);
          const expanded = await this.entriesFor(entry, source);
          for (const part of expanded) {
            await this.collectEntry(part, source, result);
          }
        } catch (error) {
          result.errors.push({
            id: entry.id,
            url: entry.url,
            error: error.message,
          });
          this.debug({
            event: 'collection-error',
            id: entry.id,
            error: error.message,
          });
        }
      }
      if (result.errors.length || result.remaining) {
        result.status = 'partial';
      }
      result.completedAt = new Date().toISOString();
      await atomicJson(
        join(this.store.root, 'runs', `${hashContent(result.startedAt)}.json`),
        result
      );
      await atomicJson(
        join(this.store.root, 'corpus.json'),
        await this.store.corpus()
      );
      return result;
    } finally {
      await this.store.unlock();
    }
  }
  async entriesFor(entry, source) {
    if (
      source.adapter !== 'indiacode' ||
      !new URL(entry.url).pathname.startsWith('/handle/')
    ) {
      return [entry];
    }
    const fetched = await this.client.get(entry.url, source);
    const parts = linkedDocumentResources(
      new TextDecoder().decode(fetched.bytes),
      entry,
      source
    );
    if (!parts.length) {
      throw new Error(
        'India Code act has no downloadable sections or PDFs; metadata rejected'
      );
    }
    if (parts.length > 2000) {
      throw new Error('Act exceeds 2000 section resource budget');
    }
    return parts;
  }
  async collectEntry(entry, source, result) {
    const fetched = await this.client.get(entry.url, source);
    const records = await parseDocument(
      fetched.bytes,
      entry,
      source,
      fetched.contentType
    );
    for (const record of records) {
      const law = normalizeLaw({
        ...record,
        jurisdiction: source.jurisdiction,
        retrievedAt: fetched.retrievedAt,
        rawHash: fetched.rawHash,
      });
      const saved = await this.store.put(law);
      result[saved.unchanged ? 'unchanged' : 'collected']++;
    }
  }
  async discover(sourceId, options = {}) {
    const maxPages = options.maxPages ?? 2;
    if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 10000) {
      throw new Error('maxPages must be between 1 and 10000');
    }
    const source = getSource(sourceId);
    return await (source.adapter === 'directory'
      ? discoverDirectory(this.client, source, { ...options, maxPages })
      : discoverCatalog(this.client, source, { ...options, maxPages }));
  }
}
async function discoverCatalog(
  client,
  source,
  { maxPages, pageSize = 100, languages, startPage = 0, startUrl = null }
) {
  const entries = [];
  const errors = [];
  const resources = [];
  let next = startUrl;
  let page = startPage;
  const seen = new Set();
  for (let count = 0; count < maxPages; count++, page++) {
    const url =
      next && next !== 'generated'
        ? next
        : catalogUrl(source, { page, languages, pageSize });
    if (seen.has(url)) {
      errors.push({ url, error: 'Discovery pagination cycle' });
      break;
    }
    seen.add(url);
    try {
      const fetched = await fetchCatalog(client, source, url, page, pageSize);
      const result = discoverPage(
        new TextDecoder().decode(fetched.bytes),
        source,
        url,
        { languages, pageSize }
      );
      entries.push(...result.entries);
      resources.push(...result.resources);
      next = result.next;
      if (!next) {
        break;
      }
    } catch (error) {
      errors.push({ url, error: error.message });
      next = url;
      break;
    }
  }
  return discoveryResult({
    sourceId: source.id,
    entries,
    resources,
    errors,
    next,
    page,
  });
}

function npcCatalogBody(page, pageSize) {
  return {
    searchRange: 1,
    sxrq: [],
    gbrq: [],
    searchType: 2,
    sxx: [],
    gbrqYear: [],
    flfgCodeId: [],
    zdjgCodeId: [],
    searchContent: '',
    orderByParam: { order: '-1', sort: '' },
    pageNum: page + 1,
    pageSize,
  };
}

function fetchCatalog(client, source, url, page, pageSize) {
  return source.adapter === 'npc'
    ? client.postJson(source.catalogUrl, npcCatalogBody(page, pageSize), source)
    : client.get(url, source);
}
function requestHeaders(cached, body) {
  const headers = {
    'user-agent':
      'LegalAssistant/0.1 (+https://github.com/link-assistant/legal)',
    accept:
      'application/xml,application/json,text/html,application/pdf;q=0.9,*/*;q=0.1',
  };
  if (body !== undefined) {
    headers['content-type'] = 'application/json';
  }
  if (cached?.etag) {
    headers['if-none-match'] = cached.etag;
  }
  if (cached?.lastModified) {
    headers['if-modified-since'] = cached.lastModified;
  }

  return headers;
}

async function readResponse(response, maxBytes) {
  const length = Number(response.headers.get('content-length'));
  if (length > maxBytes) {
    await response.body?.cancel();
    throw new Error('Official response exceeds download budget');
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body ?? []) {
    size += chunk.length;
    if (size > maxBytes) {
      throw new Error('Official response exceeds download budget');
    }
    chunks.push(chunk);
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.length;
  }
  return {
    bytes,
    status: response.status,
    contentType: response.headers.get('content-type') ?? '',
    etag: response.headers.get('etag'),
    lastModified: response.headers.get('last-modified'),
  };
}

function retryDelay(response, attempt) {
  const retry = response.headers.get('retry-after');
  return retry && /^\d+$/.test(retry)
    ? Number(retry) * 1000
    : retry
      ? Date.parse(retry) - Date.now()
      : 1000 * 2 ** attempt;
}

function discoveryResult({ sourceId, entries, resources, errors, next, page }) {
  return {
    schemaVersion: 1,
    sourceId,
    entries: [
      ...new Map(
        entries.map((entry) => [`${entry.id}:${entry.language}`, entry])
      ).values(),
    ],
    resources,
    errors,
    status:
      errors.length || next || resources.length
        ? 'partial'
        : 'catalog-exhausted',
    nextPage: next ? page : null,
    nextUrl: next,
    complete: false,
  };
}

function terminalError(error, attempt, retries) {
  return attempt === retries || /HTTP |budget/.test(error.message);
}

// Breadth-first publisher directory traversal with a serializable run cursor.
async function discoverDirectory(
  client,
  source,
  { maxPages, startUrl, cursor }
) {
  const pending = [...(cursor?.pending ?? [startUrl ?? source.catalogUrl])];
  const visited = new Set(cursor?.visited ?? []);
  const entries = [],
    errors = [],
    resources = [];
  for (let count = 0; count < maxPages && pending.length; count++) {
    const url = pending.shift();
    if (visited.has(url)) {
      count--;
      continue;
    }
    try {
      allowedUrl(url, source);
      const result = discoverPage(
        new TextDecoder().decode((await client.get(url, source)).bytes),
        source,
        url
      );
      entries.push(...result.entries);
      appendDirectoryResources(pending, visited, resources, result.resources);
      visited.add(url);
      if (pending.length + visited.size > 10000) {
        throw new Error('Directory discovery exceeds 10000 path budget');
      }
    } catch (error) {
      if (!visited.has(url)) {
        pending.unshift(url);
      }
      errors.push({ url, error: error.message });
      break;
    }
  }
  return {
    ...discoveryResult({
      sourceId: source.id,
      entries,
      resources,
      errors,
      next: pending[0] ?? null,
      page: visited.size,
    }),
    cursor: { pending, visited: [...visited] },
  };
}

function appendDirectoryResources(pending, visited, resources, discovered) {
  for (const resource of discovered) {
    if (resource.kind === 'directory') {
      if (!visited.has(resource.url) && !pending.includes(resource.url)) {
        pending.push(resource.url);
      }
    } else {
      resources.push(resource);
    }
  }
}
