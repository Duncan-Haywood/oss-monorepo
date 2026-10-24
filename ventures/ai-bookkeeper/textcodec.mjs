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
//  - otherwise single bytes that are almost never text in 1252: 0xF0/0xFE/0xD0/
//    0xDE (Baltic s/z with caron; eth and thorn in 1252, which Icelandic also
//    uses, so any acute a/i/u/y keeps 1252) pick 1257; 0xB9/0xB3/0xBF (Polish
//    a-ogonek, l-stroke, z-dot) or i-grave with o-slash (Czech e/r-caron; no
//    Italian or Danish text has both) pick 1250; so do s/z with caron and t/z
//    with acute (0x8a 0x8e 0x9a 0x9e 0x8d 0x8f 0x9d: Czech, Slovak, Slovene,
//    Croatian names; Western bank text does not use them).
// A text with none of these letters is read as 1252; pass the encoding then.
function legacy(b) {
  const latin = win1252(b);
  const east = eastAsian(b);
  if (east) return east;
  if (/^000\t\d{8}\t/.test(latin)) return new TextDecoder("windows-1257").decode(b);
  const highWords = latin.match(/[\u00c0-\u00ff]{4,}/g) || [];
  const mixedWords = latin.match(/[A-Za-z]+[\u00c0-\u00ff]+[A-Za-z]*/g) || [];
  if (highWords.length >= 3 && highWords.length > mixedWords.length) return new TextDecoder("windows-1251").decode(b);
  const c = new Map();
  for (let i = 0; i < b.length; i++) if (b[i] >= 0x80) c.set(b[i], (c.get(b[i]) || 0) + 1);
  const has = (...xs) => xs.reduce((n, x) => n + (c.get(x) || 0), 0);
  if (has(0xf0, 0xfe, 0xd0, 0xde) > 0 && has(0xe1, 0xed, 0xfa, 0xfd) === 0) return new TextDecoder("windows-1257").decode(b);
  if (has(0x8a, 0x8d, 0x8e, 0x8f, 0x9a, 0x9d, 0x9e) > 0 || has(0xb9, 0xb3, 0xbf) > 0 || (has(0xec) > 0 && has(0xf8) > 0)) return new TextDecoder("windows-1250").decode(b);
  return latin;
}

// Japanese (Shift_JIS), Simplified Chinese (GBK) and Korean (EUC-KR) bank
// files are usually not UTF-8. Their double-byte pairs also decode as Western
// letters ("é" before a letter is a valid Shift_JIS pair), so a codepage is
// taken only when the bytes decode cleanly in it AND the text carries one of
// that language's statement column names, which Western text never does.
const EAST = [
  ["shift_jis", /取引日|摘要|日付|残高|金額|入金|出金|お取引内容|年月日/],
  ["gbk", /交易日期|记账日期|交易时间|摘要|余额|支出|收入|借方发生额|贷方发生额|交易金额|对方户名/],
  ["euc-kr", /거래일자|거래일시|적요|잔액|출금|입금|거래내용|거래금액/],
];
function eastAsian(b) {
  let hi = 0;
  for (let i = 0; i < b.length && hi < 4; i++) if (b[i] >= 0x80) hi++;
  if (hi < 4) return null;
  for (const [enc, words] of EAST) {
    try {
      const t = new TextDecoder(enc, { fatal: true }).decode(b);
      if (words.test(t)) return t;
    } catch { /* not this codepage */ }
  }
  return null;
}

// 0x80-0x9F differ from Latin-1 (euro sign, curly quotes, dashes); a runtime
// built without full ICU decodes them as control characters, so map them here.
const HIGH = "\u20ac\u0081\u201a\u0192\u201e\u2026\u2020\u2021\u02c6\u2030\u0160\u2039\u0152\u008d\u017d\u008f\u0090\u2018\u2019\u201c\u201d\u2022\u2013\u2014\u02dc\u2122\u0161\u203a\u0153\u009d\u017e\u0178";
function win1252(b) {
  let out = "";
  for (let i = 0; i < b.length; i++) out += b[i] >= 0x80 && b[i] < 0xa0 ? HIGH[b[i] - 0x80] : String.fromCharCode(b[i]);
  return out;
}
