import { it, expect } from 'test-anywhere';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { updateCollection } from '../src/legal/schedule.js';
import { CollectionStore } from '../src/legal/collector.js';
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
