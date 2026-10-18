import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  Collector,
  CollectionStore,
  SourceClient,
  atomicJson,
} from './collector.js';
import { getSource } from './registry.js';

function validateConfig(config) {
  const intervalDays = config.intervalDays ?? 7;
  const documentsPerRun = config.documentsPerRun ?? 25;
  if (!Number.isFinite(intervalDays) || intervalDays < 1) {
    throw new Error('intervalDays must be at least one day');
  }
  if (
    !Array.isArray(config.sources) ||
    !Number.isInteger(documentsPerRun) ||
    documentsPerRun < 1
  ) {
    throw new Error('Expected sources and a positive documentsPerRun');
  }
  for (const source of config.sources) {
    getSource(source.id);
  }
  return {
    intervalDays,
    documentsPerRun,
    pagesPerRun: config.pagesPerRun ?? 2,
  };
}
async function readState(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
    return { sources: {} };
  }
}
async function discoverBatch(collector, selection, previous, pagesPerRun) {
  const discovered = await collector.discover(selection.id, {
    maxPages: pagesPerRun,
    startPage: previous.page,
    startUrl: previous.nextUrl,
    languages: selection.languages,
  });
  Object.assign(previous, {
    nextUrl: discovered.nextUrl,
    pending: discovered.entries,
    page: discovered.nextPage ?? 0,
    catalogExhausted: discovered.status === 'catalog-exhausted',
    errors: discovered.errors,
    resources: discovered.resources,
  });
}
async function updateSource(collector, selection, previous, limits, now) {
  if (
    previous.lastCompleted &&
    now - new Date(previous.lastCompleted) < limits.intervalDays * 86400000
  ) {
    return { sourceId: selection.id, status: 'not-due' };
  }
  if (!previous.pending.length) {
    await discoverBatch(collector, selection, previous, limits.pagesPerRun);
  }
  const batch = previous.pending.slice(0, limits.documentsPerRun);
  const result = batch.length
    ? await collector.collect(
        { schemaVersion: 1, entries: batch },
        { maxDocuments: limits.documentsPerRun }
      )
    : { status: 'partial', errors: previous.errors ?? [] };
  const failedIds = new Set(result.errors.map((error) => error.id));
  previous.pending = [
    ...batch.filter((entry) => failedIds.has(entry.id)),
    ...previous.pending.slice(limits.documentsPerRun),
  ];
  if (!previous.pending.length && previous.catalogExhausted) {
    previous.lastCompleted = now.toISOString();
    previous.page = 0;
  }
  // Successful downloads do not erase unresolved discovery or remaining pages.
  const incomplete =
    previous.pending.length ||
    previous.nextUrl ||
    previous.errors?.length ||
    previous.resources?.length;
  return {
    sourceId: selection.id,
    ...result,
    status: incomplete ? 'partial' : result.status,
    nextPage: previous.page,
    pending: previous.pending.length,
    discoveryErrors: previous.errors,
    unresolvedResources: previous.resources,
  };
}
export async function updateCollection(
  config,
  {
    store = new CollectionStore(config.store ?? 'collections/scheduled'),
    client = new SourceClient({ store }),
    now = new Date(),
  } = {}
) {
  const limits = validateConfig(config);
  const collector = new Collector({ store, client });
  await store.init();
  const path = join(store.root, 'schedule.json');
  const state = await readState(path);
  const results = [];
  for (const selection of config.sources) {
    const previous = state.sources[selection.id] ?? {
      page: 0,
      pending: [],
      lastCompleted: null,
    };
    results.push(
      await updateSource(collector, selection, previous, limits, now)
    );
    state.sources[selection.id] = previous;
    await atomicJson(path, state);
  }
  return {
    complete: false,
    results,
    redistributionReviewed: config.redistributionReviewed === true,
  };
}
