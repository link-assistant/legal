import { describe, it, expect } from 'test-anywhere';
import { readFileSync } from 'node:fs';
import {
  assessTextQuality,
  assessCorpusQuality,
  expectedScripts,
} from '../src/legal/index.js';

const codes = (text, language) =>
  assessTextQuality(text, language).issues.map((issue) => issue.code);

describe('extracted text screening', () => {
  it('screens every collected demo record as clean in its declared script', () => {
    const { laws } = JSON.parse(readFileSync('data/demo/corpus.json', 'utf8'));
    const report = assessCorpusQuality(laws);
    expect(report.summary).toEqual({
      records: 5,
      screened: 5,
      needsReview: 0,
      scriptUnassessed: 0,
    });
    expect(report.complete).toBe(false);
    expect(report.records.every((item) => item.reviewed === false)).toBe(true);
    expect(report).toEqual(
      JSON.parse(
        readFileSync(
          'docs/case-studies/legal-issue-3/quality-report.json',
          'utf8'
        )
      )
    );
  });

  it('flags legacy-font Hindi extracted as Latin letters', () => {
    // Kruti Dev glyph codes for "भारत का संविधान" read as Latin letters.
    expect(codes('Hkkjr dk lafo/kku', 'hi')).toEqual(['script-mismatch']);
    expect(codes('भारत का संविधान', 'hi')).toEqual([]);
  });

  it('flags UTF-8 decoded as Windows-1252 without flagging real accents', () => {
    const russian = codes('Ð¡Ñ‚Ð°', 'ru');
    expect(russian).toEqual(['utf8-as-latin1', 'script-mismatch']);
    expect(codes('cafÃ© â€” x', 'fr')).toEqual(['utf8-as-latin1']);
    expect(codes('España, Ñandú, café — “cité” ‘x’', 'es')).toEqual([]);
  });

  it('flags replacement, private-use and control characters and empty text', () => {
    expect(codes('Article �', 'en')).toEqual(['replacement-character']);
    expect(codes('Article ', 'en')).toEqual(['private-use-character']);
    expect(codes('Article\u0007', 'en')).toEqual(['control-character']);
    expect(codes('1 2 3', 'en')).toEqual(['no-letters']);
  });

  it('reports unknown scripts as unassessed, not screened', () => {
    expect(expectedScripts('zz')).toBe(undefined);
    expect(assessTextQuality('Text', 'zz').status).toBe('script-unassessed');
    expect(expectedScripts('sr-Latn')).toEqual(['Cyrillic', 'Latin']);
    expect(assessTextQuality('Устав', 'ka').status).toBe('needs-review');
    expect(() => assessTextQuality(null, 'en')).toThrow();
  });
});
