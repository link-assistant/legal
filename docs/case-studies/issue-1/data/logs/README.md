# Preserved verification logs

The latest CI setup verification is in `ci-clean-checkout-verification.tar.gz`:
Node/Bun each pass 907 tests; Deno passes 904 with three expected skips. It
preserves the complete failed run 39148071370, every failed matrix job,
clean-checkout and CRLF reproductions, passing checks, latest hosted Docker
smoke evidence and zero-result CodeQL analyses. The companion `.sha256` file
records each archived file's checksum. This evidence distinguishes local
success from fresh hosted checks still required after the setup fixes.

Earlier integrated checks are in `unicode-policy-verification.tar.gz`: Node/Bun
each pass 905 tests; Deno passes 902 with three runtime-specific skips. It also
preserves lint/format/duplication, browser, package, focused red/green and small
hostile-input probe logs. `unicode-policy-verification.sha256` records each
archived file's checksum. Extract it and use `sha256sum -c` as shown below for
the earlier archive. Failure reproductions, source probes and hosted CI logs
also remain individually compressed alongside it.

`earlier-local-verification.tar.gz` preserves 66 earlier local verification logs
under their original filenames. Every archived compressed file was checked
byte-for-byte before consolidation. `earlier-local-verification.sha256` lists
their SHA-256 checksums. This reduces the PR below GitHub's 300-file diff limit;
the unconsolidated version had 351 changed files and the diff API returned 406.

To inspect an earlier run from the repository root:

```sh
mkdir -p /tmp/legal-earlier-logs
tar -xzf docs/case-studies/issue-1/data/logs/earlier-local-verification.tar.gz -C /tmp/legal-earlier-logs
(cd /tmp/legal-earlier-logs && sha256sum -c "$OLDPWD/docs/case-studies/issue-1/data/logs/earlier-local-verification.sha256")
gzip -dc /tmp/legal-earlier-logs/tests-node-final.log.gz | less
```

These logs record different historical revisions. The verification report
distinguishes the latest local results, older hosted proofs and unfinished
acceptance criteria.
