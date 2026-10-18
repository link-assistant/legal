import { it, expect } from 'test-anywhere';
import { normalizeLaw, evaluateRules } from '../src/legal/index.js';
const law = normalizeLaw({
  id: 'test-rule',
  title: 'Test rule',
  jurisdiction: 'GE',
  language: 'en',
  url: 'https://matsne.gov.ge/en/document/view/1',
  retrievedAt: new Date(0).toISOString(),
  text: 'Every resident shall pay the levy unless exempt.',
});
const rule = {
  id: 'levy',
  reviewedBy: 'test fixture',
  lawId: law.id,
  contentHash: law.contentHash,
  start: 0,
  end: law.text.length,
  quote: law.text,
  jurisdiction: 'GE',
  effectiveFrom: '2020-01-01',
  effectiveTo: null,
  when: { resident: true },
  unless: { exempt: true },
  conclusion: { predicate: 'pay-levy', value: true },
};
it('evaluates source-bound rules using known facts, exceptions and open-world unknowns', () => {
  const context = {
    jurisdiction: 'GE',
    asOf: '2026-01-01',
    predicate: 'pay-levy',
  };
  expect(
    evaluateRules([law], [rule], { resident: true, exempt: false }, context)
      .status
  ).toBe('supported');
  expect(evaluateRules([law], [rule], { resident: true }, context).status).toBe(
    'unknown'
  );
  expect(
    evaluateRules([law], [rule], { resident: true, exempt: true }, context)
      .status
  ).toBe('unknown');
  expect(
    evaluateRules(
      [law],
      [rule],
      { resident: true, exempt: false },
      { ...context, jurisdiction: 'US' }
    ).status
  ).toBe('unknown');
  expect(
    evaluateRules(
      [law],
      [rule],
      { resident: true, exempt: false },
      { ...context, asOf: '2019-01-01' }
    ).status
  ).toBe('unknown');
  const opposite = {
    ...rule,
    id: 'opposite',
    conclusion: { predicate: 'pay-levy', value: false },
  };
  expect(
    evaluateRules(
      [law],
      [rule, opposite],
      { resident: true, exempt: false },
      context
    ).status
  ).toBe('conflict');
});
it('refuses unreviewed semantics and citations that drift from the source', () => {
  for (const bad of [
    { ...rule, reviewedBy: '' },
    { ...rule, quote: 'invented' },
    { ...rule, contentHash: 'stale' },
    { ...rule, end: law.text.length + 1 },
  ]) {
    let failed = false;
    try {
      evaluateRules(
        [law],
        [bad],
        { resident: true, exempt: false },
        { jurisdiction: 'GE', asOf: '2026-01-01', predicate: 'pay-levy' }
      );
    } catch {
      failed = true;
    }
    expect(failed).toBe(true);
  }
});
