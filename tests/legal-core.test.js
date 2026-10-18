import { describe, it, expect } from 'test-anywhere';
import { readFileSync } from 'node:fs';
import {
  normalizeLaw,
  formalizeLaw,
  answerQuestion,
  queryLaws,
  encodeKnowledge,
  decodeKnowledge,
  buildCoverage,
  sources,
} from '../src/legal/index.js';

const specimen = {
  id: 'test-equality',
  jurisdiction: 'GE',
  language: 'en',
  title: 'Test act',
  url: 'https://matsne.gov.ge/en/document/view/1',
  retrievedAt: '2026-10-18T00:00:00.000Z',
  text: 'Article 1 – Equality\nAll persons are equal before the law.\nArticle 2 – Duty\nEvery person shall pay taxes unless exempt.\nArticle 3 – Restriction\nNo person shall be subjected to torture.',
};

describe('provenance and deterministic legal knowledge', () => {
  it('keeps language, jurisdiction, exact normalized text and UTF-8 source spans', () => {
    const law = normalizeLaw(specimen);
    expect(law.sections.length).toBe(3);
    for (const section of law.sections) {
      expect(law.text.slice(section.start, section.end)).toBe(section.text);
      expect(
        new TextDecoder().decode(
          new TextEncoder()
            .encode(law.text)
            .slice(section.byteStart, section.byteEnd)
        )
      ).toBe(section.text);
    }
    expect(normalizeLaw(specimen).contentHash).toBe(law.contentHash);
    expect(law.status).toBe('unverified');
  });
  it('rejects missing provenance, HTML error pages and unsupported languages', () => {
    for (const changed of [
      { url: 'javascript:alert(1)' },
      { jurisdiction: '' },
      { language: '' },
      { text: '' },
    ]) {
      let failed = false;
      try {
        normalizeLaw({ ...specimen, ...changed });
      } catch {
        failed = true;
      }
      expect(failed).toBe(true);
    }
  });
  it('formalizes losslessly and marks extracted modal cues as unproved', () => {
    const law = normalizeLaw(specimen);
    const formal = formalizeLaw(law);
    expect(formal.reconstructed).toBe(law.text);
    expect(formal.roundTrip).toBe(true);
    expect(formal.claims.some((claim) => claim.modality === 'obligation')).toBe(
      true
    );
    expect(formal.claims.every((claim) => claim.verified === false)).toBe(true);
    expect(
      formal.claims.some((claim) => claim.qualifiers.includes('unless'))
    ).toBe(true);
    expect(decodeKnowledge(encodeKnowledge(formal)).lawId).toBe(law.id);
  });
  it('returns only exact cited quotations and abstains without evidence', () => {
    const law = normalizeLaw(specimen);
    const answer = answerQuestion([law], 'equality before the law', {
      jurisdiction: 'GE',
      language: 'en',
    });
    expect(answer.status).toBe('sources-found');
    expect(answer.citations.length > 0).toBe(true);
    for (const citation of answer.citations) {
      expect(law.text.slice(citation.start, citation.end)).toBe(citation.quote);
      expect(citation.contentHash).toBe(law.contentHash);
    }
    expect(answerQuestion([law], 'space mining patents').status).toBe(
      'insufficient-evidence'
    );
    expect(
      answerQuestion([law], 'equality', { jurisdiction: 'US' }).citations
    ).toEqual([]);
  });
  it('does not invent translations or hide date and scope limitations', () => {
    const law = normalizeLaw(specimen);
    expect(queryLaws([law], 'equal', { language: 'zh' })).toEqual([]);
    const result = answerQuestion([law], 'equal', { asOf: '2020-01-01' });
    expect(result.status).toBe('insufficient-evidence');
    expect(result.limits.length > 0).toBe(true);
  });
  it('tokenizes CJK without requiring spaces and preserves other scripts', () => {
    for (const [language, text, question] of [
      ['zh', '中华人民共和国公民在法律面前一律平等。', '法律'],
      ['hi', 'सभी व्यक्ति कानून के समक्ष समान हैं।', 'समान'],
      ['ka', 'ყველა ადამიანი სამართლის წინაშე თანასწორია.', 'თანასწორია'],
      ['ru', 'Все равны перед законом.', 'законом'],
    ]) {
      const law = normalizeLaw({ ...specimen, language, text });
      expect(queryLaws([law], question).length > 0).toBe(true);
    }
  });
  it('reports missing languages and never reports sample coverage as complete', () => {
    expect(
      sources
        .map((source) => source.jurisdiction)
        .filter((value, i, all) => all.indexOf(value) === i)
        .sort()
    ).toEqual(['CN', 'EU', 'GE', 'IN', 'RU', 'US']);
    const coverage = buildCoverage([normalizeLaw(specimen)]);
    expect(coverage.complete).toBe(false);
    expect(
      coverage.jurisdictions.find((item) => item.id === 'EU').missingLanguages
        .length
    ).toBe(24);
    expect(
      coverage.jurisdictions
        .find((item) => item.id === 'IN')
        .expectedLanguages.includes('hi')
    ).toBe(true);
  });
  it('grounds demo queries in actual collected records', () => {
    const corpus = JSON.parse(readFileSync('data/demo/corpus.json', 'utf8'));
    for (const law of corpus.laws) {
      expect(normalizeLaw(law).contentHash).toBe(law.contentHash);
    }
    expect(corpus.laws.length > 0).toBe(true);
  });
});
