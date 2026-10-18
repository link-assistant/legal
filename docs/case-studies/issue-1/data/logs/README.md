# Preserved verification logs

`unicode-policy-verification.tar.gz` consolidates the recent independent
recovery sessions. It retains every original archived file byte for byte,
including robots-policy probes, conditional-cache and combining-mark search
red/green traces, all nine failed jobs and complete run 39148071370, clean
checkout/CRLF/empty-release reproductions, browser and package checks, hosted
Docker evidence and CodeQL results. The latest full local suites pass 912
Node tests, 912 Bun tests and 909 Deno tests with three runtime-specific skips.
Earlier logs retain their original counts and timestamps.

The companion `unicode-policy-verification.sha256` lists every archived
file's checksum. Consolidating the logs keeps the complete PR within GitHub's
300-file diff limit. New evidence must preserve existing entries and checksums;
a passing local result does not replace a fresh hosted result.

`earlier-local-verification.tar.gz` preserves 66 earlier compressed logs under
their original filenames. Every compressed file was verified byte for byte.
Its companion `.sha256` file lists their checksums. The initial unconsolidated
PR had 351 changed files and the diff API returned HTTP 406.

To inspect the recent evidence from the repository root:

```sh
mkdir -p /tmp/legal-recent-logs
tar -xzf docs/case-studies/issue-1/data/logs/unicode-policy-verification.tar.gz -C /tmp/legal-recent-logs
(cd /tmp/legal-recent-logs && sha256sum -c "$OLDPWD/docs/case-studies/issue-1/data/logs/unicode-policy-verification.sha256")
less /tmp/legal-recent-logs/bootstrap-platforms-node-full.log
```

Some older source probes and hosted logs remain individually compressed
alongside the archives. The verification report distinguishes local checks,
older hosted proofs and unfinished acceptance criteria.

The latest `ef0-*` entries preserve all five passing workflows and the Pages
dispatch for combined head `ef0ff36`, all nine runtime jobs, Docker runtime
health/citations, full CodeQL SARIF and alert metadata, and public browser
verification. The SARIF retains one baseline finding in the unchanged issue-3
historical snapshot; it does not report zero results. `additional-source-*`
retains the later Know India and presidential-origin policy retrieval failures.
