import { describe, it, expect } from 'test-anywhere';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseDocument, discoverPage } from '../src/legal/ingest.js';
import {
  Collector,
  CollectionStore,
  SourceClient,
} from '../src/legal/collector.js';
import { getSource } from '../src/legal/registry.js';

const html =
  '<html><head><title>Test law</title></head><body><nav>Menu</nav><main><h2>Article 1</h2><p>Every person shall pay taxes.</p><h2>Article 2</h2><p>No person shall be tortured.</p></main></body></html>';
const source = {
  ...getSource('ge-matsne'),
  contentSelector: 'main',
  intervalMs: 0,
};
const entry = {
  id: 'act-1',
  title: 'Test law',
  url: 'https://matsne.gov.ge/en/document/view/1',
  language: 'en',
  sourceId: source.id,
  contentSelector: 'main',
};
const response = (body, status = 200, headers = {}) =>
  new Response(body, {
    status,
    headers: { 'content-type': 'text/html', ...headers },
  });

it('checks robots policy before following same-origin and allowed-origin redirects', async () => {
  const root = await mkdtemp(join(tmpdir(), 'legal-redirect-robots-'));
  try {
    for (const origin of [source.origin, 'https://www.matsne.gov.ge']) {
      const target = `${origin}/restricted/law`;
      const calls = [];
      const client = new SourceClient({
        store: new CollectionStore(root),
        retries: 0,
        fetchImpl: async (url) => {
          calls.push(url);
          return url.endsWith('/robots.txt')
            ? response('User-agent: *\nDisallow: /restricted/\n')
            : url === entry.url
              ? response('', 302, { location: target })
              : response(html);
        },
      });
      let message = '';
      try {
        await client.get(entry.url, source);
      } catch (error) {
        message = error.message;
      }
      expect(message.includes('robots.txt disallows')).toBe(true);
      expect(calls.includes(target)).toBe(false);
      expect(calls.includes(`${origin}/robots.txt`)).toBe(true);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

describe('official document adapters', () => {
  it('extracts only the configured law body and preserves paragraph boundaries', async () => {
    const records = await parseDocument(
      new TextEncoder().encode(html),
      entry,
      source,
      'text/html'
    );
    expect(records[0].text).toBe(
      'Article 1\nEvery person shall pay taxes.\nArticle 2\nNo person shall be tortured.'
    );
    expect(records[0].title).toBe('Test law');
  });
  it('rejects denial pages, JS shells, selector drift and HTML served as PDF', async () => {
    for (const [body, type] of [
      ['<h1>Access Denied</h1>', 'text/html'],
      ['<html><div id="app"></div></html>', 'text/html'],
      ['<main>unrelated content</main>', 'text/html'],
      [html, 'application/pdf'],
    ]) {
      let failed = false;
      try {
        await parseDocument(
          new TextEncoder().encode(body),
          entry,
          { ...source, contentSelector: '#law' },
          type
        );
      } catch {
        failed = true;
      }
      expect(failed).toBe(true);
    }
  });
  it('discovers individual USLM title archives and excludes all-title duplicates', () => {
    const page =
      '<a href="download/xml_uscAll@119-1.zip">All</a><a href="download/xml_usc01@119-1.zip">Title 1</a>';
    const result = discoverPage(
      page,
      getSource('us-code'),
      'https://uscode.house.gov/download.html'
    );
    expect(result.entries.length).toBe(1);
    expect(result.entries[0].url).toBe(
      'https://uscode.house.gov/download/xml_usc01@119-1.zip'
    );
  });
  it('keeps India Code pagination and language links explicit', () => {
    const page =
      '<table><tr><td>Act</td><td><a href="/handle/123456789/1?view_type=browse">Test Act</a></td></tr></table><a rel="next" href="?start=100">Next</a>';
    const result = discoverPage(
      page,
      getSource('in-code'),
      'https://www.indiacode.nic.in/simple-search?start=0'
    );
    expect(result.entries[0].id).toBe('in-code:1');
    expect(new URL(result.next).searchParams.get('start')).toBe('100');
  });
  it('extracts the text of structured law sections', async () => {
    const xml =
      '<uscDoc><main><section identifier="/us/usc/t1/s1"><num>§ 1.</num><heading>Words</heading><content><p>Words include the plural.</p></content></section></main></uscDoc>';
    const records = await parseDocument(
      new TextEncoder().encode(xml),
      { ...entry, format: 'xml' },
      getSource('us-code'),
      'application/xml'
    );
    expect(records[0].text.includes('Words include the plural.')).toBe(true);
    expect(records[0].text.includes('uscDoc')).toBe(false);
  });
});

describe('bounded collection and persistent evidence', () => {
  it('checks robots before following an allowed-origin redirect', async () => {
    const root = await mkdtemp(join(tmpdir(), 'legal-redirect-robots-'));
    const requests = [];
    const client = new SourceClient({
      store: new CollectionStore(root),
      sleep: async () => {},
      retries: 0,
      fetchImpl: async (url) => {
        requests.push(url);
        if (url.endsWith('/robots.txt')) {
          return response('User-agent: *\nDisallow: /private');
        }
        return url.endsWith('/private')
          ? response(html)
          : response('', 302, { location: '/private' });
      },
    });
    try {
      let message = '';
      try {
        await client.get(entry.url, source);
      } catch (error) {
        message = error.message;
      }
      expect(message.includes('robots.txt disallows')).toBe(true);
      expect(requests.some((url) => url.endsWith('/private'))).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it('deduplicates unchanged content, keeps historical versions and resumes after failure', async () => {
    const root = await mkdtemp(join(tmpdir(), 'legal-collect-'));
    try {
      const store = new CollectionStore(root);
      let content = html;
      const client = new SourceClient({
        store,
        fetchImpl: async () => response(content),
        respectRobots: false,
        retries: 0,
      });
      const collector = new Collector({ store, client });
      const manifest = { schemaVersion: 1, entries: [entry] };
      expect((await collector.collect(manifest)).collected).toBe(1);
      expect((await collector.collect(manifest)).unchanged).toBe(1);
      content = html.replace('pay taxes', 'pay lawful taxes');
      expect((await collector.collect(manifest)).collected).toBe(1);
      const corpus = await store.corpus();
      expect(corpus.laws.length).toBe(1);
      expect((await store.versions(entry.id, 'en')).length).toBe(2);
      expect(corpus.laws[0].text.includes('lawful taxes')).toBe(true);
      expect(
        (await readFile(join(root, 'raw', `${corpus.laws[0].rawHash}.bin`)))
          .length > 0
      ).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it('retries transient responses, respects conditional fetches and rejects off-source redirects', async () => {
    const root = await mkdtemp(join(tmpdir(), 'legal-http-'));
    try {
      const store = new CollectionStore(root);
      let count = 0;
      const client = new SourceClient({
        store,
        respectRobots: false,
        retries: 1,
        sleep: async () => {},
        fetchImpl: async (_url, options) => {
          count++;
          if (count === 1) {
            return response('', 503);
          }
          if (count === 2) {
            return response(html, 200, { etag: 'v1' });
          }
          expect(options.headers['if-none-match']).toBe('v1');
          return response(null, 304);
        },
      });
      await client.get(entry.url, source);
      expect((await client.get(entry.url, source)).fromCache).toBe(true);
      expect(count).toBe(3);
      const redirect = new SourceClient({
        store,
        respectRobots: false,
        retries: 0,
        fetchImpl: async () =>
          response('', 302, { location: 'http://127.0.0.1/private' }),
      });
      let failed = false;
      try {
        await redirect.get(entry.url, source);
      } catch {
        failed = true;
      }
      expect(failed).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it('returns partial failure and retains prior laws when new content is blocked', async () => {
    const root = await mkdtemp(join(tmpdir(), 'legal-failure-'));
    try {
      const store = new CollectionStore(root);
      const client = new SourceClient({
        store,
        respectRobots: false,
        retries: 0,
        fetchImpl: async () => response('<h1>Access Denied</h1>'),
      });
      const result = await new Collector({ store, client }).collect({
        schemaVersion: 1,
        entries: [entry],
      });
      expect(result.status).toBe('partial');
      expect(result.errors.length).toBe(1);
      expect((await store.corpus()).laws).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

it('converts India Code section links into text API entries and refuses act metadata as law', async () => {
  const { linkedDocumentResources } = await import('../src/legal/ingest.js');
  const source = getSource('in-code');
  const entry = {
    id: 'in-act',
    url: 'https://www.indiacode.nic.in/handle/123456789/1',
    language: 'en',
  };
  const links = linkedDocumentResources(
    '<a href="/show-data?actid=AC_TEST&amp;sectionId=42&amp;sectionno=1">Section 1</a>',
    entry,
    source
  );
  expect(new URL(links[0].url).pathname).toBe('/SectionPageContent');
  expect(links[0].format).toBe('json');
  let failed = false;
  try {
    await parseDocument(
      new TextEncoder().encode(
        '<main id="content">Act metadata only, not the operative text of this legislation.</main>'
      ),
      entry,
      source,
      'text/html'
    );
  } catch {
    failed = true;
  }
  expect(failed).toBe(true);
});
