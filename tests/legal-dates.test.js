import { it, expect } from 'test-anywhere';
import { normalizeLaw, answerQuestion } from '../src/legal/index.js';
it('rejects impossible effective dates and query dates', () => {
  const input = {
    id: 'dates',
    title: 'Dates',
    jurisdiction: 'GE',
    language: 'en',
    url: 'https://matsne.gov.ge/en/document/view/1',
    retrievedAt: new Date(0).toISOString(),
    text: 'A person shall act.',
  };
  for (const date of ['2026-02-30', '2026-13-01']) {
    let failed = false;
    try {
      normalizeLaw({ ...input, effectiveFrom: date });
    } catch {
      failed = true;
    }
    expect(failed).toBe(true);
    failed = false;
    try {
      answerQuestion([normalizeLaw(input)], 'person', { asOf: date });
    } catch {
      failed = true;
    }
    expect(failed).toBe(true);
  }
});
