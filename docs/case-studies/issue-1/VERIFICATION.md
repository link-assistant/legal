# Verification record

This report concerns [PR 2](https://github.com/link-assistant/legal/pull/2). A passing sample test does not verify exhaustive legal coverage or arbitrary legal interpretation. The requirement inventory in [README.md](README.md) identifies unfinished criteria.

## Reproductions

- The original Security run `39134730952` failed at log line 162 because Dependency graph is disabled. Its terminal gate failed at line 4226 as a consequence. The compressed log is in `data/logs/`. PRs now audit both npm locks if that API returns 403/404; other errors still fail, and default-branch runs explicitly require enabling the feature. The capability policy has offline tests.
- Calendar tests reproduced acceptance of impossible dates such as `2026-02-30`; date validation now round-trips the calendar value, including reviewed rules and query dates.
- `tests/legal-pdf.test.js` uses the finite PDF generator in `experiments/pdf-fixture.mjs`. It failed with `TypeError: doc.destroy is not a function` under PDF.js 6.4.299. Cleanup now uses the loading task, and the same exact-text assertion passes.
- The browser bundle initially failed to resolve `events` from links-notation. Declaring that browser dependency fixed the build; the upstream report is linked in the case study.
- GovInfo's actual directory links omit trailing slashes. A regression test first failed to discover them; traversal now follows child directories with a persisted pending/visited cursor, retries failed paths and resumes through the CLI or scheduled runner.
- The previous CFR parser returned only the first section. Two-section and context/appendix regressions failed before the fix. A downloaded 2026 Title 2 volume (`data/cfr-sample.xml.gz`, SHA-256 in its JSON manifest) now yields all 1,508 distinct numbered sections and a context record retaining headings, authorities and appendices. The offline test verifies the raw hash and re-extracts every record. This one volume is not a complete CFR inventory.
- A EUR-Lex title-only metadata fixture was accepted as law text. Removing the title selector makes that fixture fail closed. CLI resume tests also reproduced asynchronous collection errors escaping the error handler; those now return exit code 1.
- The full Deno run exposed an HTTP test waiting indefinitely for a keep-alive socket after `server.close()`. Explicitly closing test connections fixes cleanup; the focused run with leak tracing and the full Deno rerun pass. The interrupted log is preserved separately.
- A redirect could bypass the destination's robots policy. A mocked regression first demonstrated the request reaching a prohibited path; same-origin and explicitly allowed alternate-origin redirects now check the destination policy before requesting content.
- The fresh link-check job for `2b7dbd2` failed at line 285 because source HTML linked to a build-only `web/corpus.json`. The preserved job log is `data/logs/links-39141675940.log.gz`. A local source-link test reproduced the missing file. The source now links to the canonical collected corpus; the build rewrites that link for its packaged layout, and a browser test downloads and compares the entire JSON corpus.

- Release CI on `2b7dbd2` failed at line 238 of `data/logs/release-117718678351.log.gz`: four inherited changesets still referenced the starter package name after the package rename. A regression assembles the actual pending release plan and failed with the same workspace error. Retargeting those fragments preserves their release notes and makes the regression pass. `experiments/pending-release-version.mjs` runs the complete versioning command in an isolated copy, confirms version `0.12.0` and its synchronized lockfile, and leaves the checkout's fragments intact.

- USLM extraction also discarded title-level notes outside numbered sections. The minimal regression failed with two records instead of three. A robots-compliant, bounded official Title 1 download (42,240 archive bytes; catalog and SHA-256 preserved in `data/uslm-sample*`) confirmed 39 sections plus omitted statutory repeal/rights language. Extraction now retains all 39 sections and a separate context record. The offline archive regression rechecks its hash, distinct IDs and actual title-level statutory notes. This title is a temporary fixture outside the four-record browser corpus, not an exhaustive US Code collection.

## Evidence and limits

Local verification after recovery passed:

- Node: 873 tests, zero failures.
- Bun: 873 tests, zero failures.
- Deno: 870 tests, zero failures, three runtime-specific tests ignored.
- Chromium: two browser tests, including desktop and phone layouts.
- Packed npm artifact: installed into a clean directory with install scripts disabled; library, bundled corpus, exact citations and CLI worked outside the repository.
- Root dependency audit: zero vulnerabilities. Existing universal-app dependencies have eight moderate audit findings; neither lock has a high/critical finding.
- ESLint, formatting, duplication (below the existing 10% limit), secret scanning, syntax, required documentation, line limits and workflow policy are checked locally. Fresh hosted CI remains pending. At 15:43 UTC, most Linux jobs for head `5f42124` were still queued without runners; desktop packaging on Windows/macOS and the Actions CodeQL job had passed.

Compressed test, browser and package logs are in `data/logs/`.

The pinned actionlint 1.7.12 binary and zizmor 1.30.1 regular/high-severity pedantic passes also passed locally. The native actionlint run had no ShellCheck on PATH; the hosted workflow uses its pinned Docker image with ShellCheck and remains the full shell-block check. Zizmor reported no findings under the repository's existing configuration; ignored/suppressed rules are visible in its preserved logs.

The temporary corpus contains four records from three jurisdictions. Its integration tests verify every compressed raw source hash, repeat extraction, and compare the normalized excerpt; they do not merely trust the corpus manifest. The browser screenshot is [committed with the source](../../screenshots/legal-demo.png); desktop and phone tests exercise the actual bundled engine.

A local Docker image build passed. Launching a container in this workspace failed because its cgroup v2 hierarchy reports `cannot enter cgroupv2 ... with domain controllers -- it is in threaded mode`. Hosted CI includes a bounded container health and cited-answer smoke test. Local host rejection is not evidence that the container API works.

The [public Pages explorer](https://link-assistant.github.io/legal/legal/) was deployed from `2b7dbd2` by [workflow dispatch 39141691021](https://github.com/link-assistant/legal/actions/runs/39141691021). Chromium verification at 15:53 UTC on 18 October 2026 confirmed four source records, a Chinese query returning the official government URL, and only three same-origin runtime resources (CSS, JavaScript and corpus JSON). The captured result is in `data/public-pages-verified.json`; the [public-site screenshot](../../screenshots/legal-demo-public.png) is committed. The workflow packages the explorer alongside the existing app and supports branch deployment without modifying main. This PR remains unmerged. Deployment verification does not establish exhaustive corpus coverage.
