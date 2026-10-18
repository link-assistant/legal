import { it, expect } from 'test-anywhere';
import { applyExactPatch } from '../scripts/bootstrap-formal-ai.mjs';
import { dependencyReviewAvailable } from '../scripts/dependency-capability.mjs';

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
