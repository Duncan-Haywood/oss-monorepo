// Bytes of a downloaded statement to text. Excel's "Unicode Text" save and
// some bank portals write UTF-16 (with a BOM, or without one), and many older
// bank files are Windows-1252; reading either as UTF-8 gives garbled columns
// and no rows. Runs in Node and in the page (TextDecoder is in both).

export function decodeBytes(bytes, encoding) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  // A caller who knows the codepage (a --encoding flag, a picker) wins.
  if (encoding) return new TextDecoder(encoding).decode(b);
  const dec = (enc, from = 0) => new TextDecoder(enc).decode(b.subarray(from));
  if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) return dec("utf-8", 3);
  if (b[0] === 0xff && b[1] === 0xfe) return dec("utf-16le", 2);
  if (b[0] === 0xfe && b[1] === 0xff) return dec("utf-16be", 2);
  // No BOM: ASCII-heavy text in UTF-16 has a zero in every other byte.
  const n = Math.min(b.length, 400);
  let even = 0, odd = 0;
  for (let i = 0; i < n; i++) if (b[i] === 0) (i % 2 ? odd++ : even++);
  if (n >= 8 && odd > n * 0.3 && even === 0) return dec("utf-16le");
  if (n >= 8 && even > n * 0.3 && odd === 0) return dec("utf-16be");
  try { return new TextDecoder("utf-8", { fatal: true }).decode(b); }
  catch { return legacy(b); }
}

// Not UTF-8 and no BOM: a single-byte codepage. Windows-1252 is the default;
// two cases are told apart from it by evidence in the bytes themselves:
//  - a LITAS-ESIS .acc file (Lithuanian banks) starts "000<tab>YYYYMMDD<tab>"
//    in plain ASCII and is Windows-1257 (ą č ę ė į š ų ū ž);
//  - Cyrillic in Windows-1251 reads, as 1252, as words made only of accented
//    Latin letters (ïðèâåò); several such words in a row are not Western text.
// Otherwise Baltic (1257) and Central European (1250) text is told from 1252
// by `byLetters` below; pass the encoding explicitly when it guesses wrong.
function legacy(b) {
  const latin = win1252(b);
  if (/^000\t\d{8}\t/.test(latin)) return new TextDecoder("windows-1257").decode(b);
  const highWords = latin.match(/[\u00c0-\u00ff]{4,}/g) || [];
  const mixedWords = latin.match(/[A-Za-z]+[\u00c0-\u00ff]+[A-Za-z]*/g) || [];
  if (highWords.length >= 3 && highWords.length > mixedWords.length) return new TextDecoder("windows-1251").decode(b);
  return byLetters(b, latin);
}

// Each candidate is scored by the bytes it decodes to a native letter where
// 1252 gives something else, less those where 1252 gives a letter and it gives
// a symbol or a non-native letter; 1252 wins ties, so Western files are unchanged.
const NATIVE = {
  "windows-1257": "ąčęėįšųūžāēģīķļņō\u0100\u0112\u0122\u012a\u0136\u013b\u0145\u014c\u0160\u017d\u0104\u010c\u0118\u0116\u012e\u0172\u016a",
  "windows-1250": "ěščřžťďňůľĺŕłąęśźżćńőűĚŠČŘŽŤĎŇŮĽŁĄĘŚŹŻĆŃŐŰ",
};
function byLetters(b, latin) {
  let best = "", top = 0;
  for (const [enc, letters] of Object.entries(NATIVE)) {
    const t = new TextDecoder(enc).decode(b);
    if (t.length !== latin.length) continue;
    let score = 0;
    for (let i = 0; i < latin.length; i++) {
      if (!/\p{L}/u.test(t[i]) && t[i].charCodeAt(0) > 127 && /\p{L}/u.test(latin[i])) score -= 2;
      if (t[i] === latin[i]) continue;
      if (letters.includes(t[i])) score++;
      else if (/\p{L}/u.test(latin[i])) score--;
    }
    if (score > top) { top = score; best = enc; }
  }
  return top > 0 ? new TextDecoder(best).decode(b) : latin;
}

// 0x80-0x9F differ from Latin-1 (euro sign, curly quotes, dashes); a runtime
// built without full ICU decodes them as control characters, so map them here.
const HIGH = "\u20ac\u0081\u201a\u0192\u201e\u2026\u2020\u2021\u02c6\u2030\u0160\u2039\u0152\u008d\u017d\u008f\u0090\u2018\u2019\u201c\u201d\u2022\u2013\u2014\u02dc\u2122\u0161\u203a\u0153\u009d\u017e\u0178";
function win1252(b) {
  let out = "";
  for (let i = 0; i < b.length; i++) out += b[i] >= 0x80 && b[i] < 0xa0 ? HIGH[b[i] - 0x80] : String.fromCharCode(b[i]);
  return out;
}
