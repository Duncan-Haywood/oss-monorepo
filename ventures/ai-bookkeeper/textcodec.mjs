// Bytes of a downloaded statement to text. Excel's "Unicode Text" save and
// some bank portals write UTF-16 (with a BOM, or without one), and many older
// bank files are Windows-1252; reading either as UTF-8 gives garbled columns
// and no rows. Runs in Node and in the page (TextDecoder is in both).

export function decodeBytes(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
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

// Not UTF-8: a single-byte code page, and the bytes alone do not say which.
// Windows-1252 stays the default (western Europe, the Nordics, the US). Two
// others are chosen only on bytes that are almost never text in 1252:
// - 1257 (Baltic): 0xF0/0xFE/0xD0/0xDE are Lithuanian and Latvian s/z with a
//   caron, but in 1252 they are eth and thorn; Icelandic uses those too, so
//   any 1252 a/i/u/y-acute (0xE1, 0xED, 0xFA, 0xFD) keeps 1252.
// - 1250 (Central Europe): 0xB9/0xB3/0xBF (Polish a-ogonek, l-stroke, z-dot)
//   are superscripts and an inverted question mark in 1252, and 0xEC with
//   0xF8 (Czech e-caron, r-caron) are i-grave and o-slash, which no
//   Italian or Danish text has together; 0x8D/0x8F/0x9D are unused in 1252.
// Only one of the two is tried; a guess that turns out wrong reads as the
// same garbled text 1252 gave before, so nothing is lost.
function legacy(b) {
  const c = new Map();
  for (let i = 0; i < b.length; i++) if (b[i] >= 0x80) c.set(b[i], (c.get(b[i]) || 0) + 1);
  const has = (...xs) => xs.reduce((n, x) => n + (c.get(x) || 0), 0);
  let enc = "windows-1252";
  if (has(0xf0, 0xfe, 0xd0, 0xde) > 0 && has(0xe1, 0xed, 0xfa, 0xfd) === 0) enc = "windows-1257";
  else if (has(0xb9, 0xb3, 0xbf, 0x8d, 0x8f, 0x9d) > 0 || (has(0xec) > 0 && has(0xf8) > 0)) enc = "windows-1250";
  if (enc !== "windows-1252") {
    try { return new TextDecoder(enc).decode(b); } catch { /* runtime lacks the table */ }
  }
  return win1252(b);
}

// 0x80-0x9F differ from Latin-1 (euro sign, curly quotes, dashes); a runtime
// built without full ICU decodes them as control characters, so map them here.
const HIGH = "\u20ac\u0081\u201a\u0192\u201e\u2026\u2020\u2021\u02c6\u2030\u0160\u2039\u0152\u008d\u017d\u008f\u0090\u2018\u2019\u201c\u201d\u2022\u2013\u2014\u02dc\u2122\u0161\u203a\u0153\u009d\u017e\u0178";
function win1252(b) {
  let out = "";
  for (let i = 0; i < b.length; i++) out += b[i] >= 0x80 && b[i] < 0xa0 ? HIGH[b[i] - 0x80] : String.fromCharCode(b[i]);
  return out;
}
