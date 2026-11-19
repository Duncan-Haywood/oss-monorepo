// A small, dependency-free PDF object parser.
//
// This is not a PDF renderer and does not aim to be spec-complete. It is a
// lenient scanner good enough to answer the accessibility-structure
// questions this venture checks: is the document tagged, does it have a
// title and a declared language, do its images have alternate text
// structure elements, do its form-field widgets have accessible names, and
// does a page have a text layer at all. Real-world PDFs vary widely in how
// strictly they follow the spec, so this parser is deliberately forgiving --
// it scans for object patterns directly in the byte stream rather than
// requiring a valid cross-reference table, which is also what lets it read
// a PDF whose xref table is stale or wrong (common after some editors patch
// a file in place).
//
// Byte <-> "binary string" trick: PDF syntax (names, dict punctuation,
// keywords) is pure ASCII even though stream *content* is arbitrary binary.
// Decoding the whole file as Latin-1 gives a 1:1, lossless, reversible
// mapping from byte value to JS UTF-16 code unit, so ordinary string
// methods and regexes can scan the syntax layer directly with no separate
// byte-oriented lexer, and any substring can be converted back to exact
// original bytes with binaryStringToBytes(). pdf.js and pdf-lib use the
// same trick internally.

export function bytesToBinaryString(bytes) {
  let s = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return s;
}

export function binaryStringToBytes(str) {
  const out = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) out[i] = str.charCodeAt(i) & 0xff;
  return out;
}

// --- Value model -----------------------------------------------------

export class PName {
  constructor(name) { this.name = name; }
}
export class PString {
  constructor(text) { this.text = text; } // best-effort decoded text, not exact bytes
}
export class PRef {
  constructor(num, gen) { this.num = num; this.gen = gen; }
}
export class PDict {
  constructor() { this.map = new Map(); }
  get(key) { return this.map.get(key); }
  has(key) { return this.map.has(key); }
  set(key, value) { this.map.set(key, value); return this; }
}

function isDict(v) { return v instanceof PDict; }
function isName(v, name) { return v instanceof PName && v.name === name; }

// --- Tiny recursive-descent value parser ------------------------------

const WS = /[\0\t\n\f\r ]/;

function skipWs(str, pos) {
  for (;;) {
    while (pos < str.length && WS.test(str[pos])) pos++;
    if (str[pos] === '%') {
      while (pos < str.length && str[pos] !== '\n' && str[pos] !== '\r') pos++;
      continue;
    }
    return pos;
  }
}

function parseName(str, pos) {
  let i = pos + 1; // skip leading '/'
  let name = '';
  while (i < str.length && !WS.test(str[i]) && !'()<>[]{}/%'.includes(str[i])) {
    if (str[i] === '#' && /[0-9a-fA-F]{2}/.test(str.slice(i + 1, i + 3))) {
      name += String.fromCharCode(parseInt(str.slice(i + 1, i + 3), 16));
      i += 3;
    } else {
      name += str[i];
      i++;
    }
  }
  return [new PName(name), i];
}

function parseLiteralString(str, pos) {
  let i = pos + 1;
  let depth = 1;
  let text = '';
  while (i < str.length && depth > 0) {
    const c = str[i];
    if (c === '\\') {
      const next = str[i + 1];
      const map = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '(': '(', ')': ')', '\\': '\\' };
      if (next === '\n') { i += 2; continue; }
      if (next === '\r') { i += str[i + 2] === '\n' ? 3 : 2; continue; }
      if (map[next] !== undefined) { text += map[next]; i += 2; continue; }
      if (/[0-7]/.test(next)) {
        let oct = '';
        let j = i + 1;
        while (j < str.length && oct.length < 3 && /[0-7]/.test(str[j])) { oct += str[j]; j++; }
        text += String.fromCharCode(parseInt(oct, 8) & 0xff);
        i = j;
        continue;
      }
      text += next ?? '';
      i += 2;
      continue;
    }
    if (c === '(') { depth++; text += c; i++; continue; }
    if (c === ')') { depth--; i++; if (depth === 0) break; text += c; continue; }
    text += c;
    i++;
  }
  return [new PString(text), i];
}

function parseHexString(str, pos) {
  let i = pos + 1;
  let hex = '';
  while (i < str.length && str[i] !== '>') { if (/[0-9a-fA-F]/.test(str[i])) hex += str[i]; i++; }
  i++; // skip '>'
  if (hex.length % 2 === 1) hex += '0';
  let text = '';
  for (let k = 0; k < hex.length; k += 2) text += String.fromCharCode(parseInt(hex.slice(k, k + 2), 16));
  return [new PString(text), i];
}

function parseArray(str, pos, parseValueFn) {
  let i = pos + 1;
  const arr = [];
  for (;;) {
    i = skipWs(str, i);
    if (str[i] === ']' || i >= str.length) { i++; break; }
    const [v, next] = parseValueFn(str, i);
    if (next <= i) { i++; continue; } // guard against non-advancing parse
    arr.push(v);
    i = next;
  }
  return [arr, i];
}

function parseDict(str, pos, parseValueFn) {
  let i = pos + 2; // skip '<<'
  const dict = new PDict();
  for (;;) {
    i = skipWs(str, i);
    if (str.startsWith('>>', i) || i >= str.length) { i += 2; break; }
    if (str[i] !== '/') { i++; continue; } // resync on malformed input
    const [key, afterKey] = parseName(str, i);
    i = skipWs(str, afterKey);
    const [value, afterValue] = parseValueFn(str, i);
    dict.set(key.name, value);
    i = afterValue <= i ? i + 1 : afterValue;
  }
  return [dict, i];
}

const NUM_RE = /^[+-]?(\d+\.\d*|\.\d+|\d+)/;

export function parseValue(str, pos) {
  pos = skipWs(str, pos);
  if (pos >= str.length) return [null, pos];
  const c = str[pos];
  if (str.startsWith('<<', pos)) return parseDict(str, pos, parseValue);
  if (c === '[') return parseArray(str, pos, parseValue);
  if (c === '/') return parseName(str, pos);
  if (c === '(') return parseLiteralString(str, pos);
  if (c === '<') return parseHexString(str, pos);
  if (str.startsWith('true', pos)) return [true, pos + 4];
  if (str.startsWith('false', pos)) return [false, pos + 5];
  if (str.startsWith('null', pos)) return [null, pos + 4];
  const m = NUM_RE.exec(str.slice(pos));
  if (m) {
    const numEnd = pos + m[0].length;
    // Look ahead for "<gen> R" to fold into a reference.
    let look = skipWs(str, numEnd);
    const m2 = /^\d+/.exec(str.slice(look));
    if (/^\d+$/.test(m[0]) && m2) {
      const genEnd = look + m2[0].length;
      const afterGen = skipWs(str, genEnd);
      if (str[afterGen] === 'R' && !/[A-Za-z0-9]/.test(str[afterGen + 1] || '')) {
        return [new PRef(parseInt(m[0], 10), parseInt(m2[0], 10)), afterGen + 1];
      }
    }
    return [parseFloat(m[0]), numEnd];
  }
  // Unknown token (keyword like "obj", "endobj", stray operator) -- skip one char.
  return [null, pos + 1];
}

// --- Object scanning ----------------------------------------------------

const OBJ_RE = /(\d+)\s+(\d+)\s+obj\b/g;

/**
 * Scan the whole file for "<n> <g> obj ... endobj" definitions. Lenient:
 * does not require or trust the xref table, so a stale or missing xref
 * cannot hide an object from the checks below (and cannot be exploited to
 * make a check see a stripped-down "clean" copy of a document either).
 *
 * @param {string} str - binary string (see bytesToBinaryString)
 * @returns {Map<number, {dict: PDict|any, streamStart: number, streamEnd: number, filter: PName|PName[]|null}>}
 */
export function scanObjects(str) {
  const objects = new Map();
  OBJ_RE.lastIndex = 0;
  let m;
  while ((m = OBJ_RE.exec(str))) {
    const num = parseInt(m[1], 10);
    const bodyStart = OBJ_RE.lastIndex;
    const endObjIdx = str.indexOf('endobj', bodyStart);
    const bodyEnd = endObjIdx === -1 ? str.length : endObjIdx;
    const streamKw = str.indexOf('stream', bodyStart);
    let dictText = str.slice(bodyStart, bodyEnd);
    let streamStart = -1;
    let streamEnd = -1;
    if (streamKw !== -1 && streamKw < bodyEnd) {
      dictText = str.slice(bodyStart, streamKw);
      let s = streamKw + 'stream'.length;
      if (str[s] === '\r') s++;
      if (str[s] === '\n') s++;
      streamStart = s;
      const endStreamIdx = str.indexOf('endstream', s);
      streamEnd = endStreamIdx === -1 ? bodyEnd : endStreamIdx;
      // Trim a single trailing EOL that precedes "endstream".
      let e = streamEnd;
      if (str[e - 1] === '\n') e--;
      if (str[e - 1] === '\r') e--;
      streamEnd = e;
    }
    const [dict] = parseValue(dictText, 0);
    objects.set(num, { dict, streamStart, streamEnd });
    OBJ_RE.lastIndex = Math.max(bodyEnd, OBJ_RE.lastIndex);
  }
  return objects;
}

/** Finds the last "trailer << ... >>" dict, or the dict of the last object
 * whose own /Type is /XRef (a cross-reference *stream*, which carries the
 * same /Root and /Info keys a classic trailer would -- used by many modern
 * PDF writers instead of a plain trailer keyword). */
export function findTrailer(str, objects) {
  let trailerDict = null;
  const TRAILER_RE = /trailer\b/g;
  let m;
  while ((m = TRAILER_RE.exec(str))) {
    const [dict] = parseValue(str, m.index + m[0].length);
    if (isDict(dict)) trailerDict = dict;
  }
  if (trailerDict) return trailerDict;
  for (const { dict } of objects.values()) {
    if (isDict(dict) && isName(dict.get('Type'), 'XRef')) trailerDict = dict;
  }
  return trailerDict;
}

function resolve(value, objects, depth = 0) {
  if (depth > 32) return null;
  if (value instanceof PRef) {
    const entry = objects.get(value.num);
    if (!entry) return null;
    return resolve(entry.dict, objects, depth + 1);
  }
  return value;
}

/** Filter name(s) declared on a stream dict, as a plain array of strings. */
function filterNames(dict) {
  const f = dict.get('Filter');
  if (!f) return [];
  if (f instanceof PName) return [f.name];
  if (Array.isArray(f)) return f.filter((v) => v instanceof PName).map((v) => v.name);
  return [];
}

/**
 * Returns the raw (still-encoded) bytes of an object's stream, or null.
 */
export function rawStreamBytes(entry, bytes, binaryStr) {
  if (!entry || entry.streamStart < 0) return null;
  return binaryStringToBytes(binaryStr.slice(entry.streamStart, entry.streamEnd));
}

/**
 * Decodes a stream's bytes by applying its declared filter chain, using the
 * supplied async inflate(bytes) -> Uint8Array|null for FlateDecode (the
 * only filter this tool supports: it's what essentially all modern PDF
 * writers use for both content streams and object/xref streams). A stream
 * using any other filter, or one that fails to inflate (garbled data,
 * encryption), decodes to null rather than throwing -- callers treat that
 * as "could not be checked", never as "checked and clean".
 */
export async function decodeStream(entry, binaryStr, inflate) {
  const raw = rawStreamBytes(entry, null, binaryStr);
  if (!raw) return null;
  const filters = filterNames(entry.dict instanceof PDict ? entry.dict : new PDict());
  if (filters.length === 0) return raw;
  let data = raw;
  for (const name of filters) {
    if (name !== 'FlateDecode' && name !== 'Fl') return null; // unsupported filter chain
    if (!data) return null;
    data = await inflate(data);
  }
  return data;
}

/**
 * Expands compressed object streams (/Type /ObjStm) into the main object
 * map, mutating and returning it. Objects already present from a plain
 * scan are left untouched -- a compressed definition should never need to
 * override one this parser already read directly.
 */
export async function expandObjectStreams(objects, binaryStr, inflate) {
  const objStms = [];
  for (const [num, entry] of objects) {
    if (isDict(entry.dict) && isName(entry.dict.get('Type'), 'ObjStm')) objStms.push([num, entry]);
  }
  for (const [, entry] of objStms) {
    const decoded = await decodeStream(entry, binaryStr, inflate);
    if (!decoded) continue;
    const bodyStr = bytesToBinaryString(decoded);
    const n = resolve(entry.dict.get('N'), objects);
    const first = resolve(entry.dict.get('First'), objects);
    if (typeof n !== 'number' || typeof first !== 'number') continue;
    const header = bodyStr.slice(0, first);
    const pairs = header.trim().split(/\s+/).map((s) => parseInt(s, 10));
    for (let i = 0; i < n; i++) {
      const objNum = pairs[i * 2];
      const offset = pairs[i * 2 + 1];
      if (!Number.isFinite(objNum) || !Number.isFinite(offset)) continue;
      if (objects.has(objNum)) continue;
      const [value] = parseValue(bodyStr, first + offset);
      objects.set(objNum, { dict: value, streamStart: -1, streamEnd: -1 });
    }
  }
  return objects;
}

export { isDict, isName, resolve };
