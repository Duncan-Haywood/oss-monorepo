// ISO 10303-21 (STEP physical file) reader for IFC models.
//
// parseStep(text) -> { schema, entities: Map<id, {id, type, args}> }
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

export function decodeStepString(s) {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "'" && s[i + 1] === "'") { out += "'"; i++; continue; }
    if (c !== "\\") { out += c; continue; }
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
      this.p = m.lastIndex;
      return { ref: Number(r[1]) };
    }
    if (c === ".") {
      const e = t.indexOf(".", this.p + 1);
      const v = t.slice(this.p + 1, e).toUpperCase();
      this.p = e + 1;
      if (v === "T") return true;
      if (v === "F") return false;
      if (v === "U") return { unknown: true };
      return { enum: v };
    }
    if (c === '"') {
      const e = t.indexOf('"', this.p + 1);
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

export function parseStep(text) {
  const schemaM = text.match(/FILE_SCHEMA\s*\(\s*\(\s*'([^']*)'/i);
  const schema = schemaM ? schemaM[1].toUpperCase() : null;
  const dataStart = text.search(/\bDATA\s*;/);
  if (dataStart < 0) throw new Error("not a STEP file: no DATA section");
  const entities = new Map();
  const re = /#(\d+)\s*=\s*([A-Za-z0-9_]+)\s*\(/g;
  re.lastIndex = dataStart;
  const errors = [];
  let m;
  while ((m = re.exec(text))) {
    const id = Number(m[1]);
    const type = m[2].toUpperCase();
    const r = new Reader(text, re.lastIndex - 1);
    try {
      const args = r.list();
      entities.set(id, { id, type, args });
    } catch (e) {
      errors.push(`#${id}: ${e.message}`);
    }
    re.lastIndex = r.p;
  }
  return { schema, entities, errors };
}
