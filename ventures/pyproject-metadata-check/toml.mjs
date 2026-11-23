// A TOML 1.0 parser that also remembers the line each key was written on, so a
// finding can point at `pyproject.toml:12`. No dependencies, no I/O.
//
// The table-definition rules (when a [table] or a dotted key may reopen a table
// that already exists) follow the TOML 1.0 spec using the flag model of tomli
// (Taneli Hukkinen, MIT licence), which is also Python's tomllib: a path can be
// "explicitly nested" (opened by a header, or by a dotted key in an earlier
// section) or "frozen" (an inline table or a value array). The behaviour is
// differential-tested against Python's tomllib (`toml.diff.test.mjs`).
//
// Values: strings, numbers (integers outside +-2^53 come back as BigInt),
// booleans, arrays, plain objects with a null prototype, and date/time values
// as `{ $toml: "offset-datetime" | "local-datetime" | "local-date" | "local-time", text }`.

export class TomlError extends Error {
  constructor(message, line, col) {
    super(`${message} (line ${line}, column ${col})`);
    this.reason = message;
    this.line = line;
    this.col = col;
  }
}

const FROZEN = 0;
const EXPLICIT = 1;

class Flags {
  constructor() {
    this.root = new Map();
    this.pending = [];
  }
  node(cont, k) {
    let n = cont.get(k);
    if (!n) {
      n = { flags: new Set(), rec: new Set(), nested: new Map() };
      cont.set(k, n);
    }
    return n;
  }
  set(key, flag, recursive) {
    let cont = this.root;
    for (const k of key.slice(0, -1)) cont = this.node(cont, k).nested;
    this.node(cont, key[key.length - 1])[recursive ? "rec" : "flags"].add(flag);
  }
  is(key, flag) {
    if (!key.length) return false;
    let cont = this.root;
    for (const k of key.slice(0, -1)) {
      const n = cont.get(k);
      if (!n) return false;
      if (n.rec.has(flag)) return true;
      cont = n.nested;
    }
    const n = cont.get(key[key.length - 1]);
    return !!n && (n.flags.has(flag) || n.rec.has(flag));
  }
  unsetAll(key) {
    let cont = this.root;
    for (const k of key.slice(0, -1)) {
      const n = cont.get(k);
      if (!n) return;
      cont = n.nested;
    }
    cont.delete(key[key.length - 1]);
  }
  addPending(key, flag) {
    this.pending.push([key, flag]);
  }
  finalize() {
    for (const [k, f] of this.pending) this.set(k, f, false);
    this.pending = [];
  }
}

const newTable = () => Object.create(null);
const isTable = (v) => v !== null && typeof v === "object" && !Array.isArray(v) && !v.$toml;
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

// Returns the table at `key`, creating missing tables; the last element of an
// array of tables stands for the array.
function getOrCreateNest(root, key, accessLists = true) {
  let cont = root;
  for (const k of key) {
    if (!has(cont, k)) cont[k] = newTable();
    cont = cont[k];
    if (accessLists && Array.isArray(cont)) cont = cont[cont.length - 1];
    if (!isTable(cont)) return null;
  }
  return cont;
}

const BARE = /[A-Za-z0-9_-]/;
const WS = " \t";
const HEX = /^[0-9A-Fa-f]+$/;

const RE_NUMBER = /0(?:x[0-9A-Fa-f](?:_?[0-9A-Fa-f])*|b[01](?:_?[01])*|o[0-7](?:_?[0-7])*)|[+-]?(?:0|[1-9](?:_?[0-9])*)((?:\.[0-9](?:_?[0-9])*)?(?:[eE][+-]?[0-9](?:_?[0-9])*)?)/y;
const TIME = "([01][0-9]|2[0-3]):([0-5][0-9]):([0-5][0-9])(?:\\.([0-9]{1,6})[0-9]*)?";
const RE_DATETIME = new RegExp(`([0-9]{4})-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])(?:[Tt ]${TIME}(?:([Zz])|([+-])([01][0-9]|2[0-3]):([0-5][0-9]))?)?`, "y");
const RE_LOCALTIME = new RegExp(TIME, "y");

function daysIn(y, m) {
  if (m === 2) return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28;
  return [4, 6, 9, 11].includes(m) ? 30 : 31;
}

// Characters TOML forbids in comments and strings: C0 controls other than tab, and DEL.
const illegal = (c) => {
  const n = c.charCodeAt(0);
  return (n <= 0x1f && n !== 0x09) || n === 0x7f;
};

export function parseToml(src) {
  if (typeof src !== "string") throw new TypeError("parseToml expects a string");
  // A leading byte-order mark is not part of TOML, but editors write one; tomllib refuses it, so do we.
  const out = newTable();
  const flags = new Flags();
  const lines = new Map(); // JSON path -> line
  let pos = 0;
  let header = [];

  const lineCol = (p) => {
    let line = 1;
    let last = -1;
    for (let i = 0; i < p && i < src.length; i++) if (src[i] === "\n") { line++; last = i; }
    return [line, p - last];
  };
  const fail = (msg, p = pos) => {
    const [l, c] = lineCol(p);
    throw new TomlError(msg, l, c);
  };
  const remember = (path, p) => {
    const k = JSON.stringify(path);
    if (!lines.has(k)) lines.set(k, lineCol(p)[0]);
  };
  const skipWs = () => {
    while (pos < src.length && WS.includes(src[pos])) pos++;
  };
  const skipComment = () => {
    if (src[pos] !== "#") return;
    pos++;
    while (pos < src.length && src[pos] !== "\n") {
      if (src[pos] === "\r" && src[pos + 1] === "\n") break;
      if (illegal(src[pos])) fail("Illegal character in a comment");
      pos++;
    }
  };
  // Whitespace, newlines and comments, as allowed inside an array.
  const skipCommentsAndBlankLines = () => {
    for (;;) {
      const start = pos;
      skipWs();
      skipComment();
      if (src[pos] === "\n") pos++;
      else if (src[pos] === "\r" && src[pos + 1] === "\n") pos += 2;
      if (pos === start) return;
    }
  };
  const atLineEnd = () => {
    skipWs();
    skipComment();
    if (pos >= src.length) return;
    if (src[pos] === "\n") { pos++; return; }
    if (src[pos] === "\r" && src[pos + 1] === "\n") { pos += 2; return; }
    fail("Expected a newline or the end of the document after a statement");
  };

  function parseKeyPart() {
    const c = src[pos];
    if (c === '"') return parseBasicString(false);
    if (c === "'") return parseLiteralString(false);
    const start = pos;
    while (pos < src.length && BARE.test(src[pos])) pos++;
    if (pos === start) fail("Invalid key");
    return src.slice(start, pos);
  }
  function parseKey() {
    const key = [parseKeyPart()];
    skipWs();
    while (src[pos] === ".") {
      pos++;
      skipWs();
      key.push(parseKeyPart());
      skipWs();
    }
    return key;
  }

  function readEscape() {
    // pos is just past the backslash
    const c = src[pos];
    const simple = { b: "\b", t: "\t", n: "\n", f: "\f", r: "\r", '"': '"', "\\": "\\" };
    if (has(simple, c)) { pos++; return simple[c]; }
    if (c === "u" || c === "U") {
      const n = c === "u" ? 4 : 8;
      const hex = src.slice(pos + 1, pos + 1 + n);
      if (hex.length !== n || !HEX.test(hex)) fail("Invalid hex value in a \\u or \\U escape");
      const cp = parseInt(hex, 16);
      if (cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) fail("Escaped character is not a Unicode scalar value");
      pos += 1 + n;
      return String.fromCodePoint(cp);
    }
    fail("Unescaped '\\' in a string");
  }

  function parseBasicString(multiline) {
    if (multiline) {
      pos += 3;
      if (src[pos] === "\n") pos++;
      else if (src[pos] === "\r" && src[pos + 1] === "\n") pos += 2;
    } else pos++;
    let s = "";
    for (;;) {
      if (pos >= src.length) fail("Unterminated string");
      const c = src[pos];
      if (c === '"') {
        if (!multiline) { pos++; return s; }
        if (src.startsWith('"""', pos)) {
          pos += 3;
          // Up to two more quotes belong to the string.
          let extra = 0;
          while (src[pos] === '"' && extra < 2) { pos++; extra++; }
          return s + '"'.repeat(extra);
        }
        s += c; pos++; continue;
      }
      if (c === "\\") {
        pos++;
        if (multiline) {
          // A line-ending backslash trims the newline and following whitespace.
          let p = pos;
          while (p < src.length && WS.includes(src[p])) p++;
          if (src[p] === "\n" || (src[p] === "\r" && src[p + 1] === "\n")) {
            pos = p;
            while (pos < src.length && (WS.includes(src[pos]) || src[pos] === "\n" || (src[pos] === "\r" && src[pos + 1] === "\n"))) pos += src[pos] === "\r" ? 2 : 1;
            continue;
          }
        }
        s += readEscape();
        continue;
      }
      if (multiline && c === "\n") { s += "\n"; pos++; continue; }
      if (multiline && c === "\r" && src[pos + 1] === "\n") { s += "\n"; pos += 2; continue; }
      if (illegal(c)) fail(c === "\n" || c === "\r" ? "Unterminated string" : "Illegal character in a string");
      s += c;
      pos++;
    }
  }

  function parseLiteralString(multiline) {
    if (multiline) {
      pos += 3;
      if (src[pos] === "\n") pos++;
      else if (src[pos] === "\r" && src[pos + 1] === "\n") pos += 2;
    } else pos++;
    let s = "";
    for (;;) {
      if (pos >= src.length) fail("Unterminated string");
      const c = src[pos];
      if (c === "'") {
        if (!multiline) { pos++; return s; }
        if (src.startsWith("'''", pos)) {
          pos += 3;
          let extra = 0;
          while (src[pos] === "'" && extra < 2) { pos++; extra++; }
          return s + "'".repeat(extra);
        }
      } else if (multiline && c === "\n") { s += "\n"; pos++; continue; }
      else if (multiline && c === "\r" && src[pos + 1] === "\n") { s += "\n"; pos += 2; continue; }
      else if (illegal(c)) fail(c === "\n" || c === "\r" ? "Unterminated string" : "Illegal character in a string");
      s += c;
      pos++;
    }
  }

  function parseArray() {
    pos++;
    const arr = [];
    skipCommentsAndBlankLines();
    if (src[pos] === "]") { pos++; return arr; }
    for (;;) {
      arr.push(parseValue());
      skipCommentsAndBlankLines();
      const c = src[pos];
      if (c === "]") { pos++; return arr; }
      if (c !== ",") fail("Unclosed array");
      pos++;
      skipCommentsAndBlankLines();
      if (src[pos] === "]") { pos++; return arr; }
    }
  }

  function parseInlineTable() {
    pos++;
    const table = newTable();
    const f = new Flags();
    skipWs();
    if (src[pos] === "}") { pos++; return table; }
    for (;;) {
      const key = parseKey();
      if (src[pos] !== "=") fail("Expected '=' after a key in a key/value pair");
      pos++;
      skipWs();
      const value = parseValue();
      const parent = key.slice(0, -1);
      const stem = key[key.length - 1];
      if (f.is(key, FROZEN)) fail(`Cannot mutate immutable namespace ${JSON.stringify(key)}`);
      const nest = getOrCreateNest(table, parent, false);
      if (!nest) fail("Cannot overwrite a value");
      if (has(nest, stem)) fail(`Duplicate inline table key ${JSON.stringify(stem)}`);
      nest[stem] = value;
      skipWs();
      const c = src[pos];
      if (c === "}") { pos++; return table; }
      if (c !== ",") fail("Unclosed inline table");
      if (isTable(value) || Array.isArray(value)) f.set(key, FROZEN, true);
      pos++;
      skipWs();
    }
  }

  function parseNumberOrDate() {
    RE_DATETIME.lastIndex = pos;
    let m = RE_DATETIME.exec(src);
    if (m) {
      const [, y, mo, d, H, , , , z, sign] = m;
      if (+d > daysIn(+y, +mo)) fail("Invalid date or datetime");
      pos += m[0].length;
      const kind = H === undefined ? "local-date" : z || sign ? "offset-datetime" : "local-datetime";
      return { $toml: kind, text: m[0] };
    }
    RE_LOCALTIME.lastIndex = pos;
    m = RE_LOCALTIME.exec(src);
    if (m) {
      pos += m[0].length;
      return { $toml: "local-time", text: m[0] };
    }
    RE_NUMBER.lastIndex = pos;
    m = RE_NUMBER.exec(src);
    if (m) {
      pos += m[0].length;
      const t = m[0].replace(/_/g, "");
      if (m[1]) return Number(t);
      let big;
      if (/^0[xob]/.test(t)) big = BigInt(t);
      else big = BigInt(t);
      return big >= BigInt(Number.MIN_SAFE_INTEGER) && big <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(big) : big;
    }
    return undefined;
  }

  function parseValue() {
    const c = src[pos];
    if (c === '"') return src.startsWith('"""', pos) ? parseBasicString(true) : parseBasicString(false);
    if (c === "'") return src.startsWith("'''", pos) ? parseLiteralString(true) : parseLiteralString(false);
    if (c === "t" && src.startsWith("true", pos)) { pos += 4; return true; }
    if (c === "f" && src.startsWith("false", pos)) { pos += 5; return false; }
    if (c === "[") return parseArray();
    if (c === "{") return parseInlineTable();
    const v = parseNumberOrDate();
    if (v !== undefined) return v;
    for (const [word, val] of [["inf", Infinity], ["nan", NaN]]) {
      for (const sign of ["", "+", "-"]) {
        if (src.startsWith(sign + word, pos)) {
          pos += sign.length + word.length;
          return sign === "-" ? -val : val;
        }
      }
    }
    fail("Invalid value");
  }

  function keyValueRule() {
    const start = pos;
    const key = parseKey();
    if (src[pos] !== "=") fail("Expected '=' after a key in a key/value pair");
    pos++;
    skipWs();
    const value = parseValue();
    const parent = key.slice(0, -1);
    const stem = key[key.length - 1];
    const absParent = header.concat(parent);
    for (let i = 1; i < key.length; i++) {
      const cont = header.concat(key.slice(0, i));
      if (flags.is(cont, EXPLICIT)) fail(`Cannot redefine namespace ${JSON.stringify(cont)}`, start);
      flags.addPending(cont, EXPLICIT);
    }
    if (flags.is(absParent, FROZEN)) fail(`Cannot mutate immutable namespace ${JSON.stringify(absParent)}`, start);
    const nest = getOrCreateNest(out, absParent);
    if (!nest) fail("Cannot overwrite a value", start);
    if (has(nest, stem)) fail(`Cannot overwrite a value (key ${JSON.stringify(header.concat(key).join("."))} is set twice)`, start);
    if (isTable(value) || Array.isArray(value)) flags.set(header.concat(key), FROZEN, true);
    nest[stem] = value;
    remember(pathOf(header.concat(key)), start);
  }

  // Turns a key path into the path through actual values (array-of-table indexes included).
  function pathOf(key) {
    const p = [];
    let cont = out;
    for (const k of key) {
      p.push(k);
      cont = cont && isTable(cont) ? cont[k] : undefined;
      if (Array.isArray(cont) && aot.has(cont)) {
        p.push(cont.length - 1);
        cont = cont[cont.length - 1];
      }
    }
    return p;
  }
  const aot = new WeakSet();

  while (pos < src.length) {
    skipWs();
    const c = src[pos];
    if (pos >= src.length) break;
    if (c === "\n") { pos++; continue; }
    if (c === "\r" && src[pos + 1] === "\n") { pos += 2; continue; }
    if (c === "#") { skipComment(); atLineEnd(); continue; }
    if (c === "[") {
      const start = pos;
      flags.finalize();
      const list = src[pos + 1] === "[";
      pos += list ? 2 : 1;
      skipWs();
      const key = parseKey();
      if (list) {
        if (flags.is(key, FROZEN)) fail(`Cannot mutate immutable namespace ${JSON.stringify(key)}`, start);
        flags.unsetAll(key);
        flags.set(key, EXPLICIT, false);
        const parent = getOrCreateNest(out, key.slice(0, -1));
        if (!parent) fail("Cannot overwrite a value", start);
        const last = key[key.length - 1];
        if (has(parent, last)) {
          if (!Array.isArray(parent[last])) fail("Cannot overwrite a value", start);
          parent[last].push(newTable());
        } else {
          parent[last] = [newTable()];
          aot.add(parent[last]);
        }
        if (!src.startsWith("]]", pos)) fail("Expected ']]' at the end of an array declaration");
        pos += 2;
      } else {
        if (flags.is(key, EXPLICIT) || flags.is(key, FROZEN)) fail(`Cannot declare ${JSON.stringify(key.join("."))} twice`, start);
        flags.set(key, EXPLICIT, false);
        if (!getOrCreateNest(out, key)) fail("Cannot overwrite a value", start);
        if (src[pos] !== "]") fail("Expected ']' at the end of a table declaration");
        pos++;
      }
      header = key;
      remember(pathOf(key), start);
      atLineEnd();
      continue;
    }
    keyValueRule();
    atLineEnd();
  }

  return { data: out, lines };
}

// The line a value was written on, or the nearest written ancestor's.
export function lineOf(lines, path) {
  for (let n = path.length; n > 0; n--) {
    const l = lines.get(JSON.stringify(path.slice(0, n)));
    if (l) return l;
  }
  return null;
}
