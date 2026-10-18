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

## Evidence and limits

Local verification after recovery passed:

- Node: 865 tests, zero failures.
- Bun: 865 tests, zero failures.
- Deno: 862 tests, zero failures, three runtime-specific tests ignored.
- Chromium: two browser tests, including desktop and phone layouts.
- Packed npm artifact: installed into a clean directory with install scripts disabled; library, bundled corpus, exact citations and CLI worked outside the repository.
- Root dependency audit: zero vulnerabilities. Existing universal-app dependencies have eight moderate audit findings; neither lock has a high/critical finding.
- ESLint, formatting, duplication (8.30%, below the existing 10% limit), secret scanning, syntax, required documentation, line limits and workflow policy are checked locally. Fresh hosted CI remains pending. At 15:43 UTC, most Linux jobs for head `5f42124` were still queued without runners; desktop packaging on Windows/macOS and the Actions CodeQL job had passed.

Compressed test, browser and package logs are in `data/logs/`.

The temporary corpus contains four records from three jurisdictions. Its integration tests verify every compressed raw source hash, repeat extraction, and compare the normalized excerpt; they do not merely trust the corpus manifest. The browser screenshot is [committed with the source](../../screenshots/legal-demo.png); desktop and phone tests exercise the actual bundled engine.

A local Docker image build passed. Launching a container in this workspace failed because its cgroup v2 hierarchy reports `cannot enter cgroupv2 ... with domain controllers -- it is in threaded mode`. Hosted CI includes a bounded container health and cited-answer smoke test. Local host rejection is not evidence that the container API works.

Public Pages is configured for Actions but deployment is still unverified. The workflow packages the explorer alongside the existing app and supports an explicit branch deployment without modifying main. This PR remains unmerged; no public deployment or exhaustive corpus is claimed until verified.
