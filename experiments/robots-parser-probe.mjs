import { robotsAllowed } from '../src/legal/collector.js';
import { performance } from 'node:perf_hooks';

// Finite CodeQL reproductions: an 8 KiB whitespace line or a 74-byte policy.
// Run in a child with --max-old-space-size=96 and a parent deadline, never as
// an unbounded benchmark. The suite also exercises the larger bounded probes.
const wildcards = process.argv[2] === 'wildcards';
const line = `-:${' '.repeat(8192)}x\u2028x`;
const policy = wildcards
  ? `User-agent: *\nDisallow: /${'*a'.repeat(24)}b`
  : `User-agent: *\n${line}\nDisallow: /private/`;
const url = wildcards
  ? `https://example.gov/${'a'.repeat(64)}`
  : 'https://example.gov/private/law';
const started = performance.now();
const allowed = robotsAllowed(policy, url);
if (allowed !== wildcards) {
  throw new Error('Unexpected policy result');
}
console.log(
  JSON.stringify({
    bytes: policy.length,
    allowed,
    elapsedMs: performance.now() - started,
  })
);
