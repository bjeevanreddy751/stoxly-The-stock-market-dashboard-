/* ------------------------------------------------------------------
 * translit.js — phonetic transliteration from Latin script into the
 * Indian scripts, so that any of the ~2,300 listed companies can be
 * displayed in Hindi, Kannada, Telugu, Tamil, Malayalam, Bengali,
 * Gujarati, Punjabi or Odia without hand-translating every name.
 *
 * How it works
 *   1. `phonemes()` turns a Latin word into a phoneme stream using
 *      longest-match digraph rules plus a few English spelling rules
 *      (c before e/i/y = s, final silent e, final i is long, …).
 *   2. `render()` writes that stream in the target script using the
 *      consonant + matra (vowel sign) model, with a virama for bare
 *      consonants and anusvara for a nasal before another consonant.
 *
 * Hand-curated spellings (js/glossary.js) always win over this, so the
 * well-known names stay exactly right.
 * ------------------------------------------------------------------ */

const TRANSLIT_SCRIPTS = {
  // ---- Devanagari (Hindi, Marathi) ----
  deva: {
    vowels: { a: 'अ', aa: 'आ', i: 'इ', ii: 'ई', u: 'उ', uu: 'ऊ', e: 'ए', ai: 'ऐ', o: 'ओ', au: 'औ' },
    matras: { a: '', aa: 'ा', i: 'ि', ii: 'ी', u: 'ु', uu: 'ू', e: 'े', ai: 'ै', o: 'ो', au: 'ौ' },
    consonants: {
      k: 'क', kh: 'ख', g: 'ग', gh: 'घ', ng: 'ङ', ch: 'च', chh: 'छ', j: 'ज', jh: 'झ',
      tt: 'ट', tth: 'ठ', dd: 'ड', ddh: 'ढ', nn: 'ण', t: 'त', th: 'थ', d: 'द', dh: 'ध', n: 'न',
      p: 'प', ph: 'फ', b: 'ब', bh: 'भ', m: 'म', y: 'य', r: 'र', l: 'ल', v: 'व', sh: 'श', ss: 'ष', s: 'स', h: 'ह'
    },
    virama: '्', nasal: 'ं'
  },
  // ---- Kannada ----
  knda: {
    vowels: { a: 'ಅ', aa: 'ಆ', i: 'ಇ', ii: 'ಈ', u: 'ಉ', uu: 'ಊ', e: 'ಎ', ai: 'ಐ', o: 'ಒ', au: 'ಔ' },
    matras: { a: '', aa: 'ಾ', i: 'ಿ', ii: 'ೀ', u: 'ು', uu: 'ೂ', e: 'ೆ', ai: 'ೈ', o: 'ೊ', au: 'ೌ' },
    consonants: {
      k: 'ಕ', kh: 'ಖ', g: 'ಗ', gh: 'ಘ', ng: 'ಙ', ch: 'ಚ', chh: 'ಛ', j: 'ಜ', jh: 'ಝ',
      tt: 'ಟ', tth: 'ಠ', dd: 'ಡ', ddh: 'ಢ', nn: 'ಣ', t: 'ತ', th: 'ಥ', d: 'ದ', dh: 'ಧ', n: 'ನ',
      p: 'ಪ', ph: 'ಫ', b: 'ಬ', bh: 'ಭ', m: 'ಮ', y: 'ಯ', r: 'ರ', l: 'ಲ', v: 'ವ', sh: 'ಶ', ss: 'ಷ', s: 'ಸ', h: 'ಹ'
    },
    virama: '್', nasal: 'ಂ'
  },
  // ---- Telugu ----
  telu: {
    vowels: { a: 'అ', aa: 'ఆ', i: 'ఇ', ii: 'ఈ', u: 'ఉ', uu: 'ఊ', e: 'ఎ', ai: 'ఐ', o: 'ఒ', au: 'ఔ' },
    matras: { a: '', aa: 'ా', i: 'ి', ii: 'ీ', u: 'ు', uu: 'ూ', e: 'ె', ai: 'ై', o: 'ొ', au: 'ౌ' },
    consonants: {
      k: 'క', kh: 'ఖ', g: 'గ', gh: 'ఘ', ng: 'ఙ', ch: 'చ', chh: 'ఛ', j: 'జ', jh: 'ఝ',
      tt: 'ట', tth: 'ఠ', dd: 'డ', ddh: 'ఢ', nn: 'ణ', t: 'త', th: 'థ', d: 'ద', dh: 'ధ', n: 'న',
      p: 'ప', ph: 'ఫ', b: 'బ', bh: 'భ', m: 'మ', y: 'య', r: 'ర', l: 'ల', v: 'వ', sh: 'శ', ss: 'ష', s: 'స', h: 'హ'
    },
    virama: '్', nasal: 'ం'
  },
  // ---- Tamil ----
  taml: {
    vowels: { a: 'அ', aa: 'ஆ', i: 'இ', ii: 'ஈ', u: 'உ', uu: 'ஊ', e: 'எ', ai: 'ஐ', o: 'ஒ', au: 'ஔ' },
    matras: { a: '', aa: 'ா', i: 'ி', ii: 'ீ', u: 'ு', uu: 'ூ', e: 'ெ', ai: 'ை', o: 'ொ', au: 'ௌ' },
    consonants: {
      k: 'க', kh: 'க', g: 'க', gh: 'க', ng: 'ங', ch: 'ச', chh: 'ச', j: 'ஜ', jh: 'ஜ',
      tt: 'ட', tth: 'ட', dd: 'ட', ddh: 'ட', nn: 'ண', t: 'த', th: 'த', d: 'த', dh: 'த', n: 'ந',
      p: 'ப', ph: 'ப', b: 'ப', bh: 'ப', m: 'ம', y: 'ய', r: 'ர', l: 'ல', v: 'வ', sh: 'ஷ', ss: 'ஷ', s: 'ஸ', h: 'ஹ'
    },
    virama: '்', nasal: 'ம்', extra: ['ஃ'] // aytham, used in எஃகு (steel)
  },
  // ---- Malayalam ----
  mlym: {
    vowels: { a: 'അ', aa: 'ആ', i: 'ഇ', ii: 'ഈ', u: 'ഉ', uu: 'ഊ', e: 'എ', ai: 'ഐ', o: 'ഒ', au: 'ഔ' },
    matras: { a: '', aa: 'ാ', i: 'ി', ii: 'ീ', u: 'ു', uu: 'ൂ', e: 'െ', ai: 'ൈ', o: 'ൊ', au: 'ൗ' },
    consonants: {
      k: 'ക', kh: 'ഖ', g: 'ഗ', gh: 'ഘ', ng: 'ങ', ch: 'ച', chh: 'ഛ', j: 'ജ', jh: 'ഝ',
      tt: 'ട', tth: 'ഠ', dd: 'ഡ', ddh: 'ഢ', nn: 'ണ', t: 'ത', th: 'ഥ', d: 'ദ', dh: 'ധ', n: 'ന',
      p: 'പ', ph: 'ഫ', b: 'ബ', bh: 'ഭ', m: 'മ', y: 'യ', r: 'ര', l: 'ല', v: 'വ', sh: 'ശ', ss: 'ഷ', s: 'സ', h: 'ഹ'
    },
    virama: '്', nasal: 'ം'
  },
  // ---- Bengali (also used for Assamese) ----
  beng: {
    vowels: { a: 'অ', aa: 'আ', i: 'ই', ii: 'ঈ', u: 'উ', uu: 'ঊ', e: 'এ', ai: 'ঐ', o: 'ও', au: 'ঔ' },
    matras: { a: '', aa: 'া', i: 'ি', ii: 'ী', u: 'ু', uu: 'ূ', e: 'ে', ai: 'ৈ', o: 'ো', au: 'ৌ' },
    consonants: {
      k: 'ক', kh: 'খ', g: 'গ', gh: 'ঘ', ng: 'ঙ', ch: 'চ', chh: 'ছ', j: 'জ', jh: 'ঝ',
      tt: 'ট', tth: 'ঠ', dd: 'ড', ddh: 'ঢ', nn: 'ণ', t: 'ত', th: 'থ', d: 'দ', dh: 'ধ', n: 'ন',
      p: 'প', ph: 'ফ', b: 'ব', bh: 'ভ', m: 'ম', y: 'য', r: 'র', l: 'ল', v: 'ভ', sh: 'শ', ss: 'ষ', s: 'স', h: 'হ'
    },
    virama: '্', nasal: 'ং'
  },
  // ---- Gujarati ----
  gujr: {
    vowels: { a: 'અ', aa: 'આ', i: 'ઇ', ii: 'ઈ', u: 'ઉ', uu: 'ઊ', e: 'એ', ai: 'ઐ', o: 'ઓ', au: 'ઔ' },
    matras: { a: '', aa: 'ા', i: 'િ', ii: 'ી', u: 'ુ', uu: 'ૂ', e: 'ે', ai: 'ૈ', o: 'ો', au: 'ૌ' },
    consonants: {
      k: 'ક', kh: 'ખ', g: 'ગ', gh: 'ઘ', ng: 'ઙ', ch: 'ચ', chh: 'છ', j: 'જ', jh: 'ઝ',
      tt: 'ટ', tth: 'ઠ', dd: 'ડ', ddh: 'ઢ', nn: 'ણ', t: 'ત', th: 'થ', d: 'દ', dh: 'ધ', n: 'ન',
      p: 'પ', ph: 'ફ', b: 'બ', bh: 'ભ', m: 'મ', y: 'ય', r: 'ર', l: 'લ', v: 'વ', sh: 'શ', ss: 'ષ', s: 'સ', h: 'હ'
    },
    virama: '્', nasal: 'ં'
  },
  // ---- Gurmukhi (Punjabi) ----
  guru: {
    vowels: { a: 'ਅ', aa: 'ਆ', i: 'ਇ', ii: 'ਈ', u: 'ਉ', uu: 'ਊ', e: 'ਏ', ai: 'ਐ', o: 'ਓ', au: 'ਔ' },
    matras: { a: '', aa: 'ਾ', i: 'ਿ', ii: 'ੀ', u: 'ੁ', uu: 'ੂ', e: 'ੇ', ai: 'ੈ', o: 'ੋ', au: 'ੌ' },
    consonants: {
      k: 'ਕ', kh: 'ਖ', g: 'ਗ', gh: 'ਘ', ng: 'ਙ', ch: 'ਚ', chh: 'ਛ', j: 'ਜ', jh: 'ਝ',
      tt: 'ਟ', tth: 'ਠ', dd: 'ਡ', ddh: 'ਢ', nn: 'ਣ', t: 'ਤ', th: 'ਥ', d: 'ਦ', dh: 'ਧ', n: 'ਨ',
      p: 'ਪ', ph: 'ਫ', b: 'ਬ', bh: 'ਭ', m: 'ਮ', y: 'ਯ', r: 'ਰ', l: 'ਲ', v: 'ਵ', sh: 'ਸ਼', ss: 'ਸ਼', s: 'ਸ', h: 'ਹ'
    },
    virama: '੍', nasal: 'ੰ'
  },
  // ---- Odia ----
  orya: {
    vowels: { a: 'ଅ', aa: 'ଆ', i: 'ଇ', ii: 'ଈ', u: 'ଉ', uu: 'ଊ', e: 'ଏ', ai: 'ଐ', o: 'ଓ', au: 'ଔ' },
    matras: { a: '', aa: 'ା', i: 'ି', ii: 'ୀ', u: 'ୁ', uu: 'ୂ', e: 'େ', ai: 'ୈ', o: 'ୋ', au: 'ୌ' },
    consonants: {
      k: 'କ', kh: 'ଖ', g: 'ଗ', gh: 'ଘ', ng: 'ଙ', ch: 'ଚ', chh: 'ଛ', j: 'ଜ', jh: 'ଝ',
      tt: 'ଟ', tth: 'ଠ', dd: 'ଡ', ddh: 'ଢ', nn: 'ଣ', t: 'ତ', th: 'ଥ', d: 'ଦ', dh: 'ଧ', n: 'ନ',
      p: 'ପ', ph: 'ଫ', b: 'ବ', bh: 'ଭ', m: 'ମ', y: 'ଯ', r: 'ର', l: 'ଲ', v: 'ଵ', sh: 'ଶ', ss: 'ଷ', s: 'ସ', h: 'ହ'
    },
    virama: '୍', nasal: 'ଂ'
  },
  // ---- Arabic script (Sindhi, Kashmiri, Urdu) ----
  // Arabic is an abjad, so short vowels are dropped (matra = '') and long
  // ones written with their letter. Sindhi-retroflex letters are used where
  // they exist, otherwise standard Arabic letters.
  arab: {
    vowels: { a: 'ا', aa: 'آ', i: 'ا', ii: 'ي', u: 'و', uu: 'و', e: 'ا', ai: 'اي', o: 'و', au: 'او', oi: 'اي' },
    matras: { a: '', aa: 'ا', i: '', ii: 'ي', u: '', uu: 'و', e: '', ai: 'ي', o: '', au: 'و', oi: 'ي' },
    consonants: {
      k: 'ك', kh: 'خ', g: 'گ', gh: 'غ', ng: 'نگ', ch: 'چ', chh: 'چ', j: 'ج', jh: 'ج',
      tt: 'ٽ', tth: 'ٺ', dd: 'ڊ', ddh: 'ڏ', nn: 'ڻ', t: 'ت', th: 'ٿ', d: 'د', dh: 'ڌ', n: 'ن',
      p: 'پ', ph: 'ف', b: 'ب', bh: 'ڀ', m: 'م', y: 'ي', r: 'ر', l: 'ل', v: 'و', sh: 'ش', ss: 'ص', s: 'س', h: 'ه'
    },
    virama: '', nasal: 'ن',
    // Curated Urdu/Sindhi words in the glossary use the wider Arabic block
    // (ڊ ٽ ی …), so accept the whole range rather than only mapped letters.
    range: /[\u0600-\u06FF\u0750-\u077F]/
  },
  // ---- Ol Chiki (Santali) ----
  // An alphabet with an inherent 'a', so consonants need no virama and the
  // long/other vowels are written as their own letters.
  olck: {
    vowels: { a: 'ᱚ', aa: 'ᱟ', i: 'ᱤ', ii: 'ᱤ', u: 'ᱩ', uu: 'ᱩ', e: 'ᱮ', ai: 'ᱮ', o: 'ᱳ', au: 'ᱳ', oi: 'ᱳ' },
    matras: { a: '', aa: 'ᱟ', i: 'ᱤ', ii: 'ᱤ', u: 'ᱩ', uu: 'ᱩ', e: 'ᱮ', ai: 'ᱮ', o: 'ᱳ', au: 'ᱳ', oi: 'ᱳ' },
    consonants: {
      k: 'ᱠ', kh: 'ᱠ', g: 'ᱜ', gh: 'ᱜ', ng: 'ᱝ', ch: 'ᱪ', chh: 'ᱪ', j: 'ᱡ', jh: 'ᱡ',
      tt: 'ᱴ', tth: 'ᱴ', dd: 'ᱰ', ddh: 'ᱰ', nn: 'ᱬ', t: 'ᱛ', th: 'ᱛ', d: 'ᱫ', dh: 'ᱫ', n: 'ᱱ',
      p: 'ᱯ', ph: 'ᱯ', b: 'ᱵ', bh: 'ᱵ', m: 'ᱢ', y: 'ᱭ', r: 'ᱨ', l: 'ᱞ', v: 'ᱶ', sh: 'ᱥ', ss: 'ᱥ', s: 'ᱥ', h: 'ᱦ'
    },
    virama: '', nasal: 'ᱸ', extra: ['ᱲ', 'ᱷ'],
    range: /[\u1C50-\u1C7F]/
  }
};

/* --------------------------- phoneme rules -------------------------- */

/** Longest-match first: digraphs, then English spelling tweaks, then letters. */
const LATIN_DIGRAPHS = [
  ['sch', 'sh'], ['tch', 'ch'], ['chh', 'chh'], ['ck', 'k'], ['qu', 'kv'],
  ['kh', 'kh'], ['gh', 'gh'], ['ch', 'ch'], ['sh', 'sh'], ['zh', 'j'], ['ph', 'ph'],
  ['th', 'th'], ['bh', 'bh'], ['dh', 'dh'], ['jh', 'jh'], ['ng', 'ng'],
  ['tt', 'tt'], ['dd', 'dd'], ['nn', 'nn'], ['ll', 'l'], ['pp', 'p'], ['rr', 'r'],
  ['ss', 's'], ['mm', 'm'], ['bb', 'b'], ['gg', 'g'], ['ff', 'ph'], ['zz', 'j'],
  ['aa', 'aa'], ['ee', 'ii'], ['ii', 'ii'], ['oo', 'uu'], ['uu', 'uu'],
  ['ai', 'ai'], ['au', 'au'], ['ay', 'ai'], ['ey', 'ai'], ['oi', 'oi'], ['oy', 'oi'],
  ['oa', 'uu'], ['ou', 'au'], ['ow', 'au'], ['ie', 'i'], ['ea', 'ii']
];

const VOWELS = { a: 'a', e: 'e', i: 'i', o: 'o', u: 'u' };

/**
 * English letter names as phonemes, so an acronym is spelled out the way it
 * is spoken: HDFC -> एचडीएफसी, rather than the unreadable एच्ड्फ्च.
 */
const LATIN_LETTERS = {
  a: ['e', 'y'], b: ['b', 'ii'], c: ['s', 'ii'], d: ['dd', 'ii'], e: ['ii'],
  f: ['e', 'ph'], g: ['j', 'ii'], h: ['e', 'ch'], i: ['aa', 'ii'], j: ['j', 'e', 'y'],
  k: ['k', 'e', 'y'], l: ['e', 'l'], m: ['e', 'm'], n: ['e', 'n'], o: ['o'],
  p: ['p', 'ii'], q: ['k', 'y', 'uu'], r: ['aa', 'r'], s: ['e', 's'], t: ['tt', 'ii'],
  u: ['y', 'uu'], v: ['v', 'ii'], w: ['dd', 'a', 'b', 'l', 'y', 'uu'],
  x: ['e', 'k', 's'], y: ['v', 'aa', 'y'], z: ['j', 'e', 'dd']
};

/**
 * Words whose spelling does not follow the generic rules (vowel length,
 * the retroflex t of "Tata", silent letters). Matched case-insensitively.
 * Native-language spellings verified against Indian business press.
 */
const PHONEME_OVERRIDES = {
  one: ['o', 'n'], two: ['tt', 'u'], three: ['th', 'r', 'ii'], four: ['ph', 'o', 'r'],
  five: ['ph', 'ai', 'v'], seven: ['s', 'e', 'v', 'a', 'n'], nine: ['n', 'ai', 'n'],
  tata: ['tt', 'aa', 'tt', 'aa'],
  bajaj: ['b', 'a', 'j', 'aa', 'j'],
  airtel: ['e', 'y', 'a', 'r', 'a', 'tt', 'e', 'l'],
  reliance: ['r', 'i', 'l', 'aa', 'y', 'a', 'n', 's'],
  suzuki: ['s', 'u', 'j', 'u', 'k', 'ii'],
  gujarat: ['g', 'u', 'j', 'aa', 'r', 'aa', 'tt'],
  maruti: ['m', 'a', 'r', 'u', 'tt', 'ii'],
  hindustan: ['h', 'i', 'n', 'd', 'u', 's', 'tt', 'aa', 'n'],
  wipro: ['v', 'i', 'p', 'r', 'o']
};

/** Convert one Latin word into a phoneme list. */
function latinPhonemes(word) {
  const lower = word.toLowerCase();
  if (PHONEME_OVERRIDES[lower]) return PHONEME_OVERRIDES[lower].slice();

  const phonemes = [];
  let i = 0;
  const isVowelChar = (c) => c === 'a' || c === 'e' || c === 'i' || c === 'o' || c === 'u';

  while (i < lower.length) {
    const rest = lower.slice(i);

    // silent final 'e' (Reliance, More, Prime)
    if (rest === 'e' && lower.length > 3 && !isVowelChar(lower[i - 1])) { i += 1; continue; }

    // English soft c / g before e, i, y
    const soft = /^[cgy][eiy]/.test(rest);

    let matched = false;
    for (const [pattern, phoneme] of LATIN_DIGRAPHS) {
      if (rest.startsWith(pattern)) {
        phonemes.push(phoneme);
        i += pattern.length;
        matched = true;
        break;
      }
    }
    if (matched) continue;

    const char = lower[i];
    if (soft && char === 'c') phonemes.push('s');
    else if (soft && char === 'g') phonemes.push('j');
    else if (VOWELS[char]) phonemes.push(VOWELS[char]);
    else if (char === 'y') phonemes.push(i === 0 || isVowelChar(lower[i - 1]) ? 'y' : 'ii');
    else if (char === 'c') phonemes.push('k');
    else if (char === 'x') { phonemes.push('k'); phonemes.push('s'); }
    else if (char === 'w') phonemes.push('v');
    else if (char === 'z') phonemes.push('j');
    else if (char === 'f') phonemes.push('ph');
    else if (char === 't') phonemes.push('tt');
    else if ('kgjdnpbmrlshv'.includes(char)) phonemes.push(char);
    else if (char === 'q') phonemes.push('k');
    else if (char !== '\u2019' && char !== "'") phonemes.push(char);
    i += 1;
  }

  // word-final 'i' is usually long (Suzuki, Capri)
  if (phonemes[phonemes.length - 1] === 'i') phonemes[phonemes.length - 1] = 'ii';
  return phonemes;
}

/** Write a phoneme list in the given script. */
function renderPhonemes(phonemes, script) {
  const out = [];
  let i = 0;

  while (i < phonemes.length) {
    const phoneme = phonemes[i];

    if (script.consonants[phoneme]) {
      const next = phonemes[i + 1];
      // nasal before another consonant becomes anusvara (Indus -> इंडस)
      if ((phoneme === 'n' || phoneme === 'm') && next && script.consonants[next]) {
        out.push(script.nasal);
        i += 1;
      } else if (next && script.matras[next] !== undefined) {
        out.push(script.consonants[phoneme]);
        if (script.matras[next]) out.push(script.matras[next]);
        i += 2;
      } else {
        out.push(script.consonants[phoneme]);
        i += 1;
        // a trailing consonant keeps its virama, mid-word consonants too
        if (i < phonemes.length || script.virama) out.push(script.virama);
      }
    } else if (script.vowels[phoneme] !== undefined) {
      out.push(script.vowels[phoneme]);
      i += 1;
    } else {
      i += 1;
    }
  }

  // tidy up: no trailing virama, no doubled viramas
  let text = out.join('');
  if (script.virama) {
    while (text.endsWith(script.virama)) text = text.slice(0, -script.virama.length);
    text = text.split(script.virama + script.virama).join(script.virama);
  }
  return text;
}

const Translit = {
  scripts: TRANSLIT_SCRIPTS,

  /** Which script a language uses ('' = keep Latin). */
  scriptFor(lang) {
    const map = {
      hi: 'deva', mr: 'deva', kn: 'knda', te: 'telu', ta: 'taml', ml: 'mlym',
      bn: 'beng', as: 'beng', gu: 'gujr', pa: 'guru', or: 'orya',
      // Added when the scheduled-language set was completed.
      kok: 'deva', mai: 'deva', doi: 'deva', brx: 'deva', sa: 'deva',
      mni: 'beng',
      sd: 'arab', ks: 'arab', ur: 'arab', sat: 'olck'
    };
    return map[lang] || '';
  },

  /** Spell an all-caps acronym letter-by-letter in the target script. */
  acronym(word, lang) {
    const script = TRANSLIT_SCRIPTS[this.scriptFor(lang)];
    if (!script) return word;
    const rendered = [...String(word)].map((ch) => {
      const phonemes = LATIN_LETTERS[ch.toLowerCase()];
      if (!phonemes) return ch;
      return renderPhonemes(phonemes, script) || ch;
    }).join('');
    return rendered || word;
  },

  /** Transliterate a single Latin word. */
  word(word, lang) {
    const script = TRANSLIT_SCRIPTS[this.scriptFor(lang)];
    if (!script) return word;
    if (!/[A-Za-z]/.test(word)) return word;
    const phonemes = latinPhonemes(word);
    const rendered = renderPhonemes(phonemes, script);
    return rendered || word;
  },

  /** Transliterate a phrase, preserving numbers, punctuation and separators. */
  text(value, lang) {
    if (!value) return '';
    if (!this.scriptFor(lang)) return value;
    return String(value)
      .split(/(\s+|&|,|\.|\/|-|\()/g)
      .map((chunk) => (/^[A-Za-z][A-Za-z'’]*$/.test(chunk) ? this.word(chunk, lang) : chunk))
      .join('');
  },

  /**
   * Character range check used by the tests: true when the text uses only
   * the target script (Latin brand tokens such as "3M" are allowed).
   */
  isScriptText(value, lang) {
    const script = TRANSLIT_SCRIPTS[this.scriptFor(lang)];
    if (!script) return true;
    const allowed = new Set([
      ...Object.values(script.vowels), ...Object.values(script.matras),
      ...Object.values(script.consonants), ...(script.extra || []),
      script.virama, script.nasal, ' ', '&', ',', '.', '-', '(', ')'
    ]);
    return [...value].every((char) => allowed.has(char) || /[A-Za-z0-9]/.test(char)
      || (script.range && script.range.test(char)));
  },

  /** Exposed for unit tests. */
  phonemes: latinPhonemes
};
