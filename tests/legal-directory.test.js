import { it, expect } from 'test-anywhere';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Collector, CollectionStore } from '../src/legal/collector.js';
import { discoverPage } from '../src/legal/ingest.js';
import { getSource } from '../src/legal/registry.js';
import { runLegalCli } from '../bin/legal-assistant.js';

const base = 'https://www.govinfo.gov/bulkdata/CFR';
it('discovers real GovInfo child directories without trailing slashes', () => {
  const result = discoverPage(
    '<a href="/bulkdata/CFR/2026">2026</a>',
    getSource('us-govinfo'),
    base
  );
  expect(result.resources[0].url).toBe(`${base}/2026`);
});
it('resumes bounded directory traversal, deduplicates children and retains failed paths', async () => {
  const root = await mkdtemp(join(tmpdir(), 'legal-directories-'));
  const calls = [];
  let fail = true;
  const pages = {
    [base]:
      '<a href="/bulkdata/CFR/2026">2026</a><a href="/bulkdata/CFR/2025/">2025</a><a href="/bulkdata/CFR/2026">duplicate</a>',
    [`${base}/2026`]:
      '<a href="/bulkdata/CFR">parent</a><a href="/bulkdata/CFR/2026/title-1.xml">Title one</a><a href="https://example.com/other.xml">other</a>',
    [`${base}/2025/`]: '<a href="/bulkdata/CFR/2025/title-2.xml">Title two</a>',
  };
  const client = {
    get: async (url) => {
      calls.push(url);
      if (fail && url.endsWith('/2025/')) {
        throw new Error('Temporary publisher error');
      }
      if (!pages[url]) {
        throw new Error('Unexpected request');
      }
      return { bytes: new TextEncoder().encode(pages[url]) };
    },
  };
  try {
    const collector = new Collector({
      store: new CollectionStore(root),
      client,
    });
    const first = await collector.discover('us-govinfo', { maxPages: 2 });
    expect(first.entries.length).toBe(1);
    expect(first.status).toBe('partial');
    expect(first.cursor.pending).toEqual([`${base}/2025/`]);
    const second = await collector.discover('us-govinfo', {
      maxPages: 1,
      cursor: first.cursor,
    });
    expect(second.errors.length).toBe(1);
    expect(second.cursor.pending).toEqual([`${base}/2025/`]);
    fail = false;
    const third = await collector.discover('us-govinfo', {
      maxPages: 2,
      cursor: second.cursor,
    });
    expect(third.entries.length).toBe(1);
    expect(third.status).toBe('catalog-exhausted');
    expect(third.complete).toBe(false);
    expect(calls).toEqual([
      base,
      `${base}/2026`,
      `${base}/2025/`,
      `${base}/2025/`,
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
it('extracts every section from CFR XML with distinct identifiers', async () => {
  const { parseDocument } = await import('../src/legal/ingest.js');
  const xml =
    '<CFRDOC><TITLE><CHAPTER><PART><SECTION><SECTNO>§ 1.1</SECTNO><SUBJECT>First</SUBJECT><P>Every person shall follow the first rule.</P></SECTION><SECTION><SECTNO>§ 1.2</SECTNO><SUBJECT>Second</SUBJECT><P>Every person shall follow the second rule.</P></SECTION></PART></CHAPTER></TITLE></CFRDOC>';
  const records = await parseDocument(
    new TextEncoder().encode(xml),
    {
      id: 'cfr-test',
      title: 'Test CFR',
      language: 'en',
      url: `${base}/2026/title-1.xml`,
      format: 'xml',
    },
    getSource('us-govinfo'),
    'application/xml'
  );
  expect(records.length).toBe(2);
  expect(records[1].text.includes('second rule')).toBe(true);
  expect(records[0].id === records[1].id).toBe(false);
});
it('preserves CFR authority, headings and appendices outside numbered sections', async () => {
  const { parseDocument } = await import('../src/legal/ingest.js');
  const records = await parseDocument(
    new TextEncoder().encode(
      '<CFRDOC><TITLE><HD>Federal Regulations</HD><AUTH>Authority: an official statute.</AUTH><SECTION><SECTNO>§ 1.1</SECTNO><P>The numbered section text.</P></SECTION><APPENDIX><HD>Appendix A</HD><P>The binding appendix text.</P></APPENDIX></TITLE></CFRDOC>'
    ),
    {
      id: 'cfr-context',
      title: 'Title',
      language: 'en',
      url: `${base}/title.xml`,
      format: 'xml',
    },
    getSource('us-govinfo'),
    'application/xml'
  );
  const context = records.find((record) => record.id === 'cfr-context:context');
  expect(context?.text.includes('official statute')).toBe(true);
  expect(context?.text.includes('binding appendix text')).toBe(true);
  expect(context?.text.includes('numbered section text')).toBe(false);
});
it('scheduled runs persist directory cursors and collect each leaf before waiting a week', async () => {
  const { updateCollection } = await import('../src/legal/schedule.js');
  const root = await mkdtemp(join(tmpdir(), 'legal-directory-schedule-'));
  const requests = [];
  const xmlUrl = `${base}/2026/title-1.xml`;
  const client = {
    get: async (url) => {
      requests.push(url);
      return {
        bytes: new TextEncoder().encode(
          url === base
            ? '<a href="/bulkdata/CFR/2026">2026</a>'
            : url === `${base}/2026`
              ? `<a href="${xmlUrl}">Title 1</a>`
              : '<CFRDOC><SECTION><SECTNO>§ 1.1</SECTNO><P>Every person shall comply with the regulation in this section.</P></SECTION></CFRDOC>'
        ),
        contentType: url.endsWith('.xml') ? 'application/xml' : 'text/html',
        retrievedAt: '2026-10-18T00:00:00Z',
        rawHash: 'fixture',
      };
    },
  };
  try {
    const store = new CollectionStore(root);
    const config = {
      sources: [{ id: 'us-govinfo' }],
      pagesPerRun: 1,
      documentsPerRun: 1,
    };
    const one = await updateCollection(config, { store, client });
    expect(one.results[0].status).toBe('partial');
    const two = await updateCollection(config, { store, client });
    expect(two.results[0].status).toBe('success');
    expect((await store.corpus()).laws.length).toBe(1);
    const three = await updateCollection(config, { store, client });
    expect(three.results[0].status).toBe('not-due');
    expect(requests).toEqual([base, `${base}/2026`, xmlUrl]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
it('rejects a EUR-Lex title-only metadata page as law text', async () => {
  const { parseDocument } = await import('../src/legal/ingest.js');
  let message = '';
  try {
    await parseDocument(
      new TextEncoder().encode(
        '<html lang="en"><div class="eli-main-title">Regulation concerning a long legislative title with metadata but no legislative body.</div></html>'
      ),
      {
        id: 'eu-metadata',
        language: 'en',
        url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32016R0679',
        format: 'html',
      },
      getSource('eu-cellar'),
      'text/html'
    );
  } catch (error) {
    message = error.message;
  }
  expect(message.includes('selector')).toBe(true);
});
it('reproduces every section and unique identifier from the collected CFR volume', async () => {
  const { gunzipSync } = await import('node:zlib');
  const { hashContent } = await import('../src/legal/model.js');
  const { parseDocument } = await import('../src/legal/ingest.js');
  const path = 'docs/case-studies/issue-1/data/cfr-sample';
  const evidence = JSON.parse(await readFile(`${path}.json`, 'utf8'));
  const bytes = new Uint8Array(gunzipSync(await readFile(`${path}.xml.gz`)));
  expect(bytes.length).toBe(evidence.rawBytes);
  expect(hashContent(bytes)).toBe(evidence.rawHash);
  const records = await parseDocument(
    bytes,
    {
      id: 'cfr-2026-title2-vol1',
      title: 'CFR Title 2 Volume 1 (2026)',
      language: 'en',
      url: evidence.url,
      format: 'xml',
    },
    getSource('us-govinfo'),
    'application/xml'
  );
  const sections = records.filter((record) => record.id.includes(':section:'));
  expect(sections.length).toBe(1508);
  expect(records.length).toBe(1509);
  expect(new Set(records.map((record) => record.id)).size).toBe(records.length);
  expect(records[0].id).toBe(evidence.firstId);
  expect(sections.at(-1).id).toBe(evidence.lastId);
  expect(records.at(-1).id).toBe('cfr-2026-title2-vol1:context');
  expect(records.every((record) => record.text.length > 0)).toBe(true);
});
it('resumes a CLI directory manifest and reports incompatible manifests without rejection', async () => {
  const root = await mkdtemp(join(tmpdir(), 'legal-cli-resume-'));
  const path = join(root, 'manifest.json');
  const output = [];
  const errors = [];
  const command = ['discover', 'us-govinfo', '--resume', path, '--store', root];
  const io = {
    stdout: (line) => output.push(line),
    stderr: (line) => errors.push(line),
  };
  try {
    await writeFile(
      path,
      JSON.stringify({ schemaVersion: 1, sourceId: 'other' })
    );
    expect(await runLegalCli(command, io)).toBe(1);
    expect(errors[0]).toBe('Resume manifest must match the requested source');
    await writeFile(
      path,
      JSON.stringify({
        schemaVersion: 1,
        sourceId: 'us-govinfo',
        cursor: { pending: [], visited: [base] },
      })
    );
    expect(await runLegalCli(command, io)).toBe(0);
    expect(JSON.parse(output[0]).status).toBe('catalog-exhausted');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
