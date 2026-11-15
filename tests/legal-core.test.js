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
  tokenize,
  extractLawReferences,
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

describe('Unicode word integrity', () => {
  it('retains combining marks in government-language search tokens', () => {
    expect(
      tokenize('शिक्षा শিক্ষা நீதி న్యాయం നീതി ನ್ಯಾಯ ન્યાય ਨਿਆਂ ନ୍ୟାୟ')
    ).toEqual([
      'शिक्षा',
      'শিক্ষা',
      'நீதி',
      'న్యాయం',
      'നീതി',
      'ನ್ಯಾಯ',
      'ન્યાય',
      'ਨਿਆਂ',
      'ନ୍ୟାୟ',
    ]);
    expect(tokenize('कानून')).toEqual([]);
    expect(tokenize('\u0301')).toEqual([]);
    expect(tokenize('re\u0301sume\u0301')).toEqual(['résumé']);
  });
  it('does not collapse distinct marked terms into the same legal search match', () => {
    for (const [language, text, other] of [
      ['hi', 'नीति', 'नाती'],
      ['bn', 'নীতি', 'নেতা'],
      ['ur', 'عَلَم', 'عِلْم'],
    ]) {
      // Synthetic text probes token identity, not a purported legal rule.
      const law = normalizeLaw({ ...specimen, language, text });
      expect(queryLaws([law], other)).toEqual([]);
      const [citation] = queryLaws([law], text);
      expect(citation.quote).toBe(text);
      expect(citation.contentHash).toBe(law.contentHash);
    }
  });
});

describe('source-bound reference formalization', () => {
  it('retains both actual GDPR references to the uncollected Article 89(1)', () => {
    const { laws } = JSON.parse(readFileSync('data/demo/corpus.json', 'utf8'));
    const law = laws.find((record) => record.id === 'eu-gdpr-2016-article5-en');
    const references = formalizeLaw(law).references;
    expect(Array.isArray(references)).toBe(true);
    const mentions = references.filter(
      (reference) => reference.target.identifier === '89'
    );
    expect(mentions.length).toBe(2);
    for (const reference of mentions) {
      expect(reference.target).toEqual({
        unit: 'article',
        identifier: '89',
        subdivisions: ['1'],
      });
      expect(reference.quote).toBe('Article 89(1)');
      expect(reference.role).toBe('reference-candidate');
      expect(reference.localCandidates).toEqual([]);
      expect(reference.verified).toBe(false);
      expect(reference.semantics).toBe('citation-syntax-only');
      expect(reference.contentHash).toBe(law.contentHash);
      expect(reference.url).toBe(law.url);
      expect(law.text.slice(reference.start, reference.end)).toBe(
        reference.quote
      );
      expect(
        new TextDecoder().decode(
          new TextEncoder()
            .encode(law.text)
            .slice(reference.byteStart, reference.byteEnd)
        )
      ).toBe(reference.quote);
    }
  });
  it('keeps multilingual reference spans separate from unreviewed heading candidates', () => {
    for (const [language, text, identifier, quote] of [
      ['en', 'Article 2\nSee Article 2(1)(a).', '2', 'Article 2(1)(a)'],
      ['ru', 'Статья 2\nСогласно статье 2.', '2', 'статье 2'],
      ['zh', '第十二条\n依照第十二条。', '十二', '第十二条'],
      ['ka', 'მუხლი 2\nიხილეთ მუხლი 2.', '2', 'მუხლი 2'],
      ['hi', 'अनुच्छेद २\nइसके अनुसार अनुच्छेद २।', '२', 'अनुच्छेद २'],
    ]) {
      const law = normalizeLaw({ ...specimen, language, text });
      const references = formalizeLaw(law).references;
      expect(Array.isArray(references)).toBe(true);
      const mention = references.find(
        (reference) => reference.role === 'reference-candidate'
      );
      expect(mention.quote).toBe(quote);
      expect(mention.target.identifier).toBe(identifier);
      expect(mention.localCandidates).toEqual([law.sections[0].id]);
      expect(mention.verified).toBe(false);
      expect(law.text.slice(mention.start, mention.end)).toBe(quote);
    }
  });
  it('preserves ambiguous local headings and does not assume a target subdivision exists', () => {
    const law = normalizeLaw({
      ...specimen,
      text: 'Article I\nSection 1\nFirst provision.\nArticle II\nSection 1\nSee Section 1(9)(z); also paragraph 1.',
    });
    const references = extractLawReferences(law);
    const mention = references.find((item) => item.quote === 'Section 1(9)(z)');
    expect(mention.localCandidates).toEqual(['s2', 's4']);
    expect(mention.localCandidateCount).toBe(2);
    expect(mention.candidatesTruncated).toBe(false);
    expect(mention.target.subdivisions).toEqual(['9', 'z']);
    expect(mention.verified).toBe(false);
    expect(references.at(-1).localCandidates).toEqual([]);
  });
  it('does not treat parts of words or invalid Roman numerals as citations', () => {
    const law = normalizeLaw({
      ...specimen,
      text: 'Particle 5, subsection 4, Article civil, Article IIII; see Article IV and § 12.3(a).',
    });
    expect(extractLawReferences(law).map((item) => item.quote)).toEqual([
      'Article IV',
      '§ 12.3(a)',
    ]);
  });
  it('preserves UTF-8 offsets and deterministic references through LiNo interchange', () => {
    const law = normalizeLaw({
      ...specimen,
      text: '🙂 नीती 中文\nSee Article 2(1); then 第十二条.',
    });
    const references = extractLawReferences(law);
    const encoded = new TextEncoder().encode(law.text);
    for (const reference of references) {
      expect(
        new TextDecoder().decode(
          encoded.slice(reference.byteStart, reference.byteEnd)
        )
      ).toBe(reference.quote);
      expect(reference.byteEnd > reference.end).toBe(true);
    }
    expect(extractLawReferences(law)).toEqual(references);
    expect(decodeKnowledge(encodeKnowledge(references))).toEqual(references);
  });
  it('bounds repeated heading candidates and rejects excessive reference counts', () => {
    const law = normalizeLaw({
      ...specimen,
      text: 'Article 1\nSame heading.\n'.repeat(20),
    });
    const [reference] = extractLawReferences(law);
    expect(reference.localCandidateCount).toBe(20);
    expect(reference.localCandidates.length).toBe(16);
    expect(reference.candidatesTruncated).toBe(true);
    expect(
      extractLawReferences(
        normalizeLaw({ ...specimen, text: 'See Article 1; '.repeat(10000) })
      ).length
    ).toBe(10000);
    let failed = false;
    try {
      extractLawReferences(
        normalizeLaw({ ...specimen, text: 'See Article 1; '.repeat(10001) })
      );
    } catch (error) {
      failed = error instanceof RangeError && error.message.includes('10000');
    }
    expect(failed).toBe(true);
  });
});
