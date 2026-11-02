// Builds data/inventory/jurisdictions.json from Wikidata entity documents.
// Uses only robots-allowed Special:EntityData/{QID}.json URLs through the
// production SourceClient (robots, allowlist, throttle, byte limit). Network
// use is bounded: about 400 sequential requests. Not run in CI.
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
tag(eu.subdivisions, 'eu-member');
tag(councilOfEurope.parts, 'council-of-europe-member');
tag(nonMemberEurope, 'europe-non-member');
tag(focus, 'issue-1-focus');
const countries = [
  ...new Set([
    ...focus,
    ...eu.subdivisions,
    ...councilOfEurope.parts,
    ...nonMemberEurope,
  ]),
];
for (const id of countries) {
  await fetchEntity(id);
}
for (const id of focus) {
  for (const sub of entities.get(id).subdivisions) {
    await fetchEntity(sub);
  }
}
const languageIds = new Set(
  [eu, ...entities.values()].flatMap((entity) => entity.officialLanguages)
);
for (const id of [...languageIds].sort()) {
  await fetchEntity(id);
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
    'Official languages: current P37 statements, coded by ISO 639-1 (P218) or else ISO 639-3 (P220).',
  ],
  evidence,
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
