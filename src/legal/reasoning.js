import { isISODate, isOptionalISODate } from './model.js';
import {
  assessLegalContext,
  Stance,
} from '../generated/formal-ai-relative.mjs';

const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
function matchFacts(conditions, facts) {
  const entries = Object.entries(conditions);
  if (entries.some(([key, value]) => own(facts, key) && facts[key] !== value)) {
    return false;
  }
  return entries.every(([key]) => own(facts, key)) ? true : null;
}
function validateRule(rule, laws) {
  const law = laws.find(
    (record) =>
      record.id === rule.lawId && record.contentHash === rule.contentHash
  );
  if (
    !law ||
    !rule.reviewedBy?.trim() ||
    rule.jurisdiction !== law.jurisdiction
  ) {
    throw new Error(
      'Rule requires a reviewed, hash-bound source in the same jurisdiction'
    );
  }
  validateCitation(rule, law);
  validateRuleDates(rule);
  if (
    !rule.when ||
    !rule.unless ||
    typeof rule.conclusion?.value !== 'boolean' ||
    !rule.conclusion.predicate
  ) {
    throw new Error('Invalid rule conditions or conclusion');
  }
  for (const conditions of [rule.when, rule.unless]) {
    if (
      Object.values(conditions).some(
        (value) => !['string', 'number', 'boolean'].includes(typeof value)
      )
    ) {
      throw new Error('Facts must be primitive values');
    }
  }
  if (!isISODate(rule.effectiveFrom)) {
    throw new Error('Reviewed rules require an effectiveFrom date');
  }
  return law;
}
// Executable meaning is supplied by a named reviewer, never inferred from modal cues.
export function evaluateRules(laws, rules, facts, context) {
  if (
    !facts ||
    typeof facts !== 'object' ||
    Array.isArray(facts) ||
    !context?.jurisdiction ||
    !context.predicate ||
    !isISODate(context.asOf)
  ) {
    throw new Error(
      'Rule evaluation requires facts, jurisdiction, predicate and asOf date'
    );
  }
  const trace = [];
  const evidence = [];
  for (const rule of rules) {
    const law = validateRule(rule, laws);
    const inScope = inRuleScope(rule, context);
    const when = matchFacts(rule.when, facts);
    const exception = Object.keys(rule.unless).length
      ? matchFacts(rule.unless, facts)
      : false;
    const applies = inScope && when === true && exception === false;
    trace.push({
      ruleId: rule.id,
      inScope,
      when,
      exception,
      applies,
      citation: {
        lawId: law.id,
        contentHash: law.contentHash,
        url: law.url,
        start: rule.start,
        end: rule.end,
        quote: rule.quote,
      },
      reviewedBy: rule.reviewedBy,
    });
    if (applies) {
      evidence.push({
        source_label: rule.id,
        stance: rule.conclusion.value ? Stance.Supports : Stance.Contradicts,
      });
    }
  }
  return {
    ...assessLegalContext(evidence),
    predicate: context.predicate,
    context,
    trace,
    limits: [
      'Results are conditional on supplied reviewed rules and facts. Corpus and rule coverage are incomplete. Conflicting rules require legal resolution; no priority is invented.',
    ],
  };
}

function validateCitation(rule, law) {
  if (
    !Number.isInteger(rule.start) ||
    !Number.isInteger(rule.end) ||
    rule.start < 0 ||
    rule.end <= rule.start ||
    law.text.slice(rule.start, rule.end) !== rule.quote
  ) {
    throw new Error('Rule citation does not match source text');
  }
}

function inRuleScope(rule, context) {
  return (
    rule.jurisdiction === context.jurisdiction &&
    rule.conclusion.predicate === context.predicate &&
    context.asOf >= rule.effectiveFrom &&
    (!rule.effectiveTo || context.asOf < rule.effectiveTo)
  );
}

function validateRuleDates(rule) {
  if (
    !isOptionalISODate(rule.effectiveTo) ||
    (rule.effectiveTo && rule.effectiveTo <= rule.effectiveFrom)
  ) {
    throw new Error('Invalid rule effective date range');
  }
}
