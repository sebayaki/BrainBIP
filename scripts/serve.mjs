import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const port = Number(process.env.PORT || 4173);
const root = new URL('../dist/', import.meta.url);
const types = {
  html: 'text/html; charset=utf-8',
  txt: 'text/plain; charset=utf-8',
  json: 'application/json; charset=utf-8',
};
createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  const file = pathname === '/' ? 'index.html' : pathname.slice(1);
  if (
    ![
      'index.html',
      'brainbip.html',
      'THIRD_PARTY_NOTICES.txt',
      'SHA256SUMS.txt',
      'VERSION.json',
      'LICENSE',
    ].includes(file)
  ) {
    response.writeHead(404).end('Not found');
    return;
  }
  try {
    const data = await readFile(new URL(file, root));
    response.writeHead(200, {
      'Content-Type': types[file.split('.').pop()] || 'text/plain',
      'Cache-Control': 'no-store',
    });
    response.end(data);
  } catch {
    response.writeHead(500).end('Build the app before starting the preview.');
  }
}).listen(port, '127.0.0.1', () => console.log(`BrainBIP preview: http://127.0.0.1:${port}`));
