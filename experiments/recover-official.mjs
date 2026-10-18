import { writeFile } from 'node:fs/promises';
const urls = [
  'https://matsne.gov.ge/en/document/download/30346/36/en/pdf',
  'https://www.matsne.gov.ge/en/document/view/30346',
  'https://matsne.gov.ge/en/document/view/30346?publication=0',
  'https://matsne.gov.ge/en/document/download/30346/35/en/pdf',
];
for (let i = 0; i < urls.length; i++) {
  try {
    const response = await fetch(urls[i], {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        Accept: 'text/html,application/pdf',
      },
      signal: AbortSignal.timeout(20000),
    });
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length > 5000000) {
      throw Error('Budget');
    }
    await writeFile(`experiments/official/ge-recovery-${i}.raw`, bytes);
    console.log(
      response.status,
      urls[i],
      bytes.length,
      response.headers.get('content-type')
    );
  } catch (error) {
    console.log(urls[i], error.message);
  }
}
