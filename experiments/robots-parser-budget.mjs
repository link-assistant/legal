import assert from 'node:assert/strict';
import { robotsAllowed } from '../src/legal/collector.js';

// Finite hostile input. Run in a child with a heap/stack limit and a parent
// deadline; the pre-fix parser must never monopolize the test runner itself.
const kind = process.argv[2];
assert.ok(['comment', 'directive', 'wildcard'].includes(kind));
const prefix =
  kind === 'comment' ? '#'.repeat(200_000) : `-:${' '.repeat(1_000_000)}`;
const policy =
  kind === 'wildcard'
    ? `User-agent: *\nDisallow: /${'*a'.repeat(40)}b$`
    : `${prefix}\rX\nUser-agent: *\nDisallow: /private/`;
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
console.log(
  JSON.stringify({ kind, inputCharacters: policy.length, passed: true })
);
