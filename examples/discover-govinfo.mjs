import {
  Collector,
  CollectionStore,
  SourceClient,
} from '../src/legal/collector.js';
const store = new CollectionStore('collections/govinfo-probe');
const client = new SourceClient({ store, timeoutMs: 20000, maxBytes: 1500000 });
const result = await new Collector({ store, client }).discover('us-govinfo', {
  maxPages: 2,
  startUrl: process.argv[2],
});
console.log(
  JSON.stringify(
    {
      status: result.status,
      entries: result.entries.slice(0, 3),
      directoryCount: result.cursor?.visited.length,
      pending: result.cursor?.pending.length,
      errors: result.errors,
    },
    null,
    2
  )
);
