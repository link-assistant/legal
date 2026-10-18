// Published-language inventory, not a promise that every law has a translation.
export const jurisdictions = [
  {
    id: 'US',
    name: 'United States',
    languages: ['en'],
    scope:
      'Federal statutes and regulations; state, territorial, tribal and local law require additional publishers.',
  },
  {
    id: 'EU',
    name: 'Europe',
    languages: [
      'bg',
      'es',
      'cs',
      'da',
      'de',
      'et',
      'el',
      'en',
      'fr',
      'ga',
      'hr',
      'it',
      'lv',
      'lt',
      'hu',
      'mt',
      'nl',
      'pl',
      'pt',
      'ro',
      'sk',
      'sl',
      'fi',
      'sv',
    ],
    scope:
      'European Union law via EUR-Lex/Cellar. Europe also includes national and non-EU law, which is not covered by this publisher.',
  },
  {
    id: 'CN',
    name: 'China',
    languages: ['zh', 'en', 'mn', 'bo', 'ug', 'kk', 'ko', 'za', 'ii'],
    scope:
      'NPC national database and government translations; regional/minority-language publication is distributed and incomplete.',
  },
  {
    id: 'IN',
    name: 'India',
    languages: [
      'en',
      'hi',
      'as',
      'bn',
      'brx',
      'doi',
      'gu',
      'kn',
      'ks',
      'kok',
      'mai',
      'ml',
      'mni',
      'mr',
      'ne',
      'or',
      'pa',
      'sa',
      'sat',
      'sd',
      'ta',
      'te',
      'ur',
    ],
    scope:
      'India Code Central and State Acts and Legislative Department regional publications. Language availability varies by act.',
  },
  {
    id: 'RU',
    name: 'Russia',
    languages: [
      'ru',
      'ab',
      'ady',
      'alt',
      'av',
      'ba',
      'bua',
      'ce',
      'chm',
      'cv',
      'dar',
      'inh',
      'kbd',
      'krc',
      'krl',
      'kum',
      'kv',
      'lbe',
      'lez',
      'mdf',
      'mhr',
      'myv',
      'nog',
      'os',
      'rut',
      'sah',
      'tab',
      'tt',
      'tyv',
      'udm',
      'vep',
      'xal',
    ],
    scope:
      'Federal and regional official publication; republic-language laws require publisher-specific discovery. Karelian is recorded as a supported regional publication language, not asserted as a state language.',
  },
  {
    id: 'GE',
    name: 'Georgia',
    languages: ['ka', 'ab', 'en', 'ru'],
    scope:
      'Matsne legislative acts. Georgian and Abkhaz official-language coverage must be distinguished from English/Russian translations.',
  },
];

const source = (id, jurisdiction, origin, adapter, extra = {}) => ({
  id,
  jurisdiction,
  origin,
  adapter,
  languages: jurisdictions.find((item) => item.id === jurisdiction).languages,
  intervalMs: 1500,
  termsUrl: origin,
  ...extra,
});
export const sources = [
  source('us-code', 'US', 'https://uscode.house.gov', 'uslm', {
    catalogUrl: 'https://uscode.house.gov/download.html',
    termsUrl: 'https://uscode.house.gov/about/info.shtml',
    contentSelector: 'main',
    languages: ['en'],
  }),
  source('us-govinfo', 'US', 'https://www.govinfo.gov', 'directory', {
    catalogUrl: 'https://www.govinfo.gov/bulkdata/CFR',
    languages: ['en'],
  }),
  source('us-archives', 'US', 'https://www.archives.gov', 'html', {
    contentSelector: '#block-system-main',
    languages: ['en'],
    termsUrl: 'https://www.archives.gov/global-pages/privacy.html',
  }),
  source('eu-cellar', 'EU', 'https://publications.europa.eu', 'cellar', {
    catalogUrl: 'https://publications.europa.eu/webapi/rdf/sparql',
    contentSelector: '#document1, #TexteOnly, #text',
    allowedOrigins: ['https://eur-lex.europa.eu', 'https://op.europa.eu'],
    termsUrl:
      'https://eur-lex.europa.eu/content/legal-notice/legal-notice.html',
  }),
  source('cn-npc', 'CN', 'https://flk.npc.gov.cn', 'npc', {
    catalogUrl: 'https://flk.npc.gov.cn/law-search/search/list',
    allowedOrigins: [
      'https://www.npc.gov.cn',
      'https://english.www.gov.cn',
      'https://www.gov.cn',
    ],
    contentSelector: '.pages_content, #UCAP-CONTENT, .trs_editor_view, #sp',
    languages: ['zh', 'en'],
  }),
  source('in-code', 'IN', 'https://www.indiacode.nic.in', 'indiacode', {
    catalogUrl:
      'https://www.indiacode.nic.in/simple-search?query=&rpp=100&start=0',
    allowedOrigins: [
      'https://upload.indiacode.nic.in',
      'https://www.legislative.gov.in',
      'https://legislative.gov.in',
      'https://lddashboard.legislative.gov.in',
    ],
    contentSelector: '#content, #sectioncontent, .content',
    termsUrl: 'https://www.indiacode.nic.in/copyright.jsp',
  }),
  source('ru-pravo', 'RU', 'https://publication.pravo.gov.ru', 'pravo', {
    catalogUrl:
      'https://publication.pravo.gov.ru/api/Documents?pageSize=100&index=1',
    allowedOrigins: [
      'https://pravo.gov.ru',
      'http://pravo.gov.ru',
      'https://www.kremlin.ru',
      'http://www.kremlin.ru',
      'https://kremlin.ru',
      'http://kremlin.ru',
    ],
    contentSelector: '#text_content, .reader_article_body',
    languages: ['ru'],
  }),
  source('ge-matsne', 'GE', 'https://matsne.gov.ge', 'matsne', {
    catalogUrl: 'https://matsne.gov.ge/ka/document/search?searchType=0&page=0',
    allowedOrigins: ['https://www.matsne.gov.ge'],
    contentSelector:
      '#maindocbody, #maindoc, .document-body, #document-content, .doc-body',
    termsUrl: 'https://matsne.gov.ge/en/document/view/16198',
    languages: ['ka', 'en', 'ru'],
  }),
];

export function getSource(id) {
  const value = sources.find((item) => item.id === id);
  if (!value) {
    throw new Error(`Unknown source: ${id}`);
  }
  return value;
}

export function buildCoverage(laws = [], runs = []) {
  return {
    complete: false,
    level: 'collected-sample',
    jurisdictions: jurisdictions.map((item) => {
      const records = laws.filter((law) => law.jurisdiction === item.id);
      const collectedLanguages = [
        ...new Set(records.map((law) => law.language)),
      ].sort();
      return {
        id: item.id,
        name: item.name,
        scope: item.scope,
        expectedLanguages: item.languages,
        collectedLanguages,
        missingLanguages: item.languages.filter(
          (language) => !collectedLanguages.includes(language)
        ),
        documents: records.length,
        complete: false,
      };
    }),
    runs,
    limits: [
      'No complete global inventory has been verified.',
      'Collection time is not an effective date.',
      'Absence of a search result does not establish that a law or right does not exist.',
    ],
  };
}
