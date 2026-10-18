import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { parseDocument } from '../src/legal/ingest.js';
import { getSource, buildCoverage } from '../src/legal/registry.js';
import { normalizeLaw, hashContent } from '../src/legal/model.js';
const samples = [
  [
    'us-constitution',
    'us-archives',
    'us-constitution-original',
    'en',
    'Constitution of the United States (original transcription)',
    'https://www.archives.gov/founding-docs/constitution-transcript',
    'Original 1787 text with amendment references; not a consolidated current constitution',
  ],
  [
    'cn-constitution',
    'cn-npc',
    'cn-constitution-2014-en',
    'en',
    'Constitution of the People’s Republic of China (2014 English publication)',
    'https://english.www.gov.cn/archive/laws_regulations/2014/08/23/content_281474982987458.htm',
    'Historical government English publication; predates the 2018 amendments',
  ],
  [
    'cn-zh',
    'cn-npc',
    'cn-constitution-2018-zh',
    'zh',
    '中华人民共和国宪法（2018）',
    'https://www.gov.cn/guoqing/2018-03/22/content_5276318.htm',
    '2018 government publication; legal currency unverified',
  ],
  [
    'ge',
    'ge-matsne',
    'ge-constitution-en',
    'en',
    'Constitution of Georgia (official English translation)',
    'https://matsne.gov.ge/en/document/view/30346',
    'Matsne English translation; verify consolidation edition against Georgian original',
  ],
];
await mkdir('data/demo/raw', { recursive: true });
const laws = [];
const evidence = [];
for (const [file, sourceId, id, language, title, url, scope] of samples) {
  const bytes = new Uint8Array(
    await readFile(`experiments/official/${file}.raw`)
  );
  const rawHash = hashContent(bytes);
  const source = getSource(sourceId);
  const entry = {
    id,
    sourceId,
    language,
    title,
    url,
    scope,
    translation: language === 'en' && sourceId !== 'us-archives',
  };
  const parsed = await parseDocument(bytes, entry, source, 'text/html');
  const law = normalizeLaw({
    ...parsed[0],
    jurisdiction: source.jurisdiction,
    retrievedAt: '2026-10-18T14:20:00.000Z',
    rawHash,
  });
  // Keep a finite sample of genuine source text. Exact normalized offsets start
  // at zero in the complete parsed document and remain reproducible from raw.
  law.text = law.text.slice(0, Math.min(law.text.length, 18000));
  const record = normalizeLaw(law);
  laws.push(record);
  const path = `raw/${rawHash}.html.gz`;
  await writeFile(`data/demo/${path}`, gzipSync(bytes, { mtime: 0 }));
  evidence.push({
    ...entry,
    rawHash,
    rawPath: path,
    format: 'html',
    sampleCharacters: record.text.length,
    fullTextCharacters: parsed[0].text.length,
    selection: 'First 18000 normalized characters; explicitly incomplete',
    retrievedAt: record.retrievedAt,
  });
  console.log(
    id,
    record.text.length,
    record.sections.length,
    record.contentHash
  );
}
const corpus = {
  schemaVersion: 1,
  generatedAt: '2026-10-18T14:20:00.000Z',
  laws,
  coverage: buildCoverage(laws),
};
await writeFile(
  'data/demo/corpus.json',
  `${JSON.stringify(corpus, null, 2)}\n`
);
await writeFile(
  'data/demo/manifest.json',
  `${JSON.stringify(
    {
      schemaVersion: 1,
      purpose:
        'Temporary bounded official-source collection for reproducible tests and demo',
      entries: evidence,
    },
    null,
    2
  )}\n`
);
