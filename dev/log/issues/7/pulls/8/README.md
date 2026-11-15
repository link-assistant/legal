# Issue #7 / PR #8: CI/CD false positives, false negatives, warnings and errors

Issue: https://github.com/link-assistant/legal/issues/7
Pull request: https://github.com/link-assistant/legal/pull/8

This folder holds the raw evidence (run lists, job JSON, full logs and
annotations) that the analysis below is built on. Everything was collected
with `gh run list`, `gh run view --log` and `gh api .../check-runs/*/annotations`.

| Path | Content |
| --- | --- |
| `issue-7.json`, `pr-8.json` | Issue and PR as fetched at the start |
| `runs-main.json` | Recent `main` runs (all workflows) |
| `runs-pr6.txt` | Runs of PR #6, whose merge produced commit 1f828d9 |
| `annotations.tsv` | Every annotation of the failing 1f828d9 runs |
| `ci-logs/run-<id>.log`, `ci-logs/run-<id>-jobs.json` | Full logs and job lists of the 1f828d9 runs |
| `ci-logs/run-43749538511-links-failed.log` | An earlier failing Broken Link Checker run |
| `ci/release-43765257604-failed.log` | PR #8 failure that revealed the `npm pack --json` defect |
| `template-logs/` | The JS template's own failing run, used to compare root causes |
| `tree/` | `git ls-files` of this repository and both templates, plus the files only the JS template has |

## Timeline

| Time (UTC) | Event |
| --- | --- |
| 2026-10-26 to 2026-11-09 | Weekly scheduled Security runs on `main` (a208c29) fail |
| 2026-11-15 18:56 | `main` runs on 10abc1c fail (links, release, security, example app) |
| 2026-11-15 20:46 | PR #6 head 2fbd68e: all five workflows green on `pull_request` |
| 2026-11-15 20:53 | PR #6 merged as 1f828d9; Example app 43760599346, Checks and release 43760599358 and Security 43760599355 fail on `push` |
| 2026-11-15 21:22 | Issue #7 opened |
| 2026-11-15 | PR #8: template sync (95a23c8), advisory fix (94f8ecf), Dependabot (faaf262), tarball JSON fix (4840181) |

The same commit was green as a pull request and red on `main`. That is the
first finding: the checks that need a maintainer action only ran in
"release"/"require" mode on `main`, so no pull request could ever show them.
The template sync keeps that split on purpose (forks have no secrets), but
the PR now always runs the probe and prints a warning that names the action,
so the `main` failure is no longer a surprise.

## Requirements map

| Requirement (issue #7 and solver instructions) | Where it is met |
| --- | --- |
| Fix failing Example app 43760599346 | 95a23c8: drift detection via `git status --porcelain`, no false "regenerated" notice, `RELEASE_PR_TOKEN` falls back to `GITHUB_TOKEN`, explicit error when a ruleset refuses the push |
| Fix failing Checks and release 43760599358 | 95a23c8: preflight explains the npm 404 (first publish needs `NPM_TOKEN`, then a trusted publisher) with the settings URLs |
| Fix failing Security 43760599355 | 95a23c8: dependency-graph availability probe; PRs warn, `main` fails with the settings URL |
| Apply all JS template best practices, compare the full tree | 95a23c8 (3-way merge 0a62b80 -> 74de898), `tree/only-in-js-template.txt` |
| Apply Python template best practices | faaf262 (Dependabot with cooldown and a stuck-PR health check), see "Python template" below |
| Follow hive-mind CI-CD-BEST-PRACTICES.md | Status gates on every workflow, `timeout-minutes` everywhere, pinned tooling, least-privilege permissions, rerun of unacquired runners, credential preflight |
| Fix every warning | 95a23c8 (deprecated `whatwg-encoding` removed via `encoding-sniffer` override), 94f8ecf (GHSA-474x-hrwr-fgx4 in the artifact lock) |
| Find false negatives | 4840181 (tarball size gate failed to parse output: it would have blocked releases), rerun test derives the workflow list instead of a hand list |
| Human-action checks pass on PRs, fail on `main` with "what to do" | Verified, see "Maintainer actions" |
| Report template issues | js-template #302 (same fast-xml-parser lock); cheerio #4977 already existed |
| Collect logs, experiments | This folder; `experiments/issue-7-*.sh` |

## Root causes and fixes

### 1. Example app: Regenerate Preview Images (43760599346)

Log: `ci-logs/run-43760599346.log`, annotation
`RELEASE_PR_TOKEN is required to push generated preview images.`

- The job hard-required `RELEASE_PR_TOKEN` even when the built-in
  `GITHUB_TOKEN` could push, and it printed "Preview images regenerated and
  (if applicable) committed to main" as a notice in the same run that failed
  (false positive notice).
- Fix (template sync): try the built-in token when the secret is absent; only
  when `main` refuses the push (a ruleset requiring PRs) fail with
  `Preview images need RELEASE_PR_TOKEN` naming the secret URL, the token
  scopes, and the local alternative `npm run example:web:preview-images`.
- The `::error::Desktop package output was not created` lines in that log are
  the text of a guard in the `run:` script echoed by the runner, not errors;
  those jobs passed.

### 2. Checks and release: Release Preflight (43760599358)

Annotation: `npm OIDC package exchange rejected (404); configure a trusted
publisher or bootstrap token`.

- `@link-assistant/legal` is not published yet. npm can only attach a trusted
  publisher to an existing package, so OIDC answers 404 and no `NPM_TOKEN`
  bootstrap secret exists. This is a real maintainer action, not a CI bug.
- Fix (template sync): `explain_npm_exchange_404` looks the package up and
  says which of the two actions applies, with links to the npm access page and
  the repository secrets page. PRs run the probe in report mode (warning),
  `main` in release mode (error, exit 1). Verified locally:
  `PREFLIGHT_MODE=report` -> exit 0 with `::warning::`,
  `PREFLIGHT_MODE=release` -> exit 1 with `::error::`.

### 3. Security: Dependency Review (43760599355)

- `actions/dependency-review-action` answers 403 when the repository's
  dependency graph is disabled, which surfaced only as
  `Process completed with exit code 1`.
- Fix (template sync): `scripts/check-dependency-graph.sh` probes the
  compare API first. Verified against this repository:
  `--require` (main) exits 1 with
  `::error::The dependency graph of link-assistant/legal is disabled ... enable "Dependency graph" at https://github.com/link-assistant/legal/settings/security_analysis.`;
  without it (PRs) the same text is a warning and the review step is skipped.

### 4. npm tarball size gate could not parse `npm pack --json` (found on PR #8)

Log: `ci/release-43765257604-failed.log`:
`Unexpected token '/', "/home/runn"... is not valid JSON`.

- `npm pack --dry-run --json` runs `prepack`/`prepare` in the foreground and
  forwards their stdout ahead of the JSON. `bootstrap-formal-ai.mjs` printed
  its output path to stdout. The template does not hit this because its own
  lifecycle script writes to stderr.
- Fix (4840181): pass `--foreground-scripts=false` (a failing script's output
  still reaches stderr and the JSON error, verified) and print the path on
  stderr. Regression test in `tests/ci-issue-299.test.js` fails without the
  flag. Demonstration: `experiments/issue-7-npm-pack-json-lifecycle.sh`.

### 5. Warnings

- `npm warn deprecated whatwg-encoding@3.1.1` (and the Deno equivalent):
  cheerio pins `encoding-sniffer@^0.2`, which depends on it. Override to
  `encoding-sniffer@1.0.2`, which uses `@exodus/bytes`. Upstream:
  https://github.com/cheeriojs/cheerio/issues/4977 (already reported, so cited, not duplicated).
- `GHSA-474x-hrwr-fgx4` (low) in the artifact-transport lock through
  `@actions/artifact` -> `@azure/core-xml` -> `fast-xml-parser 5.11.2`:
  lockfile moved to 5.12.1 (94f8ecf). The template had the same lock:
  link-foundation/js-ai-driven-development-pipeline-template#302.
- Dependency install scripts are now allow-listed explicitly in
  `package.json` and `deno.json` instead of producing "scripts not run"
  warnings.

## Python template practices

`tree/python-template.txt` lists its tree. Adopted or already equivalent:

| Python template | Here |
| --- | --- |
| `.github/dependabot.yml`, `dependabot-health.yml`, `check_dependabot_health.py` | Added (faaf262) as `scripts/check-dependabot-health.mjs` with 27 tests. Root npm is excluded because Dependabot cannot update `deno.lock`, and those PRs would fail `deno test --frozen` |
| `audit-npm-locks.sh` | Already covered: `security.yml` audits all three tracked locks and `tests/security-workflow.test.js` fails when a tracked lock is missing from the matrix |
| `.github/actionlint.yaml` | Same effect via the `-ignore` argument of the digest-pinned actionlint image; this repository uses no `ubuntu-26.04` labels |
| `check_zizmor_compatibility.py` | The zizmor action and the pedantic pass pin the same 1.30.1 version in `workflows.yml` |
| `preflight-credentials.sh`, `check-dependency-graph.sh`, `check-pipeline-status.sh`, codeql config | Same scripts arrived through the JS template |

## JS template files not adopted

`tree/only-in-js-template.txt`: the template's own changesets, issue
case studies and experiments, `bin/example-package-name.js`, and the
"JavaScript-first" Rust gate (`AGENTS.md`, `docs/javascript-first.md`,
`examples/javascript-first/`, its two workflows and tests). The gate applies
only to repositories combined with the Rust template; this one is
JavaScript-only.

## Maintainer actions (cannot be done from a pull request)

`main` will keep failing until these are done, and each failure names the action:

1. Enable "Dependency graph" at
   https://github.com/link-assistant/legal/settings/security_analysis
   (Security / Dependency Review).
2. Publish `@link-assistant/legal` once: add an npm automation token as the
   `NPM_TOKEN` repository secret, let the release job publish, then configure
   the npm trusted publisher for `release.yml` and remove the token
   (Checks and release / Release Preflight).
3. Optional: add `RELEASE_PR_TOKEN` (fine-grained, Contents and Pull requests
   read/write) if a ruleset blocks `GITHUB_TOKEN` pushes to `main`
   (Example app / Regenerate Preview Images).

## Debugging switches (off by default)

- `DEPENDABOT_HEALTH_DEBUG=1`: traces every API page of the Dependabot scan.
- `DEPENDENCY_GRAPH_DEBUG=1`: prints every raw dependency-graph API answer;
  `DEPENDENCY_GRAPH_ATTEMPTS=<n>` sets the probe retry count.
- Existing template switches (`scripts/debug-print.mjs`) are unchanged.

## Reproduction scripts

- `experiments/issue-7-template-base.sh <template-checkout> <file>...`: finds
  the template revision each shared file was forked from (used to identify
  the 0a62b80 merge base).
- `experiments/issue-7-npm-pack-json-lifecycle.sh`: shows lifecycle stdout
  breaking `npm pack --json` and the `--foreground-scripts=false` fix.

## Final PR state

All six workflows passed on 8fa6524. `ci/annotations-8fa6524.tsv` lists every
annotation left: the two expected maintainer-action warnings (dependency
graph, first npm publish) and GitHub's own macOS arm64 capacity notices.
