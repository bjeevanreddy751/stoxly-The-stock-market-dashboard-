/* ------------------------------------------------------------------
 * tests/live-check.mjs — opt-in check against the REAL Yahoo Finance API.
 *
 *   node tools/proxy.mjs          # terminal 1
 *   node tests/live-check.mjs     # terminal 2
 *
 * Verifies URL construction, response parsing and localisation using
 * live market data. Skips (exit 0) when the proxy is not running.
 * ------------------------------------------------------------------ */

import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROXY = process.env.PROXY_URL || 'http://127.0.0.1:8787/?url=';

try {
  const ping = await fetch(`${PROXY}${encodeURIComponent('https://query1.finance.yahoo.com/v8/finance/chart/RELIANCE.NS?range=1d&interval=1d')}`);
  if (!ping.ok) throw new Error(`HTTP ${ping.status}`);
  await ping.json();
} catch (err) {
  console.log(`SKIP: local proxy not reachable at ${PROXY} (${err.message})`);
  console.log('      start it with: node tools/proxy.mjs');
  process.exit(0);
}

const sandbox = {
  console, Intl, Date, Math, JSON, Number, String, Array, Object, Promise, Set, Map, URLSearchParams,
  setTimeout, clearTimeout, AbortController,
  fetch: (url) => fetch(`${PROXY}${encodeURIComponent(url)}`),
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  sessionStorage: { getItem: () => null, setItem: () => {} },
  location: { search: '' }
};
sandbox.window = sandbox;
sandbox.navigator = { language: 'en-IN' };
vm.createContext(sandbox);
['js/config.js', 'js/translit.js', 'js/glossary.js', 'js/i18n.js', 'js/universe.js', 'js/data.js'].forEach((file) => {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), sandbox, { filename: file });
});

// Load the full NSE universe from the bundled files.
sandbox.fetch = async (url) => {
  const target = String(url);
  if (target.startsWith('data/')) {
    const file = path.join(root, target.split('?')[0]);
    return { ok: true, status: 200, json: async () => JSON.parse(fs.readFileSync(file, 'utf8')), text: async () => fs.readFileSync(file, 'utf8') };
  }
  return fetch(`${PROXY}${encodeURIComponent(target)}`);
};

const { DataService, Format, INSTRUMENTS, CONFIG, Universe, Localize } = vm.runInContext(
  '({ DataService, Format, INSTRUMENTS, CONFIG, Universe, Localize })', sandbox
);
await Universe.load();

const symbols = [...CONFIG.indexSymbols, ...INSTRUMENTS.map((i) => i.symbol)].filter((s, i, a) => a.indexOf(s) === i);

console.log(`\nFetching ${symbols.length} symbols from Yahoo Finance…`);
const started = Date.now();
const { source, quotes } = await DataService.fetchQuotes(symbols);
console.log(`source=${source} in ${Date.now() - started}ms (one batched request + fallbacks)\n`);

if (source !== 'live') {
  console.log('FAIL: expected live data, got', source);
  process.exit(1);
}

let failures = 0;
const rows = symbols.map((symbol) => {
  const quote = quotes[symbol];
  const name = Format.instrumentName(symbol, 'en');
  if (!quote || !(quote.price > 0)) { failures += 1; return [name, symbol, 'MISSING', '', '']; }
  return [
    name,
    symbol,
    Format.price(quote.price, quote.currency, 'en'),
    Format.signedPercent(quote.changePct, 'en'),
    Format.marketState(quote.marketState, 'en')
  ];
});

const widths = [0, 1, 2, 3].map((i) => Math.max(...rows.map((r) => r[i].length)));
rows.forEach((r) => console.log(r.map((cell, i) => cell.padEnd(widths[i])).join('  |  ')));

console.log('\nSame values, localised:');
const sample = quotes['RELIANCE.NS'] || quotes[symbols[0]];
['en', 'hi', 'kn', 'te'].forEach((lang) => {
  console.log(`  ${lang}: ${Format.instrumentName('RELIANCE.NS', lang).padEnd(28)} `
    + `${Format.price(sample.price, sample.currency, lang)}  ${Format.signedPercent(sample.changePct, lang)}  `
    + `${Format.volume(sample.volume, lang, sample.currency)}  ${Format.dateTime(sample.ts, lang, sample.offset)}`);
});

const series = await DataService.fetchSeries('RELIANCE.NS', '1d');
console.log(`\n1D series: ok=${series.ok} points=${series.points ? series.points.length : 0} `
  + `intraday=${series.intraday} 52wHigh=${series.meta && series.meta.fiftyTwoWeekHigh}`);
if (series.ok) {
  const labels = series.points.slice(0, 3).map((p) => Format.axisLabel(p.t, 'hi', series.offset, series.intraday));
  console.log(`Hindi axis labels: ${labels.join(', ')}`);
}

/* --------------------- whole-market snapshot ----------------------- */

const basket = process.env.BASKET || 'nifty50';
const basketSymbols = Universe.basketSymbols(basket);
console.log(`\n\nUniverse: ${Universe.count()} NSE listings · basket "${basket}" = ${basketSymbols.length} symbols`);

const startSnapshot = Date.now();
const snapshot = await DataService.fetchQuotes(basketSymbols);
const snapshotQuotes = Object.values(snapshot.quotes).filter((q) => typeof q.changePct === 'number');
console.log(`Snapshot: ${snapshotQuotes.length}/${basketSymbols.length} quotes in ${Date.now() - startSnapshot}ms `
  + `(${snapshot.chunks || 1} batched request(s), source=${snapshot.source})`);

const ranked = snapshotQuotes.slice().sort((a, b) => b.changePct - a.changePct);
const language = process.env.LANG || 'hi';
console.log(`\nBiggest movers, rendered in ${language}:`);
[...ranked.slice(0, 3), ...ranked.slice(-3)].forEach((quote) => {
  const bare = Universe.fromYahoo(quote.symbol);
  console.log(`  ${Format.signedPercent(quote.changePct, language).padStart(8)}  `
    + `${Universe.name(quote.symbol, language).padEnd(34)} ${bare.padEnd(12)} `
    + `${Format.price(quote.price, quote.currency, language).padStart(11)}  `
    + `${Format.sectorName(Universe.sectorKey(quote.symbol), language)}`);
});

console.log('\nSearching the whole universe in regional scripts:');
['ಇನ್ಫೋಸಿಸ್', 'విప్రో', 'ரிலையன்ஸ்', 'టాటా', 'मारुति'].forEach((needle) => {
  const [first] = Universe.search(needle, 'hi', 1);
  console.log(`  ${needle.padEnd(14)} -> ${first ? `${first.symbol} (${first.official})` : 'no match'}`);
});

const missing = basketSymbols.length - snapshotQuotes.length;
console.log(missing ? `\n${missing} symbol(s) had no live quote` : '\nEvery symbol in the basket resolved live 🎉');
process.exit(failures ? 1 : 0);
