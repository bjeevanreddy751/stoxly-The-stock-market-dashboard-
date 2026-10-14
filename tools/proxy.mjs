/* ------------------------------------------------------------------
 * tools/proxy.mjs — tiny zero-dependency CORS proxy for the dashboard's
 * data sources: Yahoo Finance (quotes + series), the NSE archives and
 * BSE bhavcopy (symbol lists) and Google Finance quote pages (a fresher
 * cross-check price for the selected stock).
 *
 * None of them send CORS headers, so a browser page cannot call them
 * directly. Run this alongside the dashboard to get live data locally:
 *
 *     node tools/proxy.mjs          # listens on http://127.0.0.1:8787
 *
 * The dashboard tries this proxy first (see CONFIG.proxies in
 * js/config.js) and silently falls back to public proxies, then to
 * cached values, then to demo data when it is not running.
 * ------------------------------------------------------------------ */

import http from 'node:http';

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '127.0.0.1';
/** Hosts this proxy will fetch. All are free and need no API key.
 *  Google Finance is restricted to quote pages because the dashboard only
 *  uses it for the one stock being viewed.
 *
 *  Note: Yahoo's `v8/finance/spark` multi-symbol batches sometimes return only
 *  the first symbol on the Indian feed. The dashboard (js/data.js) treats a
 *  batch that returns fewer symbols than requested as partially missing and
 *  re-fetches the stragglers one symbol at a time, so it is safe to keep
 *  batch sizes modest (CONFIG.snapshotChunkSize).
 */
const ALLOWED = [
  /^https:\/\/query[12]\.finance\.yahoo\.com\//,
  /^https:\/\/nsearchives\.nseindia\.com\//,
  /^https:\/\/www\.bseindia\.com\//,
  /^https:\/\/www\.google\.com\/finance\/quote\//
];

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, OPTIONS',
  'access-control-allow-headers': '*'
};

function send(res, status, body, contentType = 'application/json') {
  res.writeHead(status, { ...CORS_HEADERS, 'content-type': contentType, 'cache-control': 'no-store' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    return res.end();
  }

  const requestUrl = new URL(req.url, `http://${HOST}:${PORT}`);
  const target = requestUrl.searchParams.get('url');

  if (!target) return send(res, 400, { error: 'Missing ?url= parameter' });
  if (!ALLOWED.some((pattern) => pattern.test(target))) {
    return send(res, 400, { error: 'Only Yahoo Finance, NSE archive, BSE bhavcopy and Google Finance quote URLs are allowed' });
  }

  try {
    const upstream = await fetch(target, {
      headers: {
        // Both providers throttle generic clients; look like a browser.
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36',
        accept: 'application/json,text/csv,text/plain,*/*',
        'accept-language': 'en-IN,en;q=0.9'
      }
    });
    const body = await upstream.text();
    console.log(`${upstream.status} ${target.replace('https://query1.finance.yahoo.com', '')}`);
    send(res, upstream.ok ? 200 : upstream.status, body, upstream.headers.get('content-type') || 'application/json');
  } catch (err) {
    console.error(`proxy error: ${err.message}`);
    send(res, 502, { error: err.message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`CORS proxy listening on http://${HOST}:${PORT} (Yahoo · NSE · BSE · Google Finance)`);
});
