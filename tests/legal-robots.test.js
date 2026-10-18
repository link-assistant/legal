import { it, expect } from 'test-anywhere';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CollectionStore, SourceClient } from '../src/legal/collector.js';

async function withClient(policy, run) {
  const root = await mkdtemp(join(tmpdir(), 'legal-robots-'));
  const requests = [],
    delays = [];
  const client = new SourceClient({
    store: new CollectionStore(root),
    retries: 0,
    sleep: async (delay) => delays.push(delay),
    fetchImpl: async (url) => {
      requests.push(url);
      return new Response(url.endsWith('/robots.txt') ? policy : 'Law body');
    },
  });
  try {
    await run(client, requests, delays);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
const source = { origin: 'https://example.gov', intervalMs: 0 };
const url = 'https://example.gov/law';

it('rejects a successful HTML denial response masquerading as robots.txt', async () => {
  await withClient(
    '<html><title>Request Rejected</title></html>',
    async (client, requests) => {
      let error = '';
      try {
        await client.get(url, source);
      } catch (failure) {
        error = failure.message;
      }
      expect(error.includes('robots')).toBe(true);
      expect(requests).toEqual(['https://example.gov/robots.txt']);
    }
  );
});

it('honors the publisher crawl delay before the first document request', async () => {
  await withClient(
    'User-agent: *\nCrawl-delay: 10\nDisallow: /search',
    async (client, requests, delays) => {
      await client.get(url, source);
      expect(requests.length).toBe(2);
      expect(delays.some((delay) => delay > 9500 && delay <= 10000)).toBe(true);
    }
  );
});

it('uses the matching agent crawl delay and the stricter configured interval', async () => {
  await withClient(
    'User-agent: *\nCrawl-delay: 50\n\nUser-agent: LegalAssistant\nCrawl-delay: 2',
    async (client, _requests, delays) => {
      await client.get(url, { ...source, intervalMs: 3000 });
      expect(delays.every((delay) => delay <= 3000)).toBe(true);
      expect(delays.some((delay) => delay > 2500)).toBe(true);
    }
  );
});

it('stops collection if a publisher delay exceeds the bounded wait budget', async () => {
  await withClient(
    'User-agent: *\nCrawl-delay: 3600',
    async (client, requests) => {
      let error = '';
      try {
        await client.get(url, source);
      } catch (failure) {
        error = failure.message;
      }
      expect(error.includes('crawl-delay')).toBe(true);
      expect(requests.length).toBe(1);
    }
  );
});
