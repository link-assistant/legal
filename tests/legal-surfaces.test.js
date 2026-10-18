import { describe, it, expect } from 'test-anywhere';
import { readFile } from 'node:fs/promises';
import { runLegalCli } from '../bin/legal-assistant.js';
import { createLegalServer, loadCorpus } from '../src/legal/server.js';
import { extractLawReferences, decodeKnowledge } from '../src/legal/index.js';

async function withServer(action) {
  const corpus = await loadCorpus();
  const server = createLegalServer({ corpus });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    await action(`http://127.0.0.1:${server.address().port}`, corpus);
  } finally {
    await new Promise((resolve) => {
      server.close(resolve);
      // Deno's Node HTTP shim can retain fetch keep-alive sockets after close().
      server.closeAllConnections();
    });
  }
}
describe('shared CLI and HTTP assistant', () => {
  it('answers through the CLI from the same collected corpus', async () => {
    const output = [];
    const errors = [];
    expect(
      await runLegalCli(['ask', 'equality', '--jurisdiction', 'GE'], {
        stdout: (line) => output.push(line),
        stderr: (line) => errors.push(line),
      })
    ).toBe(0);
    const answer = JSON.parse(output.join('\n'));
    expect(answer.status).toBe('sources-found');
    expect(answer.citations[0].jurisdiction).toBe('GE');
    expect(errors).toEqual([]);
  });
  it('exits nonzero for invalid commands or malformed flags', async () => {
    expect(
      await runLegalCli(['explode'], { stdout: () => {}, stderr: () => {} })
    ).toBe(1);
    expect(
      await runLegalCli(['ask', 'law', '--limit', '-1'], {
        stdout: () => {},
        stderr: () => {},
      })
    ).toBe(1);
  });
  it('serves health, paginated laws, coverage and grounded answers', async () =>
    withServer(async (base, corpus) => {
      expect((await (await fetch(`${base}/health`)).json()).status).toBe('ok');
      const listing = await (await fetch(`${base}/v1/laws?limit=1`)).json();
      expect(listing.laws.length).toBe(1);
      expect(listing.total).toBe(corpus.laws.length);
      expect((await (await fetch(`${base}/v1/coverage`)).json()).complete).toBe(
        false
      );
      const answer = await (
        await fetch(`${base}/v1/answer`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            question: '法律',
            language: 'zh',
            jurisdiction: 'CN',
          }),
        })
      ).json();
      expect(answer.citations.length > 0).toBe(true);
      expect(answer.citations[0].language).toBe('zh');
      const law = corpus.laws.find(
        (item) => item.id === answer.citations[0].lawId
      );
      expect(
        law.text.slice(answer.citations[0].start, answer.citations[0].end)
      ).toBe(answer.citations[0].quote);
    }));
  it('rejects malformed input, unsupported methods and oversized bodies', async () =>
    withServer(async (base) => {
      expect(
        (await fetch(`${base}/v1/answer`, { method: 'POST', body: '{' })).status
      ).toBe(400);
      expect(
        (
          await fetch(`${base}/v1/answer`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ question: 'x'.repeat(20000) }),
          })
        ).status
      ).toBe(413);
      expect((await fetch(`${base}/v1/laws?limit=-3`)).status).toBe(400);
      expect(
        (await fetch(`${base}/v1/answer`, { method: 'DELETE' })).status
      ).toBe(405);
      expect((await fetch(`${base}/v1/laws/unknown`)).status).toBe(404);
    }));
  it('exports formalization through the API with a working LiNo interchange', async () =>
    withServer(async (base, corpus) => {
      const law = corpus.laws.find((item) => item.language === 'zh');
      const result = await fetch(
        `${base}/v1/laws/${encodeURIComponent(law.id)}/formalization?format=lino`
      );
      expect(result.status).toBe(200);
      expect((await result.text()).includes(law.id)).toBe(true);
    }));
  it('shares actual GDPR reference evidence across library, CLI, JSON and LiNo API', async () =>
    withServer(async (base, corpus) => {
      const law = corpus.laws.find(
        (item) => item.id === 'eu-gdpr-2016-article5-en'
      );
      const references = extractLawReferences(law);
      const output = [];
      const errors = [];
      expect(
        await runLegalCli(['formalize', law.id], {
          stdout: (line) => output.push(line),
          stderr: (line) => errors.push(line),
        })
      ).toBe(0);
      expect(errors).toEqual([]);
      expect(JSON.parse(output.join('\n')).references).toEqual(references);
      const url = `${base}/v1/laws/${law.id}/formalization`;
      expect((await (await fetch(url)).json()).references).toEqual(references);
      expect(
        decodeKnowledge(await (await fetch(`${url}?format=lino`)).text())
          .references
      ).toEqual(references);
    }));
  it('keeps local source HTML links resolvable before building the demo', async () => {
    const { access } = await import('node:fs/promises');
    const { load } = await import('cheerio');
    const base = new URL('../web/index.html', import.meta.url);
    const $ = load(await readFile(base, 'utf8'));
    for (const element of $('[href], [src]').toArray()) {
      const path = $(element).attr('href') ?? $(element).attr('src');
      const url = new URL(path, base);
      if (url.protocol === 'file:') {
        await access(url);
      }
    }
  });
  it('ships official raw evidence that can reproduce every demo sample', async () => {
    const { gunzipSync } = await import('node:zlib');
    const { parseDocument } = await import('../src/legal/ingest.js');
    const { getSource } = await import('../src/legal/registry.js');
    const { hashContent, normalizeText } =
      await import('../src/legal/model.js');
    const manifest = JSON.parse(
      await readFile('data/demo/manifest.json', 'utf8')
    );
    const corpus = await loadCorpus();
    for (const entry of manifest.entries) {
      const bytes = new Uint8Array(
        gunzipSync(await readFile(`data/demo/${entry.rawPath}`))
      );
      expect(hashContent(bytes)).toBe(entry.rawHash);
      const parsed = await parseDocument(
        bytes,
        entry,
        getSource(entry.sourceId),
        'text/html'
      );
      expect(
        normalizeText(parsed[0].text.slice(0, entry.sampleCharacters))
      ).toBe(corpus.laws.find((law) => law.id === entry.id).text);
    }
  });
});
