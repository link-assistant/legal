import { describe, it, expect } from 'test-anywhere';
import { readFileSync } from 'node:fs';
import { evaluateQuestions } from '../src/legal/index.js';
import { runLegalCli } from '../bin/legal-assistant.js';

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const { laws } = readJson('data/demo/corpus.json');
const set = readJson('data/evaluation/questions.json');

describe('bounded real-question evaluation', () => {
  it('validates every expected proof against the edition independently of retrieval', () => {
    const answerable = set.cases.filter(
      (item) => item.expected.status === 'sources-found'
    );
    expect(answerable.length).toBe(16);
    for (const { expected } of answerable) {
      const law = laws.find(
        (item) =>
          item.id === expected.lawId &&
          item.contentHash === expected.contentHash
      );
      const section = law.sections.find(
        (item) => item.id === expected.sectionId
      );
      expect(section.text.includes(expected.proof)).toBe(true);
      expect(expected.answer.length > 0).toBe(true);
    }
    for (const item of set.cases) {
      expect(item.question.length > 0).toBe(true);
      if (item.expected.status === 'insufficient-evidence') {
        expect(item.expected.reason.length > 0).toBe(true);
      }
    }
  });

  it('reproduces the recorded report, including its failures', () => {
    const report = evaluateQuestions(laws, set);
    const recorded = readJson(
      'docs/case-studies/legal-issue-3/evaluation-report.json'
    );
    expect(report).toEqual(recorded);
    expect(report.summary.invalidProofs).toBe(0);
    expect(report.summary.proofWithinLimit).toBe(report.summary.answerable);
    expect(report.failures).toEqual([
      'us-first-amendment',
      'eu-consent-conditions',
      'in-article-21-unfiltered',
      'in-article-21-hi',
      'ge-president-term',
    ]);
  });

  it('fails a case whose proof is not in the cited edition', () => {
    const [first] = set.cases;
    const changed = {
      id: 'changed',
      cases: [
        {
          ...first,
          expected: { ...first.expected, contentHash: '0'.repeat(64) },
        },
        {
          ...first,
          id: 'quote',
          expected: { ...first.expected, proof: 'not in the text' },
        },
      ],
    };
    const report = evaluateQuestions(laws, changed);
    expect(report.summary.passed).toBe(0);
    expect(report.summary.invalidProofs).toBe(2);
  });

  it('rejects empty sets, duplicate IDs and unknown expected statuses', () => {
    const [first] = set.cases;
    for (const invalid of [
      { cases: [] },
      { cases: [first, first] },
      { cases: [{ ...first, expected: { status: 'yes' } }] },
    ]) {
      expect(() => evaluateQuestions(laws, invalid)).toThrow();
    }
  });

  it('exits 2 from the CLI while any case fails', async () => {
    const output = [];
    const code = await runLegalCli(['evaluate'], {
      stdout: (line) => output.push(line),
      stderr: () => {},
    });
    expect(code).toBe(2);
    expect(JSON.parse(output.join('')).summary.cases).toBe(24);
  });
});
