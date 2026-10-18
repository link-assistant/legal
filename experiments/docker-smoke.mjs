import { execFileSync } from 'node:child_process';
const image = process.argv[2];
if (!image) {
  throw new Error('Pass a built Docker image tag');
}
const name = `legal-smoke-${process.pid}`;
try {
  execFileSync(
    'docker',
    [
      'run',
      '-d',
      '--name',
      name,
      '--memory=384m',
      '--cpus=1',
      '-p',
      '127.0.0.1:18787:8787',
      image,
    ],
    { stdio: 'pipe' }
  );
  let ready = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      const response = await fetch('http://127.0.0.1:18787/health');
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {
      /* Startup in progress. */
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  if (!ready) {
    throw new Error('Container API did not become healthy');
  }
  const response = await fetch('http://127.0.0.1:18787/v1/answer', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      question: 'equal before the law',
      jurisdiction: 'GE',
    }),
  });
  const answer = await response.json();
  if (!response.ok || !answer.citations?.length) {
    throw new Error('Container API returned no grounded citation');
  }
  console.log(
    JSON.stringify({
      health: 'ok',
      status: answer.status,
      citations: answer.citations.length,
    })
  );
} finally {
  try {
    execFileSync('docker', ['rm', '-f', name], { stdio: 'pipe' });
  } catch {
    /* Preserve original test failure. */
  }
}
