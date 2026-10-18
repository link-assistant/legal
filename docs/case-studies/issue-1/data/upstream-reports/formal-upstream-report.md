The JavaScript relative meta-logic component at fd5bfaced85262a51b341fb2b25c79e507423ca3 aggregates probabilistic evidence, but legal source absence, contradictions and contextual applicability need an explicit categorical interface.

Downstream work: https://github.com/link-assistant/legal/pull/2 (issue https://github.com/link-assistant/legal/issues/1).

Proposed addition: assessLegalContext(evidence) returning supported / contradicted / conflict / unknown, with provenance labels. Empty input must remain unknown; opposing source stances must remain a conflict. A probability must not be presented as proof of legal validity.

We are developing a patch against js/agentic/crate/relative_meta_logic.mjs in the downstream PR, kept as a patch with the pinned source checksum, and deterministic tests for exceptions, missing facts, dates, jurisdiction, conflicting rules and source drift. Executable rules require reviewed semantics and exact source spans. Surface modal extraction is explicitly unverified. This does not claim to solve arbitrary legal reasoning.

Upstream incorporation would remove the temporary patch and support other deterministic applications. Broader automatic semantic formalization of legislation remains an unresolved capability requirement.
