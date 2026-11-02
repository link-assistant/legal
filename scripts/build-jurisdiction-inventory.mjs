// Builds data/inventory/jurisdictions.json from Wikidata entity documents.
// Uses only robots-allowed Special:EntityData/{QID}.json URLs through the
// production SourceClient (robots, allowlist, throttle, byte limit). Network
// use is bounded: about 450 sequential requests. Not run in CI.
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CollectionStore, SourceClient } from '../src/legal/collector.js';
import {
  buildJurisdictionInventory,
  parseWikidataEntity,
} from '../src/legal/inventory.js';

const output = process.argv[2] ?? 'data/inventory/jurisdictions.json';
const verbose = process.env.LEGAL_INVENTORY_DEBUG === '1';
const source = {
  id: 'wikidata',
  origin: 'https://www.wikidata.org',
  intervalMs: 1000,
};
const store = new CollectionStore(
  process.env.LEGAL_INVENTORY_STORE ??
    (await mkdtemp(join(tmpdir(), 'legal-inventory-')))
);
const client = new SourceClient({
  store,
  maxBytes: 16_000_000,
  timeoutMs: 60000,
  debug: verbose ? (event) => console.error(JSON.stringify(event)) : () => {},
});
const entities = new Map();
const evidence = [];
const MAX_REQUESTS = 600;

async function fetchEntity(id) {
  if (entities.has(id)) {
    return entities.get(id);
  }
  if (evidence.length >= MAX_REQUESTS) {
    throw new Error(`Request budget of ${MAX_REQUESTS} exhausted`);
  }
  const url = `https://www.wikidata.org/wiki/Special:EntityData/${id}.json`;
  const response = await client.get(url, source);
  const entity = parseWikidataEntity(
    JSON.parse(new TextDecoder().decode(response.bytes)),
    id
  );
  entities.set(id, entity);
  entities.set(entity.id, entity);
  evidence.push({
    wikidata: id,
    revision: entity.revision,
    sha256: response.rawHash,
    bytes: response.bytes.length,
  });
  if (evidence.length % 25 === 0) {
    console.error(`fetched ${evidence.length} entities`);
  }
  return entity;
}

// Focus jurisdictions from issue 1, plus Europe defined as EU members, current
// Council of Europe members and three European states outside both bodies.
const focus = ['Q30', 'Q148', 'Q668', 'Q159', 'Q230'];
const nonMemberEurope = ['Q184', 'Q237', 'Q1246'];
const eu = await fetchEntity('Q458');
const councilOfEurope = await fetchEntity('Q8908');
const groups = new Map();
const tag = (ids, label) => {
  for (const id of ids) {
    groups.set(id, new Set([...(groups.get(id) ?? []), label]));
  }
};
const listed = [
  ...new Set([...focus, ...eu.subdivisions, ...councilOfEurope.parts]),
];
for (const id of [...listed, ...nonMemberEurope]) {
  await fetchEntity(id);
}
// A deprecated ISO 3166-1 code can name the item that carries it (P8327).
const resolveCountry = async (id) => {
  const subject = entities.get(id).codeSubjects.iso3166_1;
  if (!entities.get(id).iso3166_1 && subject) {
    await fetchEntity(subject);
    return subject;
  }
  return id;
};
const resolved = new Map();
for (const id of [...listed, ...nonMemberEurope]) {
  resolved.set(id, await resolveCountry(id));
}
// Membership is cross-checked in both directions: the organization's list and
// each fetched country's current P463 statements. Disagreements are kept.
const crossChecks = [];
for (const [label, organization, members] of [
  ['eu-member', 'Q458', eu.subdivisions],
  ['council-of-europe-member', 'Q8908', councilOfEurope.parts],
]) {
  const fromOrganization = new Set(members.map((id) => resolved.get(id)));
  const fromCountries = new Set(
    [...new Set(resolved.values())].filter((id) =>
      entities.get(id).memberOf.includes(organization)
    )
  );
  const union = [...new Set([...fromOrganization, ...fromCountries])].sort();
  tag(union, label);
  for (const id of union) {
    if (fromOrganization.has(id) !== fromCountries.has(id)) {
      crossChecks.push({
        organization,
        group: label,
        wikidata: id,
        name: entities.get(id).label,
        listedByOrganization: fromOrganization.has(id),
        countryMemberStatement: fromCountries.has(id),
      });
    }
  }
}
tag(nonMemberEurope, 'europe-non-member');
tag(focus, 'issue-1-focus');
const countries = [...new Set([...listed, ...nonMemberEurope])];
for (const id of focus) {
  for (const sub of entities.get(id).subdivisions) {
    await fetchEntity(sub);
  }
}
const languageIds = new Set(
  [eu, ...entities.values()].flatMap((entity) => entity.officialLanguages)
);
for (const id of [...languageIds].sort()) {
  const language = await fetchEntity(id);
  if (
    !language.iso639_1 &&
    !language.iso639_3 &&
    language.codeSubjects.iso639_1
  ) {
    await fetchEntity(language.codeSubjects.iso639_1);
  }
}

const inventory = buildJurisdictionInventory({
  entities,
  countries,
  supranational: [{ id: 'EU', wikidata: 'Q458', membersFrom: 'subdivisions' }],
  groups,
  resolveSubdivisions: focus,
  retrievedAt: new Date().toISOString(),
  selection: [
    'Supranational: European Union (Q458); members from its current P150 statements.',
    'National: issue 1 focus jurisdictions (US, CN, IN, RU, GE); current EU members; current Council of Europe members (Q8908 P527); Belarus, Vatican City and Kosovo as European states outside both bodies.',
    'Transcontinental states outside these sets (for example Kazakhstan) are excluded and must be decided explicitly.',
    'First-level subdivisions: current P150 statements. Names, ISO 3166-2 codes and official languages are fetched only for the five focus jurisdictions; other subdivisions are listed by Wikidata identifier.',
    'Official languages: current P37 statements, coded by ISO 639-1 (P218) or else ISO 639-3 (P220). A deprecated code that names its intended item (P8327) is followed once; languages left without a code keep their Wikidata identifier and are listed in unresolvedLanguages.',
    'Countries whose ISO 3166-1 code is deprecated in favour of an intended item (P8327) are replaced by that item, recorded in `via`.',
    'Membership: union of the organization statement (EU P150, Council of Europe P527) and current country P463 statements; disagreements are listed in crossChecks. A member missing from both is not found.',
  ],
  evidence,
  crossChecks,
});
await mkdir(join(output, '..'), { recursive: true });
await writeFile(output, `${JSON.stringify(inventory, null, 2)}\n`);
console.log(
  JSON.stringify({
    output,
    jurisdictions: inventory.jurisdictions.length,
    requests: evidence.length,
    store: store.root,
  })
);
