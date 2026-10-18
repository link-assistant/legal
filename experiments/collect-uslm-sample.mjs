// One catalog and one small title archive; robots, pacing and byte limits apply.
import { writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { CollectionStore, SourceClient } from '../src/legal/collector.js';
import { getSource } from '../src/legal/registry.js';
import { discoverPage, parseDocument } from '../src/legal/ingest.js';

const source = getSource('us-code');
const store = new CollectionStore('collections/uslm-probe');
const client = new SourceClient({
  store,
  retries: 0,
  timeoutMs: 30000,
  maxBytes: 8000000,
  debug: (event) => console.log(JSON.stringify(event)),
});
const catalog = await client.get(source.catalogUrl, source);
const discovery = discoverPage(
  new TextDecoder().decode(catalog.bytes),
  source,
  source.catalogUrl
);
const entry = discovery.entries.find((item) => /xml_usc0?1@/.test(item.url));
if (!entry) {
  throw new Error('Official catalog did not expose Title 1');
}
const fetched = await client.get(entry.url, source);
const records = await parseDocument(fetched.bytes, entry, source);
const evidence = {
  entry,
  url: fetched.url,
  rawHash: fetched.rawHash,
  retrievedAt: fetched.retrievedAt,
  rawBytes: fetched.bytes.length,
  records: records.length,
  context: records.filter((record) => record.id.endsWith(':context')).length,
  firstId: records[0]?.id,
  lastId: records.at(-1)?.id,
};
const path = 'docs/case-studies/issue-1/data/uslm-sample';
await writeFile(`${path}.zip`, fetched.bytes);
await writeFile(`${path}-catalog.html.gz`, gzipSync(catalog.bytes));
await writeFile(`${path}.json`, `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify(evidence, null, 2));
