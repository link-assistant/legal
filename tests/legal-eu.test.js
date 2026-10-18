import { it, expect } from 'test-anywhere';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { loadCorpus } from '../src/legal/server.js';
import { answerQuestion } from '../src/legal/index.js';
import { parseDocument } from '../src/legal/ingest.js';
import { getSource } from '../src/legal/registry.js';

it('extracts the collected EU body when delivered with its supported XHTML media type', async () => {
  const manifest = JSON.parse(
    await readFile('data/demo/manifest.json', 'utf8')
  );
  const entry = manifest.entries.find(
    (item) => item.id === 'eu-gdpr-2016-article5-en'
  );
  const bytes = gunzipSync(await readFile(`data/demo/${entry.rawPath}`));
  const expected = (await loadCorpus()).laws.find(
    (item) => item.id === entry.id
  );
  delete entry.format;
  for (const type of [
    'application/xhtml+xml',
    'Application/XHTML+XML; charset=UTF-8',
  ]) {
    const [law] = await parseDocument(
      bytes,
      entry,
      getSource(entry.sourceId),
      type
    );
    expect(law.text).toBe(expected.text);
  }
});

it('answers a bounded EU source query from the actual collected Article 5 text', async () => {
  const corpus = await loadCorpus();
  const law = corpus.laws.find(
    (item) => item.id === 'eu-gdpr-2016-article5-en'
  );
  expect(law.text.startsWith('Article 5\n')).toBe(true);
  expect(law.text.includes('(f)')).toBe(true);
  expect(law.text.includes('accountability')).toBe(true);
  expect(law.effectiveFrom).toBe(null);
  const answer = answerQuestion(corpus.laws, 'data minimisation', {
    jurisdiction: 'EU',
    language: 'en',
  });
  expect(answer.status).toBe('sources-found');
  expect(answer.citations.length > 0).toBe(true);
  for (const citation of answer.citations) {
    expect(citation.lawId).toBe(law.id);
    expect(citation.quote).toBe(law.text.slice(citation.start, citation.end));
    expect(citation.url).toBe(law.url);
  }
});
