import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const urls = {
  'eu-fr':
    'https://eur-lex.europa.eu/legal-content/FR/TXT/?uri=CELEX:32016R0679',
  'eu-xml':
    'https://publications.europa.eu/resource/celex/32016R0679?language=eng&format=fmx4',
  'ge-en': 'https://matsne.gov.ge/en/document/view/30346?publication=36',
  'ru-ips':
    'https://pravo.gov.ru/proxy/ips/?doc_itself=&nd=102027595&fulltext=1',
  'ru-kremlin': 'https://kremlin.ru/acts/constitution',
  'in-official':
    'https://lddashboard.legislative.gov.in/sites/default/files/COI_English.pdf',
  'cn-zh': 'https://www.gov.cn/guoqing/2018-03/22/content_5276318.htm',
};
for (const [id, url] of Object.entries(urls)) {
  try {
    const body = execFileSync(
      'curl',
      ['-L', '--max-time', '20', '--max-filesize', '5000000', '-sS', url],
      { maxBuffer: 6 * 1024 * 1024 }
    );
    writeFileSync(`experiments/official/${id}.raw`, body);
    console.log(id, body.length, body.toString().slice(0, 60));
  } catch (e) {
    console.log(id, e.message);
  }
}
