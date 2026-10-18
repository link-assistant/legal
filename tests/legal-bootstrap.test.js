import { it, expect } from 'test-anywhere';
import { applyExactPatch } from '../scripts/bootstrap-formal-ai.mjs';
import { dependencyReviewAvailable } from '../scripts/dependency-capability.mjs';
import { readFileSync } from 'node:fs';

it('applies exact dependency patch context and rejects source drift', () => {
  const patch = '--- a/source\n+++ b/source\n@@ -1,2 +1,2 @@\n a\n-b\n+c\n';
  expect(applyExactPatch('a\nb\n', patch)).toBe('a\nc\n');
  let failed = false;
  try {
    applyExactPatch('changed\nb\n', patch);
  } catch {
    failed = true;
  }
  expect(failed).toBe(true);
});
it('applies CRLF patch files while preserving exact source context checks', () => {
  const patch =
    '--- a/source\r\n+++ b/source\r\n@@ -1,2 +1,2 @@\r\n a\r\n-b\r\n+c\r\n';
  expect(applyExactPatch('a\nb\n', patch)).toBe('a\nc\n');
  expect(() => applyExactPatch('changed\nb\n', patch)).toThrow(
    'Formal AI patch context mismatch'
  );
  expect(() => applyExactPatch('a\r\nb\r\n', patch)).toThrow(
    'Formal AI patch context mismatch'
  );
});

it('generates the pinned dependency before the Deno matrix type-checks tests', () => {
  const workflow = readFileSync(
    '.github/workflows/release.yml',
    'utf8'
  ).replaceAll('\r\n', '\n');
  const testJob = workflow.split('\n  test:')[1].split('\n  docker-build:')[0];
  const preparation = testJob.indexOf(
    'deno run -A scripts/bootstrap-formal-ai.mjs'
  );
  const tests = testJob.indexOf('deno test -A --parallel');
  expect(preparation).toBeGreaterThan(-1);
  expect(preparation).toBeLessThan(tests);
});
it('uses audit fallback only for unavailable PR dependency review and fails closed otherwise', () => {
  expect(
    dependencyReviewAvailable({ ok: true, status: 200 }, 'pull_request')
  ).toBe(true);
  for (const status of [403, 404]) {
    expect(
      dependencyReviewAvailable({ ok: false, status }, 'pull_request')
    ).toBe(false);
    let message = '';
    try {
      dependencyReviewAvailable({ ok: false, status }, 'push');
    } catch (error) {
      message = error.message;
    }
    expect(message.includes('Enable Dependency graph')).toBe(true);
  }
  let failed = false;
  try {
    dependencyReviewAvailable({ ok: false, status: 500 }, 'pull_request');
  } catch {
    failed = true;
  }
  expect(failed).toBe(true);
});
