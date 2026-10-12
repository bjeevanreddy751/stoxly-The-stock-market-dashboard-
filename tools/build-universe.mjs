/* ------------------------------------------------------------------
 * tools/build-universe.mjs — regenerate the bundled Indian equity
 * universe from NSE and BSE public files.
 *
 *     node tools/build-universe.mjs
 *
 * Writes:
 *   data/nse-symbols.json  every NSE-listed equity (symbol, name, industry)
 *   data/bse-symbols.json  every BSE-listed scrip NOT already on NSE
 *   data/baskets.json      Nifty 50 / Next 50 / Midcap 150 / Smallcap 250 / 500
 *
 * BSE's API needs a token, but its daily bhavcopy CSV is free and carries
 * every listed scrip with its ISIN — so we dedupe by ISIN and keep the
 * NSE entry when a company is listed on both exchanges.
 *
 * The dashboard always ships with these files so it works offline; it can
 * also refresh them at runtime through the proxy (see js/universe.js).
 * ------------------------------------------------------------------ */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EQUITY_URL = 'https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv';
const INDEX_URL = (name) => `https://nsearchives.nseindia.com/content/indices/${name}.csv`;
/** BSE daily bhavcopy for a given trading date (YYYYMMDD). */
const BSE_URL = (date) => {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `https://www.bseindia.com/download/BhavCopy/Equity/BhavCopy_BSE_CM_0_0_0_${y}${m}${d}_F_0000.CSV`;
};

const BASKETS = [
  ['nifty50', 'ind_nifty50list'],
  ['niftynext50', 'ind_niftynext50list'],
  ['niftymidcap150', 'ind_niftymidcap150list'],
  ['niftysmallcap250', 'ind_niftysmallcap250list'],
  ['nifty500', 'ind_nifty500list']
];

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36';

async function fetchCsv(url) {
  const response = await fetch(url, {
    headers: { 'user-agent': UA, accept: 'text/csv,*/*' }
  });
  if (!response.ok) throw new Error(`${url} -> HTTP ${response.status}`);
  return (await response.text()).replace(/^\uFEFF/, '');
}

/** Minimal CSV parser (handles quoted fields with embedded commas). */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(field); field = ''; }
    else if (char === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (char !== '\r') field += char;
  }
  if (field || row.length) { row.push(field); rows.push(row); }

  const [header, ...body] = rows.filter((r) => r.some((c) => c.trim() !== ''));
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] || '').trim()])));
}

/* ------------------------------ build ------------------------------ */

console.log('Downloading NSE equity master…');
const equities = parseCsv(await fetchCsv(EQUITY_URL))
  .filter((row) => row['SYMBOL'] && row['SERIES'] === 'EQ');

console.log(`  ${equities.length} listed equities`);

/** symbol -> industry, taken from whichever index list contains it. */
const industries = {};
const baskets = {};

for (const [key, file] of BASKETS) {
  process.stdout.write(`Downloading ${file}… `);
  const rows = parseCsv(await fetchCsv(INDEX_URL(file)));
  baskets[key] = rows.map((row) => row.Symbol).filter(Boolean);
  rows.forEach((row) => {
    const symbol = row.Symbol;
    const industry = row.Industry;
    if (symbol && industry && !industries[symbol]) industries[symbol] = industry;
  });
  console.log(`${baskets[key].length} constituents`);
}

const nseSymbols = equities.map((row) => (row.SYMBOL || '').toUpperCase());
const nseIsins = new Set(equities.map((row) => (row['ISIN NUMBER'] || '').toUpperCase()).filter(Boolean));

const symbols = equities.map((row) => ({
  s: row.SYMBOL,
  n: (row['NAME OF COMPANY'] || '').replace(/,\s*$/, ''),
  ...(industries[row.SYMBOL] ? { i: industries[row.SYMBOL] } : {}),
  ...(row['ISIN NUMBER'] ? { isin: row['ISIN NUMBER'] } : {})
}));

const industryCount = symbols.filter((s) => s.i).length;
console.log(`Industries known for ${industryCount}/${symbols.length} symbols`);

/* ------------------------------- BSE ------------------------------- */

/** Companies already covered by NSE: never duplicate them. */
const haveSymbol = new Set(nseSymbols);
const haveIsin = new Set(nseIsins);

/** Walk back over weekends/holidays until a bhavcopy is available. */
async function fetchBseMaster(maxDaysBack = 8) {
  const errors = [];
  for (let back = 1; back <= maxDaysBack; back += 1) {
    const date = new Date(Date.now() - back * 24 * 60 * 60 * 1000);
    const url = BSE_URL(date);
    try {
      const csv = await fetchCsv(url);
      return { csv, url };
    } catch (err) {
      errors.push(err.message);
    }
  }
  throw new Error(`no recent BSE bhavcopy found (${errors.slice(0, 3).join('; ')}…)`);
}

console.log('\nDownloading BSE equity master…');
let bseSymbols = [];
try {
  const { csv, url } = await fetchBseMaster();
  const rows = parseCsv(csv);
  const seen = new Set();

  rows.forEach((row) => {
    const ticker = (row.TckrSymb || '').trim();
    const isin = (row.ISIN || '').trim().toUpperCase();
    const name = (row.FinInstrmNm || '').trim();
    if (!ticker || !name) return;
    if ((row.FinInstrmTp || '').trim() !== 'STK') return;
    if (isin && haveIsin.has(isin)) return;      // same company as an NSE listing
    if (haveSymbol.has(ticker.toUpperCase())) return; // same Yahoo ticker
    if (seen.has(ticker.toUpperCase())) return;  // duplicate row in the file
    seen.add(ticker.toUpperCase());
    bseSymbols.push({ s: ticker, n: name, ...(isin ? { isin } : {}) });
  });

  console.log(`  ${rows.length} scrips in ${path.basename(url)} -> ${bseSymbols.length} BSE-only listings`);
} catch (err) {
  console.log(`  skipped: ${err.message}`);
  // Keep any previously generated file rather than shipping an empty one.
  const existing = path.join(root, 'data', 'bse-symbols.json');
  if (fs.existsSync(existing)) {
    bseSymbols = JSON.parse(fs.readFileSync(existing, 'utf8')).symbols || [];
    console.log(`  reusing ${bseSymbols.length} symbols from the existing file`);
  }
}

fs.mkdirSync(path.join(root, 'data'), { recursive: true });
fs.writeFileSync(path.join(root, 'data', 'nse-symbols.json'), JSON.stringify({
  generatedAt: new Date().toISOString(),
  source: 'NSE archives (EQUITY_L.csv)',
  symbols
}));
fs.writeFileSync(path.join(root, 'data', 'bse-symbols.json'), JSON.stringify({
  generatedAt: new Date().toISOString(),
  source: 'BSE daily bhavcopy (BhavCopy_BSE_CM)',
  symbols: bseSymbols
}));
fs.writeFileSync(path.join(root, 'data', 'baskets.json'), JSON.stringify({
  generatedAt: new Date().toISOString(),
  baskets
}));

const kb = (file) => `${(fs.statSync(path.join(root, file)).size / 1024).toFixed(0)} KB`;
console.log(`\nWrote data/nse-symbols.json (${kb('data/nse-symbols.json')})`);
console.log(`Wrote data/bse-symbols.json (${kb('data/bse-symbols.json')})`);
console.log(`Wrote data/baskets.json (${kb('data/baskets.json')})`);
