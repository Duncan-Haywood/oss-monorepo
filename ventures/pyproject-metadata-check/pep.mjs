// Python packaging grammars: PEP 440 versions and specifiers, PEP 508 dependency
// specifiers (the grammar of packaging 26's hand-written parser), PEP 503/685
// name normalisation and PEP 639 SPDX license expressions. Reimplemented from
// the specifications and packaging's documented behaviour; differential-tested
// against packaging 26.3 (`pep.diff.test.mjs`). No dependencies, no I/O.

import { LICENSES, EXCEPTIONS } from "./data.mjs";

// ---- PEP 440 versions ----------------------------------------------------

const VERSION_BODY =
  "v?(?:([0-9]+)!)?([0-9]+(?:\\.[0-9]+)*)" +
  "([._-]?(alpha|a|beta|b|preview|pre|c|rc)[._-]?([0-9]+)?)?" +
  "((?:-([0-9]+))|(?:[._-]?(post|rev|r)[._-]?([0-9]+)?))?" +
  "([._-]?(dev)[._-]?([0-9]+)?)?" +
  "(?:\\+([a-z0-9]+(?:[._-][a-z0-9]+)*))?";
const RE_VERSION = new RegExp(`^\\s*${VERSION_BODY}\\s*$`, "i");

const stripZeros = (s) => String(BigInt(s));

// Returns { normalized, epoch, release, pre, post, dev, local } or null.
export function parseVersion(text) {
  if (typeof text !== "string") return null;
  const m = RE_VERSION.exec(text);
  if (!m) return null;
  const [, epoch, release, pre, preL, preN, post, postN1, postL, postN2, dev, , devN, local] = m;
  const v = {
    epoch: epoch ? stripZeros(epoch) : "0",
    release: release.split(".").map(stripZeros),
    pre: null,
    post: null,
    dev: null,
    local: local ? local.toLowerCase().split(/[._-]/).map((p) => (/^[0-9]+$/.test(p) ? stripZeros(p) : p)) : null,
  };
  if (pre) {
    const l = preL.toLowerCase();
    v.pre = [l === "alpha" ? "a" : l === "beta" ? "b" : ["c", "pre", "preview"].includes(l) ? "rc" : l, preN ? stripZeros(preN) : "0"];
  }
  if (post) v.post = postN1 ? stripZeros(postN1) : postN2 ? stripZeros(postN2) : "0";
  if (dev) v.dev = devN ? stripZeros(devN) : "0";
  v.normalized =
    (v.epoch !== "0" ? `${v.epoch}!` : "") +
    v.release.join(".") +
    (v.pre ? v.pre.join("") : "") +
    (v.post !== null ? `.post${v.post}` : "") +
    (v.dev !== null ? `.dev${v.dev}` : "") +
    (v.local ? `+${v.local.join(".")}` : "");
  return v;
}

// ---- PEP 440 specifiers (packaging's Specifier regex) --------------------

const PRE = "(?:[-_.]?(?:alpha|beta|preview|pre|a|b|c|rc)[-_.]?[0-9]*)?";
const POST = "(?:(?:-[0-9]+)|(?:[-_.]?(?:post|rev|r)[-_.]?[0-9]*))?";
const DEV = "(?:[-_.]?dev[-_.]?[0-9]*)?";
const LOCAL = "(?:\\+[a-z0-9]+(?:[-_.][a-z0-9]+)*)?";
const SPEC_BODY =
  "(?:" +
  "(?:===\\s*[^\\s;)]*)" +
  "|(?:(?:==|!=)\\s*v?(?:[0-9]+!)?[0-9]+(?:\\.[0-9]+)*(?:\\.\\*|" + PRE + POST + DEV + LOCAL + ")?)" +
  "|(?:~=\\s*v?(?:[0-9]+!)?[0-9]+(?:\\.[0-9]+)+" + PRE + POST + DEV + ")" +
  "|(?:(?:<=|>=|<|>)\\s*v?(?:[0-9]+!)?[0-9]+(?:\\.[0-9]+)*" + PRE + POST + DEV + ")" +
  ")";
const RE_SPEC_TOKEN = new RegExp(SPEC_BODY, "iy");
const RE_SPEC_FULL = new RegExp(`^\\s*${SPEC_BODY}\\s*$`, "i");

// One specifier ("~=1.2"); returns { op, version } or null.
export function parseSpecifier(text) {
  if (!RE_SPEC_FULL.test(text)) return null;
  const t = text.trim();
  const op = /^(===|==|!=|~=|<=|>=|<|>)/.exec(t)[1];
  return { op, version: t.slice(op.length).trim() };
}

// A comma-separated set ("" is valid: no constraint). Returns { specs } or { error }.
export function parseSpecifierSet(text) {
  if (typeof text !== "string") return { error: "not a string" };
  const parts = text.split(",").map((s) => s.trim()).filter((s) => s !== "");
  const specs = [];
  for (const p of parts) {
    const s = parseSpecifier(p);
    if (!s) return { error: `Invalid specifier: ${JSON.stringify(p)}` };
    specs.push(s);
  }
  return { specs };
}

// ---- names (PEP 503 / 508 / 685) -----------------------------------------

export const RE_NAME = /^([A-Z0-9]|[A-Z0-9][A-Z0-9._-]*[A-Z0-9])$/i;
export const canonicalName = (n) => n.replace(/[-_.]+/g, "-").toLowerCase();

// ---- PEP 508 dependency specifiers ---------------------------------------

const RULES = {
  LP: /\(/y, RP: /\)/y, LB: /\[/y, RB: /\]/y, SEMI: /;/y, COMMA: /,/y,
  QUOTED: /('[^']*')|("[^"]*")/y,
  OP: /(===|==|~=|!=|<=|>=|<|>)/y,
  BOOLOP: /\b(or|and)\b/y,
  IN: /\bin\b/y,
  NOT: /\bnot\b/y,
  VARIABLE: /\b(python_version|python_full_version|os[._]name|sys[._]platform|platform_(release|system)|platform[._](version|machine|python_implementation)|python_implementation|implementation_(name|version)|extras?|dependency_groups)\b/y,
  SPECIFIER: RE_SPEC_TOKEN,
  AT: /@/y,
  URL: /[^ \t]+/y,
  IDENT: /\b[a-zA-Z0-9][a-zA-Z0-9._-]*\b/y,
  PREFIX_TRAIL: /\.\*/y,
  LOCAL_TRAIL: /\+[a-z0-9]+(?:[-_.][a-z0-9]+)*/y,
  WS: /[ \t]+/y,
};

class SyntaxErr extends Error {
  constructor(message, at) {
    super(message);
    this.at = at;
  }
}

class Tok {
  constructor(src) {
    this.src = src;
    this.pos = 0;
  }
  match(name) {
    if (name === "END") return this.pos === this.src.length ? "" : null;
    const re = RULES[name];
    re.lastIndex = this.pos;
    // `\b` at the start must see the previous character, which a sticky regex does.
    const m = re.exec(this.src);
    return m ? m[0] : null;
  }
  check(name) {
    return this.match(name) !== null;
  }
  read(name) {
    const t = this.match(name);
    this.pos += t.length;
    return t;
  }
  consume(name) {
    if (this.check(name)) this.read(name);
  }
  expect(name, expected) {
    if (!this.check(name)) throw new SyntaxErr(`Expected ${expected}`, this.pos);
    return this.read(name);
  }
  enclosed(open, close, around, fn) {
    const opened = this.check(open);
    const at = this.pos;
    if (opened) this.read(open);
    const r = fn();
    if (opened) {
      if (!this.check(close)) throw new SyntaxErr(`Expected matching ${close === "RP" ? ")" : "]"} for ${open === "LP" ? "(" : "["}, after ${around}`, at);
      this.read(close);
    }
    return r;
  }
}

function parseExtrasList(t) {
  const extras = [];
  if (!t.check("IDENT")) return extras;
  extras.push(t.read("IDENT"));
  for (;;) {
    t.consume("WS");
    if (t.check("IDENT")) throw new SyntaxErr("Expected comma between extra names", t.pos);
    if (!t.check("COMMA")) break;
    t.read("COMMA");
    t.consume("WS");
    extras.push(t.expect("IDENT", "extra name after comma"));
  }
  return extras;
}

function parseVersionMany(t) {
  let out = "";
  while (t.check("SPECIFIER")) {
    const spec = t.read("SPECIFIER");
    out += spec;
    if (t.check("PREFIX_TRAIL")) {
      const eq = spec.startsWith("!=") || (spec.startsWith("==") && !spec.startsWith("==="));
      throw new SyntaxErr(eq ? ".* suffix cannot be used with pre-release, post-release, dev or local versions" : ".* suffix can only be used with `==` or `!=` operators", t.pos);
    }
    if (t.check("LOCAL_TRAIL")) throw new SyntaxErr("Local version label can only be used with `==` or `!=` operators", t.pos);
    t.consume("WS");
    if (!t.check("COMMA")) break;
    out += t.read("COMMA");
    t.consume("WS");
  }
  return out;
}

// Python's ast.literal_eval of a quoted string: we accept strings without
// backslashes (the only ones a pyproject needs) and refuse the rest as unknown.
function quotedValue(text, at) {
  const inner = text.slice(1, -1);
  if (inner.includes("\\")) throw new SyntaxErr("Backslash in a marker string (this checker does not evaluate Python escapes)", at);
  return inner;
}

function parseMarkerVar(t) {
  if (t.check("VARIABLE")) {
    let v = t.read("VARIABLE").replace(/\./g, "_");
    if (v === "python_implementation") v = "platform_python_implementation";
    return { variable: v };
  }
  if (t.check("QUOTED")) {
    const at = t.pos;
    return { value: quotedValue(t.read("QUOTED"), at) };
  }
  throw new SyntaxErr("Expected a marker variable or quoted string", t.pos);
}

function parseMarkerOp(t) {
  if (t.check("IN")) { t.read("IN"); return "in"; }
  if (t.check("NOT")) {
    t.read("NOT");
    t.expect("WS", "whitespace after 'not'");
    t.expect("IN", "'in' after 'not'");
    return "not in";
  }
  if (t.check("OP")) return t.read("OP");
  throw new SyntaxErr("Expected marker operator, one of <=, <, !=, ==, >=, >, ~=, ===, in, not in", t.pos);
}

function parseMarkerAtom(t) {
  t.consume("WS");
  let m;
  if (t.check("LP")) {
    m = t.enclosed("LP", "RP", "marker expression", () => {
      t.consume("WS");
      const inner = parseMarker(t);
      t.consume("WS");
      return inner;
    });
  } else {
    t.consume("WS");
    const left = parseMarkerVar(t);
    t.consume("WS");
    const op = parseMarkerOp(t);
    t.consume("WS");
    const right = parseMarkerVar(t);
    t.consume("WS");
    m = [left, op, right];
  }
  t.consume("WS");
  return m;
}

function parseMarker(t) {
  const expr = [parseMarkerAtom(t)];
  while (t.check("BOOLOP")) {
    const op = t.read("BOOLOP");
    expr.push(op, parseMarkerAtom(t));
  }
  return expr;
}

// Collects every [variable, op, value] item in a parsed marker.
export function markerItems(marker, out = []) {
  if (!Array.isArray(marker)) return out;
  if (marker.length === 3 && typeof marker[1] === "string" && marker[0] && typeof marker[0] === "object" && !Array.isArray(marker[0]) && ("variable" in marker[0] || "value" in marker[0])) {
    out.push(marker);
    return out;
  }
  for (const m of marker) if (Array.isArray(m)) markerItems(m, out);
  return out;
}

// Returns { name, extras, specifier, url, marker } or { error, at }.
export function parseRequirement(src) {
  if (typeof src !== "string") return { error: "a dependency must be a string", at: 0 };
  const t = new Tok(src);
  try {
    t.consume("WS");
    const name = t.expect("IDENT", "package name at the start of dependency specifier");
    t.consume("WS");
    let extras = [];
    if (t.check("LB")) {
      extras = t.enclosed("LB", "RB", "extras", () => {
        t.consume("WS");
        const e = parseExtrasList(t);
        t.consume("WS");
        return e;
      });
    }
    t.consume("WS");
    let url = "";
    let specifier = "";
    let marker = null;
    const markerAfter = (expected) => {
      if (!t.check("SEMI")) throw new SyntaxErr(`Expected ${expected} or end`, t.pos);
      t.read("SEMI");
      const m = parseMarker(t);
      t.consume("WS");
      return m;
    };
    if (t.check("AT")) {
      t.read("AT");
      t.consume("WS");
      url = t.expect("URL", "URL after @");
      if (!t.check("END")) {
        t.expect("WS", "whitespace after URL");
        if (!t.check("END")) marker = markerAfter("semicolon (after URL and whitespace)");
      }
    } else {
      specifier = t.enclosed("LP", "RP", "version specifier", () => {
        t.consume("WS");
        const s = parseVersionMany(t);
        t.consume("WS");
        return s;
      });
      t.consume("WS");
      if (!t.check("END")) marker = markerAfter(specifier ? "comma (within version specifier), semicolon (after version specifier)" : "semicolon (after name with no version specifier)");
    }
    t.expect("END", "end of dependency specifier");
    return { name, extras, specifier, url, marker };
  } catch (e) {
    if (e instanceof SyntaxErr) return { error: e.message, at: e.at };
    throw e;
  }
}

// ---- PEP 639 SPDX license expressions ------------------------------------

const LICENSE_REF = /^[A-Za-z0-9.-]+$/;

// Returns { normalized, deprecated: [ids] } or { error }.
// Grammar (SPDX annex D): or-expr = and-expr ("OR" and-expr)*; and-expr = with-expr
// ("AND" with-expr)*; with-expr = simple ["WITH" exception]; simple = id ["+"] |
// LicenseRef-x | "(" or-expr ")". Operators and ids are case-insensitive, as
// packaging treats them.
export function parseLicenseExpression(raw) {
  if (typeof raw !== "string" || !raw) return { error: `Invalid license expression: ${JSON.stringify(raw ?? "")}` };
  const toks = raw.replace(/\(/g, " ( ").replace(/\)/g, " ) ").split(/\s+/).filter(Boolean);
  const invalid = { error: `Invalid license expression: ${JSON.stringify(raw)}` };
  const deprecated = [];
  let i = 0;
  const peek = () => toks[i]?.toLowerCase();
  const OPS = new Set(["or", "and", "with", "(", ")"]);
  let unknown = null;
  function simple() {
    const tk = toks[i];
    if (tk === undefined) throw invalid;
    if (tk === "(") {
      i++;
      const inner = orExpr();
      if (toks[i] !== ")") throw invalid;
      i++;
      return `(${inner})`;
    }
    if (OPS.has(tk.toLowerCase())) throw invalid;
    i++;
    let id = tk.toLowerCase();
    let suffix = "";
    if (id.endsWith("+")) { id = id.slice(0, -1); suffix = "+"; }
    if (id.startsWith("licenseref-")) {
      const ref = tk.slice("licenseref-".length);
      if (suffix || !LICENSE_REF.test(ref)) unknown ??= `Invalid licenseref: ${JSON.stringify(tk.toLowerCase())}`;
      return "LicenseRef-" + ref;
    }
    const hit = LICENSES[id];
    if (!hit) { unknown ??= `Unknown license: ${JSON.stringify(id)}`; return tk; }
    if (hit[1]) deprecated.push(hit[0]);
    return hit[0] + suffix;
  }
  function withExpr() {
    let s = simple();
    if (peek() === "with") {
      if (s.startsWith("(")) throw invalid;
      i++;
      const tk = toks[i];
      if (tk === undefined || OPS.has(tk.toLowerCase())) throw invalid;
      i++;
      const hit = EXCEPTIONS[tk.toLowerCase()];
      if (!hit) unknown ??= `Unknown license exception: ${JSON.stringify(tk.toLowerCase())}`;
      else if (hit[1]) deprecated.push(hit[0]);
      s += " WITH " + (hit ? hit[0] : tk);
    }
    return s;
  }
  function andExpr() {
    let s = withExpr();
    while (peek() === "and") { i++; s += " AND " + withExpr(); }
    return s;
  }
  function orExpr() {
    let s = andExpr();
    while (peek() === "or") { i++; s += " OR " + andExpr(); }
    return s;
  }
  try {
    const normalized = orExpr();
    if (i !== toks.length) return invalid;
    if (unknown) return { error: unknown };
    return { normalized, deprecated };
  } catch (e) {
    if (e === invalid) return invalid;
    throw e;
  }
}
