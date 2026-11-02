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
  references: LawReference[];
  limits: string[];
};
export interface LawReference {
  id: string;
  lawId: string;
  contentHash: string;
  url: string;
  sectionId: string;
  quote: string;
  start: number;
  end: number;
  byteStart: number;
  byteEnd: number;
  role: 'heading-candidate' | 'reference-candidate';
  target: {
    unit: 'article' | 'section' | 'chapter' | 'paragraph';
    identifier: string;
    subdivisions: string[];
  };
  localCandidates: string[];
  localCandidateCount: number;
  candidatesTruncated: boolean;
  verified: false;
  semantics: 'citation-syntax-only';
}
export function extractLawReferences(law: Law): LawReference[];
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

export interface WikidataEntity {
  id: string;
  requestedId: string;
  revision: number | null;
  modified: string | null;
  label: string | null;
  iso3166_1: string | null;
  iso3166_2: string | null;
  iso639_1: string | null;
  iso639_3: string | null;
  officialLanguages: string[];
  subdivisions: string[];
  parts: string[];
  memberOf: string[];
  dissolved: boolean;
  codeSubjects: { iso3166_1: string | null; iso639_1: string | null };
}
export function parseWikidataEntity(
  document: unknown,
  requestedId?: string
): WikidataEntity;
export interface JurisdictionInventory {
  schemaVersion: 1;
  kind: 'secondary-source-planning-inventory';
  complete: false;
  retrievedAt: string;
  source: { name: string; license: string; access: string; robots: string };
  selection: string[];
  limits: string[];
  jurisdictions: {
    id: string;
    wikidata: string;
    revision: number | null;
    name: string | null;
    level: 'supranational' | 'national';
    via?: string[];
    groups?: string[];
    members?: string[];
    officialLanguages: string[];
    subdivisions?: {
      level: string;
      listed: number;
      resolved: boolean;
      items: {
        wikidata: string;
        resolved: boolean;
        revision?: number | null;
        code?: string | null;
        name?: string | null;
        officialLanguages?: string[];
      }[];
    };
  }[];
  excluded: {
    wikidata: string;
    reason: 'dissolved' | 'no-current-iso-3166-1-code' | 'not-fetched';
  }[];
  unresolvedLanguages: string[];
  crossChecks: {
    organization: string;
    group: string;
    wikidata: string;
    name: string | null;
    listedByOrganization: boolean;
    countryMemberStatement: boolean;
  }[];
  evidence: {
    wikidata: string;
    revision: number | null;
    sha256: string;
    bytes: number;
  }[];
}
export function buildJurisdictionInventory(options: {
  entities: Map<string, WikidataEntity> | [string, WikidataEntity][];
  countries: string[];
  supranational?: {
    id: string;
    wikidata: string;
    membersFrom: 'subdivisions' | 'parts';
  }[];
  groups?: Map<string, Iterable<string>>;
  resolveSubdivisions?: string[];
  retrievedAt: string;
  selection?: string[];
  evidence?: JurisdictionInventory['evidence'];
  crossChecks?: JurisdictionInventory['crossChecks'];
}): JurisdictionInventory;
export function inventoryCoverage(
  inventory: JurisdictionInventory,
  laws?: Law[],
  options?: { sources?: unknown[]; jurisdictions?: unknown[] }
): {
  complete: false;
  level: 'planning-inventory-gap-report';
  inventoryRetrievedAt: string;
  summary: Record<string, number>;
  jurisdictions: {
    id: string;
    name: string | null;
    level: 'supranational' | 'national';
    publisherStatus: 'registered' | 'unidentified';
    publishers: string[];
    officialLanguages: string[];
    collectedLanguages: string[];
    missingOfficialLanguages: string[];
    officialLanguagesOutsideRegistry: string[];
    documents: number;
    subdivisions: {
      listed: number;
      named: boolean;
      withDocuments: number;
      collected: string[];
    } | null;
    complete: false;
  }[];
  limits: string[];
};

export interface EvaluationCase {
  id: string;
  category?: string;
  question: string;
  options?: { jurisdiction?: string; language?: string; asOf?: string };
  expected:
    | {
        status: 'sources-found';
        answer: string;
        lawId: string;
        contentHash: string;
        sectionId: string;
        proof: string;
      }
    | { status: 'insufficient-evidence'; reason: string };
}
export function evaluateQuestions(
  laws: Law[],
  set: { id: string; cases: EvaluationCase[] },
  options?: { limit?: number }
): {
  id: string;
  method: 'exact-proof-retrieval-and-abstention';
  limit: number;
  summary: {
    cases: number;
    passed: number;
    failed: number;
    invalidProofs: number;
    answerable: number;
    proofAtRank1: number;
    proofWithinLimit: number;
    meanReciprocalRank: number | null;
    unanswerable: number;
    correctAbstentions: number;
  };
  failures: string[];
  results: {
    id: string;
    category?: string;
    expectedStatus: string;
    actualStatus: string;
    proofRank: number | null;
    passed: boolean;
    proofError: string | null;
    citations: string[];
  }[];
  limits: string[];
};

export interface TextQuality {
  language: string;
  expectedScripts: string[] | null;
  letters: number;
  expectedScriptShare: number | null;
  status: 'screened' | 'needs-review' | 'script-unassessed';
  issues: {
    code:
      | 'replacement-character'
      | 'private-use-character'
      | 'control-character'
      | 'unassigned-code-point'
      | 'utf8-as-latin1'
      | 'script-mismatch'
      | 'no-letters';
    count?: number;
    firstOffset?: number;
    share?: number;
  }[];
  reviewed: false;
  limits: string[];
}
export function expectedScripts(language: string): string[] | undefined;
export function assessTextQuality(
  text: string,
  language: string,
  options?: { minScriptShare?: number }
): TextQuality;
export function assessCorpusQuality(
  laws: Law[],
  options?: { minScriptShare?: number }
): {
  complete: false;
  records: (TextQuality & { lawId: string; contentHash: string })[];
  summary: {
    records: number;
    screened: number;
    needsReview: number;
    scriptUnassessed: number;
  };
};
