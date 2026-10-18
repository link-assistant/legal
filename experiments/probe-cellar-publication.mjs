import { mkdir, writeFile } from 'node:fs/promises';
import { CollectionStore, SourceClient } from '../src/legal/collector.js';
import { getSource } from '../src/legal/registry.js';
import { parseDocument } from '../src/legal/ingest.js';

// One publication, one language and one media type. The ordinary source client
// enforces robots policies, delays, redirect origins and finite response budgets.
const root = 'collections/cellar-publication-probe';
const url =
  'https://publications.europa.eu/resource/celex/32016R0679?language=eng';
const source = getSource('eu-cellar');
const requests = [];
const client = new SourceClient({
  store: new CollectionStore(root),
  retries: 0,
  maxBytes: 8_000_000,
  timeoutMs: 30000,
  fetchImpl: (address, options) => {
    const headers = new globalThis.Headers(options.headers);
    if (!new URL(address).pathname.endsWith('/robots.txt')) {
      headers.set('Accept', 'application/xhtml+xml');
      headers.set('Accept-Language', 'eng');
    }
    requests.push({ url: address, accept: headers.get('Accept') });
    return fetch(address, { ...options, headers });
  },
});
const evidence = {
  documentation: 'https://op.europa.eu/en/web/cellar/cellar-data/publications',
  url,
  acquiredAt: new Date().toISOString(),
  requests,
};
await mkdir(root, { recursive: true });
try {
  const result = await client.get(url, source);
  Object.assign(evidence, {
    finalUrl: result.finalUrl,
    rawHash: result.rawHash,
    bytes: result.bytes.length,
    contentType: result.contentType,
  });
  const laws = await parseDocument(
    result.bytes,
    { id: 'cellar-media-probe', language: 'en', title: 'GDPR', url },
    source,
    result.contentType
  );
  evidence.extracted = laws.map(({ text }) => ({
    characters: text.length,
    beginning: text.slice(0, 100),
  }));
} catch (error) {
  evidence.error = error.message;
}
await writeFile(
  `${root}/result.json`,
  `${JSON.stringify(evidence, null, 2)}\n`
);
console.log(JSON.stringify(evidence));
