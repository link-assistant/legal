# Case study: tracking unfinished issue 1 acceptance after PR 2

Work for [issue 3](https://github.com/link-assistant/legal/issues/3) in [PR 4](https://github.com/link-assistant/legal/pull/4), dated 2 November 2026. The machine-checked tracker is [acceptance.json](acceptance.json). `tests/legal-acceptance.test.js` keeps it consistent with the issue 1 requirement table, the committed evidence files and the evaluation report.

## Outcome

Issue 1 product acceptance is **not met**, and this PR does not claim it. The PR keeps every unfinished criterion visible and adds three bounded pieces of evidence:

- A secondary-source planning inventory of jurisdictions, first-level subdivisions and official languages, plus a `gaps` report that compares any corpus with it.
- A bounded question evaluation. Each expected answer carries an edition-bound exact proof or an abstention reason.
- Deterministic extracted-text screening for decoding damage and script mismatch.

No live publisher access was attempted and no new legal capability is claimed. Collection, semantic modeling, lawyer review, the permanent corpus and npm publication remain unfinished or blocked, as listed below.

## Ownership and continuation

`konard` owns the repository, merged PR 2 and opened issue 3. PR 4 on `issue-3-8b3c6419eab1` is the single continuation prepared for issue 3; no second solver was started. [Hive-mind issue 3530](https://github.com/link-assistant/hive-mind/issues/3530) describes the earlier duplicated recovery. This PR resolves that duplication by adopting the duplicate session's commit through one branch, not by starting new parallel work.

## Timeline

| Date (UTC)          | Event                                                                                                                                                     |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-18 17:54    | PR 2 merged as `a208c29`; issue 1 closed automatically. The merge excluded the citation increment `07ce04e`.                                              |
| 2026-10-18 17:55    | Main runs: Checks and release, Security and Example app fail on missing npm publishing, Dependency graph and preview-token configuration.                 |
| 2026-10-19 to 11-02 | Weekly Security runs on main keep failing (last: [41464251786](https://github.com/link-assistant/legal/actions/runs/41464251786)); see [CI gate](#gates). |
| 2026-10-31          | Issue 3 opened to restore tracking.                                                                                                                       |
| 2026-11-02          | PR 4: `07ce04e` merged into the branch (`4217757`); lockfile advisories fixed (`50cc9aa`); inventory, evaluation, screening and this tracker added.       |

## Preserved commit 07ce04e

[07ce04e](https://github.com/link-assistant/legal/commit/07ce04e17945fe79307eaf211c187250d01a5e6d) adds `extractLawReferences`: explicit citation syntax with exact spans, record hashes and unreviewed local candidates, shared by the library, CLI, API and browser export. Review findings:

- It reproduces the two real `Article 89(1)` mentions in the collected GDPR Article 5 and leaves both without a target, because Article 89 is not collected.
- Every reference stays `verified:false` with `semantics:"citation-syntax-only"`. Candidate expansion is bounded at 16 and extraction rejects more than 10,000 mentions.
- It does not resolve cross-references semantically, interpret ranges or relative references, or prove equivalence.

**Disposition: adopted.** It was merged without changes in `4217757`, so its history is preserved, and the full suite runs on it in this PR. It advances R14 syntax only; R14 stays partial.

## Requirement reconciliation

Each row of the [issue 1 requirement table](../issue-1/README.md#requirement-inventory-and-evidence) maps to one tracker entry. Evidence paths for every row are in `acceptance.json`, and the test fails if any path disappears.

| ID  | Original requirement                                                          | Status on 2026-11-02 | Remaining                                                                                                                                                                                                                                       |
| --- | ----------------------------------------------------------------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R01 | Study all nine listed repositories                                            | verified-bounded     | No claim that every historical commit was audited.                                                                                                                                                                                              |
| R02 | Take the best collection ideas                                                | implemented          | Publisher adapters remain incomplete (R03-R08).                                                                                                                                                                                                 |
| R03 | Fully automate all laws in the USA                                            | unfinished           | Federal titles beyond the sample, 50 states, territories, tribal and local publishers, and case law. The inventory lists 56 first-level subdivisions with no publisher identified.                                                              |
| R04 | Fully automate all European laws                                              | blocked              | Only GDPR Article 5 is collected. Full EU discovery is unverified live. The inventory now lists the EU and every EU, Council of Europe and other European national jurisdiction, but no national European publisher is registered or collected. |
| R05 | Fully automate China                                                          | blocked              | The NPC robots policy disallows automated collection. A permitted source or publisher permission is required; regional and minority-language publishers are not identified.                                                                     |
| R06 | Fully automate India                                                          | blocked              | Robots retrieval failed (HTTP 403, HTTP 500, timeouts) on every probed origin on 2026-10-18. No Indian record exists; OCR and regional-language coverage are unfinished.                                                                        |
| R07 | Fully automate Russia                                                         | blocked              | Pravo timed out and Ministry of Justice robots retrieval was reset on 2026-10-18. No Russian record exists; republic-language and regional coverage are unfinished.                                                                             |
| R08 | Fully automate Georgia                                                        | partial              | Only an 18,000-character excerpt of the English translation is collected. Georgian and Abkhaz originals, editions and exhaustive discovery are unverified.                                                                                      |
| R09 | All government-supported languages                                            | unfinished           | The new official-language inventory is a secondary-source planning checklist, not a publication-language registry. `legal-assistant gaps` reports missing jurisdiction-language pairs; almost all remain uncollected.                           |
| R10 | Temporary real collection and tests built on it                               | verified-bounded     | Five records; three are truncated excerpts. Not a permanent corpus.                                                                                                                                                                             |
| R11 | Permanent collection later in separate repository, weekly/configurable        | blocked              | Scaffold only. Activation needs the owner to create the repository and approve publisher-terms and redistribution reviews (G6).                                                                                                                 |
| R12 | Avoid overloading government services                                         | implemented          | Mock-tested. No large live crawl has been run.                                                                                                                                                                                                  |
| R13 | Copy Formal AI; patches only stored                                           | verified-bounded     | None for the stated scope.                                                                                                                                                                                                                      |
| R14 | Formalize all laws into meta-language                                         | partial              | Lossless syntax and citation syntax only. Automatic semantics, amendments, scopes, definitions, exceptions and legal equivalence are unfinished (G4).                                                                                           |
| R15 | Virtually any legal question, precise and without LLMs                        | unfinished           | No LLM is used. The bounded evaluation passes 19 of 24 cases: all 16 answerable proofs are retrieved, but only 3 of 8 unanswerable questions abstain. Arbitrary legal interpretation is not supported.                                          |
| R16 | Library for scripts, tests and assistant                                      | implemented          | None for the stated scope.                                                                                                                                                                                                                      |
| R17 | CLI                                                                           | implemented          | None for the stated scope.                                                                                                                                                                                                                      |
| R18 | API                                                                           | implemented          | None for the stated scope.                                                                                                                                                                                                                      |
| R19 | Docker API                                                                    | verified-bounded     | Hosted Docker smoke was verified on 2026-10-18 at earlier commits; it must pass again on this PR head.                                                                                                                                          |
| R20 | Fully working GitHub Pages demo using only collected data                     | verified-bounded     | The demo is limited to the five collected records. Public deployment currency is tracked as a separate gate.                                                                                                                                    |
| R21 | Use associative stack, JavaScript only                                        | implemented          | Native and Rust services are not substituted.                                                                                                                                                                                                   |
| R22 | Report dependency gaps and continue with patches                              | verified-bounded     | None for the stated scope.                                                                                                                                                                                                                      |
| R23 | Lots of precise deterministic tests and no LLM                                | implemented          | Passing bounded tests do not certify unknown source catalogs or semantic universality.                                                                                                                                                          |
| R24 | Deep case study, additional online facts, every requirement and solution plan | implemented          | Unresolved work stays open in this tracker.                                                                                                                                                                                                     |
| R25 | All work in one PR; release and CI                                            | blocked              | PR 2 was merged with the scope unfinished; PR 4 continues it. Release needs npm credentials, and main CI needs owner settings (see gates).                                                                                                      |

Changes since the 18 October table: R04 and R09 now have the planning inventory and gap report as evidence, but their status is unchanged. R15 now has a measured bounded evaluation and remains unfinished. R14 includes the adopted citation syntax. No row moved to a completed state.

## Follow-up gaps

### G1: jurisdiction, publisher and language inventory (partial)

`scripts/build-jurisdiction-inventory.mjs` builds [data/inventory/jurisdictions.json](../../../data/inventory/jurisdictions.json) through the production `SourceClient`. It enforces robots, the origin allowlist, a 1 s interval and byte limits. Only `Special:EntityData/{QID}.json` is fetched; the Wikidata robots policy allows it. Each fetched document's revision and SHA-256 are recorded under `evidence`.

The committed build was retrieved at 2026-11-02T23:24Z with 445 entity requests. It lists 54 jurisdictions: the EU and 53 states. The states are tagged as 27 EU members, 46 Council of Europe members, 3 European states outside both (Belarus, Vatican City and Kosovo) and 5 issue 1 focus countries (Georgia is also a Council of Europe member). Kosovo appears as `XK`, a user-assigned code rather than an official ISO 3166-1 code. In total, 1457 first-level subdivisions are listed by Wikidata identifier. They are named with ISO 3166-2 codes and languages only for the focus countries: China 33, Georgia 12, India 36, Russia 85 and the United States 56. Two of those lack an ISO 3166-2 statement: Delhi and the Republic of Crimea. `excluded` is empty. `unresolvedLanguages` keeps four language items without an ISO 639 code: Q201966 (GB), Q33968 (RU), Q55698568 (AZ) and Q56463 (NO and SE).

Wikidata is community-edited, so the build exposes inconsistencies rather than hiding them:

- The Netherlands is listed by the EU and the Council of Europe as the constituent country (Q55), whose ISO code statement is deprecated in favour of the Kingdom (Q29999). The build follows that P8327 qualifier and records `via: ["Q55"]`. An earlier build silently dropped the Netherlands; `tests/legal-inventory.test.js` reproduces that case.
- Membership lists disagree between organization and country statements. Both directions are kept, and every disagreement is listed in `crossChecks`. The four found on 2 November: the Kingdom of the Netherlands is listed by the EU and the Council of Europe but has no matching P463 statement; Slovakia is listed by the Council of Europe without a matching P463 statement; Finland states Council of Europe membership but is missing from the organization's list. Before cross-checking, Finland was missing from the Council of Europe group.
- Official-language statements are not publication languages. For example, the United States record lists languages from a few states and territories but not English. The statements mix levels of government and are incomplete. These are planning prompts for review, not facts about publication.

Disclosure: before the Wikidata robots policy was read, about four exploratory requests went to `query.wikidata.org/sparql`, which robots disallows. Their output was discarded and is not used anywhere; the build never contacts that host.

Remaining: publishers outside the reviewed registry are `unidentified`. Subdivisions are named only for the five focus countries. Tribal, municipal and special jurisdictions are not enumerated. A primary-source check of the list is not done.

### G2: permitted collection paths and completeness checks (blocked)

Issue 3 says no live publisher-access test is claimed, and none was run. `legal-assistant gaps` gives the independent denominator: it compares a corpus with the inventory and reports, per jurisdiction, registered publishers, collected and missing official languages, and subdivisions with documents. On the demo corpus it reports 4 of 54 jurisdictions with documents, 6 with a registered publisher, 2 of 165 official language pairs with documents, and 0 of 1457 subdivisions with documents. Permitted collection is still blocked for China (robots disallow), India and Russia (robots retrieval failures on 18 October). Per-publisher catalog counts do not exist for any inventory row.

### G3: extraction, OCR and language handling (partial)

`assessTextQuality` flags replacement characters, private-use and unassigned code points, control characters, UTF-8 read as Latin-1, and text whose letters are not mostly in the scripts expected for the declared language. The test reproduces the case named in issue 1: Kruti Dev legacy-font Hindi extracted as Latin letters (`Hkkjr dk lafo/kku`) passes a letters-exist check but fails screening. All five demo records screen clean ([quality-report.json](quality-report.json)). Languages without a script mapping are reported as `script-unassessed`, not as passing. No OCR engine is integrated, scanned PDFs are still rejected, and screening is not a reviewed accuracy check.

### G4: edition-bound semantic modeling (blocked on legal review)

Scope decision: executable legal meaning is accepted only from a named reviewer. `evaluateRules` already requires a reviewed, hash-bound source in the same jurisdiction, a valid effective-date range, `when` and `unless` conditions, and it reports conflicts and unknowns. Citation syntax (07ce04e) is preserved, but no meaning is inferred from it. Inventing amendment, definition or exception models without qualified reviewers would present unverified law as fact, so this PR adds none. This gap needs reviewers for each jurisdiction and consolidated editions to model.

### G5: bounded real-question evaluation (implemented; results reported)

[data/evaluation/questions.json](../../../data/evaluation/questions.json) has 24 questions over the collected records: 16 answerable and 8 that must abstain. Each answerable case names the law ID, content hash, section and an exact quotation. The proof is validated against the edition independently of retrieval. Results ([evaluation-report.json](evaluation-report.json), `legal-assistant evaluate`, exit code 2):

| Measure                             | Result               |
| ----------------------------------- | -------------------- |
| Cases passed                        | 19 / 24              |
| Answerable proof within top 5       | 16 / 16              |
| Answerable proof at rank 1          | 15 / 16 (MRR 0.9688) |
| Unanswerable questions that abstain | 3 / 8                |

The five failures are all missed abstentions: an amendment not in the excerpt, a GDPR article that was not collected, an Indian article asked without a jurisdiction filter (in English and Hindi), and a Georgian presidential term beyond the excerpt. The lexical retriever returns unrelated sections, so it would cite the wrong law with confidence. The retriever is not tuned in this PR, so the measurement stays honest. Expected answers were written from the source text and are not lawyer-reviewed.

### G6: permanent corpus review (blocked on the owner)

The weekly collection scaffold remains inactive. Activation needs the owner to create the separate repository and record a publisher-terms and redistribution review. Nothing in this PR activates it.

## Gates

| Gate               | Status on 2026-11-02 | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------ | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Demo corpus        | Verified (bounded)   | Five records with raw evidence; three are 18,000-character excerpts.                                                                                                                                                                                                                                                                                                                                                                                  |
| CI on this PR      | Reported on PR 4     | See the PR checks for the head commit. Windows runs found two test defects, both fixed here: the tracker test did not read the CRLF checkout of the issue 1 table (`19bbc12`), and the existing robots budget test counted child-process start-up against its 3 s deadline (`981567f`). On `50cc9aa` the Deno test on windows-2025 hit the 20 s Changesets child timeout once on a slow runner; the dependency update touched no Changesets packages. |
| CI on main         | Failing              | Security: Dependency graph is disabled (owner setting), and the lockfiles had advisories that `50cc9aa` fixes. Checks and release: npm trusted publisher or `NPM_TOKEN` missing. Example app: `RELEASE_PR_TOKEN` missing.                                                                                                                                                                                                                             |
| Deployment         | Live (older build)   | GitHub Pages last deployed from `a208c29` at 2026-10-18 17:55; HTTP 200 on 2026-11-02. It predates `07ce04e`.                                                                                                                                                                                                                                                                                                                                         |
| npm publication    | Blocked              | `npm view @link-assistant/legal` returns 404. Needs a trusted publisher or `NPM_TOKEN`.                                                                                                                                                                                                                                                                                                                                                               |
| Product acceptance | **Not met**          | 16 of 31 tracked items are partial, unfinished or blocked.                                                                                                                                                                                                                                                                                                                                                                                            |

A passing CI run or a merged PR does not change the product-acceptance row.

## Owner actions that would unblock items

1. Enable Dependency graph and configure npm publishing (trusted publisher or `NPM_TOKEN`) and `RELEASE_PR_TOKEN`.
2. Decide where the permanent corpus lives and approve its publisher-terms review (G6, R11).
3. Arrange qualified legal reviewers for rules and expected answers (G4, G5).
4. Obtain publisher permission or permitted alternative sources for China, India and Russia (G2, R05 to R07).

## Reproduction

```bash
npm run test:legal                                   # includes the tracker test
node bin/legal-assistant.js evaluate                 # exits 2 while cases fail
node bin/legal-assistant.js quality
node bin/legal-assistant.js gaps > /tmp/gaps.json
LEGAL_INVENTORY_STORE=/tmp/inventory-store node scripts/build-jurisdiction-inventory.mjs  # network, about 450 requests
```
