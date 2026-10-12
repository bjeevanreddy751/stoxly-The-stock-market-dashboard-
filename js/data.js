/* ------------------------------------------------------------------
 * data.js — market data access.
 *
 * Providers, in order of preference:
 *   1. Yahoo Finance (query1.finance.yahoo.com) — batched "spark"
 *      endpoint for quotes, "chart" endpoint for series. Called through
 *      a CORS proxy because Yahoo does not send CORS headers.
 *   2. localStorage cache — shown instantly (and offline) when the
 *      network call fails.
 *   3. Deterministic demo series — keeps the dashboard usable when the
 *      browser is offline or every proxy is blocked.
 * ------------------------------------------------------------------ */

const DataService = (() => {
  const TIMEOUT_MS = 9000;
  const PROXY_PREF_KEY = 'smd.proxyPreference';

  /* ----------------------------- utilities ------------------------- */

  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

  /** 32-bit string hash -> deterministic seed. */
  function hash(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i += 1) {
      h = Math.imul(h ^ str.charCodeAt(i), 16777619);
    }
    return h >>> 0;
  }

  /** Seeded pseudo random generator (mulberry32). */
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function dayKey(date = new Date()) {
    return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
  }

  function readJSON(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (err) {
      return fallback;
    }
  }

  function writeJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (err) {
      return false; // quota exceeded / private mode — not fatal
    }
  }

  function getProxyPreference() {
    try { return Number(sessionStorage.getItem(PROXY_PREF_KEY)); } catch (err) { return NaN; }
  }

  function setProxyPreference(index) {
    try { sessionStorage.setItem(PROXY_PREF_KEY, String(index)); } catch (err) { /* ignore */ }
  }

  async function fetchWithTimeout(url, ms = TIMEOUT_MS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    try {
      const response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Fetch a Yahoo Finance URL. Tries a direct request first (works if the
   * page is served with a CORS proxy in front), then each configured
   * proxy, remembering the last one that worked.
   */
  async function getJSON(yahooUrl) {
    const errors = [];
    const attempts = [];

    attempts.push({ label: 'direct', url: yahooUrl });
    CONFIG.proxies.forEach((build, index) => {
      attempts.push({ label: `proxy${index}`, url: build(yahooUrl), proxyIndex: index });
    });

    // Favour the proxy that worked the last time.
    const preferred = getProxyPreference();
    if (Number.isInteger(preferred) && attempts[preferred + 1]) {
      const [hit] = attempts.splice(preferred + 1, 1);
      attempts.splice(1, 0, hit);
    }

    for (const attempt of attempts) {
      try {
        const json = await fetchWithTimeout(attempt.url);
        if (attempt.proxyIndex !== undefined) setProxyPreference(attempt.proxyIndex);
        return json;
      } catch (err) {
        errors.push(`${attempt.label}: ${err.message}`);
      }
    }
    throw new Error(`All data providers failed (${errors.join('; ')})`);
  }

  /** Fetch a text/HTML resource through the proxies (the origin has no CORS). */
  async function getText(target) {
    const attempts = [];
    CONFIG.proxies.forEach((build, index) => attempts.push({ url: build(target), proxyIndex: index }));

    const preferred = getProxyPreference();
    if (Number.isInteger(preferred) && attempts[preferred]) {
      attempts.unshift(attempts.splice(preferred, 1)[0]);
    }

    let lastError;
    for (const attempt of attempts) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        const response = await fetch(attempt.url, { signal: controller.signal, cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const text = await response.text();
        setProxyPreference(attempt.proxyIndex);
        return text;
      } catch (err) {
        lastError = err;
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastError || new Error('no provider reachable');
  }

  /* -------------------------- Google Finance ----------------------- */

  /** Index tickers Google names differently from Yahoo. */
  const GOOGLE_INDEX = {
    '^NSEI': 'NIFTY_50:INDEXNSE',
    '^BSESN': 'SENSEX:INDEXBOM',
    '^NSEBANK': 'BANKNIFTY:INDEXNSE'
  };

  /**
   * Google Finance path for a Yahoo ticker, or null when Google has no page
   * we can use. Google writes it `SYMBOL:EXCHANGE`, and only its NSE and
   * index pages expose a price in the markup we can parse.
   */
  function googleQuotePath(symbol) {
    const value = String(symbol || '');
    if (GOOGLE_INDEX[value]) return GOOGLE_INDEX[value];
    const match = /^([A-Za-z0-9&._-]+)\.NS$/.exec(value);
    return match ? `${match[1]}:NSE` : null;
  }

  /**
   * Pull the last price out of a Google Finance quote page. The markup is
   * obfuscated, so try the price block first and fall back to the first
   * rupee amount on the page.
   */
  function parseGooglePrice(html) {
    const source = String(html || '');
    const block = /class="N6SYTe"[\s\S]*?<span[^>]*>\s*<span>([^<]+)<\/span>/.exec(source);
    const raw = block ? block[1] : (/(?:₹|\u20b9)\s?([0-9][0-9,]*(?:\.[0-9]+)?)/.exec(source) || [])[1];
    if (!raw) return null;
    const value = Number(String(raw).replace(/[^0-9.]/g, ''));
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  /**
   * A fresher, single-symbol quote from Google Finance — free and with no
   * API key. Google sends no CORS headers, so this goes through the proxy;
   * any failure just leaves the Yahoo quote on screen.
   */
  async function fetchGoogleQuote(symbol) {
    const path = googleQuotePath(symbol);
    if (!path) return null;
    const target = `https://www.google.com/finance/quote/${path.split(':').map(encodeURIComponent).join(':')}`;
    try {
      const price = parseGooglePrice(await getText(target));
      return price === null ? null : { symbol, price, currency: 'INR', source: 'google', ts: Date.now() };
    } catch (err) {
      return null;
    }
  }

  /** Run an async mapper over items with limited concurrency. */
  async function mapLimit(items, limit, mapper) {
    const results = new Array(items.length);
    let cursor = 0;
    const workers = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
      while (cursor < items.length) {
        const index = cursor;
        cursor += 1;
        results[index] = await mapper(items[index], index);
      }
    });
    await Promise.all(workers);
    return results;
  }

  /* --------------------------- normalisation ----------------------- */

  /**
   * Reconcile price / previousClose / change on a quote, in place.
   *
   * Yahoo ships two figures for the day's move: an explicit change
   * (`fulldayChange` on spark, `regularMarketChange` on chart) and a
   * `previousClose` you are expected to subtract from. For indices the two
   * disagree — Nifty's `previousClose` can sit *above* the day's high while
   * `fulldayChange` says the index gained — so the reported change is the
   * authority and the previous close is derived from it. When only a
   * percentage is reported, `price / (1 + pct)` recovers the base.
   */
  function reconcileChange(quote, reported) {
    const source = reported || {};
    const pct = num(source.changePct) ?? num(source.fulldayChangePercent)
      ?? num(source.regularMarketChangePercent);
    let change = num(source.change) ?? num(source.fulldayChange) ?? num(source.regularMarketChange);

    if (change === null && pct !== null && num(quote.price) !== null && pct > -100) {
      const derivedPrev = quote.price / (1 + pct / 100);
      change = quote.price - derivedPrev;
    }

    if (change !== null) {
      quote.change = change;
      quote.prevClose = quote.price - change;
      quote.changePct = pct !== null ? pct : (quote.prevClose ? (change / quote.prevClose) * 100 : null);
    } else if (num(quote.price) !== null && num(quote.prevClose)) {
      quote.change = quote.price - quote.prevClose;
      quote.changePct = (quote.change / quote.prevClose) * 100;
    }
    return quote;
  }

  /** Build a uniform quote object from Yahoo metadata + an intraday series. */
  function buildQuote(symbol, meta, closes, volumes) {
    const clean = (closes || []).filter((v) => typeof v === 'number' && Number.isFinite(v));
    const price = num(meta.regularMarketPrice) ?? (clean.length ? clean[clean.length - 1] : null);
    if (price === null) return null;

    const rawPrevClose = num(meta.chartPreviousClose) ?? num(meta.previousClose)
      ?? (clean.length ? clean[0] : null);
    const volumeTotal = (volumes || []).reduce((sum, v) => sum + (typeof v === 'number' ? v : 0), 0);

    const quote = {
      symbol,
      price,
      prevClose: rawPrevClose,
      change: rawPrevClose === null ? null : price - rawPrevClose,
      changePct: rawPrevClose ? ((price - rawPrevClose) / rawPrevClose) * 100 : null,
      open: num(meta.regularMarketOpen) ?? (clean.length ? clean[0] : null),
      dayHigh: num(meta.regularMarketDayHigh) ?? (clean.length ? Math.max(...clean) : null),
      dayLow: num(meta.regularMarketDayLow) ?? (clean.length ? Math.min(...clean) : null),
      week52High: num(meta.fiftyTwoWeekHigh),
      week52Low: num(meta.fiftyTwoWeekLow),
      volume: num(meta.regularMarketVolume) ?? (volumeTotal > 0 ? volumeTotal : null),
      currency: meta.currency || 'INR',
      exchange: meta.fullExchangeName || meta.exchangeName || '',
      marketState: meta.marketState || inferMarketState(),
      offset: num(meta.gmtoffset) ?? 19800,
      ts: Date.now(),
      source: 'live'
    };

    reconcileChange(quote, meta);
    if (num(quote.prevClose) === null || quote.prevClose === 0) return null;
    return quote;
  }

  /** Currency / exchange implied by a Yahoo symbol. */
  function inferMarket(symbol) {
    if (/\.NS$/i.test(symbol) || /^\^NSE/i.test(symbol)) return { currency: 'INR', exchange: 'NSE', exchangeName: 'NSE' };
    if (/\.BO$/i.test(symbol) || /^\^BSE/i.test(symbol)) return { currency: 'INR', exchange: 'BSE', exchangeName: 'BSE' };
    return { currency: 'USD', exchange: '', exchangeName: 'US' };
  }

  /**
   * Indian cash-market session, in exchange time (IST, UTC+5:30).
   * Used when a provider does not report marketState (the batched
   * spark endpoint does not).
   */
  function inferMarketState(now = new Date()) {
    const ist = new Date(now.getTime() + 5.5 * 3600 * 1000); // shift to IST
    const day = ist.getUTCDay();
    if (day === 0 || day === 6) return 'CLOSED';
    const minutes = ist.getUTCHours() * 60 + ist.getUTCMinutes();
    if (minutes >= 9 * 60 + 15 && minutes <= 15 * 60 + 30) return 'REGULAR';
    if (minutes >= 9 * 60 && minutes < 9 * 60 + 15) return 'PRE';
    if (minutes > 15 * 60 + 30 && minutes <= 16 * 60) return 'POST';
    return 'CLOSED';
  }

  /**
   * Convert one entry of the batched spark response into a quote.
   * The endpoint returns { "SYM": { close, previousClose, ... } };
   * older/legacy responses nest the same block under `response[0]`.
   */
  function sparkQuote(symbol, block) {
    if (!symbol || !block || typeof block !== 'object') return null;
    const quoteBlock = (block.indicators && block.indicators.quote && block.indicators.quote[0]) || {};
    const closes = block.close || quoteBlock.close || [];
    const volumes = Array.isArray(block.volume) ? block.volume : quoteBlock.volume;
    const meta = block.meta || {};
    const market = inferMarket(symbol);

    return buildQuote(symbol, {
      symbol,
      currency: meta.currency || market.currency,
      exchangeName: meta.exchangeName || market.exchange,
      fullExchangeName: meta.fullExchangeName || market.exchange,
      marketState: meta.marketState,
      gmtoffset: num(meta.gmtoffset) ?? 19800,
      regularMarketPrice: num(block.fulldayPrice) ?? num(meta.regularMarketPrice),
      previousClose: num(block.previousClose) ?? num(meta.previousClose),
      chartPreviousClose: num(block.chartPreviousClose) ?? num(meta.chartPreviousClose),
      fulldayChange: num(block.fulldayChange),
      fulldayChangePercent: num(block.fulldayChangePercent),
      regularMarketChange: num(meta.regularMarketChange),
      regularMarketChangePercent: num(meta.regularMarketChangePercent),
      regularMarketVolume: num(meta.regularMarketVolume),
      regularMarketOpen: num(meta.regularMarketOpen),
      regularMarketDayHigh: num(meta.regularMarketDayHigh),
      regularMarketDayLow: num(meta.regularMarketDayLow),
      fiftyTwoWeekHigh: num(meta.fiftyTwoWeekHigh),
      fiftyTwoWeekLow: num(meta.fiftyTwoWeekLow)
    }, closes, volumes);
  }

  /** Normalise either spark response shape into { symbol: quote }. */
  function parseSparkPayload(json) {
    const quotes = {};

    // Current shape: a plain object keyed by symbol.
    if (json && typeof json === 'object' && !json.spark) {
      Object.keys(json).forEach((symbol) => {
        const quote = sparkQuote(symbol, json[symbol]);
        if (quote) quotes[symbol] = quote;
      });
      if (Object.keys(quotes).length) return quotes;
    }

    // Legacy shape: { spark: { result: [{ symbol, response: [{ meta, ... }] }] } }
    const rows = (json && json.spark && json.spark.result) || [];
    rows.forEach((row) => {
      const response = (row.response && row.response[0]) || {};
      const symbol = row.symbol || response.symbol || (response.meta && response.meta.symbol);
      const quote = sparkQuote(symbol, response);
      if (quote) quotes[symbol] = quote;
    });
    return quotes;
  }

  /** Merge fresh fields into an existing quote, ignoring nulls. */
  function mergeQuote(base, extra) {
    const out = { ...base };
    Object.keys(extra || {}).forEach((key) => {
      if (extra[key] !== null && extra[key] !== undefined) out[key] = extra[key];
    });
    if (out.prevClose) {
      out.change = out.price - out.prevClose;
      out.changePct = (out.change / out.prevClose) * 100;
    }
    return out;
  }

  /* ------------------------------ quotes --------------------------- */

  /**
   * Quote fetch for any number of symbols. Baskets bigger than
   * `snapshotChunkSize` are split into several batched requests so a
   * Nifty 500 snapshot never becomes one enormous URL.
   */
  async function fetchQuotes(symbols) {
    const unique = Array.from(new Set(symbols.filter(Boolean)));
    if (!unique.length) return { source: 'live', quotes: {} };
    if (unique.length <= CONFIG.snapshotChunkSize) return fetchQuoteChunk(unique);

    const chunks = [];
    for (let i = 0; i < unique.length; i += CONFIG.snapshotChunkSize) {
      chunks.push(unique.slice(i, i + CONFIG.snapshotChunkSize));
    }

    const results = await mapLimit(chunks, CONFIG.snapshotConcurrency, (chunk) => fetchQuoteChunk(chunk));
    const quotes = {};
    let live = 0;
    results.forEach((result) => {
      if (result.source === 'live') live += 1;
      Object.assign(quotes, result.quotes);
    });
    return { source: live ? 'live' : 'demo', quotes, chunks: results.length };
  }

  /** One batched request for up to `snapshotChunkSize` symbols. */
  async function fetchQuoteChunk(symbols) {
    if (!symbols.length) return { source: 'live', quotes: {} };

    const params = new URLSearchParams({
      symbols: symbols.join(','),
      range: '1d',
      interval: '5m',
      includePrePost: 'false'
    });
    const url = `https://query1.finance.yahoo.com/v8/finance/spark?${params.toString()}`;

    let sparkQuotes = {};
    try {
      const json = await getJSON(url);
      const rows = (json && json.spark && json.spark.result) || [];
      rows.forEach((row) => {
        const response = row.response && row.response[0];
        if (!response) return;
        const quoteBlock = (response.indicators && response.indicators.quote && response.indicators.quote[0]) || {};
        const quote = buildQuote(row.symbol || response.meta.symbol, response.meta || {}, quoteBlock.close, quoteBlock.volume);
        if (quote) sparkQuotes[quote.symbol] = quote;
      });
      if (!Object.keys(sparkQuotes).length) sparkQuotes = parseSparkPayload(json);
    } catch (err) {
      sparkQuotes = {};
    }

    const missing = symbols.filter((symbol) => !sparkQuotes[symbol]);
    if (missing.length) {
      const fallbacks = await mapLimit(missing, 4, async (symbol) => {
        try {
          const series = await fetchSeries(symbol, '1d');
          if (!series.ok) return null;
          const clean = series.points.map((p) => p.c);
          return buildQuote(symbol, series.meta, clean, series.points.map((p) => p.v));
        } catch (err) {
          return null;
        }
      });
      fallbacks.filter(Boolean).forEach((quote) => { sparkQuotes[quote.symbol] = quote; });
    }

    if (Object.keys(sparkQuotes).length) {
      return { source: 'live', quotes: sparkQuotes };
    }
    return { source: 'demo', quotes: demoQuotes(symbols) };
  }

  /* ------------------------------ series --------------------------- */

  /** Price history for one instrument and one range. */
  async function fetchSeries(symbol, rangeKey) {
    const conf = RANGES.find((r) => r.key === rangeKey) || RANGES[0];
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`
      + `?range=${conf.range}&interval=${conf.interval}&includePrePost=false`;

    let json;
    try {
      json = await getJSON(url);
    } catch (err) {
      return { ok: false, error: err.message };
    }

    const result = json && json.chart && json.chart.result && json.chart.result[0];
    if (!result) {
      const message = (json && json.chart && json.chart.error && json.chart.error.description) || 'Empty response';
      return { ok: false, error: message };
    }

    const quoteBlock = (result.indicators && result.indicators.quote && result.indicators.quote[0]) || {};
    const timestamps = result.timestamp || [];
    const closes = quoteBlock.close || [];
    const volumes = quoteBlock.volume || [];

    const points = timestamps
      .map((t, i) => ({ t, c: closes[i], v: volumes[i] }))
      .filter((p) => typeof p.c === 'number' && Number.isFinite(p.c));

    if (!points.length) return { ok: false, error: 'No data points' };

    return {
      ok: true,
      symbol,
      rangeKey: conf.key,
      intraday: conf.interval.includes('m'),
      points,
      meta: result.meta || {},
      offset: num(result.meta && result.meta.gmtoffset) ?? 19800
    };
  }

  /* ------------------------------- demo ---------------------------- */

  function basePrice(symbol) {
    const random = rng(hash(symbol));
    if (symbol.startsWith('^')) return 18000 + random() * 55000;
    return 180 + random() * 3600;
  }

  const STEP_MS = { '5m': 5 * 60000, '30m': 30 * 60000, '1d': 86400000, '1wk': 604800000 };

  function demoSeries(symbol, rangeKey) {
    const conf = RANGES.find((r) => r.key === rangeKey) || RANGES[0];
    const count = { '1d': 75, '5d': 66, '1mo': 22, '6mo': 130, '1y': 252, '5y': 261 }[conf.key] || 75;
    const step = STEP_MS[conf.interval] || 300000;
    const random = rng(hash(`${symbol}|${conf.key}|${dayKey()}`));

    let price = basePrice(symbol);
    const drift = (random() - 0.45) * 0.0025;
    const volatility = conf.interval === '1d' || conf.interval === '1wk' ? 0.011 : 0.0022;
    const now = Date.now();
    const points = [];

    for (let i = count - 1; i >= 0; i -= 1) {
      price = Math.max(1, price * (1 + drift + (random() - 0.5) * volatility * 2));
      points.push({ t: Math.round((now - i * step) / 1000), c: Number(price.toFixed(2)), v: Math.round(random() * 250000) });
    }

    return {
      ok: true,
      demo: true,
      symbol,
      rangeKey: conf.key,
      intraday: conf.interval.includes('m'),
      points,
      offset: 19800,
      meta: {
        symbol,
        currency: 'INR',
        exchangeName: 'NSE',
        fullExchangeName: 'NSE (demo)',
        marketState: 'CLOSED',
        gmtoffset: 19800,
        longName: Format.instrumentName(symbol, 'en')
      }
    };
  }

  function demoQuotes(symbols) {
    const quotes = {};
    symbols.forEach((symbol) => {
      const series = demoSeries(symbol, '1d');
      const closes = series.points.map((p) => p.c);
      const quote = buildQuote(symbol, series.meta, closes, series.points.map((p) => p.v));
      if (quote) quotes[symbol] = { ...quote, source: 'demo' };
    });
    return quotes;
  }

  /* ------------------------------ cache ---------------------------- */

  function saveQuotes(quotes) {
    const cached = readJSON(CONFIG.storage.quotes, { savedAt: 0, quotes: {} });
    const merged = { ...cached.quotes, ...quotes };
    writeJSON(CONFIG.storage.quotes, { savedAt: Date.now(), quotes: merged });
  }

  function loadQuotes() {
    const cached = readJSON(CONFIG.storage.quotes, null);
    if (!cached || !cached.quotes) return { savedAt: 0, quotes: {} };
    if (Date.now() - cached.savedAt > CONFIG.cacheMaxAgeMs) return { savedAt: 0, quotes: {} };
    return cached;
  }

  function saveSeries(series) {
    const all = readJSON(CONFIG.storage.series, {});
    all[`${series.symbol}|${series.rangeKey}`] = { ...series, savedAt: Date.now() };
    // keep the cache small so localStorage never fills up
    const keys = Object.keys(all);
    if (keys.length > 12) {
      keys
        .sort((a, b) => (all[a].savedAt || 0) - (all[b].savedAt || 0))
        .slice(0, keys.length - 12)
        .forEach((key) => delete all[key]);
    }
    writeJSON(CONFIG.storage.series, all);
  }

  /** Market snapshot cache (basket -> quotes), used for instant restarts. */
  function saveSnapshot(key, quotes) {
    writeJSON(`${CONFIG.storage.snapshot}.${key}`, { savedAt: Date.now(), quotes });
  }

  function loadSnapshot(key) {
    const cached = readJSON(`${CONFIG.storage.snapshot}.${key}`, null);
    if (!cached || !cached.quotes) return { savedAt: 0, quotes: {} };
    if (Date.now() - cached.savedAt > CONFIG.cacheMaxAgeMs) return { savedAt: 0, quotes: {} };
    return cached;
  }

  function loadSeries(symbol, rangeKey) {
    const all = readJSON(CONFIG.storage.series, {});
    const entry = all[`${symbol}|${rangeKey}`];
    if (!entry) return null;
    if (Date.now() - (entry.savedAt || 0) > CONFIG.cacheMaxAgeMs) return null;
    return entry;
  }

  return {
    fetchQuotes,
    fetchSeries,
    fetchGoogleQuote,
    googleQuotePath,
    parseGooglePrice,
    reconcileChange,
    demoQuotes,
    demoSeries,
    saveQuotes,
    loadQuotes,
    saveSeries,
    loadSeries,
    saveSnapshot,
    loadSnapshot,
    readJSON,
    writeJSON
  };
})();
