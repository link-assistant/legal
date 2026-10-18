import { mkdir, writeFile } from 'node:fs/promises';
import { CollectionStore, SourceClient } from '../src/legal/collector.js';
import { discoverPage } from '../src/legal/ingest.js';
import { getSource } from '../src/legal/registry.js';

// One robots request and at most three small catalog pages; never a bulk crawl.
const source = getSource('us-govinfo');
await mkdir('experiments/official/govinfo', { recursive: true });
const client = new SourceClient({
  store: new CollectionStore('experiments/official/govinfo/store'),
  maxBytes: 1000000,
  retries: 0,
  timeoutMs: 25000,
});
async function get(url) {
  return (await client.get(url, source)).bytes;
}
let url = source.catalogUrl;
for (let page = 0; page < 3; page++) {
  const bytes = await get(url);
  if (page === 0) {
    const policy = client.robots.get(source.origin);
    if (typeof policy !== 'string') {
      throw new Error('Missing verified publisher policy');
    }
    await writeFile('experiments/official/govinfo/robots.txt', policy);
  }
  await writeFile(`experiments/official/govinfo/catalog-${page}.html`, bytes);
  console.log(JSON.stringify({ url, bytes: bytes.length }));
  const result = discoverPage(new TextDecoder().decode(bytes), source, url);
  console.log(JSON.stringify(result));
  const directory = result.resources.find((item) => item.kind === 'directory');
  if (!directory) {
    break;
  }
  url = directory.url;
}

// One finite older CFR volume validates extraction. Inspect the embedded
// revision date: a year in a URL alone does not establish its legal edition.
const sampleUrl = `${source.origin}/bulkdata/CFR/2025/title-1/CFR-2025-title1-vol1.xml`;
const sample = await get(sampleUrl);
await writeFile('experiments/official/govinfo/sample.xml', sample);
console.log(JSON.stringify({ sampleUrl, bytes: sample.length }));
