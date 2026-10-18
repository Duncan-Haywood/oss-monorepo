// Text extraction from a PDF that has a text layer, with positions.
//
// Built on the lenient object scanner in pdf-parser.mjs (copied from the
// pdf-accessibility-tag-check venture). It reads each page's content stream,
// follows the text operators (Tf, Td, TD, Tm, T*, Tj, TJ, ', ") and the
// graphics state's cm/q/Q so that every run of text comes out with an x and a
// "row" position, then groups runs into lines. It does not render anything and
// does not do OCR: a scanned statement has no text to read, and says so.
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
function glyphToChar(name) {
  if (name in GLYPHS) return GLYPHS[name];
  if (/^[A-Za-z]$/.test(name)) return name;
  let m = /^uni([0-9A-Fa-f]{4})$/.exec(name);
  if (m) return String.fromCharCode(parseInt(m[1], 16));
  return null;
}

// --- Fonts --------------------------------------------------------------

async function loadFont(fontRef, objects, binaryStr, inflate) {
  const font = { cmap: null, codeLen: 1, differences: null, unreadable: false };
  const dict = resolve(fontRef, objects);
  if (!isDict(dict)) return font;
  const composite = isName(dict.get('Subtype'), 'Type0');
  if (composite) font.codeLen = 2;
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
    out += d !== undefined ? d : String.fromCharCode(code);
  }
  return out;
}

// --- Content stream -----------------------------------------------------

// Tokenizer for a content stream: yields operands and operators.
function* tokens(str) {
  let i = 0;
  const n = str.length;
  const WS = /[\0\t\n\f\r ]/;
  while (i < n) {
    const c = str[i];
    if (WS.test(c)) { i++; continue; }
    if (c === '%') { while (i < n && str[i] !== '\n' && str[i] !== '\r') i++; continue; }
    if (c === '(' || c === '<' || c === '[' || c === '/') {
      if (c === '<' && str[i + 1] === '<') { const [v, next] = parseValue(str, i); yield { v }; i = Math.max(next, i + 1); continue; }
      const [v, next] = parseValue(str, i);
      yield { v: c === '(' || c === '<' ? v : v };
      i = Math.max(next, i + 1);
      continue;
    }
    let j = i;
    while (j < n && !WS.test(str[j]) && !'()<>[]{}/%'.includes(str[j])) j++;
    if (j === i) { i++; continue; }
    const word = str.slice(i, j);
    i = j;
    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(word)) yield { v: parseFloat(word) };
    else if (word === 'BI') {
      const end = str.indexOf('EI', i);
      i = end === -1 ? n : end + 2;
    } else yield { op: word };
  }
}

function mul(m, n) { // m then n  (row-vector convention used by PDF)
  return [
    m[0] * n[0] + m[1] * n[2], m[0] * n[1] + m[1] * n[3],
    m[2] * n[0] + m[3] * n[2], m[2] * n[1] + m[3] * n[3],
    m[4] * n[0] + m[5] * n[2] + n[4], m[4] * n[1] + m[5] * n[3] + n[5],
  ];
}

export function textRuns(content, fonts) {
  const runs = [];
  let ctm = [1, 0, 0, 1, 0, 0];
  const stack = [];
  let tm = [1, 0, 0, 1, 0, 0], tlm = [1, 0, 0, 1, 0, 0];
  let font = null, fontSize = 10, leading = 0;
  let operands = [];
  const emit = (str) => {
    const text = decodeString(str, font);
    const trm = mul(tm, ctm);
    const size = Math.abs(fontSize * (Math.abs(trm[3]) || 1));
    const adv = size * 0.5 * text.length * Math.abs(tm[0] || 1);
    if (text !== '') runs.push({ text, x: trm[4], y: trm[5], size, flip: ctm[3] < 0 || tm[3] < 0, unreadable: Boolean(font && font.unreadable && text === '') });
    else if (font && font.unreadable && str.length) runs.push({ text: '', x: trm[4], y: trm[5], size, flip: false, unreadable: true });
    tm = mul([1, 0, 0, 1, adv / (Math.abs(ctm[0]) || 1), 0], tm);
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
      case 'TL': leading = num(0); break;
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
          const flush = () => { if (pending !== '') { emit(pending); pending = ''; } };
          for (const el of arr) {
            if (el instanceof PString) pending += el.text;
            else if (typeof el === 'number') {
              if (el < -180) { flush(); tm = mul([1, 0, 0, 1, (-el / 1000) * fontSize * (Math.abs(tm[0]) || 1), 0], tm); }
              else if (el !== 0) { /* kerning: small shift, keep in the same run */ }
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
  return lines.map((l) => {
    l.items.sort((a, b) => a.x - b.x);
    return {
      page: l.page,
      items: l.items.map((it) => ({ text: it.text.replace(/ /g, ' '), x: it.x, xEnd: it.x + it.size * 0.5 * it.text.length })),
    };
  });
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

/**
 * @param {Uint8Array} bytes
 * @param {(bytes: Uint8Array) => Promise<Uint8Array|null>} inflate
 * @returns {Promise<{pages: {lines: object[]}[], flags: object}>}
 */
export async function extractPdfLines(bytes, inflate) {
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
    const runs = textRuns(text, fonts);
    if (runs.some((r) => r.unreadable)) flags.unreadableFonts = true;
    const lines = groupLines(runs.filter((r) => r.text !== ''), pageNo);
    if (lines.length) flags.pagesWithText++;
    out.push({ lines });
  }
  return { pages: out, flags };
}
