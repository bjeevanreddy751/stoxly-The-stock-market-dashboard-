/* ------------------------------------------------------------------
 * app.js — dashboard state, rendering, charting, snapshots and the
 * refresh loops. Company names are resolved through js/universe.js,
 * js/glossary.js and js/translit.js so every listing can be shown in
 * the selected language.
 * ------------------------------------------------------------------ */

(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);

  const state = {
    lang: 'en',
    theme: 'dark',
    watchlist: CONFIG.defaultWatchlist.slice(),
    selected: CONFIG.defaultWatchlist[0],
    range: CONFIG.defaultRange,
    basket: 'nifty50',
    exchange: 'all',
    quotes: {},
    snapshot: { key: null, quotes: {}, savedAt: 0, sort: 'change', sortDir: 'desc', visible: 0 },
    series: null,
    googleQuote: { symbol: null, price: null, at: 0 },
    quotesSource: 'live',
    lastUpdated: 0,
    universeReady: false,
    loadingQuotes: false,
    loadingSeries: false,
    loadingSnapshot: false,
    chart: null,
    chartShape: ''
  };

  const els = {};

  /* --------------------------- small helpers ----------------------- */

  const t = (key, vars) => Format.t(state.lang, key, vars);
  const isIndex = (symbol) => String(symbol).startsWith('^');

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[c]);
  }

  /** Tokens in an index label that are acronyms rather than words. */
  const INDEX_ACRONYMS = new Set(['IT', 'PSU', 'FMCG', 'PSE', 'VIX', 'BSE', 'NSE', 'ETF', 'SME', 'MNC']);

  /**
   * Localise an index label for a language with no curated glossary column:
   * translate the words we know, transliterate the rest, and leave only real
   * acronyms in Latin. "NIFTY 50" -> "निफ्टी 50" in Konkani, for instance.
   */
  function localiseIndexLabel(label, lang) {
    if (lang === 'en' || !Format.script(lang)) return label;
    return label.split(/(\s+)/).map((token) => {
      if (!/^[A-Za-z][A-Za-z'’.]*$/.test(token)) return token;
      const key = token.toLowerCase().replace(/[.']/g, '');
      const word = Glossary.word(key, lang);
      if (word) return word;
      if (INDEX_ACRONYMS.has(token.toUpperCase())) return Translit.acronym(token, lang) || token;
      return Translit.word(token, lang) || token;
    }).join('');
  }

  /** Localised display name for any ticker (universe, glossary or symbol). */
  function symbolName(symbol) {
    if (!symbol) return '';

    // Indices are not part of the NSE symbol list, so name them from
    // INDEX_NAMES and regionalise each label ("NIFTY 50" -> "निफ्टी 50").
    // The three headline indices still prefer their hand-curated spellings
    // from the glossary where one exists.
    if (isIndex(symbol)) {
      const ticker = String(symbol).toUpperCase();
      const curated = Glossary.name(ticker, state.lang);
      if (curated) return curated;
      const label = INDEX_NAMES[ticker];
      if (label) return localiseIndexLabel(label, state.lang);
    }

    if (state.universeReady) {
      const name = Universe.name(symbol, state.lang);
      if (name) return name;
    }
    const quote = state.quotes[symbol];
    if (quote && quote.longName) return quote.longName;
    return symbol;
  }

  /** Sector key for an instrument, from the NSE industry mapping. */
  function sectorKeyOf(symbol) {
    if (state.universeReady) return Universe.sectorKey(symbol);
    const pinned = INSTRUMENT_BY_SYMBOL[symbol];
    return pinned ? pinned.sector : 'other';
  }

  const quoteOf = (symbol) => state.quotes[symbol] || state.snapshot.quotes[symbol] || null;
  const changeClass = (value) => (value > 0 ? 'up' : value < 0 ? 'down' : 'flat');

  function changeText(quote, showAmount) {
    if (!quote) return '—';
    const amount = Format.signedPrice(quote.change, quote.currency, state.lang);
    const percent = Format.signedPercent(quote.changePct, state.lang);
    const arrow = quote.change > 0 ? '▲' : quote.change < 0 ? '▼' : '▪';
    return showAmount === false ? `${arrow} ${percent}` : `${arrow} ${amount} (${percent})`;
  }

  /* --------------------------- exchange ---------------------------- */

  /** NSE / BSE filter values. NSE and BSE stay Latin, as in the press. */
  const EXCHANGES = ['all', 'NSE', 'BSE'];

  /** Exchange implied by a Yahoo ticker ('' for indices and pasted symbols). */
  function exchangeOf(symbol) {
    const value = String(symbol || '');
    if (value.startsWith('^')) return '';
    if (/\.BO$/i.test(value)) return 'BSE';
    if (/\.NS$/i.test(value)) return 'NSE';
    return '';
  }

  /** Small “NSE” / “BSE” tag for a row, or nothing for indices. */
  function exchangeChip(symbol) {
    const exchange = exchangeOf(symbol);
    if (!exchange) return '';
    return ` <span class="ex-chip ex-${exchange.toLowerCase()}">${exchange}</span>`;
  }

  /** Does a symbol pass the current exchange filter? Indices always do. */
  function matchesExchange(symbol) {
    if (state.exchange === 'all') return true;
    const exchange = exchangeOf(symbol);
    return !exchange || exchange === state.exchange;
  }

  /* --------------------------- persistence ------------------------- */

  const store = {
    load() {
      const saved = DataService.readJSON(CONFIG.storage.lang, null);
      const browser = (navigator.language || 'en').slice(0, 2).toLowerCase();
      const linked = new URLSearchParams(location.search).get('lang');
      const valid = (code) => LANGUAGES.some((l) => l.code === code);
      state.lang = (valid(linked) && linked) || (valid(saved) && saved) || (valid(browser) ? browser : 'en');

      state.theme = DataService.readJSON(CONFIG.storage.theme, null)
        || (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');

      const watchlist = DataService.readJSON(CONFIG.storage.watchlist, null);
      state.watchlist = Array.isArray(watchlist) && watchlist.length ? watchlist : CONFIG.defaultWatchlist.slice();

      state.selected = DataService.readJSON(CONFIG.storage.selected, null) || state.watchlist[0];
      state.range = DataService.readJSON(CONFIG.storage.range, null) || CONFIG.defaultRange;
      state.basket = DataService.readJSON(CONFIG.storage.basket, null) || 'nifty50';
      state.exchange = DataService.readJSON(CONFIG.storage.exchange, null) || 'all';

      if (!RANGES.some((r) => r.key === state.range)) state.range = CONFIG.defaultRange;
      if (!BASKETS.some((b) => b.key === state.basket)) state.basket = 'nifty50';
      if (!EXCHANGES.includes(state.exchange)) state.exchange = 'all';
      if (!state.watchlist.includes(state.selected)) state.watchlist.unshift(state.selected);
    },
    lang() { DataService.writeJSON(CONFIG.storage.lang, state.lang); },
    theme() { DataService.writeJSON(CONFIG.storage.theme, state.theme); },
    basket() { DataService.writeJSON(CONFIG.storage.basket, state.basket); },
    exchange() { DataService.writeJSON(CONFIG.storage.exchange, state.exchange); },
    watchlist() {
      DataService.writeJSON(CONFIG.storage.watchlist, state.watchlist);
      DataService.writeJSON(CONFIG.storage.selected, state.selected);
    },
    range() { DataService.writeJSON(CONFIG.storage.range, state.range); }
  };

  /* --------------------------- static i18n ------------------------- */

  function applyStaticI18n() {
    const meta = LANGUAGES.find((l) => l.code === state.lang) || LANGUAGES[0];
    document.documentElement.lang = state.lang;
    document.documentElement.dir = meta.dir || 'ltr';
    // The brand is a proper noun: transliterate it into the language's own
    // script (स्टॉक्सली, ஸ்டாக்ஸ்லி …) rather than translating it.
    const brand = Translit.word('Stoxly', state.lang) || 'Stoxly';
    document.title = `${brand} · ${t('appSubtitle')}`;

    document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.getAttribute('data-i18n')); });
    const brandEl = document.querySelector('.brand-text strong');
    if (brandEl) brandEl.textContent = brand;
    document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      el.placeholder = t(el.getAttribute('data-i18n-placeholder'));
    });
    document.querySelectorAll('[data-i18n-title]').forEach((el) => {
      el.title = t(el.getAttribute('data-i18n-title'));
    });
  }

  function renderLanguageSelect() {
    els.langSelect.innerHTML = LANGUAGES
      .map((l) => `<option value="${l.code}"${l.code === state.lang ? ' selected' : ''}>${esc(l.native)} — ${esc(l.english)}</option>`)
      .join('');
  }

  /* ---------------------------- theming ---------------------------- */

  function applyTheme() {
    document.documentElement.setAttribute('data-theme', state.theme);
    els.themeIcon.textContent = state.theme === 'dark' ? '☾' : '☀';
    if (state.chart) renderChart();
  }

  const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  /** Turn a hex or rgb() colour into rgba() with the given alpha. */
  function withAlpha(color, alpha) {
    if (!color) return `rgba(120,120,120,${alpha})`;
    if (color.startsWith('#')) {
      let hex = color.slice(1);
      if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
      const value = parseInt(hex, 16);
      return `rgba(${(value >> 16) & 255},${(value >> 8) & 255},${value & 255},${alpha})`;
    }
    const match = color.match(/rgba?\(([^)]+)\)/);
    if (match) {
      const [r, g, b] = match[1].split(',').map((v) => parseFloat(v));
      return `rgba(${r},${g},${b},${alpha})`;
    }
    return color;
  }

  /* ---------------------------- rendering -------------------------- */

  function renderStrip() {
    els.indexStrip.innerHTML = CONFIG.indexSymbols.map((symbol) => {
      const quote = quoteOf(symbol);
      return `
        <button class="index-card ${symbol === state.selected ? 'is-active' : ''}" data-symbol="${esc(symbol)}">
          <span class="index-name">${esc(symbolName(symbol))}</span>
          <span class="index-price">${quote ? Format.price(quote.price, quote.currency, state.lang) : '—'}</span>
          <span class="change ${quote ? changeClass(quote.change) : 'flat'}">${changeText(quote, false)}</span>
        </button>`;
    }).join('');
  }

  function renderWatchlist() {
    els.watchCount.textContent = state.watchlist.length ? String(state.watchlist.length) : '';
    if (!state.watchlist.length) {
      els.watchList.innerHTML = `<li class="empty">${esc(t('noQuotes'))}</li>`;
      return;
    }

    els.watchList.innerHTML = state.watchlist.map((symbol) => {
      const quote = quoteOf(symbol);
      return `
        <li class="watch-row ${symbol === state.selected ? 'is-active' : ''}" data-symbol="${esc(symbol)}">
          <button class="watch-main" data-select="${esc(symbol)}">
            <span class="watch-name">${esc(symbolName(symbol))}</span>
            <span class="watch-meta">
              <span class="watch-symbol">${esc(symbol)}</span>
              ${quote && quote.exchange ? `<span class="watch-exchange">${esc(quote.exchange)}</span>` : ''}
            </span>
          </button>
          <span class="watch-figures">
            <span class="watch-price">${quote ? Format.price(quote.price, quote.currency, state.lang) : '—'}</span>
            <span class="change ${quote ? changeClass(quote.change) : 'flat'}">${changeText(quote, false)}</span>
          </span>
          <button class="icon-btn" data-remove="${esc(symbol)}" title="${esc(t('remove'))}" aria-label="${esc(t('remove'))}">×</button>
        </li>`;
    }).join('');
  }

  function renderRangeTabs() {
    els.rangeTabs.innerHTML = RANGES.map((range) => `
      <button role="tab" class="range-tab ${range.key === state.range ? 'is-active' : ''}"
        data-range="${range.key}" aria-selected="${range.key === state.range}">${esc(t(range.labelKey))}</button>`).join('');
  }

  function renderDetail() {
    const symbol = state.selected;
    const quote = quoteOf(symbol);

    els.stockName.textContent = symbolName(symbol);
    els.stockSymbol.textContent = symbol;
    els.stockSector.textContent = Format.sectorName(sectorKeyOf(symbol), state.lang);

    const official = state.universeReady ? Universe.officialName(symbol) : '';
    els.stockOfficial.textContent = official && official !== els.stockName.textContent ? official : '';

    els.stockPrice.textContent = quote ? Format.price(quote.price, quote.currency, state.lang) : '—';
    els.stockChange.className = `change ${quote ? changeClass(quote.change) : 'flat'}`;
    els.stockChange.textContent = quote ? changeText(quote, true) : t('loading');
    renderGoogleQuote();
  }

  /*
   * Yahoo's quote feed is delayed, so for the stock being viewed we also fetch
   * a fresher price from Google Finance (no API key). It is shown as a
   * separate, clearly attributed line and silently disappears when Google
   * cannot be reached — the Yahoo price above always stays put.
   */

  function renderGoogleQuote() {
    const el = els.stockLive;
    if (!el) return;
    const entry = state.googleQuote;
    if (!entry || entry.symbol !== state.selected || !entry.price) {
      el.hidden = true;
      el.textContent = '';
      return;
    }
    el.hidden = false;
    el.textContent = `${t('live')} · Google Finance: ${Format.price(entry.price, 'INR', state.lang)}`;
  }

  async function refreshGoogleQuote() {
    const symbol = state.selected;
    const entry = await DataService.fetchGoogleQuote(symbol);
    if (symbol !== state.selected) return; // the selection changed while we were fetching
    state.googleQuote = entry
      ? { symbol, price: entry.price, at: Date.now() }
      : { symbol, price: null, at: 0 };
    renderGoogleQuote();
  }

  function renderStats() {
    const quote = quoteOf(state.selected);
    const currency = quote ? quote.currency : 'INR';
    const rows = [
      ['open', quote ? Format.price(quote.open, currency, state.lang) : '—'],
      ['prevClose', quote ? Format.price(quote.prevClose, currency, state.lang) : '—'],
      ['dayHigh', quote ? Format.price(quote.dayHigh, currency, state.lang) : '—'],
      ['dayLow', quote ? Format.price(quote.dayLow, currency, state.lang) : '—'],
      ['week52High', quote ? Format.price(quote.week52High, currency, state.lang) : '—'],
      ['week52Low', quote ? Format.price(quote.week52Low, currency, state.lang) : '—'],
      ['volume', quote ? Format.volume(quote.volume, state.lang, currency) : '—'],
      ['sector', Format.sectorName(sectorKeyOf(state.selected), state.lang)]
    ];

    els.statsGrid.innerHTML = rows.map(([key, value]) => `
      <div class="stat">
        <dt>${esc(t(key))}</dt>
        <dd>${esc(value)}</dd>
      </div>`).join('');
  }

  /* ------------------------- market snapshot ----------------------- */

  function snapshotSymbols() {
    if (state.basket === 'watchlist') return state.watchlist.slice();
    return Universe.basketSymbols(state.basket);
  }

  function marketQuotes() {
    const snapshot = Object.values(state.snapshot.quotes);
    const list = snapshot.length ? snapshot : Object.values(state.quotes);
    return list.filter((quote) => matchesExchange(quote.symbol));
  }

  /** Market-table sort keys, each one's default direction, and where to find it. */
  const SORT_KEYS = ['name', 'price', 'change', 'sector'];
  const SORT_DIRECTION = { name: 'asc', sector: 'asc', price: 'desc', change: 'desc' };

  function sortedMarketQuotes() {
    const list = marketQuotes().filter((quote) => typeof quote.changePct === 'number');
    const key = SORT_KEYS.includes(state.snapshot.sort) ? state.snapshot.sort : 'change';
    const dir = state.snapshot.sortDir === 'asc' ? 1 : -1;
    const byText = (a, b) => String(a).localeCompare(String(b), undefined, { sensitivity: 'base' });
    const compare = {
      name: (a, b) => byText(symbolName(a.symbol), symbolName(b.symbol)),
      price: (a, b) => (a.price || 0) - (b.price || 0),
      change: (a, b) => a.changePct - b.changePct,
      sector: (a, b) => byText(
        Format.sectorName(sectorKeyOf(a.symbol), state.lang),
        Format.sectorName(sectorKeyOf(b.symbol), state.lang)
      )
    };
    return list.slice().sort((a, b) => compare[key](a, b) * dir);
  }

  /** Show the active sort on the table headers (arrow + aria-sort). */
  function applySortIndicators() {
    const key = SORT_KEYS.includes(state.snapshot.sort) ? state.snapshot.sort : 'change';
    const ascending = state.snapshot.sortDir === 'asc';
    (els.sortHeaders || []).forEach((th) => {
      const active = th.getAttribute('data-sort') === key;
      th.classList.toggle('is-sorted', active);
      th.setAttribute('aria-sort', active ? (ascending ? 'ascending' : 'descending') : 'none');
      const arrow = th.querySelector('.sort-arrow');
      if (arrow) arrow.textContent = active ? (ascending ? '▲' : '▼') : '▲';
    });
  }

  function renderMarketTable() {
    applySortIndicators();
    const rows = sortedMarketQuotes();
    const total = rows.length;
    const visible = state.snapshot.visible || Math.min(CONFIG.tablePageSize, total);

    if (!total) {
      // Distinguish "no snapshot loaded" from "the exchange filter hides it all".
      const filteredOut = state.exchange !== 'all'
        && (Object.keys(state.snapshot.quotes).length || Object.keys(state.quotes).length);
      els.marketTable.innerHTML = `<tr><td colspan="4" class="empty">${esc(t(filteredOut ? 'noResults' : 'noSnapshot'))}</td></tr>`;
      els.showMoreBtn.hidden = true;
      els.snapshotStatus.textContent = '';
      return;
    }

    els.marketTable.innerHTML = rows.slice(0, visible).map((quote) => `
      <tr data-symbol="${esc(quote.symbol)}" class="${quote.symbol === state.selected ? 'is-active' : ''}">
        <td class="col-name">
          <span class="row-name">${esc(symbolName(quote.symbol))}</span>
          <span class="row-symbol">${esc(quote.symbol)}${exchangeChip(quote.symbol)}</span>
        </td>
        <td class="col-num">${esc(Format.price(quote.price, quote.currency, state.lang))}</td>
        <td class="col-num change ${changeClass(quote.change)}">${esc(Format.signedPercent(quote.changePct, state.lang))}</td>
        <td class="col-sector muted">${esc(Format.sectorName(sectorKeyOf(quote.symbol), state.lang))}</td>
      </tr>`).join('');

    els.showMoreBtn.hidden = visible >= total;
    els.snapshotStatus.textContent = t('showingCount', { shown: Math.min(visible, total), total });
  }

  function renderMovers() {
    const list = marketQuotes().filter((quote) => typeof quote.changePct === 'number');
    const gainers = list.filter((q) => q.changePct > 0).sort((a, b) => b.changePct - a.changePct).slice(0, 5);
    const losers = list.filter((q) => q.changePct < 0).sort((a, b) => a.changePct - b.changePct).slice(0, 5);

    const render = (items) => (items.length
      ? items.map((quote) => `
        <li class="mover" data-symbol="${esc(quote.symbol)}">
          <span class="mover-name">${esc(symbolName(quote.symbol))}</span>
          <span class="mover-figures">
            <span class="mover-price">${esc(Format.price(quote.price, quote.currency, state.lang))}</span>
            <span class="change ${changeClass(quote.change)}">${esc(Format.signedPercent(quote.changePct, state.lang))}</span>
          </span>
        </li>`).join('')
      : `<li class="empty">${esc(t('noQuotes'))}</li>`);

    els.gainersList.innerHTML = render(gainers);
    els.losersList.innerHTML = render(losers);
  }

  function renderBasketSelect() {
    els.basketSelect.innerHTML = BASKETS
      .map((b) => `<option value="${b.key}"${b.key === state.basket ? ' selected' : ''}>${esc(t(b.labelKey))}</option>`)
      .join('');
  }

  function renderUniverseInfo() {
    const parts = [];
    if (state.universeReady) {
      const updated = Universe.updatedAt() || Universe.refreshedAt();
      parts.push(`${Format.int(Universe.count(), state.lang)} NSE`);
      if (Universe.bseCount()) parts.push(`${Format.int(Universe.bseCount(), state.lang)} BSE`);
      parts.push(updated ? Format.dateTime(updated, state.lang, 0) : '—');
    }
    els.universeInfo.textContent = parts.join(' · ');
  }

  function renderStatus() {
    const primary = quoteOf(CONFIG.indexSymbols[0]) || quoteOf(state.selected);
    els.marketBadge.textContent = primary ? Format.marketState(primary.marketState, state.lang) : t('marketClosed');
    els.marketBadge.className = `badge ${primary && primary.marketState === 'REGULAR' ? 'badge-live' : 'badge-muted'}`;

    const source = state.quotesSource === 'demo' ? t('demo')
      : state.quotesSource === 'cache' ? t('offlineCache') : t('live');
    els.sourceName.textContent = `Yahoo Finance · ${source}`;
    els.stripSource.textContent = source;

    const offset = (primary && primary.offset) || 19800;
    els.lastUpdated.textContent = state.lastUpdated ? Format.dateTime(state.lastUpdated, state.lang, offset) : '—';
  }

  /* ------------------------------ chart ---------------------------- */

  function renderChart() {
    const canvas = $('priceChart');
    const message = $('chartMessage');

    if (typeof Chart === 'undefined') {
      message.hidden = false;
      message.textContent = t('error');
      window.addEventListener('load', () => renderChart(), { once: true });
      return;
    }

    const series = state.series;
    if (!series || !series.points || series.points.length < 2) {
      message.hidden = false;
      message.textContent = state.loadingSeries ? t('loading') : t('noQuotes');
      if (state.chart) { state.chart.destroy(); state.chart = null; state.chartShape = ''; }
      return;
    }
    message.hidden = true;

    const points = series.points;
    // A 5-day intraday series spans several sessions, so label those points
    // with the date too — otherwise every day reads "09:15" and looks broken.
    const showDate = Boolean(series.intraday && series.rangeKey === '5d');
    const labels = points.map((p) => Format.axisLabel(p.t, state.lang, series.offset || 0, series.intraday, showDate));
    const values = points.map((p) => p.c);

    // Colour the line by how the instrument actually moved today — the same
    // figure shown beside the price — rather than by first-vs-last point
    // inside the window, which could paint a green line while the header
    // said the stock was down (and vice versa).
    const quote = quoteOf(state.selected) || {};
    const movedUp = typeof quote.change === 'number'
      ? quote.change >= 0
      : values[values.length - 1] >= values[0];
    const lineColor = cssVar(movedUp ? '--up' : '--down') || (movedUp ? '#22c55e' : '#ef4444');

    // Animate only when the series' shape changes (first paint, a new range or
    // a new instrument). A periodic re-quote then slides in without the whole
    // line redrawing and re-animating every 60 s.
    const shape = `${series.symbol}|${series.rangeKey}|${points.length}`;
    const animate = shape !== state.chartShape;
    state.chartShape = shape;
    const mutedColor = cssVar('--muted') || '#8b949e';
    const gridColor = withAlpha(cssVar('--border') || '#30363d', 0.6);
    const currency = (quoteOf(state.selected) || {}).currency || 'INR';

    // Volume bars sit behind the price line — the familiar stock-chart "bar"
    // strip. They share the dated x-axis with the line, so every date on the
    // chart carries a bar as well as a point.
    const volumes = points.map((p) => (typeof p.v === 'number' && Number.isFinite(p.v) ? p.v : 0));
    const maxVolume = Math.max(1, ...volumes);

    const priceDataset = {
      label: symbolName(state.selected),
      data: values,
      yAxisID: 'y',
      order: 1,
      borderColor: lineColor,
      borderWidth: 2,
      tension: 0.25,
      pointRadius: 0,
      pointHoverRadius: 4,
      pointHoverBackgroundColor: lineColor,
      pointHoverBorderWidth: 0,
      spanGaps: true,
      fill: true,
      backgroundColor: (context) => {
        const { ctx, chartArea } = context.chart;
        if (!chartArea) return withAlpha(lineColor, 0.15);
        const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
        gradient.addColorStop(0, withAlpha(lineColor, 0.32));
        gradient.addColorStop(1, withAlpha(lineColor, 0));
        return gradient;
      }
    };

    const volumeDataset = {
      type: 'bar',
      label: '',
      data: volumes,
      yAxisID: 'vol',
      order: 2,
      backgroundColor: withAlpha(lineColor, 0.22),
      hoverBackgroundColor: withAlpha(lineColor, 0.4),
      borderWidth: 0,
      barPercentage: 0.9,
      categoryPercentage: 0.95
    };

    const options = {
      responsive: true,
      maintainAspectRatio: false,
      animation: animate ? { duration: 350 } : false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          displayColors: false,
          // The volume bars are decoration — keep the tooltip on the price line.
          filter: (item) => item.datasetIndex === 0,
          callbacks: {
            title: (items) => {
              const point = points[items[0].dataIndex];
              if (!point) return '';
              // Intraday points carry a clock time; daily points just a date.
              return series.intraday
                ? Format.dateTime(point.t * 1000, state.lang, series.offset || 0)
                : Format.axisLabel(point.t, state.lang, series.offset || 0, false);
            },
            label: (item) => `${t('price')}: ${Format.price(item.parsed.y, currency, state.lang)}`
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          border: { display: false },
          ticks: { color: mutedColor, maxTicksLimit: 7, autoSkip: true, maxRotation: 0 }
        },
        y: {
          position: 'right',
          // Leave a little headroom so the line is never clipped at the top
          // or bottom of the plot area.
          grace: '8%',
          grid: { color: gridColor, drawTicks: false },
          border: { display: false },
          ticks: { color: mutedColor, callback: (value) => Format.number(value, state.lang, Math.abs(value) >= 1000 ? 0 : 2) }
        },
        // Invisible bottom axis that confines the volume bars to the lower
        // quarter of the plot so they never swamp the price line.
        vol: {
          position: 'right',
          display: false,
          beginAtZero: true,
          max: maxVolume * 4
        }
      }
    };

    if (state.chart) {
      state.chart.data.labels = labels;
      state.chart.data.datasets[0] = priceDataset;
      state.chart.data.datasets[1] = volumeDataset;
      state.chart.options = options;
      state.chart.update();
    } else {
      state.chart = new Chart(canvas, {
        type: 'line',
        data: { labels, datasets: [priceDataset, volumeDataset] },
        options
      });
    }
  }

  /* ------------------------------ search --------------------------- */

  function renderSearch(rawQuery) {
    const query = (rawQuery || '').trim();
    const box = els.searchResults;

    if (query.length < 2) {
      box.hidden = true;
      box.innerHTML = '';
      return;
    }

    // Over-fetch so the exchange filter still fills a full page of results.
    const results = (state.universeReady ? Universe.search(query, state.lang, CONFIG.searchLimit * 3) : [])
      .filter((result) => matchesExchange(result.symbol))
      .slice(0, CONFIG.searchLimit);

    // A pasted Yahoo ticker that is not part of the NSE list.
    const looksLikeSymbol = /^[\^=]?[A-Za-z0-9&.\-]{1,16}$/.test(query);
    const custom = looksLikeSymbol ? Universe.toYahoo(query.toUpperCase()) : '';
    const customMissing = custom && matchesExchange(custom) && !results.some((r) => r.symbol === custom);

    const rows = results.map((result) => {
      const inList = state.watchlist.includes(result.symbol);
      return `
        <div class="search-item">
          <button class="search-main" data-select="${esc(result.symbol)}">
            <span class="row-name">${esc(result.name)}</span>
            <span class="row-symbol">${esc(result.official)} · ${esc(result.symbol)}${exchangeChip(result.symbol)}</span>
          </button>
          <button class="icon-btn" data-add="${esc(result.symbol)}" ${inList ? 'disabled' : ''}
            title="${esc(t('add'))}" aria-label="${esc(t('add'))}">＋</button>
        </div>`;
    }).join('');

    const customRow = customMissing ? `
      <div class="search-item">
        <button class="search-main" data-add="${esc(custom)}">
          <span class="row-name">${esc(t('customSymbol'))}</span>
          <span class="row-symbol">${esc(custom)}</span>
        </button>
        <button class="icon-btn" data-add="${esc(custom)}" title="${esc(t('add'))}">＋</button>
      </div>` : '';

    box.hidden = false;
    box.innerHTML = (rows + customRow) || `<div class="search-hint">${esc(t('noResults'))}</div>`;
  }

  /* ---------------------------- actions ---------------------------- */

  function toast(message) {
    els.toast.textContent = message;
    els.toast.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { els.toast.hidden = true; }, 2200);
  }

  function renderAll() {
    applyStaticI18n();
    renderBasketSelect();
    if (els.exchangeSelect) els.exchangeSelect.value = state.exchange;
    renderStrip();
    renderWatchlist();
    renderRangeTabs();
    renderDetail();
    renderStats();
    renderMarketTable();
    renderMovers();
    renderUniverseInfo();
    renderStatus();
    renderChart();
  }

  function setLanguage(code) {
    if (!LANGUAGES.some((l) => l.code === code)) return;
    state.lang = code;
    store.lang();
    renderLanguageSelect();
    renderAll();
    if (els.searchResults && !els.searchResults.hidden) renderSearch(els.searchInput.value);
  }

  function setTheme(theme) {
    state.theme = theme;
    store.theme();
    applyTheme();
  }

  function selectSymbol(symbol) {
    if (!symbol) return;
    state.selected = symbol;
    if (!state.watchlist.includes(symbol) && !isIndex(symbol)) state.watchlist.unshift(symbol);
    store.watchlist();

    state.series = null;
    state.googleQuote = { symbol: null, price: null, at: 0 };
    renderStrip();
    renderWatchlist();
    renderDetail();
    renderStats();
    renderMarketTable();
    renderChart();
    refreshSeries();
    refreshGoogleQuote();
  }

  function addToWatchlist(symbol) {
    if (!symbol) return;
    if (!state.watchlist.includes(symbol)) {
      state.watchlist.unshift(symbol);
      store.watchlist();
      toast(t('added'));
    }
    selectSymbol(symbol);
    renderWatchlist();
    renderSearch(els.searchInput.value);
    refreshQuotes();
  }

  function removeFromWatchlist(symbol) {
    state.watchlist = state.watchlist.filter((s) => s !== symbol);
    store.watchlist();
    toast(t('removed'));
    if (state.selected === symbol && state.watchlist.length) selectSymbol(state.watchlist[0]);
    else renderWatchlist();
  }

  function setRange(key) {
    if (!RANGES.some((r) => r.key === key)) return;
    state.range = key;
    store.range();
    renderRangeTabs();
    // Drop the old series so the chart shows its loading state instead of the
    // previous range's line until the new one arrives.
    state.series = null;
    refreshSeries();
  }

  function setBasket(key) {
    state.basket = key;
    store.basket();
    state.snapshot.visible = CONFIG.tablePageSize;
    loadSnapshot(true);
  }

  /** NSE / BSE filter: applies to the market table, movers and search. */
  function setExchange(key) {
    state.exchange = EXCHANGES.includes(key) ? key : 'all';
    store.exchange();
    if (els.exchangeSelect) els.exchangeSelect.value = state.exchange;
    renderMarketTable();
    renderMovers();
    if (els.searchResults && !els.searchResults.hidden) renderSearch(els.searchInput.value);
  }

  /** Click a header: re-sort by that column, or flip direction if already active. */
  function setSort(key) {
    if (!SORT_KEYS.includes(key)) return;
    if (state.snapshot.sort === key) {
      state.snapshot.sortDir = state.snapshot.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      state.snapshot.sort = key;
      state.snapshot.sortDir = SORT_DIRECTION[key] || 'desc';
    }
    renderMarketTable();
  }

  /** Fold fresher quotes into the loaded snapshot; true if anything changed. */
  function mergeIntoSnapshot(quotes) {
    let changed = false;
    Object.keys(state.snapshot.quotes).forEach((symbol) => {
      const fresh = quotes[symbol];
      if (!fresh) return;
      state.snapshot.quotes[symbol] = { ...state.snapshot.quotes[symbol], ...fresh };
      changed = true;
    });
    return changed;
  }

  function resetDefaults() {
    state.watchlist = CONFIG.defaultWatchlist.slice();
    state.selected = state.watchlist[0];
    state.range = CONFIG.defaultRange;
    state.basket = 'nifty50';
    state.exchange = 'all';
    store.watchlist();
    store.range();
    store.basket();
    store.exchange();
    state.series = null;
    state.snapshot = { key: null, quotes: {}, savedAt: 0, sort: 'change', sortDir: 'desc', visible: 0 };
    renderWatchlist();
    renderRangeTabs();
    renderBasketSelect();
    renderMarketTable();
    renderMovers();
    refreshQuotes();
    refreshSeries();
  }

  /* ---------------------------- fetching --------------------------- */

  function watchSymbols() {
    return Array.from(new Set([...CONFIG.indexSymbols, ...state.watchlist, state.selected])).filter(Boolean);
  }

  function setBusy(on) {
    els.refreshSpinner.hidden = !on;
    els.refreshBtn.disabled = on;
  }

  async function refreshQuotes(showSpinner) {
    if (state.loadingQuotes) return;
    state.loadingQuotes = true;
    if (showSpinner) setBusy(true);
    const wanted = watchSymbols();

    try {
      const { source, quotes } = await DataService.fetchQuotes(wanted);
      let nextSource = source;
      let nextQuotes = quotes;

      // No live provider reachable: prefer values we saved earlier over
      // freshly generated demo numbers.
      if (source === 'demo') {
        const cached = DataService.loadQuotes();
        const usable = Object.keys(cached.quotes || {})
          .filter((symbol) => wanted.includes(symbol))
          .reduce((acc, symbol) => { acc[symbol] = cached.quotes[symbol]; return acc; }, {});
        if (Object.keys(usable).length) {
          nextQuotes = { ...quotes, ...usable };
          nextSource = 'cache';
        }
      }

      state.quotes = { ...state.quotes, ...nextQuotes };
      state.quotesSource = nextSource;
      state.lastUpdated = Date.now();
      if (nextSource === 'live') DataService.saveQuotes(nextQuotes);

      renderStrip();
      renderWatchlist();
      renderDetail();
      renderStats();
      // Keep the loaded market table in step with the fresh watchlist quotes.
      if (state.snapshot.key && mergeIntoSnapshot(state.quotes)) {
        renderMarketTable();
        renderMovers();
      }
      renderStatus();
    } catch (err) {
      const cached = DataService.loadQuotes();
      if (cached.savedAt) {
        state.quotes = { ...cached.quotes, ...state.quotes };
        state.quotesSource = 'cache';
        state.lastUpdated = cached.savedAt;
        renderAll();
      }
    } finally {
      state.loadingQuotes = false;
      if (showSpinner) setBusy(false);
    }
  }

  async function refreshSeries() {
    const symbol = state.selected;
    const rangeKey = state.range;

    // Paint something immediately — the cached series, else a generated one —
    // so a slow or blocked provider can never leave the chart stuck on
    // "Loading…". The live series replaces it as soon as it arrives.
    if (!state.series) {
      state.series = DataService.loadSeries(symbol, rangeKey) || DataService.demoSeries(symbol, rangeKey);
    }

    state.loadingSeries = true;
    renderChart();

    try {
      const series = await DataService.fetchSeries(symbol, rangeKey);
      if (symbol !== state.selected || rangeKey !== state.range) return; // a newer request won

      if (series.ok) {
        state.series = series;
        DataService.saveSeries(series);

        const meta = series.meta || {};
        const extra = {
          price: meta.regularMarketPrice,
          prevClose: meta.previousClose,
          open: meta.regularMarketOpen,
          dayHigh: meta.regularMarketDayHigh,
          dayLow: meta.regularMarketDayLow,
          week52High: meta.fiftyTwoWeekHigh,
          week52Low: meta.fiftyTwoWeekLow,
          volume: meta.regularMarketVolume,
          currency: meta.currency,
          exchange: meta.fullExchangeName || meta.exchangeName,
          marketState: meta.marketState,
          offset: meta.gmtoffset,
          longName: meta.longName || meta.shortName
        };
        Object.keys(extra).forEach((key) => {
          if (extra[key] === null || extra[key] === undefined) delete extra[key];
        });

        const merged = { ...(quoteOf(symbol) || { symbol, source: 'live' }), ...extra };
        if (typeof merged.price === 'number') {
          // Chart meta carries the authoritative change — Yahoo's previousClose
          // is unreliable for indices, so never recompute from it alone.
          DataService.reconcileChange(merged, {
            change: meta.regularMarketChange,
            changePct: meta.regularMarketChangePercent
          });
        }
        state.quotes[symbol] = merged;
        renderDetail();
        renderStats();
      } else {
        const cached = DataService.loadSeries(symbol, rangeKey);
        state.series = cached || DataService.demoSeries(symbol, rangeKey);
      }
      renderChart();
      renderStatus();
    } finally {
      state.loadingSeries = false;
    }
  }

  /** Load quotes for the selected basket (chunked requests). */
  async function loadSnapshot(showToast) {
    if (state.loadingSnapshot) return;
    if (!state.universeReady && state.basket !== 'watchlist') {
      await Universe.load();
      state.universeReady = Universe.ready();
    }

    const symbols = snapshotSymbols();
    if (!symbols.length) {
      toast(t('noQuotes'));
      return;
    }

    state.loadingSnapshot = true;
    els.snapshotSpinner.hidden = false;
    els.loadSnapshotBtn.disabled = true;
    els.snapshotStatus.textContent = t('loadingSnapshot');

    try {
      const { source, quotes } = await DataService.fetchQuotes(symbols);
      state.snapshot = {
        key: state.basket,
        quotes,
        savedAt: Date.now(),
        sort: state.snapshot.sort,
        sortDir: state.snapshot.sortDir,
        visible: CONFIG.tablePageSize
      };
      state.quotesSource = state.quotesSource === 'demo' ? 'demo' : state.quotesSource;
      if (source === 'live') DataService.saveSnapshot(state.basket, quotes);

      renderMarketTable();
      renderMovers();
      if (showToast) toast(`${t('snapshotLoaded')} · ${Object.keys(quotes).length}`);
    } catch (err) {
      const cached = DataService.loadSnapshot(state.basket);
      if (cached.savedAt) {
        state.snapshot = { key: state.basket, quotes: cached.quotes, savedAt: cached.savedAt, sort: 'change', sortDir: 'desc', visible: CONFIG.tablePageSize };
        renderMarketTable();
        renderMovers();
      }
    } finally {
      state.loadingSnapshot = false;
      els.snapshotSpinner.hidden = true;
      els.loadSnapshotBtn.disabled = false;
      renderMarketTable();
    }
  }

  /** Re-download the NSE symbol list and the BSE equity master, on demand. */
  async function refreshUniverseList() {
    if (els.refreshListBtn) els.refreshListBtn.disabled = true;
    if (els.listSpinner) els.listSpinner.hidden = false;
    try {
      const nse = await Universe.refreshFromNse();
      let bse = Universe.bseCount();
      try { bse = await Universe.refreshBse(); } catch (err) { /* keep the current BSE list */ }
      state.universeReady = Universe.ready();
      renderAll();
      toast(`${Format.int(nse, state.lang)} NSE · ${Format.int(bse, state.lang)} BSE`);
    } catch (err) {
      toast(t('error'));
    } finally {
      if (els.refreshListBtn) els.refreshListBtn.disabled = false;
      if (els.listSpinner) els.listSpinner.hidden = true;
    }
  }

  /**
   * Re-quote a loaded snapshot on its own cadence so the market table moves
   * while the market is open. Large baskets are skipped (Nifty 500 would mean
   * 13 requests every minute); they still refresh on demand.
   */
  async function refreshSnapshotLive() {
    if (!state.snapshot.key || state.loadingSnapshot) return;
    const symbols = Object.keys(state.snapshot.quotes);
    if (!symbols.length || symbols.length > CONFIG.liveSnapshotMax) return;
    try {
      const { source, quotes } = await DataService.fetchQuotes(symbols);
      if (source !== 'live') return;
      if (mergeIntoSnapshot(quotes)) {
        renderMarketTable();
        renderMovers();
      }
    } catch (err) {
      /* transient failure — keep the values already on screen */
    }
  }

  /* ----------------------------- events ---------------------------- */

  function bindEvents() {
    els.langSelect.addEventListener('change', (event) => setLanguage(event.target.value));
    els.themeBtn.addEventListener('click', () => setTheme(state.theme === 'dark' ? 'light' : 'dark'));
    els.refreshBtn.addEventListener('click', () => {
      refreshQuotes(true);
      refreshSeries();
      if (state.snapshot.key) loadSnapshot();
    });
    els.resetBtn.addEventListener('click', resetDefaults);
    if (els.refreshListBtn) els.refreshListBtn.addEventListener('click', refreshUniverseList);

    els.searchForm.addEventListener('submit', (event) => {
      event.preventDefault();
      renderSearch(els.searchInput.value);
    });
    els.searchInput.addEventListener('input', (event) => renderSearch(event.target.value));
    els.clearBtn.addEventListener('click', () => {
      els.searchInput.value = '';
      renderSearch('');
    });

    els.searchResults.addEventListener('click', (event) => {
      const add = event.target.closest('[data-add]');
      if (add) {
        addToWatchlist(add.getAttribute('data-add'));
        return;
      }
      const pick = event.target.closest('[data-select]');
      if (pick) selectSymbol(pick.getAttribute('data-select'));
    });

    els.watchList.addEventListener('click', (event) => {
      const removeBtn = event.target.closest('[data-remove]');
      if (removeBtn) {
        removeFromWatchlist(removeBtn.getAttribute('data-remove'));
        return;
      }
      const row = event.target.closest('[data-symbol]');
      if (row) selectSymbol(row.getAttribute('data-symbol'));
    });

    els.indexStrip.addEventListener('click', (event) => {
      const card = event.target.closest('[data-symbol]');
      if (card) selectSymbol(card.getAttribute('data-symbol'));
    });

    els.rangeTabs.addEventListener('click', (event) => {
      const tab = event.target.closest('[data-range]');
      if (tab) setRange(tab.getAttribute('data-range'));
    });

    els.marketTable.addEventListener('click', (event) => {
      const row = event.target.closest('[data-symbol]');
      if (row) selectSymbol(row.getAttribute('data-symbol'));
    });

    document.querySelector('.movers').addEventListener('click', (event) => {
      const mover = event.target.closest('[data-symbol]');
      if (mover) selectSymbol(mover.getAttribute('data-symbol'));
    });

    els.basketSelect.addEventListener('change', (event) => setBasket(event.target.value));
    if (els.exchangeSelect) els.exchangeSelect.addEventListener('change', (event) => setExchange(event.target.value));
    els.loadSnapshotBtn.addEventListener('click', () => loadSnapshot(true));
    els.showMoreBtn.addEventListener('click', () => {
      state.snapshot.visible += CONFIG.tablePageSize;
      renderMarketTable();
    });

    (els.sortHeaders || []).forEach((th) => {
      th.addEventListener('click', () => setSort(th.getAttribute('data-sort')));
    });

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) { refreshQuotes(); refreshSnapshotLive(); }
    });
    window.addEventListener('chartjs:ready', () => renderChart());
  }

  function startTimers() {
    setInterval(() => { if (!document.hidden) refreshQuotes(); }, CONFIG.refreshMs);
    setInterval(() => { if (!document.hidden) refreshSeries(); }, CONFIG.seriesRefreshMs);
    setInterval(() => { if (!document.hidden) refreshSnapshotLive(); }, CONFIG.snapshotRefreshMs);
    setInterval(() => { if (!document.hidden) refreshGoogleQuote(); }, CONFIG.seriesRefreshMs);
  }

  /* ------------------------------ init ----------------------------- */

  function cacheElements() {
    els.langSelect = $('langSelect');
    els.themeBtn = $('themeBtn');
    els.themeIcon = $('themeIcon');
    els.refreshBtn = $('refreshBtn');
    els.refreshSpinner = $('refreshSpinner');
    els.indexStrip = $('indexStrip');
    els.watchList = $('watchList');
    els.watchCount = $('watchCount');
    els.searchForm = $('searchForm');
    els.searchInput = $('searchInput');
    els.searchResults = $('searchResults');
    els.clearBtn = $('clearBtn');
    els.resetBtn = $('resetBtn');
    els.rangeTabs = $('rangeTabs');
    els.stockName = $('stockName');
    els.stockSymbol = $('stockSymbol');
    els.stockSector = $('stockSector');
    els.stockOfficial = $('stockOfficial');
    els.stockPrice = $('stockPrice');
    els.stockChange = $('stockChange');
    els.stockLive = $('stockLive');
    els.statsGrid = $('statsGrid');
    els.basketSelect = $('basketSelect');
    els.exchangeSelect = $('exchangeSelect');
    els.loadSnapshotBtn = $('loadSnapshotBtn');
    els.snapshotSpinner = $('snapshotSpinner');
    els.snapshotStatus = $('snapshotStatus');
    els.marketTable = $('marketTable');
    els.showMoreBtn = $('showMoreBtn');
    els.sortHeaders = Array.from(document.querySelectorAll('.market-table th[data-sort]'));
    els.refreshListBtn = $('refreshListBtn');
    els.listSpinner = $('listSpinner');
    els.gainersList = $('gainersList');
    els.losersList = $('losersList');
    els.marketBadge = $('marketBadge');
    els.sourceName = $('sourceName');
    els.stripSource = $('stripSource');
    els.universeInfo = $('universeInfo');
    els.lastUpdated = $('lastUpdated');
    els.toast = $('toast');
  }

  async function init() {
    cacheElements();
    store.load();

    // Paint immediately from the last known quotes, then refresh.
    const cached = DataService.loadQuotes();
    if (cached.savedAt) {
      state.quotes = cached.quotes;
      state.quotesSource = 'cache';
      state.lastUpdated = cached.savedAt;
    }
    const cachedSeries = DataService.loadSeries(state.selected, state.range);
    if (cachedSeries) state.series = cachedSeries;
    const cachedSnapshot = DataService.loadSnapshot(state.basket);
    if (cachedSnapshot.savedAt) {
      state.snapshot = { key: state.basket, quotes: cachedSnapshot.quotes, savedAt: cachedSnapshot.savedAt, sort: 'change', sortDir: 'desc', visible: CONFIG.tablePageSize };
    }

    renderLanguageSelect();
    applyTheme();
    renderAll();
    bindEvents();
    refreshQuotes(false);
    refreshSeries();
    refreshGoogleQuote();
    startTimers();

    // Full NSE symbol list: bundled file first, then a silent daily update.
    Universe.load().then(() => {
      state.universeReady = Universe.ready();
      renderAll();
      if (!state.universeReady) return;

      // First visit (or nothing cached): populate the market table right away.
      if (!state.snapshot.key) loadSnapshot(false);

      Universe.refreshIfStale().then((result) => {
        if (result.refreshed) {
          renderAll();
          toast(`${Universe.count()} NSE · ${t('snapshotLoaded')}`);
        }
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
