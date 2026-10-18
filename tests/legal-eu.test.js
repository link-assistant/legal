import { it, expect } from 'test-anywhere';
import { loadCorpus } from '../src/legal/server.js';
import { answerQuestion } from '../src/legal/index.js';

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
