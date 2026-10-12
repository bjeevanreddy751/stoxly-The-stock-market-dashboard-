# 📈 Stoxly — all NSE & BSE stocks in 21 Indian languages

**Stoxly** is a dashboard for the **entire Indian equity market (every NSE listing — ~2,300 — plus
every BSE-only scrip, ~2,900)** that shows live prices in **English plus 21 of the 22 languages of
the Eighth Schedule of the Indian Constitution** (all except Nepali) — অসমীয়া, اردو, कोंकणी, मैथिली,
डोगरी, बड़ो, संस्कृतम्, মৈতৈলোন্, سنڌي, کٲشُر, ᱥᱟᱱᱛᱟᱲᱤ, हिन्दी, मराठी, ಕನ್ನಡ, తెలుగు, தமிழ்,
മലയാളം, বাংলা, ગુજરાતી and ਪੰਜਾਬੀ.

Pick a language from the pull-down at the top and the whole screen — headings, company names,
sector labels, numbers, dates and chart labels — switches to that language instantly. The stock
list updates itself **once a day straight from the NSE archives**, with no API key.

Built with plain **HTML, CSS and JavaScript** (no build step, no dependencies), **localStorage** for
persistence and **Chart.js** for the price chart.

---

## Quick start

```bash
# 1. serve the dashboard (must be http:// — file:// blocks localStorage)
node tools/serve.mjs                # http://127.0.0.1:8000  (recommended)
#    python -m http.server 8000 also serves it — see the caching note below

# 2. local proxy: live quotes + the daily NSE list refresh
node tools/proxy.mjs                # http://127.0.0.1:8787

# 3. open it
#    http://127.0.0.1:8000/index.html
#    http://127.0.0.1:8000/index.html?lang=ta     ← deep link into any language
```

**Why `node tools/serve.mjs` instead of `python -m http.server`?** Python's server sends no
`Cache-Control` header at all — only `Last-Modified` — so browsers heuristically cache
`js/*.js` and `js/locales/*.js` and can keep **serving an old copy after you edit them**; a normal
reload is not enough. The bundled server sends `Cache-Control: no-store`, so reloading always uses
the files on disk.

Without the proxy the dashboard still works: it falls back to public CORS proxies, then to cached
values, then to generated demo data (clearly labelled *Demo data*), so the localisation is always
demonstrable. Regenerate the bundled symbol list any time with:

```bash
node tools/build-universe.mjs       # writes data/nse-symbols.json + data/bse-symbols.json + data/baskets.json
```

---

## What it does

| Area | Detail |
| --- | --- |
| **All Indian stocks** | Every NSE-listed equity from NSE's public `EQUITY_L.csv` **plus every BSE-only scrip** from BSE's daily bhavcopy (deduped by ISIN, so a company listed on both exchanges appears once, as its NSE symbol). Official company name included; Nifty 500 members also carry the NSE industry. BSE-only names show sector “Other”. |
| **Manual list refresh** | A **Refresh list** button in the *All NSE & BSE stocks* panel re-downloads the NSE symbol list and the BSE equity master on demand — useful when a listing changes between the daily auto-updates. |
| **22 languages** | Full UI translation per language (English + 21 scheduled Indian languages), one file each: `js/locales/*.js`. Language choice is remembered. |
| **Names in every language** | 27 blue-chip companies have hand-curated spellings; everything else is translated word-by-word from a finance glossary (`Limited` → `लिमिटेड`, `Bank` → `ಬ್ಯಾಂಕ್`) and the rest is **phonetically transliterated** into the target script (`Bajaj` → `बजाज`, `Wipro` → `ವಿಪ್ರೊ`). The official English name is always shown beneath, so nothing is ambiguous. |
| **Exchange filter & tags** | An **Exchange** picker (All / NSE / BSE) narrows the market table, the movers and the search results to one exchange, and every row carries a small **NSE** or **BSE** chip. Indices stay visible whatever is selected. |
| **Search in any script** | Search by ticker (`INFY`), English name (`Infosys`) or native name (`ಇನ್ಫೋಸಿಸ್`, `విప್ರೋ`, `रिलायंस`) — the query's script is detected, so you can type Kannada into a Hindi UI. There is a **Search** button and instant results as you type. |
| **Market baskets** | Load a whole index in one click: Nifty 50, Nifty Next 50, Nifty Midcap 150, Nifty Smallcap 250, Nifty 500 or your own watchlist. Requests are chunked (40 symbols each, 3 at a time) so Nifty 500 (~500 symbols) loads in ~9 s / 13 requests instead of one giant URL. |
| **Sortable market table** | The loaded basket with localised names, prices, % change and sector. Click any column header (Stock / Price / Change % / Sector) to sort by it, click again to flip the direction — the arrow and `aria-sort` follow; “Show more” pages through it, clicking a row opens that stock. |
| **Live quotes** | Batched Yahoo Finance requests for the watchlist + indices every 15 s (paused when the tab is hidden), the selected chart series every 60 s, and the loaded market snapshot every 60 s (baskets up to Nifty Next 50) so the table keeps moving while the market is open. |
| **Fresher price for the selected stock** | Yahoo's Indian feed is delayed, so the detail panel also shows a **Live · Google Finance** price for the one stock you are viewing — no API key needed. It is fetched once per selection and every 60 s, labelled with its source, and silently disappears if Google cannot be reached, leaving the Yahoo price untouched. |
| **Chart** | Chart.js line chart with gradient fill, six localised ranges (1 दिन … 5 वर्ष) and axis/tooltip labels in exchange time (IST). |
| **Movers** | Top gainers / losers from the loaded basket (or your watchlist before a basket is loaded). |
| **Daily list update** | Once every 24 h the app re-downloads the symbol list and baskets from NSE, caches them in localStorage and shows the update date. If the network is blocked, the previous list stays. |
| **Offline friendly** | Live → cached → demo fallback with a badge (`Live` / `Showing saved data` / `Demo data`); Chart.js is vendored locally. |
| **Persistence** | Language, theme, watchlist, selected stock, range, basket, quotes, chart series and snapshots all live in localStorage, so a reload paints instantly. |

Number, date and chart-axis formatting uses **Indian digit grouping in each language's own
digits** (`₹12,34,567.50`, `₹१२,३४,५६७.५०`, `₹১২,৩৪,৫৬৭.৫০`) with localised crore/lakh units
(`1.23 करोड़`, `1.23 কೋಟಿ`). English — and Santali, whose Ol Chiki digits `Intl` does not support — keep
Western digits. Acronyms are spelled out in the local script (`HDFC` → `एचडीएफसी`), and the
Stoxly wordmark is transliterated as well (`स्टोक्सली`).

---

## Third-party code and data sources

### Bundled code

- **Chart.js 4.4.4** — vendored in `vendor/chart.umd.min.js` so the dashboard works offline.
  Chart.js is licensed separately; keep its license notice with the bundle if you redistribute it.

### External data sources

All sources are public and need **no API key**:

| Purpose | Source |
| --- | --- |
| Batched quotes (price, % change, previous close, intraday series) | `query1.finance.yahoo.com/v8/finance/spark` |
| Chart series + instrument metadata (52-week range, volume, market state) | `query1.finance.yahoo.com/v8/finance/chart/{symbol}` |
| Symbol list, official names, industries | `nsearchives.nseindia.com/content/equities/EQUITY_L.csv` |
| Index baskets | `nsearchives.nseindia.com/content/indices/ind_nifty*list.csv` |
| BSE equity master (all listed scrips) | `www.bseindia.com/download/BhavCopy/Equity/BhavCopy_BSE_CM_*.CSV` |
| Fresher cross-check price for the **selected** stock | `www.google.com/finance/quote/{SYMBOL}:{EXCHANGE}` (NSE equities + Nifty/Sensex) |

The dashboard trusts the **change a provider reports** (`fulldayChange` / `regularMarketChange`)
rather than subtracting `previousClose` itself. Yahoo's `previousClose` is unreliable for indices —
Nifty's can sit *above* the day's high, which flips a gain into a loss — so `reconcileChange()` in
`js/data.js` takes the reported change (or derives it from the reported percentage) and back-fills
the previous close from it.

None of these providers send CORS headers, so `js/data.js` and `js/universe.js` route requests
through, in order: the bundled **`tools/proxy.mjs`**, then public CORS proxies (best effort — often
rate-limited), then cache, then demo data.

`tools/proxy.mjs` therefore allows exactly four hosts (Yahoo, the NSE archives, BSE's bhavcopy and
Google Finance *quote pages only*) and needs no token. It is still a good idea to deploy your own
worker in front of them for production. For production, deploy your own small worker in front of those
hosts and put its URL first in `CONFIG.proxies` (`js/config.js`).

**Google Finance** has no public quote API and scraping its HTML is fragile; Yahoo's JSON
endpoints are a strictly better fit. To add another provider, implement `fetchQuotes(symbols)` and
`fetchSeries(symbol, rangeKey)` in `js/data.js` — nothing else in the UI changes.

---

## Project structure

```
index.html                markup + language selector + i18n hooks (data-i18n attributes)
css/styles.css            dark/light theme, responsive layout, RTL support
js/config.js              22 languages, index/watchlist defaults, ranges, baskets, proxies
js/locales/*.js           one file per language (73 UI strings + 22 sectors + 5 units each)
js/glossary.js            curated spellings for top companies + 70 generic words × 13 languages
js/translit.js            phonetic Latin → Devanagari/Kannada/Telugu/Tamil/Malayalam/
                          Bengali/Gujarati/Gurmukhi/Odia transliteration engine
js/i18n.js                locale registry, Intl formatters, Localize (name → language)
js/universe.js            NSE symbol list, baskets, daily refresh, cross-script search
js/data.js                Yahoo fetchers (chunked), localStorage cache, demo generator
js/app.js                 state, rendering, Chart.js, snapshots, refresh loops, events
data/nse-symbols.json     NSE listings: symbol, official name, industry, ISIN
data/bse-symbols.json     BSE-only listings (deduped by ISIN against NSE)
data/baskets.json         Nifty 50 / Next 50 / Midcap 150 / Smallcap 250 / 500 constituents
vendor/chart.umd.min.js   Chart.js 4.4.4 (vendored so the page works offline)
tools/build-universe.mjs  regenerates the three data files from NSE + BSE
tools/proxy.mjs           local CORS proxy for Yahoo + NSE + BSE + Google Finance
tools/serve.mjs           static dev server (Cache-Control: no-store — no stale JS)
tests/smoke.mjs           39 offline checks
tests/live-check.mjs      opt-in live check: indices, a basket, localised movers, search
LICENSE                   MIT license for this codebase
```

### localStorage keys

`smd.lang`, `smd.theme`, `smd.watchlist`, `smd.selected`, `smd.range`, `smd.basket`, `smd.exchange`,
`smd.quotes.cache`, `smd.series.cache`, `smd.snapshot.cache.<basket>`, `smd.universe`,
`smd.universe.refreshedAt`. Cached quotes/series older than 24 h are ignored; the cached symbol
list is reused for up to 30 days.

---

## Adding a language

1. **`js/config.js`** — add to `LANGUAGES`:
   `{ code: 'kok', native: 'कोंकणी', english: 'Konkani', locale: 'kok-IN', script: 'deva', dir: 'ltr' }`
2. **`js/locales/kok.js`** — copy `js/locales/en.js` and translate the 73 `ui` keys (plus the 22
   `sectors` and 5 `units`). `tests/smoke.mjs` fails if any key is missing.
3. **`js/glossary.js`** — add one value to the end of every row (rows are indexed by
   `LOCALE_ORDER`).
4. **`js/translit.js`** — only if the language uses a script that is not covered yet: add a script
   table (`vowels`, `matras`, `consonants`, `virama`, `nasal`) and map the code in `scriptFor()`.
   Existing scripts: Devanagari, Kannada, Telugu, Tamil, Malayalam, Bengali, Gujarati, Gurmukhi, Odia.

`LOCALE_ORDER` in `js/glossary.js` stays the 13 curated languages; other languages fall back to the
glossary + transliteration path, so a new Devanagari or Bengali-script language needs only the
transliteration map in `js/translit.js`. The pull-down, number/date formatting, name localisation,
chart labels and search all pick the new language up automatically. Every supported language now
has a script mapping (Devanagari, Kannada, Telugu, Tamil, Malayalam, Bengali, Gujarati, Gurmukhi,
Odia, Arabic and Ol Chiki), so company and index names localise in all of them.

## Adding a company or a spelling

* Exact name for a specific ticker → add a row to `GLOSSARY_NAMES` in `js/glossary.js`
  (13 values, `LOCALE_ORDER` order).
* A recurring word in company names (“Cement”, “Mining”, …) → add a row to `GLOSSARY_WORDS`.
* A symbol that is not listed on NSE → the search box accepts a pasted Yahoo ticker
  (`WIPRO.BO`, `^NSEI`) and adds it to the watchlist as-is.

---

## Tests

```bash
node tests/smoke.mjs          # 39 checks, no dependencies, no network
node tools/proxy.mjs          # terminal 1
node tests/live-check.mjs     # terminal 2: real Yahoo Finance data
LANG=ta BASKET=nifty500 node tests/live-check.mjs   # live Nifty 500 snapshot in Tamil
```

`tests/smoke.mjs` runs the real `config.js`, `translit.js`, `glossary.js`, `i18n.js`,
`universe.js` and `data.js` inside a Node VM with stubbed `fetch`/`localStorage`. It checks the
BSE merge too: the two exchanges never share an ISIN or a ticker, and BSE scrips resolve to `.BO`
while NSE symbols stay `.NS`. It fails the
build when a language is missing a key, a glossary row has an empty value, transliteration leaks
characters from another script, a sector key is untranslated, search stops finding stocks by their
regional name, chunking breaks on large baskets, or the daily refresh stops working.

`tests/live-check.mjs` prints real prices and the biggest movers of a basket in any language, then
searches the universe in five scripts. It skips cleanly (exit 0) when the proxy is not running.

---

## Limitations

* Transliteration is **phonetic**, so vowel length is occasionally approximate
  (English `Tech Mahindra` → `ಟೆಕ್ ಮಹಿಂದ್ರ` rather than `ಟೆಕ್ ಮಹಿಂದ್ರಾ`). Curated spellings in
  `js/glossary.js` override it for the companies that matter most, and the official English name is
  always displayed next to the localised one.
* Short all-caps acronyms (JSW, NTPC, HDFC) stay in Latin script, matching Indian business press.
* Yahoo's endpoints are unofficial and may be delayed; intraday data is 5-minute granularity.
  Not execution-grade.
* Public CORS proxies are unreliable — run `tools/proxy.mjs` or your own proxy for dependable live
  data. Nifty 500 snapshots deliberately take a few seconds (13 batched requests).
* The NSE list is refreshed once a day automatically, but a corporate action on the day of a
  listing/relisting can lag until the next refresh — run `node tools/build-universe.mjs` to force
  a fresh copy into the repo.
* Market status is taken from Yahoo when available, otherwise inferred from the NSE session
  (Mon–Fri 09:15–15:30 IST).

* **There is no reliable free, key-less source of real-time Indian prices.** Yahoo, with its
  ~15-minute delay, is the only key-free feed that scales to the whole market table — which is why
  the table still uses it. Google Finance is measurably fresher, but it is HTML *scraping*:
  one ~1 MB page per symbol, so it is only used for the single stock in the detail panel, and it
  will break if Google changes its markup. Real-time market-wide data needs a paid exchange licence
  (NSE/BSE real-time subscription, TrueData) or a broker API key (Zerodha Kite, Upstox, Dhan).
  Google also has no parseable page for BSE scrips.
* BSE coverage is limited by Yahoo: many illiquid BSE-only scrips have no `.BO` quote, so they
  show “—” (or demo data offline). BSE listings also carry no industry, so their sector is “Other”.

> Prices are indicative and for information only. Not investment advice.
