// Text extraction from a PDF that has a text layer, with positions.
// Copied from ventures/submittal-register (2026-11-20) for drawing-set-index; adds
// extractPdfRuns, which keeps every run's size and the page's MediaBox and /Rotate,
// because a sheet's title block is found by where text sits on the sheet.
// Copied from ventures/bank-statement-pdf-to-csv (2026-11-19). One change: a run is "flipped"
// only when its final text matrix (Tm x CTM) is, so a page drawn with a y-down CTM and a
// y-down Tm (Chromium, Skia) still reads top to bottom.
//
// Built on the lenient object scanner in pdf-parser.mjs (copied from the
// pdf-accessibility-tag-check venture). It reads each page's content stream,
// follows the text operators (Tf, Td, TD, Tm, T*, Tj, TJ, ', ") and the
// graphics state's cm/q/Q so that every run of text comes out with an x and a
// "row" position, then groups runs into lines. It does not render anything and
// does no OCR itself: a scanned statement has no text to read, says so, and
// ocr.mjs reads its pictures when the visitor asks.
//
// Fonts: a ToUnicode CMap is used when the font has one (this is what makes
// subset TrueType and Identity-H fonts readable). Without one, a simple font
// is read as Latin-1 with any /Differences glyph names applied, and a
// composite font is reported as unreadable instead of guessed at.

import {
  bytesToBinaryString, scanObjects, findTrailer, expandObjectStreams, decodeStream,
  resolve, isDict, isName, PName, PString, PRef, PDict, parseValue,
} from './pdf-parser.mjs';

// --- CMap -------------------------------------------------------------

function hexToUtf16(hex) {
  let s = '';
  for (let i = 0; i + 3 < hex.length + 1; i += 4) {
    const chunk = hex.slice(i, i + 4);
    if (chunk.length < 4) { s += String.fromCharCode(parseInt(chunk.padEnd(4, '0'), 16)); break; }
    s += String.fromCharCode(parseInt(chunk, 16));
  }
  return s;
}

export function parseCMap(text) {
  const map = new Map();
  let codeLen = 0;
  for (const m of text.matchAll(/begincodespacerange([\s\S]*?)endcodespacerange/g)) {
    for (const h of m[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g)) codeLen = Math.max(codeLen, h[1].length / 2);
  }
  for (const m of text.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const h of m[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]*)>/g)) {
      map.set(parseInt(h[1], 16), hexToUtf16(h[2]));
      if (!codeLen) codeLen = h[1].length / 2;
    }
  }
  for (const m of text.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    const body = m[1];
    const re = /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(?:<([0-9a-fA-F]*)>|\[([^\]]*)\])/g;
    let h;
    while ((h = re.exec(body))) {
      const lo = parseInt(h[1], 16), hi = parseInt(h[2], 16);
      if (!codeLen) codeLen = h[1].length / 2;
      if (hi < lo || hi - lo > 0xffff) continue;
      if (h[3] !== undefined) {
        const base = hexToUtf16(h[3]);
        const lastCode = base.length ? base.charCodeAt(base.length - 1) : 0;
        for (let c = lo; c <= hi; c++) map.set(c, base.slice(0, -1) + String.fromCharCode(lastCode + (c - lo)));
      } else {
        const list = [...(h[4] || '').matchAll(/<([0-9a-fA-F]*)>/g)].map((x) => hexToUtf16(x[1]));
        for (let c = lo; c <= hi && c - lo < list.length; c++) map.set(c, list[c - lo]);
      }
    }
  }
  return { map, codeLen: codeLen || 0 };
}

// A small glyph-name table, enough for /Differences arrays on simple fonts.
const GLYPHS = {
  space: ' ', exclam: '!', quotedbl: '"', numbersign: '#', dollar: '$', percent: '%', ampersand: '&', quotesingle: "'",
  parenleft: '(', parenright: ')', asterisk: '*', plus: '+', comma: ',', hyphen: '-', minus: '-', period: '.', slash: '/',
  zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9',
  colon: ':', semicolon: ';', less: '<', equal: '=', greater: '>', question: '?', at: '@', bracketleft: '[',
  backslash: '\\', bracketright: ']', underscore: '_', grave: '`', braceleft: '{', bar: '|', braceright: '}',
  asciitilde: '~', endash: '–', emdash: '—', bullet: '•', Euro: '€', sterling: '£', yen: '¥', cent: '¢', quoteright: '’',
  quoteleft: '‘', quotedblleft: '“', quotedblright: '”', nbspace: ' ', nonbreakingspace: ' ',
};
// Accented letters by glyph name: "eacute" -> "é", "Udieresis" -> "Ü".
const ACCENTS = { acute: '\u0301', grave: '\u0300', circumflex: '\u0302', dieresis: '\u0308', tilde: '\u0303', cedilla: '\u0327', ring: '\u030a', caron: '\u030c' };
function glyphToChar(name) {
  if (name in GLYPHS) return GLYPHS[name];
  if (/^[A-Za-z]$/.test(name)) return name;
  let m = /^uni([0-9A-Fa-f]{4})$/.exec(name);
  if (m) return String.fromCharCode(parseInt(m[1], 16));
  if ((m = /^([A-Za-z])(acute|grave|circumflex|dieresis|tilde|cedilla|ring|caron)$/.exec(name))) return (m[1] + ACCENTS[m[2]]).normalize('NFC');
  if (name === 'germandbls') return 'ß';
  return null;
}

// WinAnsiEncoding (Windows-1252) differs from Latin-1 only in 0x80-0x9F, which
// holds the euro sign, curly quotes and dashes that statements print. It is
// also the right guess for a simple font that names no encoding.
const WIN_ANSI_HIGH = '€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008dŽ\u008f\u0090‘’“”•–—˜™š›œ\u009džŸ';

// --- Fonts --------------------------------------------------------------

async function loadFont(fontRef, objects, binaryStr, inflate) {
  const font = { cmap: null, codeLen: 1, differences: null, unreadable: false };
  const dict = resolve(fontRef, objects);
  if (!isDict(dict)) return font;
  const composite = isName(dict.get('Subtype'), 'Type0');
  if (composite) font.codeLen = 2;
  font.widths = fontWidths(dict, composite, objects);
  const tu = dict.get('ToUnicode');
  if (tu instanceof PRef) {
    const entry = objects.get(tu.num);
    const data = entry ? await decodeStream(entry, binaryStr, inflate) : null;
    if (data) {
      const cm = parseCMap(bytesToBinaryString(data));
      if (cm.map.size) { font.cmap = cm.map; if (cm.codeLen) font.codeLen = cm.codeLen; }
    }
  }
  if (!font.cmap) {
    if (composite) font.unreadable = true;
    else {
      const enc = resolve(dict.get('Encoding'), objects);
      if (isName(enc, 'MacRomanEncoding') || (isDict(enc) && isName(enc.get('BaseEncoding'), 'MacRomanEncoding'))) font.macRoman = true;
      if (isDict(enc)) {
        const diffs = resolve(enc.get('Differences'), objects);
        if (Array.isArray(diffs)) {
          font.differences = new Map();
          let code = 0;
          for (const d of diffs) {
            if (typeof d === 'number') code = d;
            else if (d instanceof PName) { const ch = glyphToChar(d.name); if (ch !== null) font.differences.set(code, ch); code++; }
          }
        }
      }
    }
  }
  return font;
}

// Glyph widths, in thousandths of the font size, keyed by character code: a
// simple font's /FirstChar and /Widths, a composite font's descendant /W and
// /DW, and Courier's fixed 600. With them a run's real end is known, so two
// runs that are pieces of one word ("1" + "3 J" + "an") can be put back
// together. Without them (the other standard fonts, whose metrics a PDF does
// not carry) the width stays an estimate and no runs are joined.
function fontWidths(dict, composite, objects) {
  const num = (v) => (typeof v === 'number' ? v : null);
  if (composite) {
    const kids = resolve(dict.get('DescendantFonts'), objects);
    const cid = Array.isArray(kids) ? resolve(kids[0], objects) : null;
    if (!isDict(cid)) return null;
    const map = new Map();
    const dw = num(resolve(cid.get('DW'), objects));
    const w = resolve(cid.get('W'), objects);
    if (Array.isArray(w)) {
      for (let i = 0; i < w.length;) {
        const first = num(resolve(w[i], objects));
        const next = resolve(w[i + 1], objects);
        if (first === null) break;
        if (Array.isArray(next)) { next.forEach((x, k) => { const v = num(resolve(x, objects)); if (v !== null) map.set(first + k, v); }); i += 2; continue; }
        const last = num(next), v = num(resolve(w[i + 2], objects));
        if (last === null || v === null || last < first || last - first > 0xffff) break;
        for (let c = first; c <= last; c++) map.set(c, v);
        i += 3;
      }
    }
    if (!map.size && dw === null) return null;
    return { map, missing: dw === null ? 1000 : dw };
  }
  const widths = resolve(dict.get('Widths'), objects);
  const first = num(resolve(dict.get('FirstChar'), objects));
  if (Array.isArray(widths) && first !== null) {
    const map = new Map();
    widths.forEach((x, k) => { const v = num(resolve(x, objects)); if (v !== null) map.set(first + k, v); });
    const fd = resolve(dict.get('FontDescriptor'), objects);
    const mw = isDict(fd) ? num(resolve(fd.get('MissingWidth'), objects)) : null;
    return { map, missing: mw === null ? 0 : mw };
  }
  const base = resolve(dict.get('BaseFont'), objects);
  if (base instanceof PName && /^Courier(-Bold|-Oblique|-BoldOblique)?$/.test(base.name)) return { map: new Map(), missing: 600 };
  return null;
}

/** Width of a string in text space units per unit font size, or null when the font carries no widths. */
function stringWidth(str, font) {
  if (!font || !font.widths) return null;
  const n = font.codeLen || 1;
  let w = 0, spaces = 0;
  for (let i = 0; i + n <= str.length; i += n) {
    let code = 0;
    for (let k = 0; k < n; k++) code = code * 256 + (str.charCodeAt(i + k) & 0xff);
    const g = font.widths.map.get(code);
    w += (g === undefined ? font.widths.missing : g) / 1000;
    if (n === 1 && code === 32) spaces++;
  }
  return { w, glyphs: Math.floor(str.length / n), spaces };
}

function decodeString(str, font) {
  if (!font) return str;
  let out = '';
  if (font.cmap) {
    const n = font.codeLen || 1;
    for (let i = 0; i + n <= str.length; i += n) {
      let code = 0;
      for (let k = 0; k < n; k++) code = code * 256 + (str.charCodeAt(i + k) & 0xff);
      const ch = font.cmap.get(code);
      out += ch === undefined ? (n === 1 ? str[i] : '') : ch;
    }
    return out;
  }
  if (font.unreadable) return '';
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i) & 0xff;
    const d = font.differences ? font.differences.get(code) : undefined;
    out += d !== undefined ? d : code >= 0x80 && code <= 0x9f && !font.macRoman ? WIN_ANSI_HIGH[code - 0x80] : String.fromCharCode(code);
  }
  return out;
}

// --- Content stream -----------------------------------------------------

// Tokenizer for a content stream: yields operands and operators.
// An inline image (BI <dict> ID <bytes> EI) holds binary data that can
// contain "EI", "(" or anything else, so it is skipped by its size when the
// data is unfiltered, and otherwise up to an EI that stands alone between
// white space. (Ghostscript writes drawing hatches as thousands of these.)
function skipInlineImage(str, i) {
  const idm = /\sID[\0\t\n\f\r ]/g;
  idm.lastIndex = i - 1;
  const m = idm.exec(str);
  if (!m) return str.length;
  const dict = str.slice(i, m.index);
  const start = m.index + 4;
  const num = (k) => { const r = new RegExp('/' + k + '\\s+(\\d+)').exec(dict); return r ? Number(r[1]) : null; };
  const w = num('W') ?? num('Width'), h = num('H') ?? num('Height');
  const filtered = /\/(?:F|Filter)\b/.test(dict);
  const mask = /\/(?:IM|ImageMask)\s+true/.test(dict);
  if (!filtered && w && h) {
    const bpc = mask ? 1 : (num('BPC') ?? num('BitsPerComponent') ?? 8);
    const cs = (/\/(?:CS|ColorSpace)\s*\/?(\w+)/.exec(dict) || [])[1] || 'G';
    const comps = mask ? 1 : /^(?:RGB|DeviceRGB|CalRGB)$/.test(cs) ? 3 : /^(?:CMYK|DeviceCMYK)$/.test(cs) ? 4 : 1;
    const end = start + h * Math.ceil((w * comps * bpc) / 8);
    const ei = str.indexOf('EI', end);
    if (ei !== -1 && ei - end < 8) return ei + 2;
  }
  const re = /[\0\t\n\f\r ]EI(?=[\0\t\n\f\r ]|$)/g;
  re.lastIndex = start;
  const e = re.exec(str);
  return e ? e.index + 3 : str.length;
}

// Character classes by char code, so the scan below compares integers
// instead of running a regex and a string search per character (a CAD
// drawing's content stream is megabytes of line-art numbers; perf note
// docs/history/drawing-review-perf-2026-11-26.md).
const TOK_WS = new Uint8Array(256), TOK_DELIM = new Uint8Array(256);
for (const c of [0, 9, 10, 12, 13, 32]) TOK_WS[c] = TOK_DELIM[c] = 1;
for (const ch of '()<>[]{}/%') TOK_DELIM[ch.charCodeAt(0)] = 1;

const POW10 = [1, 1e1, 1e2, 1e3, 1e4, 1e5, 1e6, 1e7, 1e8, 1e9, 1e10, 1e11, 1e12, 1e13, 1e14, 1e15];

// The value of str[i, j) when it matches /^[+-]?(\d+\.?\d*|\.\d+)$/, else
// undefined. Up to 15 digits it is mantissa / 10^k, two exact doubles and
// one correctly rounded division, so the same double parseFloat returns;
// longer numbers go to parseFloat itself.
function numberWord(str, i, j) {
  let k = i, c = str.charCodeAt(k), neg = false;
  if (c === 43 || c === 45) { neg = c === 45; k++; if (k === j) return undefined; }
  let m = 0, digits = 0, frac = 0;
  while (k < j && (c = str.charCodeAt(k)) >= 48 && c <= 57) { m = m * 10 + (c - 48); k++; digits++; }
  if (k < j) {
    if (c !== 46) return undefined;
    k++;
    while (k < j && (c = str.charCodeAt(k)) >= 48 && c <= 57) { m = m * 10 + (c - 48); k++; frac++; }
    if (k !== j) return undefined;
  }
  if (digits + frac === 0) return undefined;
  if (digits + frac > 15) return parseFloat(str.slice(i, j));
  const v = frac ? m / POW10[frac] : m;
  return neg ? -v : v;
}

function* tokens(str) {
  let i = 0;
  const n = str.length;
  while (i < n) {
    const c = str.charCodeAt(i);
    if (c < 256 && TOK_WS[c]) { i++; continue; }
    if (c === 37) { while (i < n && str.charCodeAt(i) !== 10 && str.charCodeAt(i) !== 13) i++; continue; } // %
    if (c === 40 || c === 60 || c === 91 || c === 47) { // ( < [ /
      const [v, next] = parseValue(str, i);
      yield { v };
      i = Math.max(next, i + 1);
      continue;
    }
    let j = i;
    let d;
    while (j < n && ((d = str.charCodeAt(j)) >= 256 || !TOK_DELIM[d])) j++;
    if (j === i) { i++; continue; }
    const num = numberWord(str, i, j);
    if (num !== undefined) { yield { v: num }; i = j; continue; }
    const word = str.slice(i, j);
    i = j;
    if (word === 'BI') i = skipInlineImage(str, i);
    else yield { op: word };
  }
}

function mul(m, n) { // m then n  (row-vector convention used by PDF)
  return [
    m[0] * n[0] + m[1] * n[2], m[0] * n[1] + m[1] * n[3],
    m[2] * n[0] + m[3] * n[2], m[2] * n[1] + m[3] * n[3],
    m[4] * n[0] + m[5] * n[2] + n[4], m[4] * n[1] + m[5] * n[3] + n[5],
  ];
}

export function textRuns(content, fonts, forms = null, startCtm = null, depth = 0, rules = null) {
  const runs = [];
  // Straight horizontal and vertical segments at least 12 pt long that are
  // stroked or filled: the rules of a title block's cells. (Optional: only
  // collected when a `rules` array is passed.)
  let cur = null, sub = null, pending = [];
  const pt = (x, y) => [x * ctm[0] + y * ctm[2] + ctm[4], x * ctm[1] + y * ctm[3] + ctm[5]];
  const seg = (a, b) => {
    if (!rules) return;
    const dx = Math.abs(a[0] - b[0]), dy = Math.abs(a[1] - b[1]);
    if ((dx < 0.5 && dy >= 12) || (dy < 0.5 && dx >= 12)) pending.push([a[0], a[1], b[0], b[1]]);
  };
  let ctm = startCtm ? startCtm.slice() : [1, 0, 0, 1, 0, 0];
  const stack = [];
  let tm = [1, 0, 0, 1, 0, 0], tlm = [1, 0, 0, 1, 0, 0];
  let font = null, fontSize = 10, leading = 0, charSpace = 0, wordSpace = 0, hScale = 1;
  let operands = [];
  const emit = (str) => {
    const text = decodeString(str, font);
    const trm = mul(tm, ctm);
    // Rotated text (a drawing sheet laid sideways on a portrait page) has its
    // scale in the off-diagonal terms, so size and width use vector lengths.
    const sx = Math.hypot(trm[0], trm[1]) || 1, sy = Math.hypot(trm[2], trm[3]) || 1;
    const size = Math.abs(fontSize * sy);
    const angle = Math.round(Math.atan2(trm[1], trm[0]) * 180 / Math.PI);
    const sw = stringWidth(str, font);
    // Advance in text space (PDF 32000-1, 9.4.4): glyph widths times the font
    // size, plus character and word spacing, times horizontal scaling.
    let tx, width;
    if (sw) {
      tx = (sw.w * fontSize + sw.glyphs * charSpace + sw.spaces * wordSpace) * hScale;
      width = Math.abs(tx * sx);
    } else {
      width = size * 0.5 * text.length * Math.abs(tm[0] || 1);
      tx = width / (Math.abs(ctm[0]) || 1);
    }
    if (text !== '') runs.push({ text, x: trm[4], y: trm[5], size, angle, flip: trm[3] < 0, unreadable: Boolean(font && font.unreadable && text === ''), width, exact: Boolean(sw) });
    else if (font && font.unreadable && str.length) runs.push({ text: '', x: trm[4], y: trm[5], size, flip: false, unreadable: true });
    tm = mul([1, 0, 0, 1, tx, 0], tm);
  };
  for (const t of tokens(content)) {
    if (!('op' in t)) { operands.push(t.v); if (operands.length > 64) operands.shift(); continue; }
    const op = t.op;
    const num = (k) => (typeof operands[k] === 'number' ? operands[k] : 0);
    switch (op) {
      case 'q': stack.push(ctm.slice()); break;
      case 'Q': if (stack.length) ctm = stack.pop(); break;
      case 'cm': if (operands.length >= 6) ctm = mul(operands.slice(-6).map((x) => (typeof x === 'number' ? x : 0)), ctm); break;
      case 'BT': tm = [1, 0, 0, 1, 0, 0]; tlm = tm.slice(); break;
      case 'Tf': {
        const nameOp = operands.find((x) => x instanceof PName);
        font = nameOp ? (fonts.get(nameOp.name) || null) : null;
        const sz = operands.filter((x) => typeof x === 'number').pop();
        if (typeof sz === 'number') fontSize = sz;
        break;
      }
      case 'm': if (rules && operands.length >= 2) { cur = sub = pt(num(operands.length - 2), num(operands.length - 1)); } break;
      case 'l': if (rules && cur && operands.length >= 2) { const q = pt(num(operands.length - 2), num(operands.length - 1)); seg(cur, q); cur = q; } break;
      case 'h': if (rules && cur && sub) { seg(cur, sub); cur = sub; } break;
      case 're': if (rules && operands.length >= 4) {
        const [x, y, w, h] = operands.slice(-4).map((v) => (typeof v === 'number' ? v : 0));
        const a = pt(x, y), b = pt(x + w, y), c = pt(x + w, y + h), d = pt(x, y + h);
        // A thin filled rectangle is a rule along its long side.
        const long = Math.hypot(b[0] - a[0], b[1] - a[1]), tall = Math.hypot(d[0] - a[0], d[1] - a[1]);
        if (tall < 2 && long >= 12) seg(a, b); else if (long < 2 && tall >= 12) seg(a, d);
        else { seg(a, b); seg(b, c); seg(c, d); seg(d, a); }
        cur = sub = a;
      } break;
      case 'S': case 's': case 'f': case 'F': case 'f*': case 'B': case 'B*': case 'b': case 'b*':
        if (rules) { for (const r of pending) if (rules.length < 20000) rules.push(r); pending = []; }
        break;
      case 'n': pending = []; break;
      case 'Do': {
        // A Form XObject (a CAD block, a placed title block, a stamp): its
        // text is drawn with its /Matrix times the current CTM.
        const nameOp = operands.find((x) => x instanceof PName);
        const form = forms && nameOp ? forms.get(nameOp.name) : null;
        if (form && depth < 8) {
          const inner = textRuns(form.content, form.fonts, form.forms, mul(form.matrix, ctm), depth + 1, rules);
          for (const r of inner) runs.push(r);
        }
        break;
      }
      case 'TL': leading = num(0); break;
      case 'Tc': charSpace = num(operands.length - 1); break;
      case 'Tw': wordSpace = num(operands.length - 1); break;
      case 'Tz': hScale = num(operands.length - 1) / 100 || 1; break;
      case 'Td': case 'TD': {
        const tx = num(operands.length - 2), ty = num(operands.length - 1);
        if (op === 'TD') leading = -ty;
        tlm = mul([1, 0, 0, 1, tx, ty], tlm); tm = tlm.slice();
        break;
      }
      case 'Tm': if (operands.length >= 6) { tm = operands.slice(-6).map((x) => (typeof x === 'number' ? x : 0)); tlm = tm.slice(); } break;
      case 'T*': tlm = mul([1, 0, 0, 1, 0, -leading], tlm); tm = tlm.slice(); break;
      case 'Tj': { const s = operands[operands.length - 1]; if (s instanceof PString) emit(s.text); break; }
      case "'": case '"': {
        tlm = mul([1, 0, 0, 1, 0, -leading], tlm); tm = tlm.slice();
        const s = operands[operands.length - 1]; if (s instanceof PString) emit(s.text);
        break;
      }
      case 'TJ': {
        const arr = operands[operands.length - 1];
        if (Array.isArray(arr)) {
          let pending = '';
          let kern = 0; // small adjustments inside one run, applied after it
          // With real widths, the spec's text-space shift; without, the earlier estimate.
          const shift = (units) => { tm = mul([1, 0, 0, 1, (-units / 1000) * fontSize * (font && font.widths ? hScale : Math.abs(tm[0]) || 1), 0], tm); };
          const flush = () => { if (pending !== '') { emit(pending); pending = ''; } if (kern) { if (font && font.widths) shift(kern); kern = 0; } };
          for (const el of arr) {
            if (el instanceof PString) pending += el.text;
            else if (typeof el === 'number') {
              if (el < -180) { flush(); shift(el); }
              else if (el !== 0) kern += el; // kerning: keep in the same run
            }
          }
          flush();
        }
        break;
      }
      default: break;
    }
    operands = [];
  }
  return runs;
}

// Runs that touch are pieces of one word or phrase: some PDF writers place
// every few glyphs on their own ("1" + "3 J" + "an" for "13 Jan", "20" + ".00").
// Two runs are joined only when both widths come from the font, the second
// starts within a fifth of the font size of where the first ends, and neither
// is only spaces; a column gap is many times that.
export function joinPieces(items) {
  const out = [];
  for (const it of items) {
    const last = out[out.length - 1];
    if (last && last.exact && it.exact && last.text.trim() && it.text.trim() && Math.abs((it.size || 0) - (last.size || 0)) < 0.5) {
      const gap = it.x - (last.x + last.width);
      const size = it.size || 10;
      if (gap > -0.2 * size && gap < 0.2 * size) {
        out[out.length - 1] = { ...last, text: last.text + it.text, width: it.x + it.width - last.x };
        continue;
      }
    }
    out.push(it);
  }
  return out;
}

// Group runs into lines, top to bottom, items left to right.
export function groupLines(runs, page = 1) {
  if (!runs.length) return [];
  const flip = runs.filter((r) => r.flip).length > runs.length / 2;
  const items = runs.map((r) => ({ ...r, key: flip ? r.y : -r.y }));
  items.sort((a, b) => a.key - b.key || a.x - b.x);
  const lines = [];
  for (const it of items) {
    const last = lines[lines.length - 1];
    const tol = Math.max(1.5, (it.size || 10) * 0.35);
    if (last && Math.abs(last.key - it.key) <= tol) last.items.push(it);
    else lines.push({ key: it.key, items: [it], page });
  }
  const est = (it) => it.x + it.size * 0.5 * it.text.trimEnd().length;
  const out = [];
  for (const l of lines) {
    l.items.sort((a, b) => a.x - b.x);
    // Two pieces of text that cover the same stretch of the line cannot be one
    // line of text: a footer or watermark printed over a row a point or two
    // higher or lower. Split such a group by exact height.
    const overlap = l.items.some((a, i) => l.items.slice(i + 1).some((b) => a.text.trim() && b.text.trim() && b.x < est(a) - a.size * 0.5 && a.x < est(b) - b.size * 0.5));
    const groups = [];
    if (overlap) {
      for (const it of [...l.items].sort((a, b) => a.key - b.key)) {
        const g = groups[groups.length - 1];
        if (g && Math.abs(g.key - it.key) <= 0.5) g.items.push(it);
        else groups.push({ key: it.key, items: [it] });
      }
      groups.forEach((g) => g.items.sort((a, b) => a.x - b.x));
    } else groups.push(l);
    for (const g of groups) {
      out.push({ page: l.page, key: g.key, items: joinPieces(g.items).map((it) => ({ text: it.text.replace(/\u00a0/g, ' '), x: it.x, xEnd: it.exact ? it.x + it.width : it.x + it.size * 0.5 * it.text.length })) });
    }
  }
  return out;
}

// --- Pages --------------------------------------------------------------

function inherited(dict, key, objects) {
  let d = dict;
  for (let i = 0; i < 24 && isDict(d); i++) {
    if (d.has(key)) return resolve(d.get(key), objects);
    d = resolve(d.get('Parent'), objects);
  }
  return null;
}

function pageList(objects, trailer) {
  const pages = [];
  const seen = new Set();
  const walk = (ref, depth) => {
    if (depth > 24) return;
    const num = ref instanceof PRef ? ref.num : null;
    if (num !== null && seen.has(num)) return;
    if (num !== null) seen.add(num);
    const d = resolve(ref, objects);
    if (!isDict(d)) return;
    const kids = resolve(d.get('Kids'), objects);
    if (Array.isArray(kids) && !isName(d.get('Type'), 'Page')) kids.forEach((k) => walk(k, depth + 1));
    else pages.push(d);
  };
  const root = trailer ? resolve(trailer.get('Root'), objects) : null;
  const top = isDict(root) ? root.get('Pages') : null;
  if (top) walk(top, 0);
  if (pages.length) return pages;
  // No usable page tree: fall back to every /Type /Page object in file order.
  return [...objects.entries()].filter(([, e]) => isDict(e.dict) && isName(e.dict.get('Type'), 'Page')).sort((a, b) => a[0] - b[0]).map(([, e]) => e.dict);
}

async function loadFonts(res, objects, binaryStr, inflate, fontCache) {
  const fonts = new Map();
  const fdict = isDict(res) ? resolve(res.get('Font'), objects) : null;
  if (isDict(fdict)) {
    for (const [name, ref] of fdict.map) {
      const key = ref instanceof PRef ? ref.num : null;
      if (key !== null && fontCache.has(key)) { fonts.set(name, fontCache.get(key)); continue; }
      const f = await loadFont(ref, objects, binaryStr, inflate);
      if (key !== null) fontCache.set(key, f);
      fonts.set(name, f);
    }
  }
  return fonts;
}

// Form XObjects named in a resource dictionary, each with its decoded content,
// fonts (its own /Resources, else the parent's), /Matrix and nested forms.
// Images are skipped; a form already on the path is not entered again.
async function loadForms(res, objects, binaryStr, inflate, fontCache, path, depth) {
  const forms = new Map();
  const xdict = isDict(res) ? resolve(res.get('XObject'), objects) : null;
  if (!isDict(xdict) || depth > 6) return forms;
  for (const [name, ref] of xdict.map) {
    const num = ref instanceof PRef ? ref.num : null;
    if (num === null || path.has(num)) continue;
    const entry = objects.get(num);
    if (!entry || !isDict(entry.dict) || !isName(entry.dict.get('Subtype'), 'Form')) continue;
    const data = await decodeStream(entry, binaryStr, inflate);
    if (!data) continue;
    const own = resolve(entry.dict.get('Resources'), objects);
    const r = isDict(own) ? own : res;
    const m = resolve(entry.dict.get('Matrix'), objects);
    const matrix = Array.isArray(m) && m.length === 6 ? m.map((v) => (typeof v === 'number' ? v : 0)) : [1, 0, 0, 1, 0, 0];
    const fonts = await loadFonts(r, objects, binaryStr, inflate, fontCache);
    const next = new Set(path); next.add(num);
    forms.set(name, { content: bytesToBinaryString(data), fonts, matrix, forms: await loadForms(r, objects, binaryStr, inflate, fontCache, next, depth + 1) });
  }
  return forms;
}

/**
 * @param {Uint8Array} bytes
 * @param {(bytes: Uint8Array) => Promise<Uint8Array|null>} inflate
 * @returns {Promise<{pages: {lines: object[]}[], flags: object}>}
 */
export async function extractPdfLines(bytes, inflate, opts = {}) {
  const flags = { notPdf: false, encrypted: false, pageCount: 0, pagesWithText: 0, unreadableFonts: false, undecodable: 0 };
  const binaryStr = bytesToBinaryString(bytes);
  if (!binaryStr.startsWith('%PDF') && !binaryStr.slice(0, 1024).includes('%PDF')) { flags.notPdf = true; return { pages: [], flags }; }
  const objects = scanObjects(binaryStr);
  await expandObjectStreams(objects, binaryStr, inflate);
  const trailer = findTrailer(binaryStr, objects);
  if (trailer && trailer.has('Encrypt')) { flags.encrypted = true; return { pages: [], flags }; }
  const plist = pageList(objects, trailer);
  flags.pageCount = plist.length;
  const fontCache = new Map();
  const out = [];
  let pageNo = 0;
  for (const page of plist) {
    pageNo++;
    const res = inherited(page, 'Resources', objects);
    const fonts = await loadFonts(res, objects, binaryStr, inflate, fontCache);
    const forms = opts.runs ? await loadForms(res, objects, binaryStr, inflate, fontCache, new Set(), 0) : null;
    let contents = page.get('Contents');
    const refs = Array.isArray(contents) ? contents : [contents];
    let text = '';
    for (const r of refs) {
      const ref = r instanceof PRef ? r : null;
      const entry = ref ? objects.get(ref.num) : null;
      if (!entry) continue;
      const data = await decodeStream(entry, binaryStr, inflate);
      if (data) text += bytesToBinaryString(data) + '\n';
      else flags.undecodable++;
    }
    const rules = opts.runs ? [] : null;
    const runs = textRuns(text, fonts, forms, null, 0, rules);
    if (runs.some((r) => r.unreadable)) flags.unreadableFonts = true;
    const kept = runs.filter((r) => r.text !== '');
    if (opts.runs) {
      const box = inherited(page, 'MediaBox', objects);
      const crop = inherited(page, 'CropBox', objects);
      const b = (Array.isArray(crop) && crop.length === 4 ? crop : Array.isArray(box) && box.length === 4 ? box : [0, 0, 612, 792]).map((v) => (typeof v === 'number' ? v : 0));
      const rot = inherited(page, 'Rotate', objects);
      if (kept.length) flags.pagesWithText++;
      out.push({ runs: kept, rules, box: [Math.min(b[0], b[2]), Math.min(b[1], b[3]), Math.max(b[0], b[2]), Math.max(b[1], b[3])], rotate: ((typeof rot === 'number' ? rot : 0) % 360 + 360) % 360 });
      continue;
    }
    const lines = groupLines(kept, pageNo);
    if (lines.length) flags.pagesWithText++;
    out.push({ lines });
  }
  return { pages: out, flags };
}

/** Every page's text runs ({text, x, y, size, width}) with its box and rotation. */
export function extractPdfRuns(bytes, inflate) { return extractPdfLines(bytes, inflate, { runs: true }); }

// Exported for pdf-tokens.test.mjs, which pins the tokenizer to its regex predecessor.
export { tokens };
