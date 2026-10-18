import { load } from 'cheerio';
import { unzipSync } from 'fflate';
import { normalizeText } from './model.js';

export function htmlText(html, selector, { xml = false } = {}) {
  const $ = load(html, { xmlMode: xml });
  $('script, style, nav, header, footer, noscript, button, form').remove();
  const body = $(selector).first();
  if (!body.length) {
    throw new Error(`Law body selector did not match: ${selector}`);
  }
  body.find('br').replaceWith('\n');
  body
    .find(
      'p, div, section, article, h1, h2, h3, h4, li, tr, num, heading, content, P, PARAG, TITLE, TI.ART, TXT, SECTNO, SUBJECT, HD, AUTH, SOURCE'
    )
    .each((_, element) => {
      $(element).prepend('\n');
      $(element).append('\n');
    });
  return normalizeText(
    body
      .text()
      .replace(/[ \t\u00a0]+/g, ' ')
      .replace(/ *\n */g, '\n')
      .replace(/\n{2,}/g, '\n')
  );
}
const denied =
  /<title[^>]*>\s*(?:Access Denied|Page Not Found|Error)|<h1[^>]*>\s*Access Denied|captcha|enable javascript to continue|not found<\/h1>/i;
function documentFormat(entry, contentType) {
  return (
    entry.format ??
    (/zip/.test(contentType) || /\.zip(?:[?#]|$)/.test(entry.url)
      ? 'zip'
      : /pdf/.test(contentType) || /\.pdf(?:[?#]|$)/.test(entry.url)
        ? 'pdf'
        : /xml/.test(contentType)
          ? 'xml'
          : /json/.test(contentType)
            ? 'json'
            : 'html')
  );
}
export async function parseDocument(bytes, entry, source, contentType = '') {
  const format = documentFormat(entry, contentType);
  if (!bytes.length) {
    throw new Error('Official source returned an empty body');
  }
  if (format === 'zip') {
    return parseArchive(bytes, entry, source);
  }
  if (format === 'pdf') {
    return [{ ...entry, text: await pdfText(bytes) }];
  }
  const text = new TextDecoder(entry.encoding ?? 'utf-8', {
    fatal: true,
  }).decode(bytes);
  if (denied.test(text)) {
    throw new Error(
      'Official source returned an access denial, challenge or error page'
    );
  }
  if (format === 'text') {
    return [{ ...entry, text: normalizeText(text) }];
  }
  if (format === 'json') {
    return parseJson(text, entry);
  }
  if (format === 'xml') {
    return parseXml(text, entry);
  }
  return parseHtml(text, entry, source);
}
function parseHtml(text, entry, source) {
  if (
    source.adapter === 'indiacode' &&
    new URL(entry.url).pathname.startsWith('/handle/')
  ) {
    throw new Error(
      'India Code act metadata is not law text; collect linked section APIs or official PDFs'
    );
  }
  const $ = load(text);
  const language = $('html').attr('lang')?.split('-')[0];
  if (language && language !== entry.language) {
    throw new Error(
      `Source language mismatch: expected ${entry.language}, received ${language}`
    );
  }
  const selector = entry.contentSelector ?? source.contentSelector;
  if (!selector) {
    throw new Error('HTML source requires an explicit law body selector');
  }
  const body = htmlText(text, selector);
  if (body.length < 40 || !/[\p{L}]/u.test(body)) {
    throw new Error(
      'Law body is empty or too short; possible JavaScript shell'
    );
  }
  return [
    {
      ...entry,
      title: entry.title || $('h1').first().text() || $('title').text(),
      text: body,
    },
  ];
}

function parseJson(text, entry) {
  const value = JSON.parse(text);
  const content = value.text ?? value.content ?? value.data?.text;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error(
      'JSON response has no law text; metadata alone is not a law'
    );
  }
  return [
    {
      ...entry,
      text: content.includes('<')
        ? htmlText(content, 'body')
        : normalizeText(content),
    },
  ];
}
function appendXmlContext($, entry, records, selector) {
  const context = htmlText($.xml(), selector, { xml: true });
  if (context.trim()) {
    records.push({
      ...entry,
      id: `${entry.id}:context`,
      title: `${entry.title} — context and appendices`,
      text: context,
    });
  }
  return records;
}
function parseXml(text, entry) {
  if (/<!ENTITY/i.test(text)) {
    throw new Error('XML entity declarations are not supported');
  }
  const $ = load(text, { xmlMode: true });
  const cfrSections = $('CFRDOC SECTION');
  if (cfrSections.length) {
    const records = cfrSections.toArray().map((element, index) => {
      const number = $(element).find('SECTNO').first().text().trim();
      return {
        ...entry,
        id: `${entry.id}:section:${number || index + 1}`,
        title:
          `${entry.title} ${number} ${$(element).find('SUBJECT').first().text()}`.trim(),
        text: htmlText($.xml(element), 'SECTION', { xml: true }),
      };
    });
    // Authorities, appendices and headings can carry legal content outside SECTION.
    cfrSections.remove();
    return appendXmlContext($, entry, records, 'CFRDOC');
  }
  const sections = $('section[identifier]');
  if (sections.length) {
    const records = sections.toArray().map((element) => ({
      ...entry,
      id: `${entry.id}:${$(element).attr('identifier')}`,
      title: `${entry.title} ${$(element).find('num,heading').first().text()}`,
      text: htmlText($.xml(element), 'section', { xml: true }),
    }));
    sections.remove();
    return $('main').length
      ? appendXmlContext($, entry, records, 'main')
      : records;
  }
  const selector = [
    'main',
    'act',
    'Legislation',
    'DOC.MAIN',
    'DOCUMENT',
    'ARTICLE',
    'SECTION',
  ].find((item) => $(item).length);
  if (!selector) {
    throw new Error(
      'XML contains no recognized legislative body; RDF metadata is not law text'
    );
  }
  return [{ ...entry, text: htmlText(text, selector, { xml: true }) }];
}
function parseArchive(bytes, entry, source) {
  let total = 0;
  const files = unzipSync(bytes, {
    filter: (file) => {
      if (!/\.(xml|html?|txt)$/i.test(file.name)) {
        return false;
      }
      if (
        file.originalSize > 40_000_000 ||
        (total += file.originalSize) > 64_000_000
      ) {
        throw new Error('Archive exceeds uncompressed size budget');
      }
      return true;
    },
  });
  return Promise.all(
    Object.entries(files).map(([name, content]) =>
      parseDocument(
        content,
        {
          ...entry,
          id: `${entry.id}:${name}`,
          format: /\.xml$/i.test(name)
            ? 'xml'
            : /\.txt$/i.test(name)
              ? 'text'
              : 'html',
        },
        source
      )
    )
  ).then((values) => values.flat());
}
async function pdfText(bytes) {
  if (new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-') {
    throw new Error('Expected PDF magic bytes');
  }
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = getDocument({
    data: bytes.slice(),
    isEvalSupported: false,
    useSystemFonts: true,
  });
  try {
    const doc = await task.promise;
    if (doc.numPages > 3000) {
      throw new Error('PDF exceeds page budget');
    }
    let text = '';
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      text += `${content.items
        .map((item) => `${item.str}${item.hasEOL ? '\n' : ' '}`)
        .join('')}\n`;
      page.cleanup();
      if (text.length > 5_000_000) {
        throw new Error('PDF exceeds text budget');
      }
    }
    if (text.trim().length < 40) {
      throw new Error(
        'Scanned PDF requires reviewed OCR; no reliable text extracted'
      );
    }
    return normalizeText(text);
  } finally {
    await task.destroy();
  }
}

function linksFrom(html, base) {
  const $ = load(html);
  return $('a[href]')
    .toArray()
    .map((element) => {
      const anchor = $(element);
      try {
        return {
          url: new URL(anchor.attr('href'), base).href,
          title: anchor.text().trim(),
          rel: anchor.attr('rel'),
          language: anchor.attr('hreflang'),
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}
const unique = (entries) => [
  ...new Map(
    entries.map((entry) => [`${entry.url}:${entry.language}`, entry])
  ).values(),
];
function record(link, source, id, language = 'en', format) {
  return {
    id: `${source.id}:${id}`,
    sourceId: source.id,
    title: link.title || `Official act ${id}`,
    url: link.url,
    language,
    ...(format ? { format } : {}),
  };
}
const language3 = {
  bg: 'bul',
  es: 'spa',
  cs: 'ces',
  da: 'dan',
  de: 'deu',
  et: 'est',
  el: 'ell',
  en: 'eng',
  fr: 'fra',
  ga: 'gle',
  hr: 'hrv',
  it: 'ita',
  lv: 'lav',
  lt: 'lit',
  hu: 'hun',
  mt: 'mlt',
  nl: 'nld',
  pl: 'pol',
  pt: 'por',
  ro: 'ron',
  sk: 'slk',
  sl: 'slv',
  fi: 'fin',
  sv: 'swe',
};
export function cellarQuery({
  offset = 0,
  pageSize = 100,
  languages = ['en'],
} = {}) {
  const selected = languages
    .map((language) => {
      if (!language3[language]) {
        throw new Error(`Unsupported EU language: ${language}`);
      }
      return `<http://publications.europa.eu/resource/authority/language/${language3[language].toUpperCase()}>`;
    })
    .join(' ');
  return `PREFIX cdm: <http://publications.europa.eu/ontology/cdm#>
SELECT DISTINCT ?work ?expression ?title ?language ?celex WHERE {
?work cdm:resource_legal_id_celex ?celex .
?expression cdm:expression_belongs_to_work ?work ; cdm:expression_uses_language ?language .
OPTIONAL { ?expression cdm:expression_title ?title }
VALUES ?language { ${selected} }
} ORDER BY ?work ?language LIMIT ${pageSize} OFFSET ${offset}`;
}
export function catalogUrl(
  source,
  { page = 0, languages = source.languages, pageSize = 100 } = {}
) {
  const url = new URL(source.catalogUrl);
  if (source.adapter === 'cellar') {
    url.searchParams.set(
      'query',
      cellarQuery({ offset: page * pageSize, pageSize, languages })
    );
    url.searchParams.set('format', 'application/sparql-results+json');
  }
  if (source.adapter === 'indiacode') {
    url.searchParams.set('start', String(page * pageSize));
    url.searchParams.set('rpp', String(pageSize));
  }
  if (source.adapter === 'matsne') {
    url.searchParams.set('page', String(page));
  }
  if (source.adapter === 'pravo') {
    url.searchParams.set('index', String(page + 1));
    url.searchParams.set('pageSize', String(pageSize));
  }
  if (source.adapter === 'npc') {
    url.searchParams.set('pageNum', String(page + 1));
    url.searchParams.set('pageSize', String(pageSize));
  }
  return url.href;
}
function discoverCellar(item, source) {
  const language = Object.entries(language3).find(([, code]) =>
    item.language?.value?.toLowerCase().endsWith(code)
  )?.[0];
  const celex = item.celex?.value;
  return language && celex
    ? record(
        {
          url: `https://eur-lex.europa.eu/legal-content/${language.toUpperCase()}/TXT/HTML/?uri=CELEX:${encodeURIComponent(
            celex
          )}`,
          title: item.title?.value,
        },
        source,
        celex,
        language
      )
    : null;
}
function discoverPravo(item, source) {
  const id = item.eoNumber ?? item.number ?? item.id;
  if (!id) {
    throw new Error('Pravo discovery entry has no identifier');
  }
  return record(
    {
      url: `${source.origin}/document/${encodeURIComponent(id)}`,
      title: item.name ?? item.title,
    },
    source,
    id,
    'ru'
  );
}
function discoverNpc(item, source, resources) {
  const id = item.id ?? item.lawId ?? item.bbbs;
  if (!id) {
    throw new Error('NPC discovery entry has no identifier');
  }
  if (item.url || item.htmlUrl) {
    return record(
      {
        url: new URL(item.htmlUrl ?? item.url, source.origin).href,
        title: item.title ?? item.name,
      },
      source,
      id,
      'zh'
    );
  }
  resources.push({
    id,
    url: source.origin,
    reason:
      'NPC listing lacks a text URL; detail API contract requires verification',
  });
  return null;
}
function discoverStructured(body, source, pageSize) {
  const json = typeof body === 'string' ? JSON.parse(body) : body;
  const rows =
    source.adapter === 'cellar'
      ? json.results?.bindings
      : (json.rows ?? json.items ?? json.data?.list ?? json.result?.data);
  if (
    source.adapter === 'npc' &&
    json.code !== undefined &&
    json.code !== 200
  ) {
    throw new Error(`NPC catalog error: ${json.code}`);
  }
  if (!Array.isArray(rows)) {
    throw new Error(`Unrecognized ${source.adapter} discovery response`);
  }
  const resources = [];
  const handlers = {
    cellar: discoverCellar,
    pravo: discoverPravo,
    npc: discoverNpc,
  };
  return {
    entries: rows
      .map((item) => handlers[source.adapter](item, source, resources))
      .filter(Boolean),
    resources,
    next: rows.length >= pageSize ? 'generated' : null,
  };
}
function discoverLink(link, source, languages, resources, url) {
  const target = new URL(link.url);
  switch (source.adapter) {
    case 'uslm':
      return /xml_usc(?!All)[\da-z]+@[^/]+\.zip$/.test(target.pathname)
        ? [record(link, source, target.pathname.split('/').pop(), 'en', 'zip')]
        : [];
    case 'indiacode':
      return /\/handle\/\d+\/\d+$/.test(target.pathname) &&
        !target.searchParams.has('query')
        ? [
            record(
              link,
              source,
              target.pathname.split('/').pop(),
              link.language ?? 'en'
            ),
          ]
        : [];
    case 'matsne': {
      const match = target.pathname.match(
        /\/(ka|en|ru)\/document\/view\/(\d+)/
      );
      return match
        ? languages
            .filter((value) => ['ka', 'en', 'ru'].includes(value))
            .map((language) =>
              record(
                {
                  ...link,
                  url: `${source.origin}/${language}/document/view/${match[2]}`,
                },
                source,
                match[2],
                language
              )
            )
        : [];
    }
    case 'directory': {
      if (
        target.origin !== source.origin ||
        !target.pathname.startsWith('/bulkdata/')
      ) {
        return [];
      }
      if (/\.xml$/.test(target.pathname)) {
        return [record(link, source, target.pathname, 'en', 'xml')];
      }
      if (isChildDirectory(target, url)) {
        resources.push({ url: link.url, kind: 'directory' });
      }
      return [];
    }
    default:
      return [];
  }
}
export function discoverPage(
  body,
  source,
  url,
  { languages = source.languages, pageSize = 100 } = {}
) {
  if (['pravo', 'npc', 'cellar'].includes(source.adapter)) {
    return discoverStructured(body, source, pageSize);
  }
  const resources = [];
  const links = linksFrom(body, url);
  const entries = unique(
    links.flatMap((link) =>
      discoverLink(link, source, languages, resources, url)
    )
  );
  let next =
    links.find(
      (link) =>
        link.rel === 'next' ||
        /^(?:next|შემდეგი|следующая|下一页|अगला)\s*[»›]?$/i.test(link.title)
    )?.url ?? null;
  if (!next && source.adapter === 'indiacode' && entries.length >= pageSize) {
    next = 'generated';
  }
  if (!entries.length && !resources.length) {
    throw new Error(
      'No official law entries discovered; catalog may be blocked or its schema changed'
    );
  }
  return { entries, next, resources };
}
export function linkedDocumentResources(html, entry, source) {
  const links = linksFrom(html, entry.url);
  return unique(
    links
      .filter(
        (link) =>
          /\.(?:pdf|xml)(?:[?#]|$)/i.test(link.url) ||
          /\/show-data\?/.test(link.url)
      )
      .map((link, index) => {
        const result = record(
          link,
          source,
          `${entry.id}:part${index + 1}`,
          link.language ?? entry.language
        );
        const url = new URL(link.url);
        if (source.adapter === 'indiacode' && url.pathname === '/show-data') {
          const target = new URL('/SectionPageContent', source.origin);
          target.searchParams.set('actid', url.searchParams.get('actid'));
          target.searchParams.set(
            'sectionID',
            url.searchParams.get('sectionId') ??
              url.searchParams.get('sectionID')
          );
          result.url = target.href;
          result.format = 'json';
        }
        return result;
      })
  );
}

function isChildDirectory(target, parent) {
  return (
    !target.search &&
    !/\.[^/]+$/.test(target.pathname) &&
    target.pathname.startsWith(
      `${new URL(parent).pathname.replace(/\/$/, '')}/`
    )
  );
}
