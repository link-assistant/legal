import { readFile, writeFile, stat } from 'node:fs/promises';
import { gzipSync, gunzipSync } from 'node:zlib';
import { parseDocument } from '../src/legal/ingest.js';
import { getSource, buildCoverage } from '../src/legal/registry.js';
import { normalizeLaw, hashContent } from '../src/legal/model.js';

// Offline extraction from one previously downloaded official response. Never
// issues a network request or changes the acquisition dates of existing records.
const input = process.argv[2] ?? 'experiments/official/alternatives/eu-eli.raw';
const manifest = JSON.parse(await readFile('data/demo/manifest.json', 'utf8'));
const corpus = JSON.parse(await readFile('data/demo/corpus.json', 'utf8'));
const id = 'eu-gdpr-2016-article5-en';
const prior = manifest.entries.find((item) => item.id === id);
const stored = await readFile(input);
const bytes = input.endsWith('.gz') ? gunzipSync(stored) : stored;
const retrievedAt =
  prior?.retrievedAt ?? (await stat(input)).mtime.toISOString();
const entry = {
  id,
  sourceId: 'eu-cellar',
  language: 'en',
  title: 'GDPR Article 5 — original 2016 English publication',
  url: 'https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng',
  contentSelector: '#art_5',
  sourceVersion: 'Original OJ L 119, 4 May 2016, Article 5',
  scope:
    'Selected Article 5 only; original 2016 publication, current legal effect unverified',
  translation: false,
};
const [parsed] = await parseDocument(
  bytes,
  entry,
  getSource(entry.sourceId),
  'text/html'
);
const rawHash = hashContent(bytes);
const rawPath = `raw/${rawHash}.html.gz`;
const law = normalizeLaw({
  ...parsed,
  jurisdiction: 'EU',
  retrievedAt,
  rawHash,
});
corpus.laws = [...corpus.laws.filter((item) => item.id !== id), law];
corpus.coverage = buildCoverage(corpus.laws);
corpus.generatedAt = new Date().toISOString();
manifest.entries = [
  ...manifest.entries.filter((item) => item.id !== id),
  {
    ...entry,
    rawHash,
    rawPath,
    format: 'html',
    sampleCharacters: law.text.length,
    fullTextCharacters: parsed.text.length,
    selection:
      'Complete selected Article 5 HTML subdivision; the regulation as a whole is not collected',
    retrievedAt,
  },
];
await writeFile(`data/demo/${rawPath}`, gzipSync(bytes, { mtime: 0 }));
await writeFile(
  'data/demo/corpus.json',
  `${JSON.stringify(corpus, null, 2)}\n`
);
await writeFile(
  'data/demo/manifest.json',
  `${JSON.stringify(manifest, null, 2)}\n`
);
console.log(
  JSON.stringify({
    id,
    rawHash,
    characters: law.text.length,
    retrievedAt,
    text: law.text.slice(0, 250),
  })
);
