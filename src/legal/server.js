import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { normalizeLaw } from './model.js';
import { sources, buildCoverage } from './registry.js';
import { answerQuestion, queryLaws } from './assistant.js';
import { formalizeLaw, encodeKnowledge } from './formalize.js';

export async function loadCorpus(
  path = new URL('../../data/demo/corpus.json', import.meta.url)
) {
  const corpus = JSON.parse(await readFile(path, 'utf8'));
  if (corpus.schemaVersion !== 1 || !Array.isArray(corpus.laws)) {
    throw new Error('Unsupported corpus schema');
  }
  corpus.laws = corpus.laws.map((record) => {
    const law = normalizeLaw(record);
    if (record.contentHash && record.contentHash !== law.contentHash) {
      throw new Error(`Corpus checksum mismatch: ${law.id}`);
    }
    return law;
  });
  return corpus;
}
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const send = (
  response,
  status,
  body,
  type = 'application/json; charset=utf-8'
) => {
  response.writeHead(status, {
    'content-type': type,
    'x-content-type-options': 'nosniff',
    'cache-control': 'no-store',
  });
  response.end(typeof body === 'string' ? body : JSON.stringify(body));
};
async function readBody(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 16384) {
      throw new HttpError(413, 'JSON request exceeds 16384 bytes');
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'Malformed JSON request');
  }
}
function optionsFrom(input) {
  return {
    jurisdiction: input.jurisdiction || undefined,
    language: input.language || undefined,
    asOf: input.asOf || undefined,
    ...(input.limit !== undefined && input.limit !== null
      ? { limit: Number(input.limit) }
      : {}),
  };
}
function pageNumber(value, fallback, max = 1000000) {
  if (value === null) {
    return fallback;
  }
  const number = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(number) || number > max) {
    throw new HttpError(400, 'Invalid pagination value');
  }
  return number;
}
async function route(request, response, corpus, url) {
  const path = url.pathname;
  const simple = {
    '/health': () => ({ status: 'ok', documents: corpus.laws.length }),
    '/v1/sources': () => ({ sources }),
    '/v1/coverage': () => buildCoverage(corpus.laws),
  };
  if (request.method === 'GET' && Object.hasOwn(simple, path)) {
    return send(response, 200, simple[path]());
  }
  if (request.method === 'GET' && path === '/v1/laws') {
    return listLaws(response, corpus, url);
  }
  if (path === '/v1/answer' && request.method === 'POST') {
    return serveAnswer(request, response, corpus);
  }
  if (path === '/v1/search' && request.method === 'GET') {
    return send(response, 200, {
      results: queryLaws(
        corpus.laws,
        url.searchParams.get('q'),
        optionsFrom(Object.fromEntries(url.searchParams))
      ),
    });
  }
  const document = path.match(/^\/v1\/laws\/([^/]+)(\/formalization)?$/);
  if (document && request.method === 'GET') {
    return serveLaw(response, corpus, url, document);
  }
  if (request.method === 'GET' && path === '/openapi.json') {
    return send(
      response,
      200,
      await readFile(
        new URL('../../docs/openapi.json', import.meta.url),
        'utf8'
      )
    );
  }
  if (!['GET', 'POST'].includes(request.method) || path === '/v1/answer') {
    throw new HttpError(405, 'Method not allowed');
  }
  throw new HttpError(404, 'Route not found');
}
export function createLegalServer({
  corpus,
  allowedOrigins = [],
  debug = () => {},
}) {
  const server = createServer(async (request, response) => {
    try {
      const origin = request.headers.origin;
      if (origin && allowedOrigins.includes(origin)) {
        response.setHeader('access-control-allow-origin', origin);
        response.setHeader('vary', 'Origin');
      }
      if (request.method === 'OPTIONS') {
        response.writeHead(204, {
          'access-control-allow-methods': 'GET, POST, OPTIONS',
          'access-control-allow-headers': 'content-type',
        });
        response.end();
        return;
      }
      await route(
        request,
        response,
        corpus,
        new URL(request.url, 'http://localhost')
      );
    } catch (error) {
      debug({ event: 'http-error', error: error.message });
      const status =
        error.status ??
        (error instanceof URIError || /Question|asOf|limit/.test(error.message)
          ? 400
          : 500);
      send(response, status, {
        error: status === 500 ? 'Internal server error' : error.message,
      });
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.keepAliveTimeout = 1000;
  return server;
}

function listLaws(response, corpus, url) {
  const selected = corpus.laws.filter(
    (law) =>
      (!url.searchParams.get('jurisdiction') ||
        law.jurisdiction === url.searchParams.get('jurisdiction')) &&
      (!url.searchParams.get('language') ||
        law.language === url.searchParams.get('language'))
  );
  const offset = pageNumber(url.searchParams.get('offset'), 0);
  const limit = pageNumber(url.searchParams.get('limit'), 20, 100);
  if (limit < 1) {
    throw new HttpError(400, 'limit must be positive');
  }
  return send(response, 200, {
    total: selected.length,
    offset,
    limit,
    laws: selected
      .slice(offset, offset + limit)
      .map(({ text, sections, ...metadata }) => ({
        ...metadata,
        characters: text.length,
        sections: sections.length,
      })),
  });
}

function serveLaw(response, corpus, url, document) {
  const matches = corpus.laws.filter(
    (item) =>
      item.id === decodeURIComponent(document[1]) &&
      (!url.searchParams.has('language') ||
        item.language === url.searchParams.get('language'))
  );
  if (matches.length > 1) {
    throw new HttpError(
      409,
      'Ambiguous law ID; select a language with ?language=TAG'
    );
  }
  const law = matches[0];
  if (!law) {
    throw new HttpError(404, 'Law not found');
  }
  if (!document[2]) {
    return send(response, 200, law);
  }
  if (law.text.length > 100000) {
    throw new HttpError(
      413,
      'Split this law into parts of at most 100000 characters for HTTP formalization'
    );
  }
  const formal = formalizeLaw(law);
  return url.searchParams.get('format') === 'lino'
    ? send(response, 200, encodeKnowledge(formal), 'text/plain; charset=utf-8')
    : send(response, 200, formal);
}

async function serveAnswer(request, response, corpus) {
  const body = await readBody(request);
  if (!body || Array.isArray(body) || typeof body !== 'object') {
    throw new HttpError(400, 'Expected a JSON object');
  }
  return send(
    response,
    200,
    answerQuestion(corpus.laws, body.question, optionsFrom(body))
  );
}
