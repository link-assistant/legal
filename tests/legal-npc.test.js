import { it, expect } from 'test-anywhere';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CollectionStore, SourceClient } from '../src/legal/collector.js';
import { discoverPage } from '../src/legal/ingest.js';
import { getSource } from '../src/legal/registry.js';
it('recognizes the NPC publisher rows contract and preserves unresolved detail identifiers', () => {
  const source = getSource('cn-npc');
  const result = discoverPage(
    { code: 200, rows: [{ bbbs: 'edition-1', title: 'Test law' }], total: 1 },
    source,
    source.catalogUrl,
    { pageSize: 2 }
  );
  expect(result.resources.length).toBe(1);
  expect(result.resources[0].id).toBe('edition-1');
  expect(result.entries.length).toBe(0);
});
it('paces and preserves evidence for distinct read-only POST catalog requests', async () => {
  const root = await mkdtemp(join(tmpdir(), 'legal-post-'));
  try {
    const store = new CollectionStore(root);
    const requests = [];
    const client = new SourceClient({
      store,
      respectRobots: false,
      fetchImpl: async (url, options) => {
        requests.push({ url, ...options });
        return new Response(
          JSON.stringify({
            code: 200,
            rows: [],
            page: JSON.parse(options.body).pageNum,
          }),
          { headers: { 'content-type': 'application/json' } }
        );
      },
    });
    const source = { ...getSource('cn-npc'), intervalMs: 0 };
    const a = await client.postJson(source.catalogUrl, { pageNum: 1 }, source);
    const b = await client.postJson(source.catalogUrl, { pageNum: 2 }, source);
    expect(requests[0].method).toBe('POST');
    expect(requests[0].headers['content-type']).toBe('application/json');
    expect(a.rawHash === b.rawHash).toBe(false);
    expect(
      new TextDecoder().decode(await store.raw(a.rawHash)).includes('"page":1')
    ).toBe(true);
    expect(requests[1].headers['if-none-match']).toBe(undefined);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
it('honors a publisher-wide robots prohibition before issuing POST discovery', async () => {
  const root = await mkdtemp(join(tmpdir(), 'legal-npc-robots-'));
  try {
    const requests = [];
    const client = new SourceClient({
      store: new CollectionStore(root),
      fetchImpl: async (url) => {
        requests.push(url);
        return new Response(
          'User-agent: *\nDisallow: /\nUser-agent: *\nDisallow: /private/\n'
        );
      },
    });
    let message = '';
    try {
      await client.postJson(
        'https://flk.npc.gov.cn/law-search/search/list',
        {},
        getSource('cn-npc')
      );
    } catch (error) {
      message = error.message;
    }
    expect(message.includes('robots.txt disallows')).toBe(true);
    expect(requests.length).toBe(1);
    expect(requests[0]).toBe('https://flk.npc.gov.cn/robots.txt');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
