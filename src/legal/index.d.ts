export interface LawSection {
  id: string;
  label: string;
  text: string;
  start: number;
  end: number;
  byteStart: number;
  byteEnd: number;
}
export interface LawInput {
  id: string;
  jurisdiction: string;
  language: string;
  title: string;
  url: string;
  retrievedAt: string;
  text: string;
  sourceId?: string;
  authority?: string;
  status?: string;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  sourceVersion?: string | null;
  translation?: boolean;
  rawHash?: string | null;
  scope?: string;
}
export interface Law extends LawInput {
  schemaVersion: 1;
  contentHash: string;
  sections: LawSection[];
  status: string;
}
export interface QueryOptions {
  jurisdiction?: string;
  language?: string;
  asOf?: string;
  limit?: number;
}
export interface Citation {
  lawId: string;
  title: string;
  jurisdiction: string;
  language: string;
  sectionId: string;
  label: string;
  quote: string;
  start: number;
  end: number;
  byteStart: number;
  byteEnd: number;
  url: string;
  contentHash: string;
  retrievedAt: string;
  score: number;
  matchedTerms: string[];
  status: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  translation: boolean;
}
export interface LegalAnswer {
  question: string;
  status: 'sources-found' | 'insufficient-evidence';
  answer: string;
  citations: Citation[];
  method: 'deterministic-lexical-retrieval';
  assessment: {
    status: string;
    sources: string[];
    inference: string;
    proposition: string;
  };
  limits: string[];
}
export interface Source {
  id: string;
  jurisdiction: string;
  origin: string;
  adapter: string;
  languages: string[];
  intervalMs: number;
  termsUrl: string;
  catalogUrl?: string;
  contentSelector?: string;
  allowedOrigins?: string[];
}
export const jurisdictions: {
  id: string;
  name: string;
  languages: string[];
  scope: string;
}[];
export const sources: Source[];
export function getSource(id: string): Source;
export function buildCoverage(
  laws?: Law[],
  runs?: unknown[]
): {
  complete: false;
  level: string;
  jurisdictions: unknown[];
  runs: unknown[];
  limits: string[];
};
export function normalizeLaw(input: LawInput): Law;
export function normalizeText(text: string): string;
export function splitSections(text: string): LawSection[];
export function hashContent(value: string | Uint8Array): string;
export function tokenize(text: string): string[];
export function queryLaws(
  laws: Law[],
  question: string,
  options?: QueryOptions
): Citation[];
export function answerQuestion(
  laws: Law[],
  question: string,
  options?: QueryOptions
): LegalAnswer;
export function formalizeLaw(law: Law): {
  schemaVersion: number;
  lawId: string;
  contentHash: string;
  language: string;
  reconstructed: string;
  roundTrip: boolean;
  networks: unknown[];
  claims: {
    id: string;
    sectionId: string;
    quote: string;
    start: number;
    end: number;
    modality: string;
    qualifiers: string[];
    verified: false;
    semantics: string;
  }[];
  limits: string[];
};
export function encodeKnowledge(value: unknown): string;
export function decodeKnowledge(notation: string): unknown;

export interface ReviewedRule {
  id: string;
  reviewedBy: string;
  lawId: string;
  contentHash: string;
  start: number;
  end: number;
  quote: string;
  jurisdiction: string;
  effectiveFrom: string;
  effectiveTo?: string | null;
  when: Record<string, string | number | boolean>;
  unless: Record<string, string | number | boolean>;
  conclusion: { predicate: string; value: boolean };
}
export function evaluateRules(
  laws: Law[],
  rules: ReviewedRule[],
  facts: Record<string, string | number | boolean>,
  context: { jurisdiction: string; asOf: string; predicate: string }
): {
  status: 'supported' | 'contradicted' | 'conflict' | 'unknown';
  trace: unknown[];
  limits: string[];
};
