import { writeFile } from 'node:fs/promises';
import { robotsAllowed } from '../src/legal/collector.js';
const payload = {
  searchRange: 1,
  sxrq: [],
  gbrq: [],
  searchType: 2,
  sxx: [],
  gbrqYear: [],
  flfgCodeId: [],
  zdjgCodeId: [],
  searchContent: '',
  orderByParam: { order: '-1', sort: '' },
  pageNum: 1,
  pageSize: 2,
};
for (const [name, path, options] of [
  ['robots', '/robots.txt', {}],
  [
    'listing',
    '/law-search/search/list',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    },
  ],
]) {
  try {
    const response = await fetch(new URL(path, 'https://flk.npc.gov.cn'), {
      ...options,
      signal: AbortSignal.timeout(20000),
    });
    const chunks = [];
    let total = 0;
    for await (const chunk of response.body) {
      total += chunk.length;
      if (total > 2000000) {
        throw new Error('Probe exceeds byte budget');
      }
      chunks.push(Buffer.from(chunk));
    }
    const body = Buffer.concat(chunks);
    await writeFile(`experiments/official/npc-${name}.raw`, body);
    console.log(
      JSON.stringify({
        name,
        status: response.status,
        type: response.headers.get('content-type'),
        bytes: body.length,
        preview: body.toString('utf8').slice(0, 500),
      })
    );
    if (
      name === 'robots' &&
      (!response.ok ||
        !robotsAllowed(
          body.toString('utf8'),
          'https://flk.npc.gov.cn/law-search/search/list'
        ))
    ) {
      console.log(
        'NPC collection stopped: publisher robots policy does not allow this catalog.'
      );
      break;
    }
  } catch (error) {
    console.log(
      JSON.stringify({ name, error: error.message, cause: error.cause?.code })
    );
    break;
  }
}
