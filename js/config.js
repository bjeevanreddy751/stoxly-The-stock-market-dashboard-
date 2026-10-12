/* ------------------------------------------------------------------
 * config.js — languages, instrument defaults, chart ranges and the
 * proxy list. Company names come from js/glossary.js + js/translit.js,
 * and the full symbol list from js/universe.js.
 * ------------------------------------------------------------------ */

/**
 * Languages offered in the header pull-down.
 *   code    — used in ?lang= and as the locale-file key
 *   native  — label inside the <select>
 *   locale  — Intl locale for numbers and dates
 *   script  — transliteration script key ('' = keep Latin names)
 *   dir     — writing direction
 */
const LANGUAGES = [
  { code: 'en', native: 'English',   english: 'English',   locale: 'en-IN', script: '',     dir: 'ltr' },
  { code: 'hi', native: 'हिन्दी',      english: 'Hindi',     locale: 'hi-IN', script: 'deva', dir: 'ltr' },
  { code: 'mr', native: 'मराठी',      english: 'Marathi',   locale: 'mr-IN', script: 'deva', dir: 'ltr' },
  { code: 'kn', native: 'ಕನ್ನಡ',       english: 'Kannada',   locale: 'kn-IN', script: 'knda', dir: 'ltr' },
  { code: 'te', native: 'తెలుగు',      english: 'Telugu',    locale: 'te-IN', script: 'telu', dir: 'ltr' },
  { code: 'ta', native: 'தமிழ்',       english: 'Tamil',     locale: 'ta-IN', script: 'taml', dir: 'ltr' },
  { code: 'ml', native: 'മലയാളം',     english: 'Malayalam', locale: 'ml-IN', script: 'mlym', dir: 'ltr' },
  { code: 'bn', native: 'বাংলা',       english: 'Bengali',   locale: 'bn-IN', script: 'beng', dir: 'ltr' },
  { code: 'gu', native: 'ગુજરાતી',    english: 'Gujarati',  locale: 'gu-IN', script: 'gujr', dir: 'ltr' },
  { code: 'pa', native: 'ਪੰਜਾਬੀ',      english: 'Punjabi',   locale: 'pa-IN', script: 'guru', dir: 'ltr' },
  { code: 'or', native: 'ଓଡ଼ିଆ',        english: 'Odia',      locale: 'or-IN', script: 'orya', dir: 'ltr' },
  { code: 'as', native: 'অসমীয়া',     english: 'Assamese',  locale: 'as-IN', script: 'beng', dir: 'ltr' },
  { code: 'ur', native: 'اردو',        english: 'Urdu',      locale: 'ur-IN', script: 'arab', dir: 'rtl' },
  { code: 'kok', native: 'कोंकणी',     english: 'Konkani',   locale: 'kok-IN', script: 'deva', dir: 'ltr' },
  { code: 'mai', native: 'मैथिली',      english: 'Maithili',  locale: 'mai-IN', script: 'deva', dir: 'ltr' },
  { code: 'doi', native: 'डोगरी',      english: 'Dogri',     locale: 'doi-IN', script: 'deva', dir: 'ltr' },
  { code: 'brx', native: 'बड़ो',        english: 'Bodo',      locale: 'brx-IN', script: 'deva', dir: 'ltr' },
  { code: 'sa',  native: 'संस्कृतम्',   english: 'Sanskrit',  locale: 'sa-IN',  script: 'deva', dir: 'ltr' },
  { code: 'mni', native: 'মৈতৈলোন্',   english: 'Manipuri',  locale: 'mni-IN', script: 'beng', dir: 'ltr' },
  { code: 'sd',  native: 'سنڌي',       english: 'Sindhi',    locale: 'sd-IN',  script: 'arab', dir: 'rtl' },
  { code: 'ks',  native: 'کٲشُر',      english: 'Kashmiri',  locale: 'ks-IN',  script: 'arab', dir: 'rtl' },
  { code: 'sat', native: 'ᱥᱟᱱᱛᱟᱲᱤ',    english: 'Santali',   locale: 'sat-IN', script: 'olck', dir: 'ltr' }
];

/** Instruments pinned in the default watchlist (names come from the glossary). */
const INSTRUMENTS = [
  { symbol: '^NSEI', sector: 'index' },
  { symbol: '^BSESN', sector: 'index' },
  { symbol: '^NSEBANK', sector: 'index' },
  { symbol: 'RELIANCE.NS', sector: 'oilgas' },
  { symbol: 'TCS.NS', sector: 'it' },
  { symbol: 'INFY.NS', sector: 'it' },
  { symbol: 'HDFCBANK.NS', sector: 'financial' },
  { symbol: 'ICICIBANK.NS', sector: 'financial' },
  { symbol: 'SBIN.NS', sector: 'financial' },
  { symbol: 'ITC.NS', sector: 'fmcg' },
  { symbol: 'TMPV.NS', sector: 'auto' }
];

/**
 * Unicode numbering systems for the languages that have their own digits,
 * so prices, percentages, dates and axis ticks render natively. Languages not
 * listed here (English, and Santali, whose Ol Chiki digits Intl does not
 * support) use Western digits.
 */
const NATIVE_DIGITS = {
  hi: 'deva', mr: 'deva', kok: 'deva', mai: 'deva', doi: 'deva', brx: 'deva', sa: 'deva',
  bn: 'beng', as: 'beng', mni: 'beng',
  gu: 'gujr', pa: 'guru', or: 'orya', ta: 'tamldec', te: 'telu', kn: 'knda', ml: 'mlym',
  ur: 'arabext', sd: 'arabext', ks: 'arabext'
};

/**
 * Display names for the index strip. The three headline indices also carry
 * curated localised spellings in js/glossary.js; these labels cover the rest
 * and are run through Localize so known words still regionalise.
 */
const INDEX_NAMES = {
  '^NSEI': 'NIFTY 50',
  '^NSEBANK': 'NIFTY BANK',
  '^BSESN': 'BSE SENSEX',
  '^NSMIDCP': 'NIFTY NEXT 50',
  '^NSEMDCP50': 'NIFTY MIDCAP 50',
  '^CNXSC': 'NIFTY SMALLCAP 100',
  '^CNX100': 'NIFTY 100',
  '^CNX200': 'NIFTY 200',
  '^CRSLDX': 'NIFTY 500',
  '^CNXIT': 'NIFTY IT',
  '^CNXFIN': 'NIFTY FINANCIAL SERVICES',
  '^CNXAUTO': 'NIFTY AUTO',
  '^CNXPHARMA': 'NIFTY PHARMA',
  '^CNXFMCG': 'NIFTY FMCG',
  '^CNXMETAL': 'NIFTY METAL',
  '^CNXENERGY': 'NIFTY ENERGY',
  '^CNXPSUBANK': 'NIFTY PSU BANK',
  '^CNXINFRA': 'NIFTY INFRASTRUCTURE',
  '^CNXREALTY': 'NIFTY REALTY',
  '^CNXMEDIA': 'NIFTY MEDIA',
  '^CNXPSE': 'NIFTY PSE',
  '^CNXCONSUM': 'NIFTY CONSUMPTION',
  '^CNXCMDT': 'NIFTY COMMODITIES',
  '^CNXSERVICE': 'NIFTY SERVICES SECTOR',
  '^INDIAVIX': 'INDIA VIX'
};

/** Chart ranges -> Yahoo Finance range/interval pairs. */
const RANGES = [
  { key: '1d',  labelKey: 'range1D', range: '1d',  interval: '5m'  },
  { key: '5d',  labelKey: 'range5D', range: '5d',  interval: '30m' },
  { key: '1mo', labelKey: 'range1M', range: '1mo', interval: '1d'  },
  { key: '6mo', labelKey: 'range6M', range: '6mo', interval: '1d'  },
  { key: '1y',  labelKey: 'range1Y', range: '1y',  interval: '1d'  },
  { key: '5y',  labelKey: 'range5Y', range: '5y',  interval: '1wk' }
];

/** Market-wide snapshots: which baskets can be loaded, in menu order. */
const BASKETS = [
  { key: 'watchlist',     labelKey: 'basketWatchlist' },
  { key: 'nifty50',       labelKey: 'basketNifty50' },
  { key: 'niftynext50',   labelKey: 'basketNiftyNext50' },
  { key: 'niftymidcap150', labelKey: 'basketMidcap150' },
  { key: 'niftysmallcap250', labelKey: 'basketSmallcap250' },
  { key: 'nifty500',      labelKey: 'basketNifty500' }
];

const CONFIG = {
  /**
   * Index symbols shown in the strip at the top — the broad-market, size and
   * sectoral indices Yahoo Finance serves for India. (Yahoo carries no BSE
   * sectoral indices, so Sensex is the only BSE series available here.)
   */
  indexSymbols: [
    '^NSEI', '^NSEBANK', '^BSESN',
    '^NSMIDCP', '^NSEMDCP50', '^CNXSC', '^CNX100', '^CNX200', '^CRSLDX',
    '^CNXIT', '^CNXFIN', '^CNXAUTO', '^CNXPHARMA', '^CNXFMCG', '^CNXMETAL',
    '^CNXENERGY', '^CNXPSUBANK', '^CNXINFRA', '^CNXREALTY', '^CNXMEDIA',
    '^CNXPSE', '^CNXCONSUM', '^CNXCMDT', '^CNXSERVICE', '^INDIAVIX'
  ],
  /** Default watchlist for first-time visitors. */
  defaultWatchlist: ['RELIANCE.NS', 'TCS.NS', 'INFY.NS', 'HDFCBANK.NS', 'TMPV.NS', 'ITC.NS'],
  defaultRange: '1d',
  /** Watchlist + index refresh interval (ms); paused while the tab is hidden. */
  refreshMs: 15000,
  /** How often the selected chart series is re-fetched (ms). */
  seriesRefreshMs: 60000,
  /** How often a loaded market snapshot is re-quoted (ms) so the table moves. */
  snapshotRefreshMs: 60000,
  /** Baskets larger than this are not auto-refreshed (keeps requests sane). */
  liveSnapshotMax: 60,
  /** Snapshot fetching: symbols per request and how many requests at once. */
  snapshotChunkSize: 40,
  snapshotConcurrency: 3,
  /** Market table: rows rendered initially and per "show more". */
  tablePageSize: 40,
  /** Search results shown at once. */
  searchLimit: 40,
  /**
   * CORS proxies tried in order for Yahoo Finance (and NSE archive)
   * requests. The first entry is the bundled local proxy — run
   * `node tools/proxy.mjs` for reliable live data. Public proxies are
   * best-effort fallbacks; put your own worker URL here for production.
   */
  proxies: [
    (url) => `http://127.0.0.1:8787/?url=${encodeURIComponent(url)}`,
    (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    (url) => `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(url)}`,
    (url) => `https://api.cors.lol/?url=${encodeURIComponent(url)}`
  ],
  /** localStorage keys (universe keys live in js/universe.js). */
  storage: {
    lang: 'smd.lang',
    theme: 'smd.theme',
    watchlist: 'smd.watchlist',
    selected: 'smd.selected',
    range: 'smd.range',
    basket: 'smd.basket',
    exchange: 'smd.exchange',
    quotes: 'smd.quotes.cache',
    series: 'smd.series.cache',
    snapshot: 'smd.snapshot.cache'
  },
  /** Cached quotes/series older than this are ignored (ms). */
  cacheMaxAgeMs: 24 * 60 * 60 * 1000
};

/** Quick lookup by symbol for the pinned instruments. */
const INSTRUMENT_BY_SYMBOL = INSTRUMENTS.reduce((acc, item) => {
  acc[item.symbol] = item;
  return acc;
}, {});
