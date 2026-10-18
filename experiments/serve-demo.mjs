import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
const types = {
  html: 'text/html',
  js: 'text/javascript',
  css: 'text/css',
  json: 'application/json',
};
createServer(async (request, response) => {
  const path = new URL(request.url, 'http://localhost').pathname;
  try {
    if (!/^\/[\w.-]*$/.test(path)) {
      throw new Error('Invalid path');
    }
    const file = path === '/' ? '/index.html' : path;
    const body = await readFile(`dist/legal-demo${file}`);
    response.setHeader(
      'content-type',
      types[file.split('.').pop()] ?? 'application/octet-stream'
    );
    response.end(body);
  } catch {
    response.writeHead(404);
    response.end('Not found');
  }
}).listen(4174, '127.0.0.1');
