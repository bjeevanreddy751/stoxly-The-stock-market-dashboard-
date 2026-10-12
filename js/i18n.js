/* ------------------------------------------------------------------
 * i18n.js — language registry, formatters and name localisation.
 *
 * Translations live one-file-per-language in js/locales/*.js and are
 * collected into `I18N` here. Curated company spellings come from
 * js/glossary.js; anything else is transliterated by js/translit.js.
 * ------------------------------------------------------------------ */

/**
 * Locale registry. Bound to the same object the locale files extend, so
 * it does not matter whether js/locales/*.js load before or after this
 * file (each one adds properties to window.I18N_LOCALES).
 */
if (typeof window !== 'undefined') {
  window.I18N_LOCALES = window.I18N_LOCALES || { en: { ui: {}, sectors: {}, units: {} } };
}
const I18N = (typeof window !== 'undefined' && window.I18N_LOCALES) ? window.I18N_LOCALES : { en: { ui: {}, sectors: {}, units: {} } };

/** Yahoo Finance marketState -> i18n key. */
const MARKET_STATE_KEYS = {
  PRE: 'marketPre', PREPRE: 'marketPre',
  REGULAR: 'marketOpen',
  POST: 'marketPost', POSTPOST: 'marketPost',
  CLOSED: 'marketClosed'
};

const CURRENCY_SYMBOLS = { INR: '₹', USD: '$', EUR: '€', GBP: '£', JPY: '¥', AED: 'د.إ' };

/**
 * Locale-aware formatting helpers. Every user-visible number passes
 * through here, so switching language re-formats prices, percentages,
 * volumes and dates.
 */
const Format = {
  /** i18n block for a language, falling back to English. */
  pack(lang) { return I18N[lang] || I18N.en; },

  /** Translate a UI key, interpolating {placeholders} when given. */
  t(lang, key, vars) {
    const pack = this.pack(lang);
    let text = (pack.ui && pack.ui[key]) || (I18N.en.ui && I18N.en.ui[key]) || key;
    if (vars) {
      Object.keys(vars).forEach((name) => {
        text = text.split(`{${name}}`).join(this.int(vars[name], lang));
      });
    }
    return text;
  },

  /**
   * Intl locale id for a language code.
   * Languages with their own digits keep them (see NATIVE_DIGITS); the rest
   * are pinned to Western digits (`-u-nu-latn`).
   */
  locale(lang) {
    const meta = LANGUAGES.find((l) => l.code === lang) || LANGUAGES[0];
    if (this.numbering(lang)) return meta.locale;
    return meta.numerals === 'native' ? meta.locale : `${meta.locale}-u-nu-latn`;
  },

  /** Unicode numbering system for a language ('' = Western digits). */
  numbering(lang) {
    return (typeof NATIVE_DIGITS !== 'undefined' && NATIVE_DIGITS[lang]) || '';
  },

  /** Build an Intl.NumberFormat, falling back if the numbering system is unknown. */
  numberFormat(lang, digits) {
    const base = { minimumFractionDigits: digits, maximumFractionDigits: digits };
    const ns = this.numbering(lang);
    if (!ns) return new Intl.NumberFormat(this.locale(lang), base);
    try {
      return new Intl.NumberFormat(this.locale(lang), { ...base, numberingSystem: ns });
    } catch (err) {
      return new Intl.NumberFormat(this.locale(lang), base);
    }
  },

  /** Build an Intl.DateTimeFormat with the language's digits. */
  dateFormat(lang, options) {
    const ns = this.numbering(lang);
    if (!ns) return new Intl.DateTimeFormat(this.locale(lang), options);
    try {
      return new Intl.DateTimeFormat(this.locale(lang), { ...options, numberingSystem: ns });
    } catch (err) {
      return new Intl.DateTimeFormat(this.locale(lang), options);
    }
  },

  /** Script used by a language (routing for transliteration). */
  script(lang) {
    const meta = LANGUAGES.find((l) => l.code === lang) || LANGUAGES[0];
    return meta.script || '';
  },

  /**
   * Company / instrument name in the chosen language:
   *   1. curated spelling (glossary)
   *   2. glossary words + transliteration ("… Limited" -> "… लिमिटेड")
   *   3. the official English name for scripts we cannot transliterate
   */
  instrumentName(symbol, lang, officialName) {
    const curated = Glossary.name(symbol, lang);
    if (curated) return curated;
    if (lang === 'en' || !officialName) return symbol;
    const localised = Localize.company(officialName, lang);
    return localised || officialName || symbol;
  },

  /** Localised sector label ("Financial Services", "Power", …). */
  sectorName(key, lang) {
    if (!key) return '';
    const pack = this.pack(lang);
    const label = pack.sectors && pack.sectors[key];
    if (label) return label;
    return (I18N.en.sectors && I18N.en.sectors[key]) || key;
  },

  /** Indian digit grouping in the language's digits, e.g. 12,34,567.89 */
  number(value, lang, digits = 2) {
    if (value === null || value === undefined || Number.isNaN(value)) return '—';
    return this.numberFormat(lang, digits).format(value);
  },

  int(value, lang) { return this.number(value, lang, 0); },

  /** Price with its currency symbol, e.g. ₹1,234.50 */
  price(value, currency, lang) {
    if (value === null || value === undefined || Number.isNaN(value)) return '—';
    const symbol = CURRENCY_SYMBOLS[currency] || (currency ? `${currency} ` : '');
    return `${symbol}${this.number(value, lang, 2)}`;
  },

  /** Signed number, e.g. +12.30 / −4.10 */
  signed(value, lang, digits = 2) {
    if (value === null || value === undefined || Number.isNaN(value)) return '—';
    const sign = value > 0 ? '+' : value < 0 ? '−' : '';
    return `${sign}${this.number(Math.abs(value), lang, digits)}`;
  },

  signedPercent(value, lang) {
    if (value === null || value === undefined || Number.isNaN(value)) return '—';
    return `${this.signed(value, lang, 2)}%`;
  },

  /** Price move with currency: +₹12.30 / −₹4.10 */
  signedPrice(value, currency, lang) {
    if (value === null || value === undefined || Number.isNaN(value)) return '—';
    const symbol = CURRENCY_SYMBOLS[currency] || (currency ? `${currency} ` : '');
    const sign = value > 0 ? '+' : value < 0 ? '−' : '';
    return `${sign}${symbol}${this.number(Math.abs(value), lang, 2)}`;
  },

  /** Big numbers in the units each language actually uses. */
  compact(value, lang, currency) {
    if (value === null || value === undefined || Number.isNaN(value) || value === 0) return '—';
    const units = this.pack(lang).units;
    const abs = Math.abs(value);
    const inr = currency === 'INR' || !currency;
    const steps = inr
      ? [[1e7, units.crore], [1e5, units.lakh], [1e3, units.thousand]]
      : [[1e9, units.billion], [1e6, units.million], [1e3, units.thousand]];
    for (const [size, unit] of steps) {
      if (abs >= size) {
        const scaled = value / size;
        const digits = Math.abs(scaled) >= 100 ? 0 : Math.abs(scaled) >= 10 ? 1 : 2;
        return `${this.number(scaled, lang, digits)} ${unit}`;
      }
    }
    return this.int(value, lang);
  },

  /** Share volume: "1.23 करोड़ शेयर" */
  volume(value, lang, currency) {
    if (value === null || value === undefined || Number.isNaN(value)) return '—';
    return `${this.compact(value, lang, currency)} ${this.t(lang, 'shares')}`;
  },

  /** Localised date + time. `ms` is a millisecond timestamp. */
  dateTime(ms, lang, offsetSeconds = 0) {
    if (!ms) return '—';
    const shifted = new Date(ms + offsetSeconds * 1000);
    return this.dateFormat(lang, {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      timeZone: 'UTC'
    }).format(shifted);
  },

  /**
   * Chart axis / tooltip label: clock time for intraday ranges, date for
   * longer ones. `seconds` is a Yahoo chart timestamp (epoch seconds).
   * `showDate` adds the day/month to an intraday label, which a multi-day
   * series (e.g. 5D at 30m) needs so its points stay distinguishable.
   */
  axisLabel(seconds, lang, offsetSeconds, intraday, showDate = false) {
    const shifted = new Date((seconds + offsetSeconds) * 1000);
    const options = intraday
      ? { hour: '2-digit', minute: '2-digit', timeZone: 'UTC', ...(showDate ? { day: '2-digit', month: 'short' } : {}) }
      : { day: '2-digit', month: 'short', timeZone: 'UTC' };
    return this.dateFormat(lang, options).format(shifted);
  },

  /** Localised market status text from Yahoo's marketState. */
  marketState(state, lang) {
    return this.t(lang, MARKET_STATE_KEYS[state] || 'marketClosed');
  }
};

/**
 * Turns official (English) company names into the target language by
 * translating the generic words and transliterating the rest:
 *   "Reliance Industries Limited" -> "रिलायंस इंडस्ट्रीज़ लिमिटेड"
 */
const Localize = {
  /** Words to keep as-is (they are already Latin brands/numbers). */
  company(officialName, lang) {
    if (!officialName) return '';
    const script = Format.script(lang);
    if (!script) return officialName; // only for languages with no script mapping

    return String(officialName)
      .split(/(\s+|&|,|\.|\/|-|\(|\))/)
      .map((token) => {
        if (!/^[A-Za-z][A-Za-z'’.]*$/.test(token)) return token;
        const word = token.toLowerCase().replace(/[.']/g, '');
        const translated = Glossary.word(word, lang);
        if (translated) return translated;
        // All-caps tokens are acronyms (HDFC, TCS, ITC), so spell them out in
        // the target script the way they are spoken: HDFC -> एचडीएफसी.
        if (token.length >= 2 && token === token.toUpperCase()) {
          return Translit.acronym(token, lang) || token;
        }
        return Translit.word(token, lang);
      })
      .join('')
      .replace(/\s{2,}/g, ' ')
      .trim();
  },

  /** Short label for an instrument: curated name, else localised official name. */
  short(symbol, lang, officialName) {
    const curated = Glossary.name(symbol, lang);
    if (curated) return curated;
    if (!officialName) return symbol;
    const cleaned = officialName.replace(/\s+(Limited|Ltd\.?)$/i, '');
    if (lang === 'en') return cleaned;
    return this.company(cleaned, lang) || cleaned;
  }
};
