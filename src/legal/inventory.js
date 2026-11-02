// Secondary-source planning inventory. It lists jurisdictions, first-level
// subdivisions and official languages that collection must account for. It
// does not identify publishers, grant collection permission or prove that a
// legal corpus is complete; every coverage result therefore stays incomplete.
import {
  jurisdictions as registry,
  sources as registrySources,
} from './registry.js';

const valueClaims = (claims = []) =>
  claims.filter(
    (claim) =>
      claim.rank !== 'deprecated' &&
      !claim.qualifiers?.P582 &&
      claim.mainsnak?.snaktype === 'value'
  );
const entityIds = (claims) => [
  ...new Set(
    valueClaims(claims)
      .map((claim) => claim.mainsnak.datavalue?.value?.id)
      .filter((id) => /^Q\d+$/.test(id ?? ''))
  ),
];
const strings = (claims) =>
  valueClaims(claims)
    .map((claim) => claim.mainsnak.datavalue?.value)
    .filter((value) => typeof value === 'string');
const firstString = (claims) => strings(claims)[0] ?? null;
// A deprecated code statement may name the item it was intended for (P8327),
// such as the Netherlands constituent country pointing to the Kingdom.
const intendedSubject = (claims = []) =>
  claims
    .filter((claim) => claim.rank === 'deprecated')
    .map((claim) => claim.qualifiers?.P8327?.[0]?.datavalue?.value?.id)
    .find((id) => /^Q\d+$/.test(id ?? '')) ?? null;

// Reads one Special:EntityData JSON document. Statements with an end time or
// deprecated rank are historical and excluded; dissolution is reported.
export function parseWikidataEntity(document, requestedId) {
  const entities = document?.entities ?? {};
  const entity = entities[requestedId] ?? Object.values(entities)[0];
  if (!entity || !/^Q\d+$/.test(entity.id ?? '')) {
    throw new Error('Invalid Wikidata entity document');
  }
  const claims = entity.claims ?? {};
  return {
    id: entity.id,
    requestedId: requestedId ?? entity.id,
    revision: entity.lastrevid ?? null,
    modified: entity.modified ?? null,
    label: entity.labels?.en?.value ?? null,
    iso3166_1: firstString(claims.P297),
    iso3166_2: firstString(claims.P300),
    iso639_1: firstString(claims.P218),
    iso639_3: firstString(claims.P220),
    officialLanguages: entityIds(claims.P37),
    subdivisions: entityIds(claims.P150),
    parts: entityIds(claims.P527),
    memberOf: entityIds(claims.P463),
    dissolved: valueClaims(claims.P576).length > 0,
    codeSubjects: {
      iso3166_1: intendedSubject(claims.P297),
      iso639_1: intendedSubject(claims.P218),
    },
  };
}

function languageCode(entity, entities) {
  const target = entities.get(entity?.codeSubjects?.iso639_1);
  return (
    entity?.iso639_1 ??
    entity?.iso639_3 ??
    target?.iso639_1 ??
    target?.iso639_3 ??
    null
  );
}

function languageList(ids, entities) {
  return [
    ...new Set(ids.map((id) => languageCode(entities.get(id), entities) ?? id)),
  ].sort();
}

// Returns the entity that carries the current ISO 3166-1 code, following a
// deprecated code's intended subject once.
function countryEntity(id, entities) {
  const entity = entities.get(id);
  if (entity && !entity.iso3166_1 && entity.codeSubjects?.iso3166_1) {
    const target = entities.get(entity.codeSubjects.iso3166_1);
    if (target?.iso3166_1) {
      return { entity: target, via: id };
    }
  }
  return { entity, via: null };
}

function exclusionReason(entity) {
  if (!entity) {
    return 'not-fetched';
  }
  return entity.dissolved ? 'dissolved' : 'no-current-iso-3166-1-code';
}

function provenance(entity) {
  return { wikidata: entity.id, revision: entity.revision };
}

function subdivisionRecord(id, entities) {
  const entity = entities.get(id);
  if (!entity) {
    return { wikidata: id, resolved: false };
  }
  return {
    ...provenance(entity),
    code: entity.iso3166_2,
    name: entity.label,
    officialLanguages: languageList(entity.officialLanguages, entities),
    resolved: true,
  };
}

function subdivisionList(entity, known, resolved) {
  const listed = entity.subdivisions.filter(
    (item) => !resolved || !known.get(item)?.dissolved
  );
  return {
    level: 'first-level (Wikidata P150)',
    listed: listed.length,
    resolved,
    items: resolved
      ? listed
          .map((item) => subdivisionRecord(item, known))
          .sort((a, b) =>
            String(a.code ?? a.name).localeCompare(String(b.code ?? b.name))
          )
      : listed.map((item) => ({ wikidata: item, resolved: false })),
  };
}

function nationalRecord(entity, known, { via, labels, resolved }) {
  return {
    id: entity.iso3166_1,
    ...provenance(entity),
    via: via ? [via] : [],
    name: entity.label,
    level: 'national',
    groups: [...new Set(labels)].sort(),
    officialLanguages: languageList(entity.officialLanguages, known),
    subdivisions: subdivisionList(entity, known, resolved),
  };
}

function nationalRecords(countries, known, { groups, resolveSubdivisions }) {
  const records = [];
  const excluded = [];
  const seen = new Map();
  for (const id of countries) {
    const { entity, via } = countryEntity(id, known);
    if (!entity || entity.dissolved || !entity.iso3166_1) {
      excluded.push({ wikidata: id, reason: exclusionReason(entity) });
      continue;
    }
    const labels = [
      ...(groups.get(id) ?? []),
      ...(groups.get(entity.id) ?? []),
    ];
    if (seen.has(entity.id)) {
      const record = seen.get(entity.id);
      record.groups = [...new Set([...record.groups, ...labels])].sort();
      record.via = [...new Set([...record.via, ...(via ? [via] : [])])].sort();
      continue;
    }
    const record = nationalRecord(entity, known, {
      via,
      labels,
      resolved:
        resolveSubdivisions.includes(id) ||
        resolveSubdivisions.includes(entity.id),
    });
    seen.set(entity.id, record);
    records.push(record);
  }
  return { records, excluded };
}

// Builds a deterministic inventory from parsed entities. `groups` maps a
// country item to membership labels such as `eu-member`; `resolveSubdivisions`
// lists countries whose subdivision items were fetched and named.
export function buildJurisdictionInventory({
  entities,
  countries,
  supranational = [],
  groups = new Map(),
  resolveSubdivisions = [],
  retrievedAt,
  selection = [],
  evidence = [],
  crossChecks = [],
}) {
  const known = entities instanceof Map ? entities : new Map(entities);
  const records = [];
  for (const item of supranational) {
    const entity = known.get(item.wikidata);
    records.push({
      id: item.id,
      ...provenance(entity),
      name: entity.label,
      level: 'supranational',
      officialLanguages: languageList(entity.officialLanguages, known),
      members: entity[item.membersFrom]
        .map((id) => countryEntity(id, known).entity?.iso3166_1 ?? id)
        .sort(),
    });
  }
  const national = nationalRecords(countries, known, {
    groups,
    resolveSubdivisions,
  });
  records.push(...national.records);
  const { excluded } = national;
  records.sort(
    (a, b) =>
      Number(a.level !== 'supranational') -
        Number(b.level !== 'supranational') || a.id.localeCompare(b.id)
  );
  return {
    schemaVersion: 1,
    kind: 'secondary-source-planning-inventory',
    complete: false,
    retrievedAt,
    source: {
      name: 'Wikidata',
      license: 'CC0-1.0',
      access: 'https://www.wikidata.org/wiki/Special:EntityData/{QID}.json',
      robots:
        'Allowed by "Allow: /wiki/Special:EntityData/*." in www.wikidata.org robots.txt; query.wikidata.org disallows /sparql and is not used.',
    },
    selection,
    limits: [
      'Wikidata is a secondary, community-edited source. It is a planning checklist, not an official list of jurisdictions or languages.',
      'Subdivision and membership statements reflect Wikidata claims, including territories whose status is disputed. No position on sovereignty is taken.',
      'Only first-level subdivisions are listed. Municipal, tribal, local and special jurisdictions are not enumerated.',
      'Official-language statements do not establish which languages laws are published in, and publication languages may be broader or narrower.',
      'Publishers are identified only through the reviewed source registry. Everything else stays "unidentified".',
    ],
    jurisdictions: records,
    excluded,
    unresolvedLanguages: [
      ...new Set(
        records.flatMap((record) =>
          record.officialLanguages.filter((code) => /^Q\d+$/.test(code))
        )
      ),
    ].sort(),
    crossChecks,
    evidence: [...evidence].sort((a, b) =>
      a.wikidata.localeCompare(b.wikidata)
    ),
  };
}

const unique = (values) => [...new Set(values)].sort();

// Compares a corpus with the planning inventory. Subnational records must use
// ISO 3166-2 jurisdiction codes (for example `US-CA`) to count as collected.
export function inventoryCoverage(
  inventory,
  laws = [],
  { sources = registrySources, jurisdictions = registry } = {}
) {
  const rows = inventory.jurisdictions.map((item) => {
    const records = laws.filter((law) => law.jurisdiction === item.id);
    const collectedLanguages = unique(records.map((law) => law.language));
    const publishers = sources
      .filter((source) => source.jurisdiction === item.id)
      .map((source) => source.id);
    const registered = jurisdictions.find((entry) => entry.id === item.id);
    const subdivisionCodes = (item.subdivisions?.items ?? [])
      .map((entry) => entry.code)
      .filter(Boolean);
    const collectedSubdivisions = unique(
      laws
        .map((law) => law.jurisdiction)
        .filter((code) => subdivisionCodes.includes(code))
    );
    return {
      id: item.id,
      name: item.name,
      level: item.level,
      publisherStatus: publishers.length ? 'registered' : 'unidentified',
      publishers,
      officialLanguages: item.officialLanguages,
      collectedLanguages,
      missingOfficialLanguages: item.officialLanguages.filter(
        (language) => !collectedLanguages.includes(language)
      ),
      officialLanguagesOutsideRegistry: registered
        ? item.officialLanguages.filter(
            (language) => !registered.languages.includes(language)
          )
        : item.officialLanguages,
      documents: records.length,
      subdivisions: item.subdivisions
        ? {
            listed: item.subdivisions.listed,
            named: item.subdivisions.resolved,
            withDocuments: collectedSubdivisions.length,
            collected: collectedSubdivisions,
          }
        : null,
      complete: false,
    };
  });
  const count = (predicate) => rows.filter(predicate).length;
  return {
    complete: false,
    level: 'planning-inventory-gap-report',
    inventoryRetrievedAt: inventory.retrievedAt,
    summary: {
      jurisdictions: rows.length,
      withRegisteredPublisher: count((row) => row.publishers.length > 0),
      withoutIdentifiedPublisher: count((row) => !row.publishers.length),
      withDocuments: count((row) => row.documents > 0),
      officialLanguagePairs: rows.reduce(
        (total, row) => total + row.officialLanguages.length,
        0
      ),
      officialLanguagePairsWithDocuments: rows.reduce(
        (total, row) =>
          total +
          row.officialLanguages.length -
          row.missingOfficialLanguages.length,
        0
      ),
      subdivisionsListed: rows.reduce(
        (total, row) => total + (row.subdivisions?.listed ?? 0),
        0
      ),
      subdivisionsWithDocuments: rows.reduce(
        (total, row) => total + (row.subdivisions?.withDocuments ?? 0),
        0
      ),
    },
    jurisdictions: rows,
    limits: [
      ...inventory.limits,
      'A registered publisher is not evidence of permitted or complete collection.',
      'Coverage stays incomplete until permitted collection paths and independent completeness checks exist for every listed jurisdiction and language.',
    ],
  };
}
