import { mkdir, writeFile } from 'node:fs/promises';
import { CollectionStore, SourceClient } from '../src/legal/collector.js';

// Finite official URLs found in current government indexes. Research only:
// no discovery loop, no retries, 8 MB per response and 25 seconds per request.
// Production policy, origin allowlists and publisher delays apply before content.
const root = 'experiments/official/current-government';
const targets = [
  {
    id: 'in-constitution-2025-en',
    url: 'https://www.legislative.gov.in/static/uploads/2025/12/f6ffd68fdbc63bef89c65e9963c6a1b5.pdf',
    origin: 'https://www.legislative.gov.in',
    allowedOrigins: ['https://legislative.gov.in'],
  },
  {
    id: 'ru-minjust-constitution',
    url: 'https://www.minjust.gov.ru/ru/documents/8011/',
    origin: 'https://www.minjust.gov.ru',
    allowedOrigins: ['https://minjust.gov.ru'],
  },
  {
    id: 'in-code-migrated',
    url: 'https://indiacode.gov.in/',
    origin: 'https://indiacode.gov.in',
    allowedOrigins: [],
  },
  {
    id: 'in-mea-constitution',
    url: 'https://www.mea.gov.in/constitution-of-india.htm',
    origin: 'https://www.mea.gov.in',
    allowedOrigins: [],
  },
];
const requested = process.argv.slice(2);
if (requested.some((id) => !targets.some((target) => target.id === id))) {
  throw new Error('Unknown target ID');
}
await mkdir(root, { recursive: true });
const results = [];
for (const target of targets.filter(
  (item) => requested.length === 0 || requested.includes(item.id)
)) {
  const store = new CollectionStore(`${root}/${target.id}`);
  const client = new SourceClient({
    store,
    retries: 0,
    maxBytes: 8_000_000,
    timeoutMs: 25000,
    debug: (event) => console.log(JSON.stringify({ id: target.id, ...event })),
  });
  const result = { ...target, attemptedAt: new Date().toISOString() };
  try {
    const response = await client.get(target.url, {
      ...target,
      intervalMs: 1500,
    });
    const { bytes, ...metadata } = response;
    await writeFile(`${root}/${target.id}.raw`, bytes);
    Object.assign(result, {
      status: 'downloaded',
      bytes: bytes.length,
      ...metadata,
    });
  } catch (error) {
    Object.assign(result, {
      status: 'stopped',
      error: error.message,
      cause: error.cause
        ? { code: error.cause.code, message: error.cause.message }
        : null,
    });
  }
  result.policies = [];
  for (const origin of [target.origin, ...target.allowedOrigins]) {
    const policy = await store.cache(`${origin}/robots.txt`);
    if (policy) {
      const bytes = await store.raw(policy.rawHash);
      await writeFile(
        `${root}/${target.id}-${new URL(origin).hostname}-robots.txt`,
        bytes
      );
      result.policies.push(policy);
    }
  }
  results.push(result);
  await writeFile(
    `${root}/results.json`,
    `${JSON.stringify(results, null, 2)}\n`
  );
  console.log(JSON.stringify(result));
}
