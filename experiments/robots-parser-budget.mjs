import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { robotsAllowed } from '../src/legal/collector.js';

// Finite hostile input. Run in a child with a heap/stack limit and a parent
// deadline; the pre-fix parser must never monopolize the test runner itself.
// Parsing time is measured here, so process start-up on slow runners does not
// count against the parsing budget.
const kind = process.argv[2];
assert.ok(['comment', 'directive', 'wildcard'].includes(kind));
const prefix =
  kind === 'comment' ? '#'.repeat(200_000) : `-:${' '.repeat(1_000_000)}`;
const policy =
  kind === 'wildcard'
    ? `User-agent: *\nDisallow: /${'*a'.repeat(40)}b$`
    : `${prefix}\rX\nUser-agent: *\nDisallow: /private/`;
const started = performance.now();
assert.equal(
  robotsAllowed(
    policy,
    kind === 'wildcard'
      ? `https://example.gov/${'a'.repeat(100)}`
      : 'https://example.gov/private/law'
  ),
  kind === 'wildcard'
);
assert.equal(robotsAllowed(policy, 'https://example.gov/public/law'), true);
const parseMs = Math.round(performance.now() - started);
console.log(
  JSON.stringify({
    kind,
    inputCharacters: policy.length,
    parseMs,
    passed: true,
  })
);
