import { describe, it, expect } from 'test-anywhere';
import { existsSync, readFileSync } from 'node:fs';

// The issue 3 tracker keeps every issue 1 requirement and follow-up gap tied to
// files in this repository. It must never report product acceptance while any
// item is partial, unfinished or blocked.
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const tracker = readJson('docs/case-studies/legal-issue-3/acceptance.json');
const open = ['partial', 'unfinished', 'blocked'];
const items = [...tracker.requirements, ...tracker.gaps];

function issueOneRequirements() {
  const lines = readFileSync(tracker.baseline.requirementTable, 'utf8').split(
    '\n'
  );
  const start = lines.indexOf('## Requirement inventory and evidence');
  const rows = [];
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith('## ')) {
      break;
    }
    const header = /^\| (Original requirement|-+ )/.test(line);
    if (line.startsWith('| ') && !header) {
      rows.push(line.split('|')[1].trim());
    }
  }
  return rows;
}

describe('issue 3 acceptance tracker', () => {
  it('reconciles every issue 1 requirement row exactly once', () => {
    const names = issueOneRequirements();
    expect(names.length).toBe(25);
    expect(tracker.requirements.map((item) => item.requirement)).toEqual(names);
    const ids = items.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('uses only defined statuses and points at existing evidence', () => {
    const statuses = Object.keys(tracker.statuses);
    for (const item of items) {
      expect(statuses.includes(item.status)).toBe(true);
      expect(item.evidence.length > 0).toBe(true);
      expect(item.remaining.length > 0).toBe(true);
      for (const path of [...item.evidence, ...(item.implementation ?? [])]) {
        expect([path, existsSync(path)]).toEqual([path, true]);
      }
    }
    for (const work of tracker.preservedWork) {
      for (const path of work.evidence) {
        expect([path, existsSync(path)]).toEqual([path, true]);
      }
    }
  });

  it('records a scope decision for every follow-up gap', () => {
    expect(tracker.gaps.map((gap) => gap.id)).toEqual([
      'G1',
      'G2',
      'G3',
      'G4',
      'G5',
      'G6',
    ]);
    for (const gap of tracker.gaps) {
      expect(gap.decision.length > 0).toBe(true);
      expect(gap.implementation.length > 0).toBe(true);
    }
  });

  it('keeps product acceptance separate from demo, CI, deployment and publication', () => {
    expect(Object.keys(tracker.gates).sort()).toEqual([
      'ci',
      'demo',
      'deployment',
      'npmPublication',
      'productAcceptance',
    ]);
    const unresolved = items.filter((item) => open.includes(item.status));
    expect(unresolved.length > 0).toBe(true);
    expect(tracker.gates.productAcceptance.status).toBe('not-met');
  });

  it('matches the committed evaluation report', () => {
    const { summary } = readJson(
      'docs/case-studies/legal-issue-3/evaluation-report.json'
    );
    const { measured } = tracker.gaps.find((gap) => gap.id === 'G5');
    for (const [key, value] of Object.entries(measured)) {
      expect([key, summary[key]]).toEqual([key, value]);
    }
  });

  it('keeps the preserved citation increment in the library', () => {
    expect(tracker.preservedWork[0].disposition).toBe('adopted');
    expect(
      readFileSync('src/legal/index.js', 'utf8').includes(
        'extractLawReferences'
      )
    ).toBe(true);
  });
});
