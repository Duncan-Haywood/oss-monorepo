// ISO 10303-21 (STEP physical file) reader for IFC models.
//
// parseStep(text) -> { schema, entities: EntityTable<id, {id, type, args}> } (a Map's read interface)
// (text is a string, or the file's bytes as a Uint8Array: see parseStepBytes)
// (args is read on first use; parseStep(text, { eager: true }) reads it up front)
// Argument values:
//   null            $ (unset)
//   {derived:true}  *  (derived in a subtype)
//   {ref:n}         #n
//   {enum:"X"}      .X.   (.T./.F. become booleans, .U. becomes {unknown:true})
//   {typed:"IFCLABEL", value}   IFCLABEL('x')
//   string | number | array
// Strings are decoded from the \X\, \X2\, \X4\ and \S\ escapes into JS strings.
// Numbers keep whether they were written as reals ({real:true} is not kept; a
// separate Set of integer-looking tokens is not needed for IDS checks: the schema
// says which attributes are integers).

// An apostrophe right after a \S\ directive is the directive's character
// (39 + 128 = 167, "§"), not a quote: ISO 10303-21 escapes the directive's
// character, not the quote, so '...\S\'' is one string ending in "§"
// (xBIM's SpecicalSolidusEscape.ifc). The "\S\" must not itself end an
// escaped backslash ("\\S\" is a backslash, then "S\").
function quotedBySolidusS(t, q) {
  if (t.charCodeAt(q - 1) !== 92 || t.charCodeAt(q - 2) !== 83 || t.charCodeAt(q - 3) !== 92) return false;
  let k = q - 4, n = 0;
  while (k >= 0 && t.charCodeAt(k) === 92) { n++; k--; }
  return n % 2 === 0;
}

// Plain runs are copied as one slice each. Appending a character at a time
// left every decoded string over 12 characters as a chain of one-character
// V8 cons strings, about 32 bytes a character, kept for as long as the
// entity's arguments are: 20 MB on HHS MEP, flattened only if something
// happened to run a regular expression over the string
// (eval/attribute-shape-2026-11-18.md).
export function decodeStepString(s) {
  if (s.indexOf("'") < 0 && s.indexOf("\\") < 0) return s;
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "'" && s[i + 1] === "'") { out += "'"; i++; continue; }
    if (c !== "\\") {
      let j = i + 1;
      while (j < s.length && s[j] !== "'" && s[j] !== "\\") j++;
      out += s.slice(i, j);
      i = j - 1;
      continue;
    }
    if (s[i + 1] === "\\") { out += "\\"; i++; continue; }
    if (s.startsWith("\\X2\\", i)) {
      const end = s.indexOf("\\X0\\", i + 4);
      const hex = s.slice(i + 4, end < 0 ? s.length : end);
      for (let k = 0; k + 4 <= hex.length; k += 4) out += String.fromCharCode(parseInt(hex.slice(k, k + 4), 16));
      i = (end < 0 ? s.length : end + 4) - 1;
      continue;
    }
    if (s.startsWith("\\X4\\", i)) {
      const end = s.indexOf("\\X0\\", i + 4);
      const hex = s.slice(i + 4, end < 0 ? s.length : end);
      for (let k = 0; k + 8 <= hex.length; k += 8) out += String.fromCodePoint(parseInt(hex.slice(k, k + 8), 16));
      i = (end < 0 ? s.length : end + 4) - 1;
      continue;
    }
    if (s.startsWith("\\X\\", i)) {
      out += String.fromCharCode(parseInt(s.slice(i + 3, i + 5), 16));
      i += 4;
      continue;
    }
    if (s.startsWith("\\S\\", i)) {
      out += String.fromCharCode(s.charCodeAt(i + 3) + 128);
      i += 3;
      continue;
    }
    if (s.startsWith("\\P", i) && s[i + 3] === "\\") { i += 3; continue; }
    out += c;
  }
  return out;
}

// Stand-ins for a nested list that a shallow read stepped over (see
// StepEntity.shallowArgs): frozen, shared, and only ever compared by length.
export const EMPTY_LIST = Object.freeze([]);
export const SKIPPED_LIST = Object.freeze([undefined]);

// Repeated small values, shared. A model's property and quantity records
// repeat a small vocabulary (property names, IFCBOOLEAN(.T.), IFCLABEL('...'),
// enumerations), and each read made new objects and strings for them: kept
// for every property a check reads, they were 109 MB of the 219 MB federated
// model's heap (eval/shared-values-2026-11-18.md). One Interner per parsed
// model hands back the same frozen object (or string) for the same value.
// Each table stops growing at INTERN_CAP entries, so a model of unique
// strings (GlobalIds, descriptions) cannot make a table larger than the
// values it would have held anyway, and lookups go on answering for the
// entries already in.
export const DERIVED = Object.freeze({ derived: true });
export const UNKNOWN = Object.freeze({ unknown: true });
const INTERN_CAP = 1 << 16;
const INTERN_MAX_LEN = 64;
export class Interner {
  constructor() { this.strings = new Map(); this.enums = new Map(); this.typeNames = new Map(); this.typed = new Map(); this.typedCount = 0; }
  string(s) {
    if (s.length > INTERN_MAX_LEN) return s;
    const got = this.strings.get(s);
    if (got !== undefined) return got;
    if (this.strings.size < INTERN_CAP) this.strings.set(s, s);
    return s;
  }
  enumOf(v) {
    let o = this.enums.get(v);
    if (!o) { o = Object.freeze({ enum: v }); if (this.enums.size < INTERN_CAP) this.enums.set(v, o); }
    return o;
  }
  typeName(raw) {
    let n = this.typeNames.get(raw);
    if (n === undefined) { n = raw.toUpperCase(); if (this.typeNames.size < INTERN_CAP) this.typeNames.set(raw, n); }
    return n;
  }
  // A typed value whose value is a scalar (string, number, boolean, null or
  // a shared enumeration or unknown); any other is made new each time.
  typedOf(name, value) {
    const t = typeof value;
    if (!(t === "string" || t === "number" || t === "boolean" || value === null || value === UNKNOWN || (t === "object" && Object.isFrozen(value) && value.enum !== undefined)) || (t === "string" && value.length > INTERN_MAX_LEN)) return { typed: name, value };
    let byValue = this.typed.get(name);
    if (!byValue) this.typed.set(name, (byValue = new Map()));
    let o = byValue.get(value);
    if (!o) { o = Object.freeze({ typed: name, value }); if (this.typedCount < INTERN_CAP) { byValue.set(value, o); this.typedCount++; } }
    return o;
  }
}

class Reader {
  // b: where the text starts in the file, for error positions (a record read
  // from a file's bytes is read as a string of its own).
  // lenient: set when a value was read in a form the standard does not allow
  // (see value()), for the caller to record as a reader note.
  constructor(text, pos, intern = null, base = 0) { this.t = text; this.p = pos; this.i = intern; this.b = base; this.lenient = null; }
  ws() {
    const t = this.t;
    for (;;) {
      const c = t.charCodeAt(this.p);
      if (c === 32 || c === 9 || c === 10 || c === 13) { this.p++; continue; }
      if (c === 47 && t[this.p + 1] === "*") {
        const e = t.indexOf("*/", this.p + 2);
        this.p = e < 0 ? t.length : e + 2;
        continue;
      }
      return;
    }
  }
  value() {
    this.ws();
    const t = this.t;
    const c = t[this.p];
    if (c === "$") { this.p++; return null; }
    if (c === "*") { this.p++; return this.i ? DERIVED : { derived: true }; }
    if (c === "(") { return this.list(); }
    if (c === "'") {
      let i = this.p + 1;
      for (;;) {
        const q = t.indexOf("'", i);
        if (q < 0) throw new Error("unterminated string");
        if (quotedBySolidusS(t, q)) { i = q + 1; continue; }
        if (t[q + 1] === "'") { i = q + 2; continue; }
        const raw = t.slice(this.p + 1, q);
        this.p = q + 1;
        return this.i ? this.i.string(decodeStepString(raw)) : decodeStepString(raw);
      }
    }
    if (c === "#") {
      const m = /#(\d+)/y;
      m.lastIndex = this.p;
      const r = m.exec(t);
      if (!r) throw new Error(`'#' with no number at ${this.b + this.p}`);
      this.p = m.lastIndex;
      return { ref: Number(r[1]) };
    }
    if (c === ".") {
      const e = t.indexOf(".", this.p + 1);
      if (e < 0) throw new Error(`unterminated enumeration at ${this.b + this.p}`);
      const v = t.slice(this.p + 1, e).toUpperCase();
      this.p = e + 1;
      if (v === "T") return true;
      if (v === "F") return false;
      if (v === "U") return this.i ? UNKNOWN : { unknown: true };
      return this.i ? this.i.enumOf(v) : { enum: v };
    }
    if (c === '"') {
      const e = t.indexOf('"', this.p + 1);
      if (e < 0) throw new Error(`unterminated binary at ${this.b + this.p}`);
      const v = t.slice(this.p + 1, e);
      this.p = e + 1;
      return { binary: v };
    }
    const num = /[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?/y;
    num.lastIndex = this.p;
    const n = num.exec(t);
    if (n && n.index === this.p) {
      this.p = num.lastIndex;
      // Microsoft C runtime spellings of infinity and NaN, written by
      // exporters that printf a double without checking it: 1.#INF, -1.#INF,
      // -1.#IND, 1.#QNAN, 1.#SNAN, sometimes with digits after (1.#INF00).
      // ISO 10303-21 has no such token, so the record would otherwise be
      // dropped whole (a property with an IFCREAL(1.#INF) went missing rather
      // than failing on its value). Read leniently and noted
      // (xBIM's FormallyIllegalFile.ifc, eval/xbim-test-files-2026-11-24.md).
      if (t.charCodeAt(this.p) === 35 && t[this.p - 1] === ".") {
        const w = /#(INF|IND|QNAN|SNAN)\d*/iy;
        w.lastIndex = this.p;
        const m = w.exec(t);
        if (m) {
          this.p = w.lastIndex;
          const v = m[1].toUpperCase() === "INF" ? (n[0][0] === "-" ? -Infinity : Infinity) : NaN;
          if (!this.lenient) this.lenient = `${n[0]}${m[0]} read as ${v} (a Microsoft C runtime spelling, not ISO 10303-21)`;
          return v;
        }
      }
      return Number(n[0]);
    }
    const kw = /[A-Za-z_][A-Za-z0-9_]*/y;
    kw.lastIndex = this.p;
    const k = kw.exec(t);
    if (k) {
      this.p = kw.lastIndex;
      this.ws();
      const inner = this.list();
      if (this.i) return this.i.typedOf(this.i.typeName(k[0]), inner.length === 1 ? inner[0] : inner);
      return { typed: k[0].toUpperCase(), value: inner.length === 1 ? inner[0] : inner };
    }
    throw new Error(`unexpected '${c}' at ${this.b + this.p}`);
  }
  // The argument list with every nested list left unread: an empty one is
  // EMPTY_LIST, any other SKIPPED_LIST (one placeholder item, so it is a
  // non-empty array). Everything else is read as list() reads it.
  shallowList() {
    this.ws();
    if (this.t[this.p] !== "(") throw new Error(`expected ( at ${this.b + this.p}`);
    this.p++;
    const out = [];
    this.ws();
    if (this.t[this.p] === ")") { this.p++; return out; }
    for (;;) {
      if (this.t[this.p] === "(") out.push(this.skipList());
      else out.push(this.value());
      this.ws();
      const c = this.t[this.p++];
      if (c === ",") continue;
      if (c === ")") return out.slice();
      throw new Error(`expected , or ) at ${this.b + this.p - 1}`);
    }
  }
  // Steps over a list, strings and comments included, to just past its ")".
  skipList() {
    const t = this.t;
    const n = t.length;
    let depth = 0, items = false;
    for (let i = this.p; i < n; i++) {
      const c = t.charCodeAt(i);
      if (c === 40) { if (depth) items = true; depth++; continue; } // (
      if (c === 41) { // )
        if (--depth === 0) { this.p = i + 1; return items ? SKIPPED_LIST : EMPTY_LIST; }
        continue;
      }
      if (c === 32 || c === 9 || c === 10 || c === 13) continue;
      if (c === 47 && t.charCodeAt(i + 1) === 42) { // /*
        const e = t.indexOf("*/", i + 2);
        if (e < 0) break;
        i = e + 1;
        continue;
      }
      if (c === 59) break; // ; : the record ended inside the list
      items = true;
      if (c === 39) { // '
        for (;;) {
          const q = t.indexOf("'", i + 1);
          if (q < 0) throw new Error("unterminated string");
          if (quotedBySolidusS(t, q)) { i = q; continue; }
          if (t.charCodeAt(q + 1) === 39) { i = q + 1; continue; }
          i = q;
          break;
        }
      }
    }
    throw new Error(`unclosed list at ${this.b + this.p}`);
  }
  list() {
    this.ws();
    if (this.t[this.p] !== "(") throw new Error(`expected ( at ${this.b + this.p}`);
    this.p++;
    const out = [];
    this.ws();
    if (this.t[this.p] === ")") { this.p++; return out; }
    for (;;) {
      out.push(this.value());
      this.ws();
      const c = this.t[this.p++];
      if (c === ",") continue;
      if (c === ")") return out.slice();
      throw new Error(`expected , or ) at ${this.b + this.p - 1}`);
    }
  }
}

// Where an entity record ends: the ";" after it, skipping strings ('' is an
// escaped quote) and /* comments */. Returns -1 when the text ends first.
function recordEnd(t, p) {
  const n = t.length;
  for (let i = p; i < n; i++) {
    const c = t.charCodeAt(i);
    if (c === 59) return i; // ;
    if (c === 39) { // '
      for (;;) {
        const q = t.indexOf("'", i + 1);
        if (q < 0) return -1;
        if (quotedBySolidusS(t, q)) { i = q; continue; }
        if (t.charCodeAt(q + 1) === 39) { i = q + 1; continue; }
        i = q;
        break;
      }
    } else if (c === 47 && t.charCodeAt(i + 1) === 42) { // /*
      const e = t.indexOf("*/", i + 2);
      if (e < 0) return -1;
      i = e + 1;
    }
  }
  return -1;
}

// ------------------------------------------------------ the file's bytes ----
//
// parseStep(bytes) reads a Uint8Array (a Node Buffer, or a browser File's
// arrayBuffer) without decoding it into one string. A 219 MB export as a
// string is 219 MB of V8 heap for as long as the model is checked (the lazy
// records read their arguments from it); as bytes it sits outside the heap,
// and each record is decoded to a short string of its own when its arguments
// are read (eval/step-bytes-2026-11-18.md). Records are cut at ASCII bytes
// (";", "'", "(", "/*"), which never occur inside a UTF-8 multi-byte
// character, so decoding a record alone gives the same characters as
// decoding the whole file and slicing it.

function byteDecoder(b) {
  if (typeof b.utf8Slice === "function") return (s, e) => b.utf8Slice(s, e); // Node Buffer
  const td = new TextDecoder();
  return (s, e) => td.decode(b.subarray(s, e));
}

function asBuffer(b) {
  // A plain Uint8Array in Node gets Buffer's fast utf8Slice over the same memory.
  if (typeof b.utf8Slice !== "function" && typeof globalThis.Buffer === "function") return globalThis.Buffer.from(b.buffer, b.byteOffset, b.length);
  return b;
}

// The "*/" that ends a comment, at or after i; -1 when the file ends first.
function commentEndBytes(b, i) {
  for (;;) {
    const k = b.indexOf(42, i);
    if (k < 0 || k + 1 >= b.length) return -1;
    if (b[k + 1] === 47) return k;
    i = k + 1;
  }
}

function quotedBySolidusSBytes(b, q) {
  if (b[q - 1] !== 92 || b[q - 2] !== 83 || b[q - 3] !== 92) return false;
  let k = q - 4, n = 0;
  while (k >= 0 && b[k] === 92) { n++; k--; }
  return n % 2 === 0;
}

// recordEnd, on bytes.
function recordEndBytes(b, p) {
  const n = b.length;
  for (let i = p; i < n; i++) {
    const c = b[i];
    if (c === 59) return i; // ;
    if (c === 39) { // '
      for (;;) {
        const q = b.indexOf(39, i + 1);
        if (q < 0) return -1;
        if (quotedBySolidusSBytes(b, q)) { i = q; continue; }
        if (b[q + 1] === 39) { i = q + 1; continue; }
        i = q;
        break;
      }
    } else if (c === 47 && b[i + 1] === 42) { // /*
      const e = commentEndBytes(b, i + 2);
      if (e < 0) return -1;
      i = e + 1;
    }
  }
  return -1;
}

// A Reader over one record: decoded from where its argument list starts to
// its ";" (found again; the scan does not keep it, 4 bytes an entity).
function bytesReader(b, intern) {
  const dec = byteDecoder(b);
  return (p) => {
    let e = recordEndBytes(b, p);
    if (e < 0) e = b.length;
    return new Reader(dec(p, e), 0, intern, p);
  };
}

// The same whitespace as the scan's \s on these files (ASCII).
const isWs = (c) => c === 32 || (c >= 9 && c <= 13);
const isWord = (c) => (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95;

// Where /\bDATA\s*;/ first matches, in bytes; -1 if nowhere.
function dataSectionBytes(b) {
  for (let i = b.indexOf(68); i >= 0; i = b.indexOf(68, i + 1)) { // D
    if (b[i + 1] !== 65 || b[i + 2] !== 84 || b[i + 3] !== 65) continue; // ATA
    if (i > 0 && isWord(b[i - 1])) continue;
    let j = i + 4;
    while (j < b.length && isWs(b[j])) j++;
    if (b[j] === 59) return i;
  }
  return -1;
}

function utf8Length(s) {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) { n += 4; i++; }
    else n += 3;
  }
  return n;
}

function parseStepBytes(input, opts) {
  const b = asBuffer(input);
  const dec = byteDecoder(b);
  const dataStart = dataSectionBytes(b);
  if (dataStart < 0) throw new Error("not a STEP file: no DATA section");
  const schemaM = dec(0, dataStart).match(/FILE_SCHEMA\s*\(\s*\(\s*'([^']*)'/i);
  const schema = schemaM ? schemaM[1].toUpperCase() : null;
  const entities = new EntityTable();
  const errors = [];
  const policy = { keep: () => true };
  const intern = new Interner();
  const Lazy = entityClass(b, errors, policy, intern);
  // Type names by their bytes: a hash of the name to the strings seen with it,
  // so the scan makes no string per entity.
  const types = new Map();
  const typeAt = (s, e) => {
    let h = 2166136261;
    for (let k = s; k < e; k++) h = Math.imul(h ^ b[k], 16777619);
    h = (h ^ (e - s)) >>> 0;
    let l = types.get(h);
    if (l) for (const t of l) if (t.raw.length === e - s && sameBytes(b, s, t.raw)) return t.type;
    const raw = dec(s, e);
    const t = { raw, type: raw.toUpperCase() };
    if (!l) types.set(h, (l = []));
    l.push(t);
    return t.type;
  };
  const n = b.length;
  let i = dataStart;
  while (i < n) {
    const c = b[i];
    if (c === 47 && b[i + 1] === 42) { // /* comment */
      const e = commentEndBytes(b, i + 2);
      if (e < 0) break;
      i = e + 2;
      continue;
    }
    if (c !== 35) { i++; continue; } // not #
    // #(\d+)\s*=\s*(?:([A-Za-z0-9_]+)\s*)?\(
    let j = i + 1;
    while (b[j] >= 48 && b[j] <= 57) j++;
    if (j === i + 1) { i++; continue; }
    const idEnd = j;
    while (isWs(b[j])) j++;
    if (b[j] !== 61) { i++; continue; } // =
    j++;
    while (isWs(b[j])) j++;
    const ts = j;
    while (isWord(b[j])) j++;
    const te = j;
    if (te > ts) while (isWs(b[j])) j++;
    if (b[j] !== 40) { i++; continue; } // (
    const start = j;
    if (te === ts) { // complex instance: skip to its ";"
      const end = recordEndBytes(b, start);
      if (end < 0) break;
      i = end + 1;
      continue;
    }
    let id = 0;
    if (idEnd - i - 1 <= 15) for (let k = i + 1; k < idEnd; k++) id = id * 10 + (b[k] - 48);
    else id = Number(dec(i + 1, idEnd));
    const type = typeAt(ts, te);
    if (!opts.eager) {
      const end = recordEndBytes(b, start);
      if (end >= 0) {
        entities.set(id, new Lazy(id, type, start));
        i = end + 1;
        continue;
      }
    }
    // Eager, or the file ends inside this record: read it now (parseStep).
    const end = opts.eager ? recordEndBytes(b, start) : -1;
    const tail = dec(start, end < 0 ? n : end + 1);
    const r = new Reader(tail, 0, null, start);
    try {
      const args = r.list();
      entities.set(id, { id, type, args });
      if (r.lenient) errors.push(`#${id}: ${r.lenient}`);
    } catch (e) {
      errors.push(`#${id}: ${e.message}`);
    }
    i = Math.max(start + utf8Length(tail.slice(0, r.p)), start + 1);
  }
  return { schema, entities: entities.trim(), errors, policy };
}

function sameBytes(b, s, raw) {
  for (let k = 0; k < raw.length; k++) if (b[s + k] !== raw.charCodeAt(k)) return false;
  return true;
}

// Entities are read lazily: the scan records each one's number, type and where
// its argument list starts, and `args` is parsed the first time it is read.
// An IDS check reads the arguments of the objects, property sets and
// relationships it tests, not the geometry (points, loops, faces), which is
// most of a large export: on a 219 MB federated model this keeps the heap at
// about 40% of reading every argument up front
// (eval/heap-200mb-2026-11-17.md). A record that cannot be read records its
// error when first read and has no arguments.
//
// Read arguments are kept, except for the types policy.keep(type) answers
// false for: the Model sets it to drop geometry (IfcRepresentationItem and
// its subtypes), which only a specification with no entity facet reads, once
// or twice per entity, and which would otherwise all stay in memory, and
// relationships, which the Model indexes once. Lists are copied to their
// length when read (list(): a pushed list of four keeps room for 16), and
// repeated small values are shared (Interner).
function entityClass(text, errors, policy, intern) {
  // From a file's bytes (parseStep(bytes)), a record is decoded to a string
  // of its own when it is read: the file is never one string on the heap.
  const reader = text instanceof Uint8Array ? bytesReader(text, intern) : (p) => new Reader(text, p, intern);
  const noted = new Set();
  const read = (e, p) => {
    try {
      const r = reader(p);
      const a = r.list();
      if (r.lenient && !noted.has(e.id)) { noted.add(e.id); errors.push(`#${e.id}: ${r.lenient}`); }
      return a;
    } catch (err) {
      errors.push(`#${e.id}: ${err.message}`);
      return [];
    }
  };
  // Three fields, not four: `_a` holds where the argument list starts (a
  // number) until the arguments are read and kept, then the arguments (an
  // array). One field fewer is 8 bytes on each of 3.7 million entities
  // (eval/entity-table-2026-11-18.md).
  return class StepEntity {
    constructor(id, type, p) { this.id = id; this.type = type; this._a = p; }
    get args() {
      const a0 = this._a;
      if (typeof a0 !== "number") return a0;
      const a = read(this, a0);
      if (policy.keep(this.type) || a.length === 0) this._a = a;
      return a;
    }
    set args(v) { this._a = v; }
    // The arguments with nested lists left unread (EMPTY_LIST or
    // SKIPPED_LIST), for a test that asks only whether a list attribute is
    // set and empty: the attribute facet with a value, whose verdict on a list
    // is "IDS cannot compare its value" whatever it holds. Used for the types
    // whose full arguments are not kept (geometry), where a specification
    // applying to every entity would otherwise read every point's coordinates
    // once per facet (eval/attribute-any-geometry-2026-11-18.md). A record the
    // shallow read cannot read is read in full, so its error is recorded.
    get shallowArgs() {
      if (typeof this._a !== "number" || policy.keep(this.type)) return this.args;
      try {
        return reader(this._a).shallowList();
      } catch {
        return this.args;
      }
    }
    toJSON() { return { id: this.id, type: this.type, args: this.args }; }
  };
}

// The entities by number, with the read-only part of a Map's interface (get,
// has, size, keys, values, entries, forEach, iteration) in file order, and set
// for the reader. A Map spent about 32 bytes an entry on 3.7 million entities
// (its hash table rounds up to a power of two); STEP numbers are close to
// dense, so here an entity sits at its number in a plain array (8 bytes a
// slot, holes included) and the file order is a list of 4-byte numbers. A
// second record with a number already read replaces the first in place, as
// Map.set did. A number that is not a small non-negative integer, or numbers
// so sparse that the array would be mostly holes, move the table to a Map,
// so any file still reads (eval/entity-table-2026-11-18.md).
export class EntityTable {
  constructor() { this._at = []; this._ord = new Int32Array(1024); this._n = 0; this._map = null; }
  get size() { return this._map ? this._map.size : this._n; }
  get(id) { return this._map ? this._map.get(id) : (Number.isInteger(id) && id >= 0 ? this._at[id] : undefined); }
  has(id) { return this.get(id) !== undefined; }
  set(id, e) {
    if (this._map) { this._map.set(id, e); return this; }
    if (!(Number.isInteger(id) && id >= 0 && id <= 0x7fffffff) || id > 4 * this._n + 1048576) { this._toMap(); this._map.set(id, e); return this; }
    const at = this._at;
    // Holes are filled, not skipped: an index far past the end turns a V8
    // array into a hash table bigger than the Map it replaces.
    while (at.length < id) at.push(undefined);
    if (at[id] === undefined) {
      if (this._n === this._ord.length) { const o = new Int32Array(this._n * 2); o.set(this._ord); this._ord = o; }
      this._ord[this._n++] = id;
    }
    at[id] = e;
    return this;
  }
  _toMap() {
    const m = new Map();
    for (let i = 0; i < this._n; i++) m.set(this._ord[i], this._at[this._ord[i]]);
    this._map = m; this._at = null; this._ord = null; this._n = 0;
  }
  // Drops the order list's spare capacity once the reader is done.
  trim() { if (!this._map && this._ord.length > this._n) this._ord = this._ord.slice(0, this._n); return this; }
  *keys() { if (this._map) { yield* this._map.keys(); return; } const o = this._ord, n = this._n; for (let i = 0; i < n; i++) yield o[i]; }
  *values() { if (this._map) { yield* this._map.values(); return; } const o = this._ord, a = this._at, n = this._n; for (let i = 0; i < n; i++) yield a[o[i]]; }
  *entries() { if (this._map) { yield* this._map.entries(); return; } const o = this._ord, a = this._at, n = this._n; for (let i = 0; i < n; i++) yield [o[i], a[o[i]]]; }
  [Symbol.iterator]() { return this.entries(); }
  forEach(f, self) { for (const [k, v] of this.entries()) f.call(self, v, k, this); }
}

export function parseStep(text, opts = {}) {
  if (text instanceof Uint8Array) return parseStepBytes(text, opts);
  const schemaM = text.match(/FILE_SCHEMA\s*\(\s*\(\s*'([^']*)'/i);
  const schema = schemaM ? schemaM[1].toUpperCase() : null;
  const dataStart = text.search(/\bDATA\s*;/);
  if (dataStart < 0) throw new Error("not a STEP file: no DATA section");
  const entities = new EntityTable();
  // A comment between records and a multi-type ("complex") instance
  // #5=(IFCA(...)IFCB(...)) are stepped over whole: the scan once matched
  // '#n=X(' inside them, so a record someone had commented out, or text in a
  // complex instance's string, came back as an entity (red team 2026-11-17).
  // Complex instances are not read (as before), only no longer mined.
  const re = /\/\*|#(\d+)\s*=\s*(?:([A-Za-z0-9_]+)\s*)?\(/g;
  re.lastIndex = dataStart;
  const errors = [];
  const policy = { keep: () => true };
  const intern = new Interner();
  const Lazy = opts.eager ? null : entityClass(text, errors, policy, intern);
  // One string per type name, not one per entity (3.7 million on the 219 MB
  // model, about 100 MB of copies of "IFCCARTESIANPOINT").
  const types = new Map();
  let m;
  while ((m = re.exec(text))) {
    if (m[1] === undefined) { // /* comment */
      const e = text.indexOf("*/", re.lastIndex);
      if (e < 0) break;
      re.lastIndex = e + 2;
      continue;
    }
    if (m[2] === undefined) { // complex instance: skip to its ";"
      const end = recordEnd(text, re.lastIndex - 1);
      if (end < 0) break;
      re.lastIndex = end + 1;
      continue;
    }
    const id = Number(m[1]);
    let type = types.get(m[2]);
    if (type === undefined) types.set(m[2], (type = m[2].toUpperCase()));
    const start = re.lastIndex - 1;
    if (Lazy) {
      const end = recordEnd(text, start);
      if (end >= 0) {
        entities.set(id, new Lazy(id, type, start));
        re.lastIndex = end + 1;
        continue;
      }
      // The file ends inside this record (an export cut short): read it now
      // so the error names what was left open.
    }
    const r = new Reader(text, start);
    try {
      const args = r.list();
      entities.set(id, { id, type, args });
      if (r.lenient) errors.push(`#${id}: ${r.lenient}`);
    } catch (e) {
      errors.push(`#${id}: ${e.message}`);
    }
    // Never step backwards: a truncated file (an export cut short) once sent
    // the reader to 0 and this loop re-read the file forever, growing errors
    // until the process ran out of memory.
    re.lastIndex = Math.max(r.p, re.lastIndex);
  }
  return { schema, entities: entities.trim(), errors, policy };
}
