import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

const encoder = new TextEncoder();
export function isISODate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const date = new Date(value);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}
export function isOptionalISODate(value) {
  return value === undefined || value === null || isISODate(value);
}
export const hashContent = (value) =>
  bytesToHex(sha256(typeof value === 'string' ? encoder.encode(value) : value));
export function officialUrl(value) {
  const url = new URL(value);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password
  ) {
    throw new Error('Expected an HTTP source URL without credentials');
  }
  return url.href;
}
export function normalizeText(text) {
  return String(text)
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .normalize('NFC')
    .trim();
}
const heading =
  /^(?:(?:Article|Section|Chapter|Part|Amendment|Статья|Глава|მუხლი|თავი|अनुच्छेद|धारा)\.?\s*[\p{L}\p{N}IVXLC]+|第[零〇一二三四五六七八九十百千万\d]+[条章编节]|§\s*\d+)/iu;
export function splitSections(text) {
  const starts = [0];
  let cursor = 0;
  for (const line of text.split('\n')) {
    if (cursor > 0 && heading.test(line.trim())) {
      starts.push(cursor);
    }
    cursor += line.length + 1;
  }
  let byteCursor = 0;
  return starts.map((start, index) => {
    const end = starts[index + 1] ?? text.length;
    const value = text.slice(start, end);
    const byteStart = byteCursor;
    byteCursor += encoder.encode(value).length;
    return {
      id: `s${index + 1}`,
      label: value.split('\n')[0].slice(0, 180),
      start,
      end,
      text: value,
      byteStart,
      byteEnd: byteCursor,
    };
  });
}

export function normalizeLaw(input) {
  for (const key of [
    'id',
    'jurisdiction',
    'language',
    'title',
    'url',
    'retrievedAt',
    'text',
  ]) {
    if (typeof input[key] !== 'string' || !input[key].trim()) {
      throw new Error(`Missing law field: ${key}`);
    }
  }
  if (!/^[a-z]{2,3}(?:-[A-Za-z0-9]+)*$/.test(input.language)) {
    throw new Error('Invalid language tag');
  }
  if (!Number.isFinite(Date.parse(input.retrievedAt))) {
    throw new Error('Invalid retrieval timestamp');
  }
  const text = normalizeText(input.text);
  if (text.length > 5_000_000) {
    throw new Error('Law text exceeds 5 million characters; split into parts');
  }
  if (/^(?:<!doctype|<html|Access Denied|Page Not Found)/i.test(text)) {
    throw new Error('Expected law text, received an error or HTML document');
  }
  for (const name of ['effectiveFrom', 'effectiveTo']) {
    if (!isOptionalISODate(input[name])) {
      throw new Error(`Invalid ${name}`);
    }
  }
  if (
    input.effectiveFrom &&
    input.effectiveTo &&
    input.effectiveFrom >= input.effectiveTo
  ) {
    throw new Error('Invalid effective date range');
  }
  return {
    schemaVersion: 1,
    id: input.id,
    jurisdiction: input.jurisdiction,
    language: input.language,
    title: input.title,
    url: officialUrl(input.url),
    retrievedAt: input.retrievedAt,
    text,
    ...lawMetadata(input),
    contentHash: hashContent(text),
    sections: splitSections(text),
    scope:
      input.scope ??
      'Collected text; completeness and legal currency unverified',
  };
}

function lawMetadata(input) {
  return {
    sourceId: input.sourceId ?? 'import',
    authority: input.authority ?? 'official-source',
    status: input.status ?? 'unverified',
    effectiveFrom: input.effectiveFrom ?? null,
    effectiveTo: input.effectiveTo ?? null,
    sourceVersion: input.sourceVersion ?? null,
    translation: input.translation ?? false,
    rawHash: input.rawHash ?? null,
  };
}
