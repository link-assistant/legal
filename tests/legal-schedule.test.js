import { it, expect } from 'test-anywhere';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { updateCollection } from '../src/legal/schedule.js';
import { CollectionStore } from '../src/legal/collector.js';
import { getSource } from '../src/legal/registry.js';
it('checkpoints scheduled pagination and preserves failed entries for retries', async () => {
  const root = await mkdtemp(join(tmpdir(), 'legal-schedule-'));
  const store = new CollectionStore(root);
  let requests = 0;
  const client = {
    get: async () => {
      requests++;
      return {
        bytes: new TextEncoder().encode(
          '<a href="/en/document/view/30346">Constitution</a>'
        ),
        contentType: 'text/html',
        retrievedAt: new Date(0).toISOString(),
        rawHash: 'raw',
      };
    },
  };
  try {
    const config = {
      sources: [{ id: 'ge-matsne', languages: ['en'] }],
      documentsPerRun: 1,
    };
    const result = await updateCollection(config, { store, client });
    expect(result.complete).toBe(false);
    expect(result.results[0].status).toBe('partial');
    expect(result.results[0].pending).toBe(1);
    await updateCollection(config, { store, client });
    expect(requests).toBe(3);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it('starts a new directory traversal after the scheduled interval', async () => {
  const root = await mkdtemp(join(tmpdir(), 'legal-directory-schedule-'));
  const store = new CollectionStore(root);
  const source = getSource('us-govinfo');
  const requests = [];
  const client = {
    get: async (url) => {
      requests.push(url);
      const bytes = new TextEncoder().encode(
        url === source.catalogUrl
          ? '<a href="/bulkdata/CFR/volume.xml">Volume</a>'
          : '<CFRDOC><SECTION><SECTNO>1</SECTNO><P>Published rule.</P></SECTION></CFRDOC>'
      );
      return {
        bytes,
        contentType: 'application/xml',
        retrievedAt: new Date(0).toISOString(),
        rawHash: await store.putRaw(bytes),
      };
    },
  };
  try {
    const config = { sources: [{ id: source.id }], pagesPerRun: 1 };
    const first = await updateCollection(config, {
      store,
      client,
      now: new Date('2026-01-01'),
    });
    expect(first.results[0].status).toBe('success');
    const early = await updateCollection(config, {
      store,
      client,
      now: new Date('2026-01-02'),
    });
    expect(early.results[0].status).toBe('not-due');
    await updateCollection(config, {
      store,
      client,
      now: new Date('2026-01-08'),
    });
    expect(requests.filter((url) => url === source.catalogUrl).length).toBe(2);
    expect((await store.corpus()).laws.length).toBe(1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
