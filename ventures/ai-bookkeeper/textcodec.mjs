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

// 0x80-0x9F differ from Latin-1 (euro sign, curly quotes, dashes); a runtime
// built without full ICU decodes them as control characters, so map them here.
const HIGH = "\u20ac\u0081\u201a\u0192\u201e\u2026\u2020\u2021\u02c6\u2030\u0160\u2039\u0152\u008d\u017d\u008f\u0090\u2018\u2019\u201c\u201d\u2022\u2013\u2014\u02dc\u2122\u0161\u203a\u0153\u009d\u017e\u0178";
function win1252(b) {
  let out = "";
  for (let i = 0; i < b.length; i++) out += b[i] >= 0x80 && b[i] < 0xa0 ? HIGH[b[i] - 0x80] : String.fromCharCode(b[i]);
  return out;
}

// A non-UTF-8 file with high bytes is Windows-1252 unless its letters say
// otherwise: Lithuanian, Latvian and Estonian banks write Windows-1257, Czech,
// Polish, Slovak and Hungarian banks Windows-1250. Each candidate is scored by
// the bytes it decodes to a native letter where Windows-1252 gives something
// else, less those where 1252 gives a Western letter and it does not; 1252 wins ties, so Western files are unchanged.
const NATIVE = {
  "windows-1257": "ąčęėįšųūžāēģīķļņō\u0100\u0112\u0122\u012a\u0136\u013b\u0145\u014c\u0160\u017d\u0104\u010c\u0118\u0116\u012e\u0172\u016a",
  "windows-1250": "ěščřžťďňůľĺŕłąęśźżćńőűĚŠČŘŽŤĎŇŮĽŁĄĘŚŹŻĆŃŐŰ",
};
function legacy(b) {
  const w = win1252(b);
  let best = "", top = 0, west = 0;
  for (const [enc, letters] of Object.entries(NATIVE)) {
    const t = new TextDecoder(enc).decode(b);
    if (t.length !== w.length) continue;
    let score = 0, lost = 0;
    for (let i = 0; i < w.length; i++) {
      if (!/\p{L}/u.test(t[i]) && t[i].charCodeAt(0) > 127 && /\p{L}/u.test(w[i])) lost += 2;
      if (t[i] === w[i]) continue;
      if (letters.includes(t[i])) score++;
      else if (/\p{L}/u.test(w[i])) lost++;
    }
    if (score - lost > top) { top = score - lost; best = enc; }
  }
  return top > west ? new TextDecoder(best).decode(b) : w;
}
