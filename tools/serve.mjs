/* ------------------------------------------------------------------
 * tools/serve.mjs — tiny zero-dependency static server for the dashboard.
 *
 *     node tools/serve.mjs        # http://127.0.0.1:8000
 *
 * `python -m http.server` works too, but it sends **no** Cache-Control
 * header — only Last-Modified — so browsers heuristically cache
 * js/*.js and js/locales/*.js and happily keep serving an old copy after
 * you edit them. That is why a normal reload can show stale code.
 *
 * This server sends `Cache-Control: no-store`, so every reload picks up
 * the files on disk. It serves the project directory only and no
 * directory listings.
 * ------------------------------------------------------------------ */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT || 8000);
const HOST = process.env.HOST || '127.0.0.1';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8'
};

function fail(res, status, message) {
  res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
  res.end(message);
}

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return fail(res, 405, 'Method not allowed');

  const requestUrl = new URL(req.url, `http://${HOST}:${PORT}`);
  let relative = decodeURIComponent(requestUrl.pathname);
  if (relative.endsWith('/')) relative += 'index.html';

  const file = path.join(root, relative);
  // Never escape the project directory (`..` in the path).
  if (file !== root && !file.startsWith(root + path.sep)) {
    return fail(res, 403, 'Forbidden');
  }

  fs.stat(file, (statErr, stat) => {
    if (statErr || !stat.isFile()) return fail(res, 404, `Not found: ${relative}`);

    res.writeHead(200, {
      'content-type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      // The whole point: never let the browser reuse an edited file.
      'cache-control': 'no-store',
      'content-length': stat.size
    });

    if (req.method === 'HEAD') return res.end();
    const stream = fs.createReadStream(file);
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Dashboard served on http://${HOST}:${PORT}  (Cache-Control: no-store)`);
  console.log('Run `node tools/proxy.mjs` as well for live quotes.');
});
