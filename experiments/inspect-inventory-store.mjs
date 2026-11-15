// Lists fetched Wikidata entities that the inventory dropped (no current ISO
// 3166-1 code or dissolved). Reads a LEGAL_INVENTORY_STORE raw directory.
import { readdirSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { parseWikidataEntity } from '../src/legal/inventory.js';

const [storeRaw, inventoryPath, ...ids] = process.argv.slice(2);
const inventory = JSON.parse(readFileSync(inventoryPath, 'utf8'));
const files = readdirSync(storeRaw);
for (const id of ids) {
  const evidence = inventory.evidence.find((item) => item.wikidata === id);
  const file = files.find((name) => name.startsWith(evidence.sha256));
  let bytes = readFileSync(`${storeRaw}/${file}`);
  try {
    bytes = gunzipSync(bytes);
  } catch {
    // Stored uncompressed.
  }
  const document = JSON.parse(bytes);
  const entity = parseWikidataEntity(document, id);
  const raw = Object.values(document.entities)[0];
  console.log(
    JSON.stringify({
      id,
      label: entity.label,
      iso3166_1: entity.iso3166_1,
      dissolved: entity.dissolved,
      rawP297: (raw.claims.P297 ?? []).map((claim) => [
        claim.rank,
        claim.mainsnak.datavalue?.value,
        Object.keys(claim.qualifiers ?? {}),
      ]),
    })
  );
}
