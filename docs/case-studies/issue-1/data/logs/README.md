# Preserved verification logs

Current runtime checks are `node-robots-nested.log.gz`, `bun-robots-nested.log.gz`
and `deno-robots-nested.log.gz`: 904, 904 and 901 passing tests respectively,
with three Deno-specific skips. `check-robots-nested.log.gz` records lint,
formatting and duplication checks. Failure reproductions, source probes and hosted
CI logs remain individually compressed alongside them.

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
