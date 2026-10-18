#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { realpathSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadCorpus, createLegalServer } from '../src/legal/server.js';
import { sources, buildCoverage } from '../src/legal/registry.js';
import { answerQuestion, queryLaws } from '../src/legal/assistant.js';
import { formalizeLaw, encodeKnowledge } from '../src/legal/formalize.js';
import {
  Collector,
  CollectionStore,
  SourceClient,
} from '../src/legal/collector.js';

const help = `legal-assistant <command> [arguments] [options]
  sources                         Official publisher registry
  coverage [--corpus FILE]         Explicit corpus and language gaps
  ask QUESTION [--jurisdiction ID] [--language TAG] [--as-of DATE]
  search QUESTION                 Cited source text matches
  formalize LAW_ID [--language TAG] [--format lino|json]
  discover SOURCE_ID --output FILE [--pages 2] [--resume PREVIOUS_MANIFEST]
  collect --manifest FILE [--store collections/default] [--limit 100]
  export [--store DIR] --output FILE
  serve [--corpus FILE] [--host 127.0.0.1] [--port 8787]
Common: --debug, --corpus FILE, --limit N, --help
Collection honors robots.txt, source allowlists and publisher rate limits.
Partial collection or discovery exits 2. Invalid input exits 1.`;
function argumentsFor(args) {
  return parseArgs({
    args,
    allowPositionals: true,
    strict: true,
    options: {
      help: { type: 'boolean' },
      debug: { type: 'boolean' },
      corpus: { type: 'string' },
      jurisdiction: { type: 'string' },
      language: { type: 'string' },
      'as-of': { type: 'string' },
      limit: { type: 'string' },
      format: { type: 'string' },
      output: { type: 'string' },
      manifest: { type: 'string' },
      resume: { type: 'string' },
      store: { type: 'string' },
      pages: { type: 'string' },
      'start-page': { type: 'string' },
      host: { type: 'string' },
      port: { type: 'string' },
    },
  });
}
const integer = (value, fallback) => {
  if (value === undefined) {
    return fallback;
  }
  const parsed = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error('Expected a non-negative integer');
  }
  return parsed;
};
export async function runLegalCli(
  args,
  { stdout = console.log, stderr = console.error, onServer } = {}
) {
  try {
    const { values, positionals } = argumentsFor(args);
    const [command, ...words] = positionals;
    const print = (value) =>
      stdout(
        typeof value === 'string' ? value : JSON.stringify(value, null, 2)
      );
    const debug = values.debug
      ? (event) => stderr(JSON.stringify(event))
      : () => {};
    const options = queryOptions(values);
    if (!command || values.help) {
      print(help);
      return 0;
    }
    if (command === 'sources') {
      print({ sources });
      return 0;
    }
    if (['collect', 'discover', 'export'].includes(command)) {
      return await collectionCommand(command, words, values, print, debug);
    }
    const corpus = await loadCorpus(corpusPath(values));
    if (command === 'coverage') {
      print(buildCoverage(corpus.laws));
      return 0;
    }
    if (command === 'ask') {
      print(answerQuestion(corpus.laws, words.join(' '), options));
      return 0;
    }
    if (command === 'search') {
      print(queryLaws(corpus.laws, words.join(' '), options));
      return 0;
    }
    if (command === 'formalize') {
      return formalizeCommand(corpus, words, values, print);
    }
    if (command === 'serve') {
      return await serveCommand(corpus, values, print, debug, onServer);
    }
    throw new Error(`Unknown command: ${command}`);
  } catch (error) {
    stderr(error.message);
    return 1;
  }
}
if (
  process.argv[1] &&
  realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  process.exitCode = await runLegalCli(process.argv.slice(2));
}

async function collectionCommand(command, words, values, print, debug) {
  const store = new CollectionStore(values.store ?? 'collections/default');
  const collector = new Collector({
    store,
    client: new SourceClient({ store, debug }),
    debug,
  });
  if (command === 'export') {
    if (!values.output) {
      throw new Error('export requires --output');
    }
    await writeFile(
      values.output,
      `${JSON.stringify(await store.corpus(), null, 2)}\n`
    );
    return 0;
  }
  const result =
    command === 'discover'
      ? await collector.discover(
          words[0],
          await discoveryOptions(values, words[0])
        )
      : await collector.collect(
          JSON.parse(
            await readFile(
              values.manifest ??
                new URL('../data/sources.sample.json', import.meta.url),
              'utf8'
            )
          ),
          { maxDocuments: integer(values.limit, 100) }
        );
  if (values.output) {
    await writeFile(values.output, `${JSON.stringify(result, null, 2)}\n`);
  }
  print(result);
  return result.status === 'partial' ? 2 : 0;
}

function formalizeCommand(corpus, words, values, print) {
  const matches = corpus.laws.filter(
    (item) =>
      item.id === words[0] &&
      (!values.language || item.language === values.language)
  );
  if (matches.length > 1) {
    throw new Error(
      'Ambiguous law ID; select a translation with --language TAG'
    );
  }
  const law = matches[0];
  if (!law) {
    throw new Error('Unknown law ID');
  }
  if (values.format && !['json', 'lino'].includes(values.format)) {
    throw new Error('format must be json or lino');
  }
  const formal = formalizeLaw(law);
  print(values.format === 'lino' ? encodeKnowledge(formal) : formal);
  return 0;
}

async function serveCommand(corpus, values, print, debug, onServer) {
  const server = createLegalServer({ corpus, debug });
  const port = integer(values.port, 8787);
  if (port > 65535) {
    throw new Error('Invalid port');
  }
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, values.host ?? '127.0.0.1', resolve);
  });
  print({ listening: server.address(), documents: corpus.laws.length });
  if (onServer) {
    onServer(server);
  }
  return 0;
}

function queryOptions(values) {
  return {
    jurisdiction: values.jurisdiction,
    language: values.language,
    asOf: values['as-of'],
    ...(values.limit ? { limit: integer(values.limit) } : {}),
  };
}

function corpusPath(values) {
  return values.corpus ?? process.env.LEGAL_CORPUS;
}

async function discoveryOptions(values, sourceId) {
  const previous = values.resume
    ? JSON.parse(await readFile(values.resume, 'utf8'))
    : null;
  if (
    previous &&
    (previous.schemaVersion !== 1 || previous.sourceId !== sourceId)
  ) {
    throw new Error('Resume manifest must match the requested source');
  }
  return {
    maxPages: integer(values.pages, 2),
    startPage: previous?.nextPage ?? integer(values['start-page'], 0),
    startUrl: previous?.nextUrl,
    cursor: previous?.cursor,
    languages: values.language?.split(','),
  };
}
