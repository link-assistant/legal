import {
  assessLegalContext,
  Stance,
} from '../generated/formal-ai-relative.mjs';
import { isISODate } from './model.js';

const ignored = new Set(
  'a an the is are of to in on and or what which how can i do does law laws article section all de la le les des en el и в на по что как о это कानून'.split(
    ' '
  )
);
export function tokenize(text) {
  const normalized = String(text).normalize('NFKC').toLowerCase();
  const tokens = normalized.match(/[\p{L}\p{N}]+/gu) ?? [];
  return [
    ...new Set(
      tokens.flatMap((token) => {
        if (/[\p{Script=Han}]/u.test(token)) {
          const chars = Array.from(token);
          return chars.length === 1
            ? chars
            : chars.slice(0, -1).map((char, i) => char + chars[i + 1]);
        }
        return ignored.has(token) ? [] : [token];
      })
    ),
  ];
}
function eligible(law, options) {
  if (options.jurisdiction && law.jurisdiction !== options.jurisdiction) {
    return false;
  }
  if (options.language && law.language !== options.language) {
    return false;
  }
  if (
    options.asOf &&
    (!law.effectiveFrom ||
      options.asOf < law.effectiveFrom ||
      (law.effectiveTo && options.asOf >= law.effectiveTo))
  ) {
    return false;
  }
  return true;
}
function validateOptions(question, options) {
  if (
    typeof question !== 'string' ||
    question.length > 4000 ||
    !question.trim()
  ) {
    throw new Error('Question must contain 1 to 4000 characters');
  }
  if (options.asOf !== undefined && !isISODate(options.asOf)) {
    throw new Error('asOf must be an ISO date');
  }
  if (
    options.limit !== undefined &&
    (!Number.isInteger(options.limit) ||
      options.limit < 1 ||
      options.limit > 100)
  ) {
    throw new Error('limit must be an integer between 1 and 100');
  }
}
export function queryLaws(laws, question, options = {}) {
  validateOptions(question, options);
  const terms = tokenize(question);
  if (!terms.length) {
    return [];
  }
  const candidates = [];
  for (const law of laws.filter((record) => eligible(record, options))) {
    for (const section of law.sections) {
      const words = tokenize(`${law.title}\n${section.text}`);
      const matched = terms.filter((term) => words.includes(term));
      if (!matched.length) {
        continue;
      }
      candidates.push({
        lawId: law.id,
        title: law.title,
        jurisdiction: law.jurisdiction,
        language: law.language,
        sectionId: section.id,
        label: section.label,
        quote: section.text,
        start: section.start,
        end: section.end,
        byteStart: section.byteStart,
        byteEnd: section.byteEnd,
        url: law.url,
        contentHash: law.contentHash,
        retrievedAt: law.retrievedAt,
        status: law.status,
        effectiveFrom: law.effectiveFrom,
        effectiveTo: law.effectiveTo,
        translation: law.translation,
        matchedTerms: matched,
        score:
          matched.length / terms.length + matched.length / (words.length + 1),
      });
    }
  }
  return candidates
    .sort(
      (a, b) =>
        b.score - a.score || a.lawId.localeCompare(b.lawId) || a.start - b.start
    )
    .slice(0, options.limit ?? 5);
}
export function answerQuestion(laws, question, options = {}) {
  const citations = queryLaws(laws, question, options);
  const evidence = citations.map((citation) => ({
    source_label: `${citation.lawId}:${citation.sectionId}@${citation.contentHash}`,
    stance: Stance.Supports,
  }));
  return {
    question,
    status: citations.length ? 'sources-found' : 'insufficient-evidence',
    answer: citations.length
      ? citations.map((citation) => citation.quote).join('\n\n')
      : 'The collected corpus has insufficient evidence for this question.',
    citations,
    assessment: {
      ...assessLegalContext(evidence),
      proposition:
        'Matching source text exists; this does not assess the answer to the legal question.',
    },
    method: 'deterministic-lexical-retrieval',
    limits: [
      'Matches are source quotations, not a determination of legal applicability.',
      'Coverage is incomplete; absence of a match is not evidence of absence.',
      'Check the source edition and effective dates. Unknown-date records are excluded from asOf queries.',
      ...(citations.some((citation) => citation.translation)
        ? [
            'Official translations may differ in authority or currency from the original.',
          ]
        : []),
    ],
  };
}
