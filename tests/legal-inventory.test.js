import { describe, it, expect } from 'test-anywhere';
import { existsSync, readFileSync } from 'node:fs';
import {
  parseWikidataEntity,
  buildJurisdictionInventory,
  inventoryCoverage,
  normalizeLaw,
} from '../src/legal/index.js';

const item = (id) => ({
  mainsnak: {
    snaktype: 'value',
    datavalue: { value: { 'entity-type': 'item', id } },
  },
  rank: 'normal',
});
const text = (value) => ({
  mainsnak: { snaktype: 'value', datavalue: { value } },
  rank: 'normal',
});
const entity = (id, label, claims = {}) => ({
  entities: {
    [id]: { id, lastrevid: 7, labels: { en: { value: label } }, claims },
  },
});
const parsed = (id, label, claims) =>
  parseWikidataEntity(entity(id, label, claims), id);

function fixture() {
  const entities = [
    parsed('Q1', 'Union', { P37: [item('Q20')], P150: [item('Q2')] }),
    parsed('Q2', 'Alpha', {
      P297: [text('AA')],
      P37: [item('Q20'), item('Q21')],
      P150: [item('Q3'), item('Q4'), item('Q5')],
    }),
    parsed('Q3', 'North', { P300: [text('AA-N')], P37: [item('Q22')] }),
    parsed('Q4', 'South', { P300: [text('AA-S')] }),
    parsed('Q5', 'Former', { P300: [text('AA-F')], P576: [text('x')] }),
    parsed('Q6', 'Beta', { P297: [text('GE')], P37: [item('Q21')] }),
    parsed('Q20', 'English', { P218: [text('en')] }),
    parsed('Q21', 'Georgian', { P218: [text('ka')] }),
    parsed('Q22', 'Northern', { P220: [text('nrt')] }),
  ];
  return buildJurisdictionInventory({
    entities: entities.map((value) => [value.id, value]),
    countries: ['Q2', 'Q6', 'Q404'],
    supranational: [{ id: 'U1', wikidata: 'Q1', membersFrom: 'subdivisions' }],
    groups: new Map([['Q2', new Set(['member'])]]),
    resolveSubdivisions: ['Q2'],
    retrievedAt: '2026-11-02T00:00:00.000Z',
  });
}

describe('jurisdiction, subdivision and official-language inventory', () => {
  it('excludes deprecated and ended statements from Wikidata entities', () => {
    const value = parsed('Q9', 'Gamma', {
      P37: [
        item('Q20'),
        { ...item('Q21'), rank: 'deprecated' },
        { ...item('Q22'), qualifiers: { P582: [{}] } },
        { mainsnak: { snaktype: 'novalue' }, rank: 'normal' },
      ],
    });
    expect(value.officialLanguages).toEqual(['Q20']);
    expect(value.dissolved).toBe(false);
    expect(() => parseWikidataEntity({ entities: {} }, 'Q1')).toThrow();
  });

  it('builds a deterministic, explicitly incomplete planning inventory', () => {
    const inventory = fixture();
    expect(inventory.complete).toBe(false);
    expect(inventory.jurisdictions.map((value) => value.id)).toEqual([
      'U1',
      'AA',
      'GE',
    ]);
    const [union, alpha] = inventory.jurisdictions;
    expect(union.members).toEqual(['AA']);
    expect(alpha.officialLanguages).toEqual(['en', 'ka']);
    expect(alpha.groups).toEqual(['member']);
    expect(alpha.subdivisions.listed).toBe(2);
    expect(alpha.subdivisions.items.map((value) => value.code)).toEqual([
      'AA-N',
      'AA-S',
    ]);
    expect(alpha.subdivisions.items[0].officialLanguages).toEqual(['nrt']);
    expect(fixture()).toEqual(inventory);
  });

  it('reports unidentified publishers and missing languages and subdivisions', () => {
    const law = normalizeLaw({
      id: 'north-act',
      jurisdiction: 'AA-N',
      language: 'en',
      title: 'North act',
      url: 'https://example.test/north',
      retrievedAt: '2026-11-02T00:00:00.000Z',
      text: 'Article 1\nText.',
    });
    const report = inventoryCoverage(fixture(), [law]);
    const alpha = report.jurisdictions.find((value) => value.id === 'AA');
    const beta = report.jurisdictions.find((value) => value.id === 'GE');
    expect(alpha.publisherStatus).toBe('unidentified');
    expect(alpha.missingOfficialLanguages).toEqual(['en', 'ka']);
    expect(alpha.subdivisions.collected).toEqual(['AA-N']);
    expect(beta.publisherStatus).toBe('registered');
    expect(beta.officialLanguagesOutsideRegistry).toEqual([]);
    expect(report.summary.subdivisionsWithDocuments).toBe(1);
    expect(report.complete).toBe(false);
    expect(report.jurisdictions.every((row) => row.complete === false)).toBe(
      true
    );
  });

  it('keeps the committed Wikidata inventory traceable and incomplete', () => {
    const path = 'data/inventory/jurisdictions.json';
    expect(existsSync(path)).toBe(true);
    const inventory = JSON.parse(readFileSync(path, 'utf8'));
    const { laws } = JSON.parse(readFileSync('data/demo/corpus.json', 'utf8'));
    expect(inventory.complete).toBe(false);
    const ids = inventory.jurisdictions.map((value) => value.id);
    for (const id of ['EU', 'US', 'CN', 'IN', 'RU', 'GE', 'DE', 'UA', 'BY']) {
      expect(ids.includes(id)).toBe(true);
    }
    const sampled = new Set(inventory.evidence.map((value) => value.wikidata));
    for (const value of inventory.jurisdictions) {
      expect(sampled.has(value.wikidata)).toBe(true);
    }
    expect(
      inventory.evidence.every((value) => /^[0-9a-f]{64}$/.test(value.sha256))
    ).toBe(true);
    const report = inventoryCoverage(inventory, laws);
    expect(report.summary.withDocuments).toBe(4);
    expect(report.summary.withoutIdentifiedPublisher > 0).toBe(true);
  });
});
