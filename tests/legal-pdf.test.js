import { it, expect } from 'test-anywhere';
import { pdfFixture } from '../experiments/pdf-fixture.mjs';
import { parseDocument } from '../src/legal/ingest.js';
import { getSource } from '../src/legal/registry.js';
it('extracts text from a real PDF and releases its loading task', async () => {
  const fixture = pdfFixture();
  const records = await parseDocument(
    fixture.bytes,
    { id: 'pdf-test', title: 'Test', language: 'en', format: 'pdf' },
    getSource('in-code'),
    'application/pdf'
  );
  expect(records[0].text).toBe(fixture.text);
});
