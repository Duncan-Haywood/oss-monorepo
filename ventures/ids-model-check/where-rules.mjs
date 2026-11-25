// The IFC schema's own WHERE rules, run on a STEP model: an interpreter for
// the part of EXPRESS (ISO 10303-11) the IFC schemas use, reading the rules,
// DERIVE expressions, functions and global RULEs from schema/rules-*.json
// (schema/gen-rules.mjs, from the buildingSMART .exp files).
//
// Why: an IDS check reads values, and a WHERE rule says when a value means
// what it says. IfcWall.CorrectPredefinedType: a wall whose PredefinedType is
// USERDEFINED must say what it is in ObjectType, which is where an IDS
// predefinedType facet then looks. IfcWall.CorrectTypeAssigned: a wall's type
// must be an IfcWallType, so the properties it inherits are a wall type's.
// Measured beside ifcopenshell.validate(express_rules=True):
// eval/where-rules-2026-11-24.md.
//
// whereRules(parsed, schema, rules) -> { findings, stats }
//   parsed: parseStep(text, { eager: true }); schema: ids.mjs Schema;
//   rules: schema/rules-*.json.
//   findings: [{ code: "where-rule", id, type, attr: "Entity.Label", message }]
//   stats: { evaluated, failed, unknown, errors: [{ rule, count, first }] }
// A rule fails only when it comes out FALSE: UNKNOWN or indeterminate passes,
// as ISO 10303-11 says. A rule this cannot evaluate (a construct it does not
// know, a value of a shape the rule did not expect) is counted in
// stats.errors and never reported as a fault.

const UNK = Symbol("UNKNOWN");
class Enum { constructor(v) { this.v = v; } }
class Typed { constructor(type, v) { this.type = type; this.v = v; } }
class Partial { constructor(type, args) { this.type = type; this.args = args; } }
class Fault extends Error {}
class Return { constructor(v) { this.v = v; } }
const ESCAPE = Symbol("ESCAPE"), SKIP = Symbol("SKIP");

// ------------------------------------------------------------ tokens --

const KW = new Set(["AND", "OR", "XOR", "NOT", "IN", "LIKE", "DIV", "MOD", "QUERY", "SELF", "TRUE", "FALSE", "UNKNOWN",
  "IF", "THEN", "ELSE", "END_IF", "CASE", "OF", "OTHERWISE", "END_CASE", "REPEAT", "TO", "BY", "WHILE", "UNTIL",
  "END_REPEAT", "RETURN", "ESCAPE", "SKIP", "BEGIN", "END", "LOCAL", "END_LOCAL", "FUNCTION", "END_FUNCTION", "PI", "CONST_E"]);

function tokenize(src) {
  const out = [];
  const re = /\s+|'((?:[^']|'')*)'|(\d+(?:\.\d*)?(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)|([A-Za-z_][A-Za-z0-9_]*)|(:=:|:<>:|:=|<>|<=|>=|<\*|\|\||\*\*|[-+*\/=<>()[\]{},;:.\\?|])/gy;
  let m;
  while (re.lastIndex < src.length) {
    const at = re.lastIndex;
    m = re.exec(src);
    if (!m) throw new Fault(`cannot read EXPRESS at '${src.slice(at, at + 20)}'`);
    if (m[1] !== undefined) out.push({ t: "str", v: m[1].replace(/''/g, "'") });
    else if (m[2] !== undefined) out.push({ t: "num", v: Number(m[2].replace(/\.$/, "")), int: !/[.eE]/.test(m[2]) });
    else if (m[3] !== undefined) { const u = m[3].toUpperCase(); out.push(KW.has(u) ? { t: "kw", v: u } : { t: "id", v: u }); }
    else if (m[4] !== undefined) out.push({ t: "op", v: m[4] });
  }
  out.push({ t: "eof", v: "" });
  return out;
}

// ------------------------------------------------------------ parser --

class Parser {
  constructor(src) { this.k = tokenize(src); this.i = 0; }
  peek(o = 0) { return this.k[this.i + o]; }
  next() { return this.k[this.i++]; }
  is(v, o = 0) { const t = this.peek(o); return (t.t === "op" || t.t === "kw") && t.v === v; }
  eat(v) { if (this.is(v)) { this.i++; return true; } return false; }
  want(v) { if (!this.eat(v)) throw new Fault(`expected ${v} at '${this.peek().v}'`); }
  ident() { const t = this.next(); if (t.t !== "id") throw new Fault(`expected a name at '${t.v}'`); return t.v; }

  // Precedence, lowest first (ISO 10303-11 12.1): relational; + - OR XOR;
  // * / DIV MOD AND ||; **; unary; component references.
  expr() {
    let l = this.simple();
    for (;;) {
      const t = this.peek();
      if ((t.t === "op" && ["=", "<>", "<", ">", "<=", ">=", ":=:", ":<>:"].includes(t.v)) || (t.t === "kw" && (t.v === "IN" || t.v === "LIKE"))) {
        this.i++;
        l = { k: "bin", op: t.v, l, r: this.simple() };
      } else return l;
    }
  }
  simple() {
    let l = this.term();
    for (;;) {
      const t = this.peek();
      if ((t.t === "op" && (t.v === "+" || t.v === "-")) || (t.t === "kw" && (t.v === "OR" || t.v === "XOR"))) { this.i++; l = { k: "bin", op: t.v, l, r: this.term() }; }
      else return l;
    }
  }
  term() {
    let l = this.factor();
    for (;;) {
      const t = this.peek();
      if ((t.t === "op" && (t.v === "*" || t.v === "/" || t.v === "||")) || (t.t === "kw" && (t.v === "DIV" || t.v === "MOD" || t.v === "AND"))) { this.i++; l = { k: "bin", op: t.v, l, r: this.factor() }; }
      else return l;
    }
  }
  factor() {
    const l = this.unary();
    if (this.eat("**")) return { k: "bin", op: "**", l, r: this.factor() };
    return l;
  }
  unary() {
    if (this.eat("NOT")) return { k: "un", op: "NOT", x: this.unary() };
    if (this.eat("-")) return { k: "un", op: "-", x: this.unary() };
    if (this.eat("+")) return this.unary();
    return this.postfix(this.primary());
  }
  postfix(x) {
    for (;;) {
      if (this.eat(".")) x = { k: "attr", o: x, n: this.ident() };
      else if (this.eat("\\")) x = { k: "group", o: x, n: this.ident() };
      else if (this.is("[")) {
        this.i++;
        const a = this.expr();
        let b = null;
        if (this.eat(":")) b = this.expr();
        this.want("]");
        x = { k: "index", o: x, a, b };
      } else return x;
    }
  }
  primary() {
    const t = this.next();
    if (t.t === "num") return { k: "val", v: t.v };
    if (t.t === "str") return { k: "val", v: t.v };
    if (t.t === "op" && t.v === "?") return { k: "val", v: undefined };
    if (t.t === "op" && t.v === "(") { const e = this.expr(); this.want(")"); return e; }
    if (t.t === "op" && t.v === "[") {
      const items = [];
      if (!this.eat("]")) {
        do { const e = this.expr(); items.push(this.eat(":") ? { k: "rep", e, n: this.expr() } : e); } while (this.eat(","));
        this.want("]");
      }
      return { k: "agg", items };
    }
    if (t.t === "op" && t.v === "{") {
      const lo = this.simple(); const op1 = this.next().v; const x = this.simple(); const op2 = this.next().v; const hi = this.simple();
      this.want("}");
      return { k: "interval", lo, op1, x, op2, hi };
    }
    if (t.t === "kw") {
      if (t.v === "TRUE") return { k: "val", v: true };
      if (t.v === "FALSE") return { k: "val", v: false };
      if (t.v === "UNKNOWN") return { k: "val", v: UNK };
      if (t.v === "SELF") return { k: "self" };
      if (t.v === "PI") return { k: "val", v: Math.PI };
      if (t.v === "CONST_E") return { k: "val", v: Math.E };
      if (t.v === "QUERY") {
        this.want("(");
        const v = this.ident();
        this.want("<*");
        const src = this.expr();
        this.want("|");
        const cond = this.expr();
        this.want(")");
        return { k: "query", v, src, cond };
      }
    }
    if (t.t === "id") {
      if (this.is("(")) {
        this.i++;
        const args = [];
        if (!this.eat(")")) { do args.push(this.expr()); while (this.eat(",")); this.want(")"); }
        return { k: "call", n: t.v, args };
      }
      return { k: "id", n: t.v };
    }
    throw new Fault(`unexpected '${t.v}'`);
  }

  // Statements, for FUNCTION and RULE bodies.
  skipType() {
    // A type in a declaration: read up to the ';' or ':=' that ends it.
    let d = 0;
    while (!(d === 0 && (this.is(";") || this.is(":=") || this.is(")")))) {
      const t = this.next();
      if (t.t === "eof") throw new Fault("unterminated type");
      if (t.v === "(" || t.v === "[") d++;
      if (t.v === ")" || t.v === "]") d--;
    }
  }
  locals() {
    const out = [];
    if (!this.eat("LOCAL")) return out;
    while (!this.eat("END_LOCAL")) {
      const names = [this.ident()];
      while (this.eat(",")) names.push(this.ident());
      this.want(":");
      const set = this.peek().t === "id" && this.peek().v === "SET";
      // ARRAY [lo:hi]: indices start at lo (IfcListToArray's ARRAY [Low:U],
      // a B-spline surface's weights from 0).
      let lo = null;
      if (this.peek().t === "id" && this.peek().v === "ARRAY" && this.is("[", 1)) {
        const at = this.i;
        this.i += 2;
        lo = this.expr();
        this.i = at;
      }
      this.skipType();
      const init = this.eat(":=") ? this.expr() : null;
      this.want(";");
      for (const n of names) out.push({ n, init, set, lo });
    }
    this.eat(";");
    return out;
  }
  func() {
    this.want("FUNCTION");
    const name = this.ident();
    const params = [];
    this.want("(");
    for (;;) {
      const names = [this.ident()];
      while (this.eat(",")) names.push(this.ident());
      this.want(":");
      this.skipType();
      params.push(...names);
      if (this.eat(";")) continue;
      this.want(")");
      break;
    }
    this.want(":");
    this.skipType();
    this.want(";");
    const locals = this.locals();
    const body = this.block(["END_FUNCTION"]);
    return { name, params, locals, body };
  }
  block(ends) {
    const out = [];
    while (!ends.some((e) => this.is(e)) && this.peek().t !== "eof") {
      const s = this.stmt();
      if (s) out.push(s);
    }
    return out;
  }
  stmt() {
    if (this.eat(";")) return null;
    if (this.eat("IF")) {
      const c = this.expr();
      this.want("THEN");
      const a = this.block(["ELSE", "END_IF"]);
      const b = this.eat("ELSE") ? this.block(["END_IF"]) : [];
      this.want("END_IF"); this.eat(";");
      return { s: "if", c, a, b };
    }
    if (this.eat("CASE")) {
      const sel = this.expr();
      this.want("OF");
      const arms = [];
      let other = null;
      while (!this.is("END_CASE")) {
        if (this.eat("OTHERWISE")) { this.want(":"); other = [this.stmt()].filter(Boolean); continue; }
        const labels = [this.expr()];
        while (this.eat(",")) labels.push(this.expr());
        this.want(":");
        arms.push({ labels, body: [this.stmt()].filter(Boolean) });
      }
      this.want("END_CASE"); this.eat(";");
      return { s: "case", sel, arms, other };
    }
    if (this.eat("REPEAT")) {
      let v = null, from = null, to = null, by = null, wh = null, un = null;
      if (this.peek().t === "id" && this.is(":=", 1)) {
        v = this.ident(); this.want(":="); from = this.expr(); this.want("TO"); to = this.expr();
        if (this.eat("BY")) by = this.expr();
      }
      if (this.eat("WHILE")) wh = this.expr();
      if (this.eat("UNTIL")) un = this.expr();
      this.want(";");
      const body = this.block(["END_REPEAT"]);
      this.want("END_REPEAT"); this.eat(";");
      return { s: "repeat", v, from, to, by, wh, un, body };
    }
    if (this.eat("BEGIN")) { const body = this.block(["END"]); this.want("END"); this.eat(";"); return { s: "block", body }; }
    if (this.eat("RETURN")) {
      const x = this.is(";") ? null : this.expr();
      this.eat(";");
      return { s: "return", x };
    }
    if (this.eat("ESCAPE")) { this.eat(";"); return { s: "escape" }; }
    if (this.eat("SKIP")) { this.eat(";"); return { s: "skip" }; }
    const target = this.postfix(this.primary());
    if (this.eat(":=")) { const x = this.expr(); this.eat(";"); return { s: "assign", target, x }; }
    this.eat(";");
    return { s: "call", x: target };
  }
}

const cache = new WeakMap();
function compiled(R) {
  let c = cache.get(R);
  if (c) return c;
  c = { entities: new Map(), types: new Map(), functions: new Map(), rules: [], derive: new Map(), bad: [] };
  const parse = (src, what) => { try { const p = new Parser(src); const e = p.expr(); if (p.peek().t !== "eof") throw new Fault(`trailing '${p.peek().v}'`); return e; } catch (err) { c.bad.push(`${what}: ${err.message}`); return null; } };
  for (const [ent, d] of Object.entries(R.entities)) {
    if (d.where) c.entities.set(ent, d.where.map(([label, src]) => ({ label, src, ast: parse(src, `${ent}.${label}`) })));
    if (d.derive) c.derive.set(ent, new Map(Object.entries(d.derive).map(([n, src]) => [n.toUpperCase(), { name: n, ast: parse(src, `${ent}.${n}`) }])));
  }
  for (const [t, w] of Object.entries(R.types)) c.types.set(t, w.map(([label, src]) => ({ label, src, ast: parse(src, `${t}.${label}`) })));
  for (const [n, src] of Object.entries(R.functions)) {
    try { c.functions.set(n, new Parser(src).func()); } catch (err) { c.bad.push(`${n}: ${err.message}`); }
  }
  for (const r of R.rules) {
    try {
      const p = new Parser(r.body);
      const locals = p.locals();
      const body = p.block([]);
      c.rules.push({ name: r.name, for: r.for.map((x) => x.toUpperCase()), locals, body, where: r.where.map(([label, src]) => ({ label, src, ast: parse(src, `${r.name}.${label}`) })) });
    } catch (err) { c.bad.push(`${r.name}: ${err.message}`); }
  }
  cache.set(R, c);
  return c;
}

// ---------------------------------------------------------- evaluator --

// A value as text, for probes and messages.
function show(v, d = 0) {
  if (v === undefined) return "?";
  if (v === UNK) return "UNKNOWN";
  if (v instanceof Enum) return "." + v.v + ".";
  if (v instanceof Typed) return `${v.type}(${show(v.v, d)})`;
  if (Array.isArray(v)) return d > 2 ? "[...]" : "[" + v.map((x) => show(x, d + 1)).join(", ") + "]";
  if (v && typeof v === "object" && typeof v.type === "string") return v.id != null ? `#${v.id}=${v.type}` : `${v.type}(${d > 2 ? "..." : v.args.map((a) => JSON.stringify(a && a.inst ? "(" + a.inst.type + ")" : a)).join(",")})`;
  return JSON.stringify(v);
}
const isInst = (v) => v && typeof v === "object" && typeof v.type === "string" && Array.isArray(v.args) && !(v instanceof Partial);
const un = (v) => (v instanceof Typed ? un(v.v) : v);
const truth = (v) => (v === true ? true : v === false ? false : UNK);
const not = (v) => (v === true ? false : v === false ? true : UNK);

export function whereRules(parsed, S, R, { only = null, probe = null } = {}) {
  const C = compiled(R);
  const E = parsed.entities;
  const SCH = (R.schema || S.name || "").toUpperCase();
  const stats = { evaluated: 0, failed: 0, unknown: 0, errors: new Map() };
  const findings = [];

  // Per class, attribute name (upper case) -> slot, and the case-insensitive
  // inverse table.
  const slotCache = new Map();
  const slotsOf = (type) => {
    let m = slotCache.get(type);
    if (m) return m;
    const ats = S.attrs(type);
    m = new Map(ats.map((a, i) => [a.name.toUpperCase(), i]));
    slotCache.set(type, m);
    return m;
  };
  const invCache = new Map();
  const inverseOf = (type, name) => {
    const key = type + "|" + name;
    if (invCache.has(key)) return invCache.get(key);
    let r = null;
    for (let t = type; t && S.entities[t] && !r; t = S.entities[t].super) {
      for (const [n, v] of Object.entries(S.entities[t].inverseFor || {})) if (n.toUpperCase() === name) {
        const d = R.entities[t];
        r = [v[0], v[1], !!(d && d.singleInverse && d.singleInverse.includes(n))];
        break;
      }
    }
    invCache.set(key, r);
    return r;
  };
  // Who points at a record through attribute `attr` (as named in the schema).
  const pointerIdx = new Map();
  const refsIn = (v, out) => { if (Array.isArray(v)) for (const x of v) refsIn(x, out); else if (v && typeof v === "object" && "ref" in v) out.push(v.ref); return out; };
  const pointers = (attrU) => {
    let idx = pointerIdx.get(attrU);
    if (idx) return idx;
    idx = new Map();
    for (const r of E.values()) {
      if (!S.has(r.type)) continue;
      const i = slotsOf(r.type).get(attrU);
      if (i === undefined || i >= r.args.length) continue;
      for (const t of refsIn(r.args[i], [])) {
        let l = idx.get(t);
        if (!l) idx.set(t, (l = []));
        if (l[l.length - 1] !== r) l.push(r);
      }
    }
    pointerIdx.set(attrU, idx);
    return idx;
  };
  let allRefs = null;
  const referrers = (inst) => {
    if (!allRefs) {
      allRefs = new Map();
      for (const r of E.values()) for (const t of new Set(refsIn(r.args, []))) { let l = allRefs.get(t); if (!l) allRefs.set(t, (l = [])); l.push(r); }
    }
    return allRefs.get(inst.id) || [];
  };
  const popCache = new Map();
  const population = (ent) => {
    let l = popCache.get(ent);
    if (!l) { l = []; for (const r of E.values()) if (S.has(r.type) && S.isA(r.type, ent)) l.push(r); popCache.set(ent, l); }
    return l;
  };

  // A raw STEP value as an EXPRESS value, typed by its declared type.
  const conv = (raw, t) => {
    if (raw === null || raw === undefined) return undefined;
    if (Array.isArray(raw)) {
      const d = S.types[t];
      const el = d && d.kind === "aggregate" ? d.of : t;
      const out = raw.map((x) => conv(x, el));
      return d && d.kind === "aggregate" ? new Typed(t, out) : out;
    }
    if (typeof raw === "object") {
      if ("ref" in raw) return raw.inst || E.get(raw.ref);
      if ("enum" in raw) return new Enum(raw.enum);
      if (raw.unknown) return UNK;
      if ("typed" in raw) return new Typed(raw.typed, conv(raw.value, raw.typed));
      if (raw.derived) return undefined;
      if ("binary" in raw) return raw.binary;
      return undefined;
    }
    const d = S.types[t];
    if (d && (d.kind === "defined" || d.kind === "enum")) return new Typed(t, raw);
    return raw;
  };

  const deriveCache = new Map();
  const attrCache = new WeakMap();
  // Aggregates a function may write into: anything else (a record's cached
  // value) is copied before the first write.
  const owned = new WeakSet();
  let depth = 0;
  const getAttr = (inst, nameU) => {
    if (inst instanceof Typed) inst = un(inst);
    if (!isInst(inst)) {
      if (inst === undefined || inst === UNK) return undefined;
      throw new Fault(`.${nameU} of a value that is not an entity`);
    }
    if (!S.has(inst.type)) return undefined;
    const i = slotsOf(inst.type).get(nameU);
    const ats = S.attrs(inst.type);
    if (i !== undefined && !(ats[i].derived)) {
      const raw = inst.args[i];
      if (raw && typeof raw === "object" && raw.derived) return derive(inst, nameU);
      // A file record's values are converted once: a rule that walks a
      // 65,536-pixel list re-read it per pixel otherwise (IFC4.3 sample
      // tessellation-with-pixel-texture took 20 s).
      if (inst.id == null) return conv(raw, ats[i].type);
      let row = attrCache.get(inst);
      if (!row) attrCache.set(inst, (row = []));
      if (!(i in row)) row[i] = conv(raw, ats[i].type);
      return row[i];
    }
    if (i !== undefined || hasDerive(inst.type, nameU)) return derive(inst, nameU);
    const inv = inverseOf(inst.type, nameU);
    if (inv) {
      if (inst.id === null || inst.id === undefined) return inv[2] ? undefined : [];
      const l = (pointers(inv[1].toUpperCase()).get(inst.id) || []).filter((r) => S.isA(r.type, inv[0]));
      // A bare inverse holds one record: none is indeterminate, and more
      // than one is the inverse-count fault conformance.mjs reports.
      return inv[2] ? l[0] : l;
    }
    throw new Fault(`${inst.type} has no attribute ${nameU}`);
  };
  const hasDerive = (type, nameU) => { for (let t = type; t && S.entities[t]; t = S.entities[t].super) { const d = C.derive.get(t); if (d && d.has(nameU)) return true; } return false; };
  const derive = (inst, nameU) => {
    const key = inst.id != null ? inst.id + "|" + nameU : null;
    if (key && deriveCache.has(key)) return deriveCache.get(key);
    let ast = null;
    for (let t = inst.type; t && S.entities[t] && !ast; t = S.entities[t].super) { const d = C.derive.get(t); if (d && d.has(nameU)) ast = d.get(nameU).ast; }
    if (!ast) return undefined;
    if (++depth > 200) { depth--; throw new Fault("derive recursion"); }
    try {
      const v = ev(ast, { self: inst, vars: new Map() });
      if (key) deriveCache.set(key, v);
      return v;
    } finally { depth--; }
  };

  const typeNames = (v) => {
    if (v instanceof Typed) {
      const out = [];
      for (let t = v.type, g = 0; t && g < 20; g++) {
        out.push(`${SCH}.${t}`);
        const d = S.types[t];
        t = d && d.kind === "defined" && S.types[d.of] ? d.of : null;
      }
      return out;
    }
    if (isInst(v)) { const out = []; for (let t = v.type; t && S.entities[t]; t = S.entities[t].super) out.push(`${SCH}.${t}`); return out; }
    if (v instanceof Partial) return [`${SCH}.${v.type}`];
    if (typeof v === "number") return Number.isInteger(v) ? ["INTEGER", "NUMBER"] : ["REAL", "NUMBER"];
    if (typeof v === "string") return ["STRING"];
    if (v === true || v === false) return ["BOOLEAN", "LOGICAL"];
    if (v === UNK) return ["LOGICAL"];
    return [];
  };

  const eq = (a, b, deep = 0) => {
    a = un(a); b = un(b);
    if (a === undefined || b === undefined) return UNK;
    if (a === UNK || b === UNK) return UNK;
    if (a instanceof Enum || b instanceof Enum) {
      const x = a instanceof Enum ? a.v : a === true ? "T" : a === false ? "F" : a;
      const y = b instanceof Enum ? b.v : b === true ? "T" : b === false ? "F" : b;
      return x === y;
    }
    if (typeof a === "number" && typeof b === "number") return a === b;
    if (typeof a !== typeof b) return false;
    if (typeof a !== "object") return a === b;
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      let r = true;
      for (let i = 0; i < a.length; i++) { const x = eq(a[i], b[i], deep); if (x === false) return false; if (x !== true) r = UNK; }
      return r;
    }
    if (isInst(a) && isInst(b)) {
      if (a === b) return true;
      if (a.id != null && b.id != null && a.id === b.id) return true;
      if (a.type !== b.type) return false;
      if (deep > 6) return a === b;
      const ats = S.attrs(a.type);
      let r = true;
      for (let i = 0; i < ats.length; i++) {
        const x = eq(conv(a.args[i], ats[i].type), conv(b.args[i], ats[i].type), deep + 1);
        if (x === false) return false;
        if (x !== true) { if (a.args[i] == null && b.args[i] == null) continue; r = UNK; }
      }
      return r;
    }
    return a === b;
  };
  const cmp = (op, a, b) => {
    a = un(a); b = un(b);
    if (a === undefined || b === undefined || a === UNK || b === UNK) return UNK;
    if (a instanceof Enum) a = a.v;
    if (b instanceof Enum) b = b.v;
    if (typeof a !== typeof b || (typeof a !== "number" && typeof a !== "string")) throw new Fault(`cannot order ${typeof a} and ${typeof b}`);
    return op === "<" ? a < b : op === ">" ? a > b : op === "<=" ? a <= b : a >= b;
  };
  const num = (v) => { v = un(v); if (typeof v !== "number") throw new Fault(`a number was needed, got ${v === undefined ? "?" : typeof v}`); return v; };
  const agg = (v) => { v = un(v); if (!Array.isArray(v)) throw new Fault("an aggregate was needed"); return v; };

  const BUILTIN = {
    SIZEOF: ([x]) => { x = un(x); return x === undefined ? undefined : agg(x).length; },
    HIINDEX: ([x]) => { x = un(x); return x === undefined ? undefined : (agg(x).lo ?? 1) + agg(x).length - 1; },
    LOINDEX: ([x]) => { x = un(x); return x === undefined ? undefined : agg(x).lo ?? 1; },
    HIBOUND: () => undefined,
    LOBOUND: () => 1,
    EXISTS: ([x]) => x !== undefined && un(x) !== undefined,
    TYPEOF: ([x]) => (x === undefined ? [] : typeNames(x)),
    NVL: ([x, y]) => (x === undefined || un(x) === undefined ? y : x),
    ABS: ([x]) => { x = un(x); return x === undefined ? undefined : Math.abs(num(x)); },
    SQRT: ([x]) => { x = un(x); return x === undefined ? undefined : Math.sqrt(num(x)); },
    SIN: ([x]) => Math.sin(num(x)), COS: ([x]) => Math.cos(num(x)), TAN: ([x]) => Math.tan(num(x)),
    ASIN: ([x]) => Math.asin(num(x)), ACOS: ([x]) => Math.acos(num(x)),
    ATAN: ([x, y]) => Math.atan(num(x) / num(y)),
    EXP: ([x]) => Math.exp(num(x)), LOG: ([x]) => Math.log(num(x)), LOG2: ([x]) => Math.log2(num(x)), LOG10: ([x]) => Math.log10(num(x)),
    ODD: ([x]) => num(x) % 2 !== 0,
    LENGTH: ([x]) => { x = un(x); return x === undefined ? undefined : String(x).length; },
    BLENGTH: ([x]) => { x = un(x); if (x === undefined) return undefined; const s = String(x); return Math.max(0, (s.length - 1) * 4 - Number(s[0] || 0)); },
    VALUE: ([x]) => { x = un(x); if (x === undefined) return undefined; const n = Number(x); return Number.isNaN(n) ? undefined : n; },
    FORMAT: ([x]) => { x = un(x); return x === undefined ? undefined : String(x); },
    VALUE_IN: ([a, x]) => { a = un(a); if (a === undefined) return UNK; let r = false; for (const y of agg(a)) { const q = eq(y, x); if (q === true) return true; if (q !== false) r = UNK; } return r; },
    VALUE_UNIQUE: ([a]) => { a = agg(a); for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) if (eq(a[i], a[j]) === true) return false; return true; },
    USEDIN: ([x, role]) => {
      x = un(x); role = un(role);
      if (!isInst(x) || x.id == null) return [];
      if (!role) return referrers(x);
      const parts = String(role).toUpperCase().split(".");
      const [ent, at] = parts.length === 3 ? [parts[1], parts[2]] : [parts[0], parts[1]];
      return (pointers(at).get(x.id) || []).filter((r) => S.isA(r.type, ent));
    },
    ROLESOF: ([x]) => {
      x = un(x);
      if (!isInst(x) || x.id == null) return [];
      const out = new Set();
      for (const r of referrers(x)) {
        const ats = S.attrs(r.type);
        ats.forEach((a, i) => { if (refsIn(r.args[i], []).includes(x.id)) for (let t = r.type; t && S.entities[t]; t = S.entities[t].super) if (S.entities[t].attrs.some((y) => y.name === a.name)) { out.add(`${SCH}.${t}.${a.name.toUpperCase()}`); break; } });
      }
      return [...out];
    },
  };

  const lookup = (n, cx) => {
    for (let c = cx; c; c = c.up) if (c.vars.has(n)) return c.vars.get(n);
    if (cx.self !== undefined && isInst(cx.self) && S.has(cx.self.type)) {
      if (slotsOf(cx.self.type).has(n) || hasDerive(cx.self.type, n) || inverseOf(cx.self.type, n)) return getAttr(cx.self, n);
    }
    if (cx.population && cx.population.has(n)) return cx.population.get(n);
    return new Enum(n); // a bare enumeration value (CASE labels, comparisons)
  };

  const ev = (x, cx) => {
    switch (x.k) {
      case "val": return x.v;
      case "self": return cx.self;
      case "id": return lookup(x.n, cx);
      case "attr": {
        if (x.o.k === "id" && S.types[x.o.n] && S.types[x.o.n].kind === "enum") return new Enum(x.n);
        return getAttr(ev(x.o, cx), x.n);
      }
      case "group": return ev(x.o, cx);
      case "index": {
        let o = un(ev(x.o, cx));
        if (o === undefined) return undefined;
        const a = num(ev(x.a, cx));
        if (x.b) { const b = num(ev(x.b, cx)); return typeof o === "string" ? o.slice(a - 1, b) : agg(o).slice(a - 1, b); }
        if (typeof o === "string") return o[a - 1];
        o = agg(o);
        const lo = o.lo ?? 1;
        return a >= lo && a < lo + o.length ? o[a - lo] : undefined;
      }
      case "agg": {
        const out = [];
        for (const i of x.items) {
          if (i.k !== "rep") { out.push(ev(i, cx)); continue; }
          const v = ev(i.e, cx), n = un(ev(i.n, cx));
          if (n === undefined) return undefined;
          for (let j = 0; j < num(n); j++) out.push(v);
        }
        return out;
      }
      case "interval": {
        const l = cmp(x.op1, ev(x.lo, cx), ev(x.x, cx)), r = cmp(x.op2, ev(x.x, cx), ev(x.hi, cx));
        return and(l, r);
      }
      case "query": {
        const src = un(ev(x.src, cx));
        if (src === undefined) return undefined;
        const out = [];
        for (const item of agg(src)) {
          const c = { vars: new Map([[x.v, item]]), up: cx, self: cx.self, population: cx.population };
          if (truth(ev(x.cond, c)) === true) out.push(item);
        }
        return out;
      }
      case "un": {
        const v = ev(x.x, cx);
        if (x.op === "NOT") return un(v) === undefined ? UNK : not(un(v));
        const n = un(v);
        return n === undefined ? undefined : -num(n);
      }
      case "bin": return bin(x, cx);
      case "call": return call(x, cx);
    }
    throw new Fault(`cannot evaluate ${x.k}`);
  };
  const and = (a, b) => { a = un(a); b = un(b); if (a === false || b === false) return false; if (a === true && b === true) return true; return UNK; };
  const or = (a, b) => { a = un(a); b = un(b); if (a === true || b === true) return true; if (a === false && b === false) return false; return UNK; };
  const bin = (x, cx) => {
    const op = x.op;
    if (op === "AND") { const a = ev(x.l, cx); if (un(a) === false) return false; return and(a, ev(x.r, cx)); }
    if (op === "OR") { const a = ev(x.l, cx); if (un(a) === true) return true; return or(a, ev(x.r, cx)); }
    const a = ev(x.l, cx), b = ev(x.r, cx);
    switch (op) {
      case "XOR": { const p = un(a), q = un(b); if ((p !== true && p !== false) || (q !== true && q !== false)) return UNK; return p !== q; }
      case "=": return eq(a, b);
      case "<>": return not(eq(a, b));
      // Instance equality. Two records with equal values count as one, as
      // ifcopenshell.validate counts them (compare_instances_by_value): an
      // edge loop whose last vertex is a second record at the first vertex's
      // point is closed (web-ifc ISSUE_171, 20 loops).
      case ":=:": { const p = un(a), q = un(b); if (p === undefined || q === undefined) return UNK; if (isInst(p) && isInst(q)) return p === q || (p.id != null && p.id === q.id) || eq(p, q) === true; return eq(p, q); }
      case ":<>:": { const p = un(a), q = un(b); if (p === undefined || q === undefined) return UNK; if (isInst(p) && isInst(q)) return !(p === q || (p.id != null && p.id === q.id) || eq(p, q) === true); return not(eq(p, q)); }
      case "<": case ">": case "<=": case ">=": return cmp(op, a, b);
      case "IN": {
        const s = un(b);
        if (s === undefined || un(a) === undefined) return UNK;
        let r = false;
        for (const y of agg(s)) { const q = eq(a, y); if (q === true) return true; if (q !== false) r = UNK; }
        return r;
      }
      case "LIKE": return UNK;
      case "+": case "-": case "*": {
        const p = un(a), q = un(b);
        if (p === undefined || q === undefined) return undefined;
        if (Array.isArray(p)) {
          const qa = Array.isArray(q) ? q : [q];
          if (op === "+") {
            if (!p.isSet) return [...p, ...qa];
            // A set's members are distinct: instances by identity, values by equality.
            const out = p.slice();
            out.isSet = true;
            for (const z of qa) if (!out.some((y) => (isInst(un(y)) || isInst(un(z)) ? un(y) === un(z) || (un(y).id != null && un(y).id === (un(z) || {}).id) : eq(y, z) === true))) out.push(z);
            return out;
          }
          if (op === "-") return p.filter((y) => !qa.some((z) => eq(y, z) === true));
          return p.filter((y) => qa.some((z) => eq(y, z) === true));
        }
        if (Array.isArray(q) && op === "+") return [p, ...q];
        return op === "+" ? num(p) + num(q) : op === "-" ? num(p) - num(q) : num(p) * num(q);
      }
      case "/": { const p = un(a), q = un(b); if (p === undefined || q === undefined) return undefined; return num(p) / num(q); }
      case "DIV": { const p = un(a), q = un(b); if (p === undefined || q === undefined) return undefined; return Math.trunc(num(p) / num(q)); }
      case "MOD": { const p = un(a), q = un(b); if (p === undefined || q === undefined) return undefined; return num(p) % num(q); }
      case "**": { const p = un(a), q = un(b); if (p === undefined || q === undefined) return undefined; return num(p) ** num(q); }
      case "||": {
        const p = un(a), q = un(b);
        if (typeof p === "string" || typeof q === "string") return p === undefined || q === undefined ? undefined : String(p) + String(q);
        const parts = [...(p instanceof Partial ? [p] : p && p.parts ? p.parts : []), ...(q instanceof Partial ? [q] : q && q.parts ? q.parts : [])];
        return combine(parts);
      }
    }
    throw new Fault(`operator ${op}`);
  };
  // A complex instance built from partial entity values (IfcRepresentationItem()
  // || IfcGeometricRepresentationItem() || IfcDirection(...)): the most specific
  // class, its attributes taken from each partial in supertype order.
  const combine = (parts) => {
    const leaf = parts.find((p) => parts.every((q) => S.isA(p.type, q.type)));
    if (!leaf) return { parts };
    const chain = [];
    for (let t = leaf.type; t && S.entities[t]; t = S.entities[t].super) chain.unshift(t);
    const args = [];
    for (const t of chain) {
      const p = parts.find((q) => q.type === t);
      const n = S.entities[t].attrs.length;
      for (let i = 0; i < n; i++) args.push(p ? raw(p.args[i]) : null);
    }
    const inst = { id: null, type: leaf.type, args, parts, own: true };
    return inst;
  };
  // An EXPRESS value back as a raw STEP value, for transient instances.
  const raw = (v) => {
    if (v === undefined) return null;
    if (v instanceof Typed) return raw(v.v);
    if (v instanceof Enum) return { enum: v.v };
    if (v === UNK) return { unknown: true };
    if (Array.isArray(v)) return v.map(raw);
    if (isInst(v)) return v.id != null ? { ref: v.id, inst: v } : { ref: null, inst: v };
    return v;
  };

  // A LOCAL's first value; a SET keeps its members distinct when added to.
  const local = (l, cx) => {
    if (l.lo) (cx.lo || (cx.lo = new Map())).set(l.n, l.lo);
    const v = l.init ? ev(l.init, cx) : undefined;
    if (l.set && Array.isArray(un(v))) { const a = un(v).slice(); a.isSet = true; return a; }
    return bounded(l.n, v, cx);
  };
  // An array given to a LOCAL declared ARRAY [lo:hi] takes that lower index.
  const bounded = (n, v, cx) => {
    const a = un(v);
    if (!Array.isArray(a)) return v;
    for (let c = cx; c; c = c.up) if (c.lo && c.lo.has(n)) {
      const lo = un(ev(c.lo.get(n), c));
      if (typeof lo !== "number" || lo === (a.lo ?? 1)) return v;
      const b = copyArr(a);
      b.lo = lo;
      owned.add(b);
      return b;
    }
    return v;
  };
  const call = (x, cx) => {
    const n = x.n;
    if (S.entities[n]) {
      const p = new Partial(n, x.args.map((a) => ev(a, cx)));
      // A lone constructor of a class with no supertype is a whole instance.
      return S.entities[n].super ? p : combine([p]);
    }
    if (S.types[n]) { const v = ev(x.args[0], cx); return new Typed(n, un(v)); }
    if (Object.hasOwn(BUILTIN, n)) return BUILTIN[n](x.args.map((a) => ev(a, cx)));
    const f = C.functions.get(n);
    if (!f) throw new Fault(`unknown function ${n}`);
    const vars = new Map();
    f.params.forEach((p, i) => vars.set(p, x.args[i] ? ev(x.args[i], cx) : undefined));
    const fc = { vars, up: null, self: undefined, population: cx.population };
    for (const l of f.locals) vars.set(l.n, local(l, fc));
    if (++depth > 200) { depth--; throw new Fault("function recursion"); }
    try {
      const r = run(f.body, fc);
      return r instanceof Return ? r.v : undefined;
    } finally { depth--; }
  };

  let steps = 0;
  const run = (body, cx) => {
    for (const s of body) {
      if (++steps > 2e6) throw new Fault("too many steps");
      const r = exec(s, cx);
      if (r !== undefined) return r;
    }
    return undefined;
  };
  const exec = (s, cx) => {
    switch (s.s) {
      case "if": { const c = un(ev(s.c, cx)); return run(c === true ? s.a : s.b, cx); }
      case "case": {
        const v = ev(s.sel, cx);
        for (const arm of s.arms) if (arm.labels.some((l) => eq(v, ev(l, cx)) === true)) return run(arm.body, cx);
        return s.other ? run(s.other, cx) : undefined;
      }
      case "repeat": {
        let i = s.v ? num(ev(s.from, cx)) : 0;
        const to = s.v ? ev(s.to, cx) : undefined;
        if (s.v && un(to) === undefined) return undefined;
        const by = s.by ? num(ev(s.by, cx)) : 1;
        for (let guard = 0; ; guard++) {
          if (guard > 1e5) throw new Fault("loop too long");
          if (s.v) { if (by > 0 ? i > num(to) : i < num(to)) break; cx.vars.set(s.v, i); }
          if (s.wh && un(ev(s.wh, cx)) !== true) break;
          const r = run(s.body, cx);
          if (r === ESCAPE) break;
          if (r instanceof Return) return r;
          if (s.un && un(ev(s.un, cx)) === true) break;
          i += by;
        }
        return undefined;
      }
      case "block": return run(s.body, cx);
      case "return": return new Return(s.x ? ev(s.x, cx) : undefined);
      case "escape": return ESCAPE;
      case "skip": return SKIP;
      case "assign": { assign(s.target, ev(s.x, cx), cx); return undefined; }
      case "call": { ev(s.x, cx); return undefined; }
    }
    throw new Fault(`statement ${s.s}`);
  };
  // Assignment. A target inside an entity instance (V.DirectionRatios[i],
  // Result.LengthExponent) changes a copy the function owns, never the file's
  // record: the first write through a variable clones what it holds.
  const setVar = (n, v, cx) => { v = bounded(n, v, cx); for (let c = cx; c; c = c.up) if (c.vars.has(n)) { c.vars.set(n, v); return; } cx.vars.set(n, v); };
  const copyArr = (a) => { const c = a.slice(); if (a.isSet) c.isSet = true; if (a.lo !== undefined) c.lo = a.lo; return c; };
  const own = (v) => (isInst(v) && !v.own ? { id: null, type: v.type, args: v.args.map((a) => a), own: true } : Array.isArray(v) ? v : v);
  // The instance a target names, made writable.
  const lvInst = (t, cx) => {
    if (t.k === "id") { let v = un(lookup(t.n, cx)); if (!isInst(v)) throw new Fault("assignment into a value that is not an entity"); if (!v.own) { v = own(v); setVar(t.n, v, cx); } return v; }
    if (t.k === "group") return lvInst(t.o, cx);
    if (t.k === "index") { const arr = lvArr(t.o, cx); const i = num(ev(t.a, cx)) - (arr.lo ?? 1); let v = un(arr[i]); if (!isInst(v)) throw new Fault("assignment into a value that is not an entity"); if (!v.own) { v = own(v); arr[i] = v; } return v; }
    if (t.k === "attr") {
      // U[1].DirectionRatios[1] := ... goes through an instance's attribute.
      const inst = lvInst(t.o, cx);
      const i = slotsOf(inst.type).get(t.n);
      if (i === undefined) throw new Fault(`${inst.type} has no attribute ${t.n}`);
      const v = un(conv(inst.args[i], S.attrs(inst.type)[i].type));
      if (!isInst(v)) throw new Fault("assignment into a value that is not an entity");
      const c = own(v);
      inst.args[i] = raw(c);
      return c;
    }
    throw new Fault("assignment target");
  };
  // The aggregate a target names, made writable.
  const lvArr = (t, cx) => {
    if (t.k === "id") {
      let v = un(lookup(t.n, cx));
      if (v === undefined || v instanceof Enum) v = [];
      if (!Array.isArray(v)) throw new Fault("indexing a value that is not an aggregate");
      if (!owned.has(v)) { const c = copyArr(v); owned.add(c); v = c; setVar(t.n, v, cx); }
      return v;
    }
    if (t.k === "attr") {
      const inst = lvInst(t.o, cx);
      const i = slotsOf(inst.type).get(t.n);
      if (i === undefined) throw new Fault(`${inst.type} has no attribute ${t.n}`);
      let v = un(conv(inst.args[i], S.attrs(inst.type)[i].type));
      if (!Array.isArray(v)) v = [];
      const arr = v.slice();
      // Written back as raw values after each change, through a proxy array.
      return new Proxy(arr, { set(o, k, val) { o[k] = val; inst.args[i] = raw(o); return true; } });
    }
    throw new Fault("assignment target");
  };
  const assign = (t, v, cx) => {
    if (t.k === "id") { setVar(t.n, v, cx); return; }
    if (t.k === "attr") {
      const inst = lvInst(t.o, cx);
      const i = slotsOf(inst.type).get(t.n);
      if (i === undefined) throw new Fault(`${inst.type} has no attribute ${t.n}`);
      inst.args[i] = raw(v);
      return;
    }
    if (t.k === "index") { const arr = lvArr(t.o, cx); arr[num(ev(t.a, cx)) - (arr.lo ?? 1)] = v; return; }
    throw new Fault("assignment target");
  };

  // ------------------------------------------------------------ run ----
  const fail = (rule, err) => {
    const g = stats.errors.get(rule);
    if (g) g.count++;
    else stats.errors.set(rule, { rule, count: 1, first: err.message });
  };
  const verdict = (ast, cx) => {
    steps = 0;
    const v = un(ev(ast, cx));
    return v === false ? false : v === true ? true : UNK;
  };
  // probe: [EXPRESS expression, record id or null]: its value, for tests and
  // for tracing a rule by hand.
  if (probe) {
    const p = new Parser(probe[0]);
    const ast = p.expr();
    const self = probe[1] == null ? undefined : E.get(probe[1]);
    const v = ev(ast, { vars: new Map(), up: null, self, population: new Map(C.rules.flatMap((r) => r.for).map((t) => [t, population(t)])) });
    return { value: show(v) };
  }
  const ruleList = new Map();
  const rulesFor = (type) => {
    let l = ruleList.get(type);
    if (l) return l;
    l = [];
    for (let t = type; t && S.entities[t]; t = S.entities[t].super) for (const r of C.entities.get(t) || []) l.push({ ...r, ent: S.entities[t].name, entU: t });
    ruleList.set(type, l);
    return l;
  };
  const typeRules = (t) => {
    const out = [];
    for (let x = t, g = 0; x && g < 20; g++) {
      for (const r of C.types.get(x) || []) out.push({ ...r, tname: x });
      const d = S.types[x];
      x = d && d.kind === "defined" && S.types[d.of] ? d.of : null;
    }
    return out;
  };
  const tnameOf = (t) => (R.typeNames && Object.hasOwn(R.typeNames, t) ? R.typeNames[t] : t);

  for (const e of E.values()) {
    if (!S.has(e.type)) continue;
    if (only && !only.has(e.id)) continue;
    const cx = { vars: new Map(), up: null, self: e };
    for (const r of rulesFor(e.type)) {
      const name = `${r.ent}.${r.label}`;
      if (!r.ast) { fail(name, new Error("not parsed")); continue; }
      stats.evaluated++;
      let v;
      try { v = verdict(r.ast, cx); } catch (err) { if (err instanceof Fault || err instanceof RangeError || err instanceof TypeError) { fail(name, err); continue; } throw err; }
      if (v === UNK) stats.unknown++;
      if (v === false) { stats.failed++; findings.push({ code: "where-rule", id: e.id, type: e.type, attr: name, message: `#${e.id}: ${explain(e, r, name)}` }); }
    }
    // Defined types' rules on the values written in this record.
    const ats = S.attrs(e.type);
    for (let i = 0; i < ats.length && i < e.args.length; i++) {
      const at = ats[i];
      if (at.derived) continue;
      const vals = [];
      const collect = (rv, t) => {
        if (rv === null || rv === undefined) return;
        if (Array.isArray(rv) && !(S.types[t] && S.types[t].kind === "aggregate")) { for (const y of rv) collect(y, t); return; }
        if (rv && typeof rv === "object" && "typed" in rv) { vals.push([rv.typed, rv.value]); return; }
        if (rv && typeof rv === "object" && !Array.isArray(rv)) return;
        vals.push([t, rv]);
      };
      collect(e.args[i], at.type);
      for (const [t, rv] of vals) {
        for (const r of typeRules(t)) {
          const name = `${tnameOf(r.tname)}.${r.label}`;
          if (!r.ast) { fail(name, new Error("not parsed")); continue; }
          stats.evaluated++;
          let v;
          // IfcBoxAlignment is read without case, as ifcopenshell.validate reads
          // it (its fixture pass-3-box-alignment-CENTER-uppercase passes).
          const self = r.tname === "IFCBOXALIGNMENT" && typeof rv === "string" ? rv.toLowerCase() : conv(rv, t);
          try { v = verdict(r.ast, { vars: new Map(), up: null, self }); } catch (err) { if (err instanceof Fault || err instanceof RangeError || err instanceof TypeError) { fail(name, err); continue; } throw err; }
          if (v === UNK) stats.unknown++;
          if (v === false) { stats.failed++; findings.push({ code: "where-rule", id: e.id, type: e.type, attr: name, message: `#${e.id}: ${e.type}.${at.name} = ${Array.isArray(rv) ? "(" + rv.join(",") + ")" : JSON.stringify(rv)} breaks ${tnameOf(r.tname)}.${r.label}: ${r.src}${Object.hasOwn(TYPE_NOTES, r.tname) ? ` (${TYPE_NOTES[r.tname]})` : ""}` }); }
        }
      }
    }
  }
  // Global rules (IfcSingleProjectInstance, IfcRepresentationContextSameWCS).
  if (!only) for (const r of C.rules) {
    const pop = new Map(r.for.map((t) => [t, population(t)]));
    const cx = { vars: new Map(), up: null, self: undefined, population: pop };
    try {
      for (const l of r.locals) cx.vars.set(l.n, local(l, cx));
      steps = 0;
      run(r.body, cx);
      for (const w of r.where) {
        const name = `${r.name}.${w.label}`;
        stats.evaluated++;
        const v = verdict(w.ast, cx);
        if (v === UNK) stats.unknown++;
        if (v === false) {
          stats.failed++;
          const first = [...pop.values()][0] || [];
          findings.push({ code: "where-rule", id: null, type: null, attr: r.name, message: `global rule ${name} fails: ${w.src} (${r.for.join(", ")}: ${first.length} in the file${first.length ? ", " + first.slice(0, 4).map((x) => "#" + x.id).join(", ") : ""})` });
        }
      }
    } catch (err) { if (err instanceof Fault || err instanceof TypeError || err instanceof RangeError) fail(r.name, err); else throw err; }
  }
  return { findings, stats: { evaluated: stats.evaluated, failed: stats.failed, unknown: stats.unknown, errors: [...stats.errors.values()], unparsed: C.bad } };

  // What a failed rule means for someone reading the model, for the two
  // families that make up most of the rules, then the rule's own text.
  function explain(e, r, name) {
    const label = r.label;
    if (label === "CorrectPredefinedType") {
      const pt = (() => { try { return un(getAttr(e, "PREDEFINEDTYPE")); } catch { return undefined; } })();
      const isType = S.isA(e.type, "IFCTYPEOBJECT") || S.isA(e.type, "IFCTYPEPROCESS") || S.isA(e.type, "IFCTYPERESOURCE");
      const where = /ElementType/.test(r.src) ? "ElementType" : /ProcessType/.test(r.src) ? "ProcessType" : /ResourceType/.test(r.src) ? "ResourceType" : /ObjectType/.test(r.src) ? "ObjectType" : null;
      if (pt instanceof Enum && pt.v === "USERDEFINED" && where) return `${e.type} has PredefinedType .USERDEFINED. and no ${where}, so it never says what it is: an IDS predefinedType facet reads ${where} for a user-defined ${isType ? "type" : "object"} and finds nothing (${name})`;
      return `${e.type} breaks ${name}: ${r.src}${pt instanceof Enum ? ` (PredefinedType .${pt.v}.)` : ""}`;
    }
    if (label === "CorrectTypeAssigned" || label === "CorrectStyleAssigned") {
      let t = null;
      try { const tb = un(getAttr(e, "ISTYPEDBY")) || un(getAttr(e, "ISDEFINEDBY")); const rel = Array.isArray(tb) ? tb.find((x) => S.isA(x.type, "IFCRELDEFINESBYTYPE")) : null; t = rel ? un(getAttr(rel, "RELATINGTYPE")) : null; } catch { t = null; }
      const want = (/'[^.']+\.(\w+)'/.exec(r.src) || [])[1];
      if (t) return `${e.type} is typed by #${t.id}, an ${t.type}, where ${name} needs ${want || "its own type class"}: the properties it inherits are another class's, so an IDS check on the type's properties reads the wrong set`;
      return `${e.type} breaks ${name}: ${r.src}`;
    }
    const note = Object.hasOwn(NOTES, label) ? NOTES[label] : Object.hasOwn(NOTES, name) ? NOTES[name] : null;
    const extra = label === "UniquePropertySetNames" ? repeatedNames(e, "ISDEFINEDBY", "RELATINGPROPERTYDEFINITION")
      : label === "UniquePropertyNames" || label === "WR32" ? repeatedNames(e, null, "HASPROPERTIES")
      : label === "UniqueQuantityNames" ? repeatedNames(e, null, "QUANTITIES") : "";
    return `${e.type} breaks ${name}${extra}: ${note ? note + ` (rule: ${r.src})` : r.src}`;
  }
  // The names written twice, for the uniqueness rules: " ('Pset_WallCommon' twice)".
  function repeatedNames(e, viaInverse, slot) {
    try {
      let items;
      if (viaInverse) items = (un(getAttr(e, viaInverse)) || []).map((rel) => un(getAttr(rel, slot))).flat();
      else items = un(getAttr(e, slot)) || [];
      const count = new Map();
      for (const x of items.map(un)) if (isInst(x)) { const n = un(getAttr(x, "NAME")); if (typeof n === "string") count.set(n, (count.get(n) || 0) + 1); }
      const twice = [...count].filter(([, c]) => c > 1).map(([n, c]) => `'${n}' ${c === 2 ? "twice" : c + " times"}`);
      return twice.length ? ` (${twice.slice(0, 3).join(", ")}${twice.length > 3 ? ", ..." : ""})` : "";
    } catch { return ""; }
  }
}

// Defined types whose rule a written value breaks most often.
const TYPE_NOTES = {
  IFCPOSITIVELENGTHMEASURE: "a length that must be above zero; a quantity or profile dimension of zero or less makes a takeoff or a geometry kernel go wrong",
  IFCPOSITIVERATIOMEASURE: "a ratio that must be above zero",
  IFCNORMALISEDRATIOMEASURE: "a ratio that must be between 0 and 1",
  IFCCOMPOUNDPLANEANGLEMEASURE: "a latitude or longitude written as degrees, minutes, seconds out of range or with mixed signs: the site lands in the wrong place on a map",
  IFCDIMENSIONCOUNT: "a dimension count that must be 1, 2 or 3",
};

// What the rules that fire most on public files, and those an IDS check
// leans on, mean for someone reading the model (eval/where-rules-2026-11-24.md).
const NOTES = {
  UniquePropertySetNames: "two property sets with the same name on one object: an IDS property facet on that set may read either, so the answer depends on the tool",
  UniquePropertyNames: "two properties with the same name in one set: an IDS property facet may read either value",
  "IfcPropertySet.WR32": "two properties with the same name in one set: an IDS property facet may read either value",
  UniqueQuantityNames: "two quantities with the same name in one element quantity set: a takeoff or an IDS check may read either",
  HasObjectName: "a proxy with no Name: nothing says what it stands for, and an IDS attribute check on Name fails",
  NameRequired: "a type with no Name: a schedule or an IDS check by type name cannot find it",
  "IfcExternalReference.WR1": "a reference (classification, document or library) with no Identification, Location or Name: it points nowhere, so an IDS classification facet cannot match it",
  "IfcProduct.PlacementForShapeRepresentation": "a product with shape geometry but no ObjectPlacement: viewers cannot place it, and a geometry check or takeoff in model coordinates goes wrong",
  "IfcShapeModel.WR11": "a shape representation used by no product, map or shape aspect (or by more than one kind): geometry nothing reads",
  "IfcRelAssociatesMaterial.AllowedElements": "a material given to something that is not an element, element type or port, so a material facet on that object finds what the schema does not allow",
  "IfcTypeProduct.ApplicableOccurrence": "a product type assigned to something that is not a product",
  "IfcSpatialStructureElement.WR41": "a spatial element (site, building, storey) not aggregated into the project or another spatial element: an IDS partOf facet cannot place what it contains",
  "IfcQuantityLength.WR22": "a negative length in a quantity set: a takeoff or an IDS value range on it reads a length below zero",
  "IfcQuantityArea.WR22": "a negative area in a quantity set",
  "IfcQuantityVolume.WR22": "a negative volume in a quantity set",
  "IfcQuantityWeight.WR22": "a negative weight in a quantity set",
  "IfcAdvancedFace.ApplicableEdgeCurves": "an advanced face bounded by an edge curve of a kind the schema does not allow there (only lines, conics, polylines and B-spline curves; a trimmed curve is not one): a strict geometry kernel may reject the face",
  "IfcRelSpaceBoundary.CorrectPhysOrVirt": "a physical space boundary with no building element (or a virtual one with a physical element): an energy or room-boundary check cannot tell what bounds the space",
  "IfcShapeRepresentation.CorrectItemsForType": "the geometry items do not fit the representation type named (e.g. a 'Curve2D' holding solids): a viewer reading by type may skip them",
};
