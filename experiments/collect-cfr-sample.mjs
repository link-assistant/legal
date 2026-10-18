import { writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { CollectionStore, SourceClient } from '../src/legal/collector.js';
import { getSource } from '../src/legal/registry.js';
import { parseDocument } from '../src/legal/ingest.js';
const url =
  'https://www.govinfo.gov/bulkdata/CFR/2026/title-2/CFR-2026-title2-vol01.xml';
const source = getSource('us-govinfo');
const store = new CollectionStore('collections/govinfo-probe');
const fetched = await new SourceClient({
  store,
  timeoutMs: 30000,
  maxBytes: 8000000,
}).get(url, source);
const records = await parseDocument(
  fetched.bytes,
  {
    id: 'cfr-2026-title2-vol1',
    url,
    title: 'CFR Title 2 Volume 1 (2026)',
    language: 'en',
    format: 'xml',
  },
  source,
  fetched.contentType
);
const evidence = {
  url,
  rawHash: fetched.rawHash,
  retrievedAt: fetched.retrievedAt,
  rawBytes: fetched.bytes.length,
  sections: records.filter((record) => record.id.includes(':section:')).length,
  records: records.length,
  firstId: records[0]?.id,
  lastId: records.filter((record) => record.id.includes(':section:')).at(-1)
    ?.id,
};
await writeFile(
  'docs/case-studies/issue-1/data/cfr-sample.xml.gz',
  gzipSync(fetched.bytes)
);
await writeFile(
  'docs/case-studies/issue-1/data/cfr-sample.json',
  `${JSON.stringify(evidence, null, 2)}\n`
);
console.log(JSON.stringify(evidence, null, 2));
