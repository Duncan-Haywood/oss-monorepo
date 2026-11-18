// ISO 10303-21 (STEP physical file) reader for IFC models.
//
// parseStep(text) -> { schema, entities: Map<id, {id, type, args}> }
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

class Reader {
  constructor(text, pos) { this.t = text; this.p = pos; }
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
    if (c === "*") { this.p++; return { derived: true }; }
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
        return decodeStepString(raw);
      }
    }
    if (c === "#") {
      const m = /#(\d+)/y;
      m.lastIndex = this.p;
      const r = m.exec(t);
      if (!r) throw new Error(`'#' with no number at ${this.p}`);
      this.p = m.lastIndex;
      return { ref: Number(r[1]) };
    }
    if (c === ".") {
      const e = t.indexOf(".", this.p + 1);
      if (e < 0) throw new Error(`unterminated enumeration at ${this.p}`);
      const v = t.slice(this.p + 1, e).toUpperCase();
      this.p = e + 1;
      if (v === "T") return true;
      if (v === "F") return false;
      if (v === "U") return { unknown: true };
      return { enum: v };
    }
    if (c === '"') {
      const e = t.indexOf('"', this.p + 1);
      if (e < 0) throw new Error(`unterminated binary at ${this.p}`);
      const v = t.slice(this.p + 1, e);
      this.p = e + 1;
      return { binary: v };
    }
    const num = /[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?/y;
    num.lastIndex = this.p;
    const n = num.exec(t);
    if (n && n.index === this.p) {
      this.p = num.lastIndex;
      return Number(n[0]);
    }
    const kw = /[A-Za-z_][A-Za-z0-9_]*/y;
    kw.lastIndex = this.p;
    const k = kw.exec(t);
    if (k) {
      this.p = kw.lastIndex;
      this.ws();
      const inner = this.list();
      return { typed: k[0].toUpperCase(), value: inner.length === 1 ? inner[0] : inner };
    }
    throw new Error(`unexpected '${c}' at ${this.p}`);
  }
  // The argument list with every nested list left unread: an empty one is
  // EMPTY_LIST, any other SKIPPED_LIST (one placeholder item, so it is a
  // non-empty array). Everything else is read as list() reads it.
  shallowList() {
    this.ws();
    if (this.t[this.p] !== "(") throw new Error(`expected ( at ${this.p}`);
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
      if (c === ")") return out;
      throw new Error(`expected , or ) at ${this.p - 1}`);
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
    throw new Error(`unclosed list at ${this.p}`);
  }
  list() {
    this.ws();
    if (this.t[this.p] !== "(") throw new Error(`expected ( at ${this.p}`);
    this.p++;
    const out = [];
    this.ws();
    if (this.t[this.p] === ")") { this.p++; return out; }
    for (;;) {
      out.push(this.value());
      this.ws();
      const c = this.t[this.p++];
      if (c === ",") continue;
      if (c === ")") return out;
      throw new Error(`expected , or ) at ${this.p - 1}`);
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
// or twice per entity, and which would otherwise all stay in memory.
function entityClass(text, errors, policy) {
  const read = (e) => {
    try {
      return new Reader(text, e._p).list();
    } catch (err) {
      errors.push(`#${e.id}: ${err.message}`);
      return [];
    }
  };
  return class StepEntity {
    constructor(id, type, p) { this.id = id; this.type = type; this._p = p; this._a = undefined; }
    get args() {
      if (this._a !== undefined) return this._a;
      const a = read(this);
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
      if (this._a !== undefined || policy.keep(this.type)) return this.args;
      try {
        return new Reader(text, this._p).shallowList();
      } catch {
        return this.args;
      }
    }
    toJSON() { return { id: this.id, type: this.type, args: this.args }; }
  };
}

export function parseStep(text, opts = {}) {
  const schemaM = text.match(/FILE_SCHEMA\s*\(\s*\(\s*'([^']*)'/i);
  const schema = schemaM ? schemaM[1].toUpperCase() : null;
  const dataStart = text.search(/\bDATA\s*;/);
  if (dataStart < 0) throw new Error("not a STEP file: no DATA section");
  const entities = new Map();
  // A comment between records and a multi-type ("complex") instance
  // #5=(IFCA(...)IFCB(...)) are stepped over whole: the scan once matched
  // '#n=X(' inside them, so a record someone had commented out, or text in a
  // complex instance's string, came back as an entity (red team 2026-11-17).
  // Complex instances are not read (as before), only no longer mined.
  const re = /\/\*|#(\d+)\s*=\s*(?:([A-Za-z0-9_]+)\s*)?\(/g;
  re.lastIndex = dataStart;
  const errors = [];
  const policy = { keep: () => true };
  const Lazy = opts.eager ? null : entityClass(text, errors, policy);
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
    } catch (e) {
      errors.push(`#${id}: ${e.message}`);
    }
    // Never step backwards: a truncated file (an export cut short) once sent
    // the reader to 0 and this loop re-read the file forever, growing errors
    // until the process ran out of memory.
    re.lastIndex = Math.max(r.p, re.lastIndex);
  }
  return { schema, entities, errors, policy };
}
