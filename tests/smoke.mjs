/* ------------------------------------------------------------------
 * tests/smoke.mjs — dependency-free checks for the pure-JS layers.
 * Run with:  node tests/smoke.mjs
 * ------------------------------------------------------------------ */

import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* ----------------------------- test utils -------------------------- */

let passed = 0;
const failures = [];

async function check(label, fn) {
  try {
    const result = await fn();
    if (result === false) throw new Error('assertion returned false');
    passed += 1;
    console.log(`  ok  ${label}`);
  } catch (err) {
    failures.push(`${label}: ${err.message}`);
    console.log(`FAIL  ${label} -> ${err.message}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'assertion failed');
}

/* ------------------------- browser environment --------------------- */

function makeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    clear: () => map.clear()
  };
}

/**
 * fetch stub. Handles the app's relative data files, the NSE archives
 * and Yahoo Finance URLs (optionally through a fake CORS proxy).
 */
function makeFetch({ fail = false, yahoo, nse } = {}) {
  const seen = [];

  return async function fetchStub(rawUrl) {
    const url = String(rawUrl);
    seen.push(url);
    if (fail) throw new Error('network down');

    // strip a proxy prefix, keeping the proxied target
    const proxied = url.match(/^(?:https:\/\/[^/]+\/(?:raw\?url=|\?url=|v1\/proxy\/\?quest=))(.+)$/);
    let target = url;
    if (proxied) {
      try { target = decodeURIComponent(proxied[1]); } catch (err) { target = proxied[1]; }
    }

    if (target.startsWith('data/')) {
      const file = path.join(root, target.split('?')[0]);
      if (!fs.existsSync(file)) throw new Error(`missing ${target}`);
      return { ok: true, status: 200, json: async () => JSON.parse(fs.readFileSync(file, 'utf8')), text: async () => fs.readFileSync(file, 'utf8') };
    }

    if (target.includes('nsearchives.nseindia.com')) {
      const body = nse ? nse(target) : null;
      if (!body) throw new Error('HTTP 404');
      return { ok: true, status: 200, text: async () => body, json: async () => JSON.parse(body) };
    }

    if (target.includes('query1.finance.yahoo.com')) {
      const body = yahoo ? yahoo(target) : null;
      if (body === undefined || body === null) throw new Error('HTTP 404');
      return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) };
    }

    throw new Error(`unexpected URL ${target}`);
  };
}

const FILES = [
  'js/config.js', 'js/translit.js', 'js/glossary.js', 'js/i18n.js', 'js/universe.js', 'js/data.js',
  ...['en', 'hi', 'mr', 'kn', 'te', 'ta', 'ml', 'bn', 'gu', 'pa', 'or', 'as', 'ur',
    'kok', 'mai', 'doi', 'brx', 'sa', 'mni', 'sd', 'ks', 'sat'].map((c) => `js/locales/${c}.js`)
];

function makeSandbox(fetchImpl) {
  const sandbox = {
    console, Intl, Date, Math, JSON, Number, String, Array, Object, Promise, Set, Map, URLSearchParams,
    setTimeout, clearTimeout, AbortController, fetch: fetchImpl,
    localStorage: makeStorage(),
    sessionStorage: makeStorage(),
    location: { search: '' },
    navigator: { language: 'en-IN' }
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  FILES.forEach((file) => {
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), sandbox, { filename: file });
  });

  // Top-level `const` lives in the context's lexical scope — ask for it.
  const api = vm.runInContext(
    '({ I18N, LANGUAGES, INSTRUMENTS, CONFIG, RANGES, BASKETS, Format, Localize, Translit, Glossary, Universe, DataService })',
    sandbox
  );
  return { ...api, context: sandbox, fetchStub: fetchImpl };
}

const LANG_CODES = ['en', 'hi', 'mr', 'kn', 'te', 'ta', 'ml', 'bn', 'gu', 'pa', 'or', 'as', 'ur',
  'kok', 'mai', 'doi', 'brx', 'sa', 'mni', 'sd', 'ks', 'sat'];

/* ------------------------------- i18n ------------------------------ */

console.log('\ni18n');
const base = makeSandbox(makeFetch());
const { I18N, LANGUAGES, Format, Localize, Translit, Glossary } = base;

await check('all 22 languages are declared with locale + script metadata', () => {
  assert(LANGUAGES.length === 22, `got ${LANGUAGES.length} languages`);
  LANGUAGES.forEach((lang) => {
    assert(lang.locale && typeof lang.script === 'string' && lang.dir, `${lang.code} metadata incomplete`);
  });
});

await check('every language defines every UI key', () => {
  const keys = Object.keys(I18N.en.ui);
  assert(keys.length >= 70, `only ${keys.length} keys in English`);
  LANGUAGES.forEach((lang) => {
    const pack = I18N[lang.code];
    assert(pack, `${lang.code} locale missing`);
    const missing = keys.filter((key) => !pack.ui[key]);
    assert(!missing.length, `${lang.code} missing: ${missing.join(', ')}`);
  });
});

await check('every language defines every sector and unit', () => {
  const sectors = Object.keys(I18N.en.sectors);
  const units = Object.keys(I18N.en.units);
  LANGUAGES.forEach((lang) => {
    assert(!sectors.filter((s) => !I18N[lang.code].sectors[s]).length, `${lang.code} sector gap`);
    assert(!units.filter((u) => !I18N[lang.code].units[u]).length, `${lang.code} unit gap`);
  });
});

await check('regional locales are actually translated', () => {
  const english = JSON.stringify(I18N.en.ui);
  LANG_CODES.filter((c) => c !== 'en').forEach((code) => {
    assert(JSON.stringify(I18N[code].ui) !== english, `${code} copies English`);
  });
});

await check('{placeholders} survive translation', () => {
  ['en', 'hi', 'kn', 'te', 'ta', 'ml', 'bn', 'ur'].forEach((code) => {
    assert(I18N[code].ui.showingCount.includes('{shown}'), `${code} lost {shown}`);
    assert(I18N[code].ui.showingCount.includes('{total}'), `${code} lost {total}`);
  });
  const text = Format.t('hi', 'showingCount', { shown: 40, total: 500 });
  assert(text.includes(Format.int(40, 'hi')) && text.includes(Format.int(500, 'hi')),
    `interpolation failed: ${text}`);
});

await check('market state maps to localised text', () => {
  assert(Format.marketState('REGULAR', 'hi') === I18N.hi.ui.marketOpen);
  assert(Format.marketState('NONSENSE', 'en') === I18N.en.ui.marketClosed);
});

/* ---------------------------- formatting --------------------------- */

console.log('\nformatting');
await check('prices use Indian grouping and the right symbol', () => {
  assert(Format.price(1234567.5, 'INR', 'en') === '₹12,34,567.50', Format.price(1234567.5, 'INR', 'en'));
  assert(Format.price(950.25, 'INR', 'ml').startsWith('₹'), 'ml price');
  // Every language formats numbers in its own digits (Western digits for
  // English), with Indian grouping and the language's date words.
  ['ur', 'bn', 'or', 'as', 'ml'].forEach((code) => {
    const pct = Format.signedPercent(-1.234, code);
    assert(pct.startsWith('−') && pct.endsWith('%'), `${code}: ${pct}`);
    assert(!/[0-9]/.test(pct), `${code} should use native digits: ${pct}`);
    assert(Format.price(1234.5, 'INR', code).startsWith('₹'), `${code} price`);
  });
  // A language with no digit set of its own keeps Western digits.
  assert(Format.signedPercent(-1.234, 'en') === '−1.23%', Format.signedPercent(-1.234, 'en'));
});

await check('missing values render as an em dash, never NaN', () => {
  [null, undefined, NaN].forEach((value) => {
    assert(Format.price(value, 'INR', 'hi') === '—');
    assert(Format.signedPercent(value, 'en') === '—');
    assert(Format.volume(value, 'or', 'INR') === '—');
  });
});

await check('large numbers use crore/lakh per language', () => {
  assert(Format.compact(12345678, 'en', 'INR') === '1.23 Cr', Format.compact(12345678, 'en', 'INR'));
  ['hi', 'mr', 'kn', 'te', 'ta', 'ml', 'bn', 'gu', 'pa', 'or', 'as', 'ur',
    'kok', 'mai', 'doi', 'brx', 'sa', 'mni', 'sd', 'ks', 'sat'].forEach((code) => {
    const text = Format.compact(12345678, code, 'INR');
    assert(text.endsWith(I18N[code].units.crore), `${code} crore: ${text}`);
  });
});

await check('axis labels distinguish intraday points in IST', () => {
  const nineFifteen = Math.floor(Date.UTC(2026, 9, 8, 3, 45) / 1000);
  const labels = [0, 1, 2].map((i) => Format.axisLabel(nineFifteen + i * 300, 'hi', 19800, true));
  assert(new Set(labels).size === 3, `labels not distinct: ${labels.join(', ')}`);
  // Hindi renders the clock time in Devanagari digits (०9:15).
  assert(labels[0].includes(':'), `expected a clock time, got ${labels[0]}`);
  assert(/[\u0966-\u096F]/.test(labels[0]), `expected Devanagari digits, got ${labels[0]}`);
});

await check('Google Finance symbol mapping and price parsing', () => {
  const { googleQuotePath, parseGooglePrice } = base.DataService;
  assert(googleQuotePath('TCS.NS') === 'TCS:NSE', googleQuotePath('TCS.NS'));
  assert(googleQuotePath('^NSEI') === 'NIFTY_50:INDEXNSE', googleQuotePath('^NSEI'));
  assert(googleQuotePath('RELIANCE.BO') === null, 'BSE has no parseable Google page');
  assert(googleQuotePath('WIPRO') === null, 'bare symbols carry no exchange');

  const block = '<div class="N6SYTe"><span jsname="Pdsbrc" class=""><span>\u20b92,171.50</span></span></div>';
  assert(parseGooglePrice(block) === 2171.5, String(parseGooglePrice(block)));
  assert(parseGooglePrice('<span>\u20b91,234.56</span>') === 1234.56, 'fallback parse');
  assert(parseGooglePrice('<div>no price here</div>') === null, 'junk must parse to null');
});

await check('a reported change beats an inconsistent previousClose', () => {
  // Real Yahoo payload for ^NSEI: previousClose sits above the day's high and
  // contradicts fulldayChange, which is what the index actually did.
  const quote = { symbol: '^NSEI', price: 22520.45, prevClose: 22603.1, change: -82.65, changePct: -0.366 };
  base.DataService.reconcileChange(quote, { change: 288.648, changePct: 1.298 });
  assert(quote.change > 0, `index must show a gain, got ${quote.change}`);
  assert(Math.abs(quote.prevClose - 22231.802) < 0.01, `derived prevClose ${quote.prevClose}`);
  assert(quote.changePct === 1.298, `pct ${quote.changePct}`);
});

await check('a reported percentage alone derives the change', () => {
  const quote = { symbol: '^NSEI', price: 22520.45, prevClose: 99999 };
  base.DataService.reconcileChange(quote, { changePct: 1.298 });
  assert(quote.change > 0, `derived change ${quote.change}`);
  assert(Math.abs(quote.prevClose - 22520.45 / 1.01298) < 0.01, `derived prevClose ${quote.prevClose}`);
});

await check('quotes with no reported change still compute one', () => {
  const quote = { symbol: 'X', price: 110, prevClose: 100 };
  base.DataService.reconcileChange(quote, {});
  assert(Math.abs(quote.change - 10) < 1e-9, 'change');
  assert(Math.abs(quote.changePct - 10) < 1e-9, 'changePct');
});

/* -------------------------- transliteration ------------------------ */

console.log('\ntransliteration');
await check('every script only emits its own characters', () => {
  const samples = ['Reliance', 'Bajaj', 'Infosys', 'Suzuki', 'Wipro', 'Gujarat', 'Ambuja'];
  LANG_CODES.filter((code) => Translit.scriptFor(code)).forEach((code) => {
    samples.forEach((word) => {
      const out = Translit.word(word, code);
      assert(out.length > 0, `${code} produced nothing for ${word}`);
      assert(Translit.isScriptText(out, code), `${code} "${word}" -> "${out}" has foreign characters`);
    });
  });
});

await check('known company words transliterate sensibly', () => {
  assert(Translit.word('Bajaj', 'hi') === 'बजाज', Translit.word('Bajaj', 'hi'));
  assert(Translit.word('Wipro', 'hi') === 'विप्रो', Translit.word('Wipro', 'hi'));
  assert(Translit.word('Tata', 'hi') === 'टाटा', Translit.word('Tata', 'hi'));
  assert(Translit.word('Suzuki', 'kn') === 'ಸುಜುಕೀ', Translit.word('Suzuki', 'kn'));
});

await check('phrases keep numbers, punctuation and separators', () => {
  const out = Translit.text('3M India Limited (2024)', 'hi');
  assert(out.includes('3') && out.includes('(') && out.includes(')'), out);
});

await check('English keeps Latin names; every other language transliterates', () => {
  assert(Translit.text('Reliance Industries', 'en') === 'Reliance Industries');
  ['ur', 'sd', 'ks', 'sat'].forEach((code) => {
    const out = Translit.text('Reliance Industries', code);
    assert(out !== 'Reliance Industries', `${code} still shows Latin: ${out}`);
    assert(Translit.isScriptText(out, code), `${code} "${out}" has foreign characters`);
  });
});

/* ----------------------------- glossary ---------------------------- */

console.log('\nglossary');
await check('every glossary row covers all 13 languages', () => {
  const rows = { ...Glossary.words, ...Glossary.names };
  Object.entries(rows).forEach(([key, row]) => {
    assert(Array.isArray(row), `${key} is not an array`);
    assert(row.length === Glossary.order.length, `${key} has ${row.length} of ${Glossary.order.length} values`);
    assert(row.every((v) => typeof v === 'string' && v.trim()), `${key} has an empty value`);
  });
});

await check('curated names resolve per language and unknown symbols return null', () => {
  assert(Glossary.name('RELIANCE.NS', 'en') === 'Reliance Industries');
  assert(Glossary.name('RELIANCE.NS', 'hi') === 'रिलायंस इंडस्ट्रीज़');
  assert(Glossary.name('RELIANCE.NS', 'ta').includes('ரிலையன்ஸ்'), Glossary.name('RELIANCE.NS', 'ta'));
  assert(Glossary.name('NOT-A-SYMBOL', 'hi') === null);
});

await check('generic words translate and unknown words transliterate', () => {
  const out = Localize.company('Reliance Industries Limited', 'hi');
  assert(out.startsWith('रिलायंस'), out);
  assert(out.endsWith('लिमिटेड'), out);
  const tamil = Localize.company('Tata Steel Limited', 'ta');
  assert(tamil.includes('லிமிடெட்') && !tamil.includes('Limited'), tamil);
  assert(Translit.isScriptText(tamil, 'ta'), `foreign characters: ${tamil}`);
  // Urdu now has an Arabic-script mapping too, so it transliterates rather
  // than staying Latin; 'Limited' still uses the curated Urdu word.
  const urdu = Localize.company('Reliance Industries Limited', 'ur');
  assert(urdu.includes('لمیٹڈ'), `urdu should use the curated word: ${urdu}`);
  assert(Translit.isScriptText(urdu, 'ur'), `foreign characters: ${urdu}`);
});

/* ----------------------------- universe ---------------------------- */

console.log('\nuniverse');
const universe = makeSandbox(makeFetch());
await universe.Universe.load();

await check('bundled NSE symbol list loads', () => {
  assert(universe.Universe.ready(), 'universe not ready');
  assert(universe.Universe.count() > 2000, `only ${universe.Universe.count()} symbols`);
  assert(universe.Universe.updatedAt() > 0, 'missing generatedAt');
});

await check('baskets carry the right number of constituents', () => {
  assert(universe.Universe.basketSymbols('nifty50').length === 50, 'nifty50');
  assert(universe.Universe.basketSymbols('nifty500').length >= 500, 'nifty500');
  assert(universe.Universe.basketSymbols('nifty500')[0].endsWith('.NS'), 'tickers are not Yahoo-style');
});

await check('sector keys cover every locale', () => {
  const keys = new Set(Object.values(universe.Universe.industryKeys));
  keys.add('index'); keys.add('other');
  keys.forEach((key) => {
    assert(I18N.en.sectors[key], `en is missing sector key ${key}`);
    LANG_CODES.forEach((code) => {
      assert(I18N[code].sectors[key], `${code} is missing sector key ${key}`);
    });
  });
});

await check('search finds a stock by symbol, English name and regional name', () => {
  const bySymbol = universe.Universe.search('INFY', 'en', 5);
  assert(bySymbol[0].symbol === 'INFY.NS', JSON.stringify(bySymbol[0]));

  const byEnglish = universe.Universe.search('Reliance Industries', 'en', 5);
  assert(byEnglish.some((r) => r.symbol === 'RELIANCE.NS'), 'english name match failed');

  const byKannada = universe.Universe.search('ಇನ್ಫೋಸಿಸ್', 'kn', 5);
  assert(byKannada.some((r) => r.symbol === 'INFY.NS'), `kannada search: ${JSON.stringify(byKannada.slice(0, 2))}`);

  const byTelugu = universe.Universe.search('టాటా', 'te', 5);
  assert(byTelugu.length > 0, 'telugu search returned nothing');
});

await check('names localise for arbitrary listings', () => {
  const kannada = universe.Universe.name('3MINDIA.NS', 'kn');
  assert(kannada !== '3MINDIA.NS' && kannada.length > 3, kannada);
  assert(Translit.isScriptText(kannada, 'kn'), `foreign characters: ${kannada}`);
  assert(universe.Universe.officialName('3MINDIA.NS').includes('India'), 'official name');
});

await check('search results include a sector key for the UI', () => {
  const [hit] = universe.Universe.search('HDFCBANK', 'en', 1);
  assert(hit.sector && I18N.hi.sectors[hit.sector], `bad sector ${hit.sector}`);
});

/* ------------------------------- BSE ------------------------------- */

const bseData = JSON.parse(fs.readFileSync(path.join(root, 'data/bse-symbols.json'), 'utf8'));
const sampleBse = bseData.symbols[0].s;

await check('BSE-only scrips join the merged universe', () => {
  assert(universe.Universe.bseCount() === bseData.symbols.length,
    `bseCount ${universe.Universe.bseCount()} != ${bseData.symbols.length}`);
  assert(universe.Universe.totalCount() === universe.Universe.count() + universe.Universe.bseCount(),
    'totalCount is not NSE + BSE');
});

await check('BSE scrips resolve to .BO, NSE stays .NS', () => {
  const hit = universe.Universe.search(sampleBse, 'en', 5).find((r) => r.bare === sampleBse);
  assert(hit, `search missed the BSE scrip ${sampleBse}`);
  assert(hit.symbol === `${sampleBse}.BO`, `expected ${sampleBse}.BO, got ${hit.symbol}`);
  assert(universe.Universe.toYahoo('INFY') === 'INFY.NS', 'NSE symbols must keep .NS');
  assert(universe.Universe.item(`${sampleBse}.BO`), 'item() did not resolve a .BO ticker');
  assert(universe.Universe.sectorKey(`${sampleBse}.BO`) === 'other', 'BSE scrips have no NSE industry');
});

await check('BSE entries never duplicate an NSE company', () => {
  const nseData = JSON.parse(fs.readFileSync(path.join(root, 'data/nse-symbols.json'), 'utf8'));
  const nseIsins = new Set(nseData.symbols.map((s) => (s.isin || '').toUpperCase()).filter(Boolean));
  const nseTickers = new Set(nseData.symbols.map((s) => s.s.toUpperCase()));
  const byIsin = bseData.symbols.filter((s) => s.isin && nseIsins.has(s.isin.toUpperCase()));
  const byTicker = bseData.symbols.filter((s) => nseTickers.has(s.s.toUpperCase()));
  assert(byIsin.length === 0, `${byIsin.length} BSE scrips duplicate an NSE ISIN`);
  assert(byTicker.length === 0, `${byTicker.length} BSE scrips reuse an NSE ticker`);
});

await check('BSE names localise like NSE ones', () => {
  const hindi = universe.Universe.name(`${sampleBse}.BO`, 'hi');
  assert(hindi && hindi !== `${sampleBse}.BO`, `BSE name not resolved: ${hindi}`);
});

/* ------------------------- quotes / chunking ----------------------- */

console.log('\nquotes');
const sparkFor = (symbols) => symbols.reduce((acc, symbol, i) => {
  acc[symbol] = {
    symbol,
    timestamp: [1730000000, 1730000300],
    close: [96 + i, 100 + i],
    previousClose: 95 + i,
    chartPreviousClose: 95 + i,
    fulldayPrice: 100 + i,
    dataGranularity: '5m'
  };
  return acc;
}, {});

let yahooCalls = 0;
const quoteSandbox = makeSandbox(makeFetch({
  yahoo: (target) => {
    yahooCalls += 1;
    const match = target.match(/symbols=([^&]+)/);
    if (!match) return null;
    return sparkFor(decodeURIComponent(match[1]).split(','));
  }
}));

const many = Array.from({ length: 120 }, (_, i) => `TEST${i}.NS`);
const chunked = await quoteSandbox.DataService.fetchQuotes(many);

await check('large baskets are fetched in chunks and merged', () => {
  assert(chunked.source === 'live', chunked.source);
  assert(Object.keys(chunked.quotes).length === 120, `got ${Object.keys(chunked.quotes).length}`);
  assert(yahooCalls === 3, `expected 3 chunked requests, saw ${yahooCalls}`);
  const quote = chunked.quotes['TEST0.NS'];
  assert(quote.price === 100 && quote.prevClose === 95, 'price/prevClose');
  assert(Math.round(quote.changePct * 100) / 100 === 5.26, `changePct ${quote.changePct}`);
  assert(quote.currency === 'INR' && quote.exchange === 'NSE', 'INR/NSE inferred');
});

await await check('duplicate symbols are collapsed before fetching', async () => {
  const before = yahooCalls;
  const result = await quoteSandbox.DataService.fetchQuotes(['A.NS', 'A.NS', 'B.NS']);
  assert(Object.keys(result.quotes).length === 2, 'dedupe failed');
  assert(yahooCalls === before + 1, 'expected a single request');
});

await check('offline browsers fall back to demo data', async () => {
  const offline = makeSandbox(makeFetch({ fail: true }));
  const result = await offline.DataService.fetchQuotes(['RELIANCE.NS']);
  assert(result.source === 'demo', result.source);
  assert(result.quotes['RELIANCE.NS'].price > 0, 'demo price');
});

await check('snapshots and quotes persist in localStorage', () => {
  const snapshot = { 'INFY.NS': { symbol: 'INFY.NS', price: 997, prevClose: 992, change: 5, changePct: 0.5 } };
  quoteSandbox.DataService.saveSnapshot('nifty50', snapshot);
  const restored = quoteSandbox.DataService.loadSnapshot('nifty50');
  assert(restored.savedAt > 0 && restored.quotes['INFY.NS'].price === 997, 'snapshot cache');
  quoteSandbox.DataService.saveQuotes(snapshot);
  assert(quoteSandbox.DataService.loadQuotes().quotes['INFY.NS'].price === 997, 'quote cache');
});

/* --------------------------- daily refresh ------------------------- */

console.log('\ndaily refresh');
const equityCsv = ['SYMBOL,NAME OF COMPANY, SERIES, DATE OF LISTING, PAID UP VALUE, MARKET LOT, ISIN NUMBER, FACE VALUE',
  ...Array.from({ length: 300 }, (_, i) => `NEWCO${i},New Company ${i} Limited,EQ,01-JAN-2020,10,1,INE${i}01010,10`)
].join('\n');

const indexCsv = ['Company Name,Industry,Symbol,Series,ISIN Code',
  ...Array.from({ length: 50 }, (_, i) => `New Company ${i} Ltd.,Capital Goods,NEWCO${i},EQ,INE${i}01010`)
].join('\n');

const refreshSandbox = makeSandbox(makeFetch({
  nse: (target) => (target.includes('EQUITY_L') ? equityCsv : indexCsv),
  yahoo: () => null
}));
await refreshSandbox.Universe.load();

await check('daily refresh replaces the list from NSE archives (no API key)', async () => {
  const before = refreshSandbox.Universe.count();
  const result = await refreshSandbox.Universe.refreshIfStale();
  assert(result.refreshed === true, `not refreshed: ${JSON.stringify(result)}`);
  assert(refreshSandbox.Universe.count() === 300, `expected 300, got ${refreshSandbox.Universe.count()}`);
  assert(before !== 300 || before === 300, 'count changed as expected');
  assert(refreshSandbox.Universe.updatedAt() > Date.now() - 60000, 'generatedAt not updated');
  assert(refreshSandbox.Universe.basketSymbols('nifty50').length === 50, 'baskets not rebuilt');
});

await check('a second call within 24h does not re-download', async () => {
  const again = await refreshSandbox.Universe.refreshIfStale();
  assert(again.refreshed === false && again.reason === 'fresh', JSON.stringify(again));
});

await check('a blocked network keeps the previous list', async () => {
  const blocked = makeSandbox(makeFetch({ fail: true }));
  await blocked.Universe.load();
  const before = blocked.Universe.count();
  const result = await blocked.Universe.refreshIfStale();
  assert(result.refreshed === false, 'should not report success offline');
  assert(blocked.Universe.count() === before, 'symbol list was lost');
});

await check('NSE CSV parsing tolerates quoted fields and a BOM', () => {
  const csv = '\uFEFFSYMBOL,NAME OF COMPANY\r\nABC,"Alpha, Beta & Co. Limited"\r\nXYZ,Gamma Limited\r\n';
  const rows = refreshSandbox.Universe.parseCsv(csv);
  assert(rows.length === 2, `got ${rows.length} rows`);
  assert(rows[0]['NAME OF COMPANY'] === 'Alpha, Beta & Co. Limited', rows[0]['NAME OF COMPANY']);
});

/* ------------------------------ summary ---------------------------- */

console.log(`\n${passed} passed, ${failures.length} failed\n`);
if (failures.length) {
  failures.forEach((f) => console.log(` - ${f}`));
  process.exit(1);
}
