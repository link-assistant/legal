import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const urls = {
  'us-code': 'https://uscode.house.gov/download.html',
  'us-constitution':
    'https://www.archives.gov/founding-docs/constitution-transcript',
  'eu-gdpr':
    'https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX%3A32016R0679',
  'eu-cellar':
    'https://publications.europa.eu/resource/celex/32016R0679.ENG.html',
  'cn-constitution':
    'https://english.www.gov.cn/archive/laws_regulations/2014/08/23/content_281474982987458.htm',
  'ru-constitution': 'http://www.kremlin.ru/acts/constitution',
  'in-acts':
    'https://www.indiacode.nic.in/simple-search?query=&rpp=100&start=0',
  'ge-constitution': 'https://matsne.gov.ge/ka/document/view/30346',
};
for (const [id, url] of Object.entries(urls)) {
  try {
    const result = execFileSync(
      'curl',
      ['-L', '--max-time', '30', '--max-filesize', '5000000', '-sS', url],
      { maxBuffer: 6 * 1024 * 1024 }
    );
    writeFileSync(`experiments/official/${id}.raw`, result);
    console.log(id, result.length, result.toString().slice(0, 60));
  } catch (e) {
    console.log(id, e.message);
  }
}
