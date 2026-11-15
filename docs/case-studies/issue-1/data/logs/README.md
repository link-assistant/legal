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

The `final-*` entries record the five passing evidence-only workflows on
`3b4283a` and their zero-result JavaScript/Actions SARIF. The `references-*`
entries retain the subsequent actual-GDPR reference red/green tests, complete
and focused runtime suites, browser/package/check results, and an independent
local Playwright MCP LiNo download with its exact decoded source-bound mentions.
These syntax candidates do not establish legal equivalence or target identity.

The `merged-main-*` entries preserve the external merge/issue state, all three
failed main workflow logs and job metadata. Their errors concern npm publisher
setup, the disabled dependency graph and the missing preview-push token. The
verification report cites exact lines; these later failures do not contradict
the earlier passing PR checks or complete unfinished acceptance criteria.
