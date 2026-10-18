import { readFile, writeFile, stat } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { hashContent } from '../src/legal/model.js';

const root = 'docs/case-studies/issue-1/data';
const origin = 'https://www.govinfo.gov';
const samples = [
  ['robots.txt', 'govinfo-robots.txt.gz', `${origin}/robots.txt`],
  ['catalog-0.html', 'govinfo-cfr-catalog.html.gz', `${origin}/bulkdata/CFR`],
  ['catalog-1.html', 'govinfo-cfr-year.html.gz', `${origin}/bulkdata/CFR/2026`],
  [
    'catalog-2.html',
    'govinfo-cfr-title.html.gz',
    `${origin}/bulkdata/CFR/2026/title-16`,
  ],
  [
    'sample.xml',
    'govinfo-cfr-sample.xml.gz',
    `${origin}/bulkdata/CFR/2025/title-1/CFR-2025-title1-vol1.xml`,
  ],
];
const evidence = [];
for (const [input, output, url] of samples) {
  const path = `experiments/official/govinfo/${input}`;
  const bytes = await readFile(path);
  await writeFile(`${root}/${output}`, gzipSync(bytes));
  evidence.push({
    url,
    path: output,
    bytes: bytes.length,
    sha256: hashContent(bytes),
    acquiredAt: (await stat(path)).mtime.toISOString(),
    timestampBasis: 'local acquisition file modification time',
  });
}
await writeFile(
  `${root}/govinfo-evidence.json`,
  `${JSON.stringify(evidence, null, 2)}\n`
);
for (const name of [
  'govinfo-xml-before',
  'govinfo-schedule-before',
  'govinfo-schedule-after',
  'govinfo-tests-before',
]) {
  await writeFile(
    `${root}/logs/${name}.log.gz`,
    gzipSync(await readFile(`ci-logs/${name}.log`))
  );
}
