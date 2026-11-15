// Bounded question evaluation. Each answerable case names an edition-bound
// proof: law ID, content hash, section and an exact quotation. The proof is
// checked against the corpus independently of retrieval, then the answer is
// scored by whether retrieval cites that proof. Unanswerable cases must
// abstain. Passing cases do not establish legal correctness or full coverage.
import { answerQuestion } from './assistant.js';

function proofError(laws, expected) {
  const law = laws.find(
    (record) =>
      record.id === expected.lawId &&
      record.contentHash === expected.contentHash
  );
  if (!law) {
    return 'Expected law edition (ID and content hash) is not in the corpus';
  }
  const section = law.sections.find((item) => item.id === expected.sectionId);
  if (!section) {
    return 'Expected section is not in the law';
  }
  if (!expected.proof || !section.text.includes(expected.proof)) {
    return 'Expected proof is not an exact quotation of the section';
  }
  return null;
}

function evaluateCase(laws, item, limit) {
  const { expected } = item;
  if (!['sources-found', 'insufficient-evidence'].includes(expected?.status)) {
    throw new Error(`Invalid expected status for case ${item.id}`);
  }
  const answerable = expected.status === 'sources-found';
  const error = answerable ? proofError(laws, expected) : null;
  const response = answerQuestion(laws, item.question, {
    ...item.options,
    limit,
  });
  const rank = answerable
    ? response.citations.findIndex(
        (citation) =>
          citation.lawId === expected.lawId &&
          citation.contentHash === expected.contentHash &&
          citation.sectionId === expected.sectionId &&
          citation.quote.includes(expected.proof)
      ) + 1
    : 0;
  const passed =
    !error &&
    (answerable ? rank > 0 : response.status === 'insufficient-evidence');
  return {
    id: item.id,
    category: item.category,
    expectedStatus: expected.status,
    actualStatus: response.status,
    proofRank: rank || null,
    passed,
    proofError: error,
    citations: response.citations.map(
      (citation) => `${citation.lawId}:${citation.sectionId}`
    ),
  };
}

export function evaluateQuestions(laws, set, { limit = 5 } = {}) {
  if (!Array.isArray(set?.cases) || !set.cases.length) {
    throw new Error('Evaluation set must contain cases');
  }
  if (new Set(set.cases.map((item) => item.id)).size !== set.cases.length) {
    throw new Error('Evaluation case IDs must be unique');
  }
  const results = set.cases.map((item) => evaluateCase(laws, item, limit));
  const answerable = results.filter(
    (item) => item.expectedStatus === 'sources-found'
  );
  const unanswerable = results.filter(
    (item) => item.expectedStatus === 'insufficient-evidence'
  );
  const share = (count, total) =>
    total ? Number((count / total).toFixed(4)) : null;
  return {
    id: set.id,
    method: 'exact-proof-retrieval-and-abstention',
    limit,
    summary: {
      cases: results.length,
      passed: results.filter((item) => item.passed).length,
      failed: results.filter((item) => !item.passed).length,
      invalidProofs: results.filter((item) => item.proofError).length,
      answerable: answerable.length,
      proofAtRank1: answerable.filter((item) => item.proofRank === 1).length,
      proofWithinLimit: answerable.filter((item) => item.proofRank).length,
      meanReciprocalRank: share(
        answerable.reduce(
          (total, item) => total + (item.proofRank ? 1 / item.proofRank : 0),
          0
        ),
        answerable.length
      ),
      unanswerable: unanswerable.length,
      correctAbstentions: unanswerable.filter((item) => item.passed).length,
    },
    failures: results.filter((item) => !item.passed).map((item) => item.id),
    results,
    limits: [
      'Expected answers are not lawyer-reviewed. A passing case shows retrieval of the expected exact quotation, not a correct legal conclusion.',
      'The set is bounded to the collected demo records and does not measure coverage of any jurisdiction.',
    ],
  };
}
