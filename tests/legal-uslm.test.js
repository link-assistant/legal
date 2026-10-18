import { it, expect } from 'test-anywhere';
import { readFile } from 'node:fs/promises';
import { parseDocument } from '../src/legal/ingest.js';
import { getSource } from '../src/legal/registry.js';
import { hashContent } from '../src/legal/model.js';

it('retains USLM title notes and context outside numbered sections', async () => {
  const records = await parseDocument(
    new TextEncoder().encode(
      '<uscDoc><meta><title>Metadata must stay separate</title></meta><main><heading>Rules of construction</heading><note>Editorial source note outside any section.</note><section identifier="/us/usc/t1/s1"><num>§ 1.</num><heading>Words</heading><content><p>Words include the plural.</p></content></section><section identifier="/us/usc/t1/s2"><num>§ 2.</num><content><p>County includes a parish.</p></content></section><notes><note>Statutory effective date outside a numbered section.</note></notes></main></uscDoc>'
    ),
    {
      id: 'uslm-context',
      title: 'US Code Title 1',
      url: 'https://uscode.house.gov/title1.xml',
      language: 'en',
      format: 'xml',
    },
    getSource('us-code')
  );
  const context = records.find(
    (record) => record.id === 'uslm-context:context'
  );
  expect(records.length).toBe(3);
  expect(context?.text.includes('Rules of construction')).toBe(true);
  expect(context?.text.includes('Statutory effective date')).toBe(true);
  expect(context?.text.includes('Editorial source note')).toBe(true);
  expect(context?.text.includes('Words include the plural')).toBe(false);
  expect(context?.text.includes('Metadata must stay separate')).toBe(false);
});

it('re-extracts the real US Code Title 1 with all sections and title-level statutory notes', async () => {
  const path = 'docs/case-studies/issue-1/data/uslm-sample';
  const evidence = JSON.parse(await readFile(`${path}.json`, 'utf8'));
  const bytes = new Uint8Array(await readFile(`${path}.zip`));
  expect(hashContent(bytes)).toBe(evidence.rawHash);
  expect(bytes.length).toBe(evidence.rawBytes);
  const records = await parseDocument(
    bytes,
    evidence.entry,
    getSource('us-code')
  );
  expect(records.length).toBe(40);
  expect(new Set(records.map((record) => record.id)).size).toBe(40);
  expect(records[0].id).toBe(evidence.firstId);
  const context = records.at(-1);
  expect(context.id.endsWith(':context')).toBe(true);
  expect(context.text.includes('Positive Law; Citation')).toBe(true);
  expect(context.text.includes('any rights or liabilities now existing')).toBe(
    true
  );
  expect(context.text.includes('shall not be affected by the repeal')).toBe(
    true
  );
});
