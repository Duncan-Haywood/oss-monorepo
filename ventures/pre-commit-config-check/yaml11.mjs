// A YAML reader that types scalars the way PyYAML's SafeLoader does.
//
// pre-commit loads its config with PyYAML (YAML 1.1 rules), and several of
// the mistakes this tool exists to catch are typing traps of that loader:
// `rev: 6.0` is a float, `args: [--line-length, 100]` holds an int,
// `pass_filenames: no` is a boolean, `rev: 2024-01-01` is a date. So the
// reader keeps the Python type of every plain scalar, following the implicit
// resolvers of YAML 1.1 (https://yaml.org/type/ : bool, int, float, null,
// timestamp) as PyYAML implements them.
//
// Supported: block mappings and sequences (including `- key: value` compact
// maps and sequences indented level with their parent key), flow sequences
// and mappings (also across lines), single- and double-quoted scalars
// (also across lines), plain multi-line scalars, literal and folded block
// scalars (`|`, `>`, chomping and indentation indicators), comments,
// anchors, aliases and `<<` merge keys, `---` / `...` around one document,
// and the `!!str` tag. Anything else is a ParseError with a line number,
// never a guess.

export class YamlError extends Error {
  constructor(message, line) { super(line ? `line ${line}: ${message}` : message); this.line = line; }
}

/** A non-string scalar, carrying the Python type PyYAML would build. */
export class PyScalar {
  constructor(type, src, value) { this.type = type; this.src = src; this.value = value; }
  toString() { return this.src; }
}

export const LINE = Symbol("line");        // line of a map/seq node
export const KEY_LINES = Symbol("keyLines"); // Map key -> line
export const ITEM_LINES = Symbol("itemLines"); // seq index -> line
export const DUP_KEYS = Symbol("dupKeys"); // [{key, line, firstLine}]

const BOOL = /^(?:yes|Yes|YES|no|No|NO|true|True|TRUE|false|False|FALSE|on|On|ON|off|Off|OFF)$/;
const FLOAT = /^(?:[-+]?(?:[0-9][0-9_]*)\.[0-9_]*(?:[eE][-+][0-9]+)?|\.[0-9][0-9_]*(?:[eE][-+][0-9]+)?|[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+\.[0-9_]*|[-+]?\.(?:inf|Inf|INF)|\.(?:nan|NaN|NAN))$/;
const INT = /^(?:[-+]?0b[0-1_]+|[-+]?0[0-7_]+|[-+]?(?:0|[1-9][0-9_]*)|[-+]?0x[0-9a-fA-F_]+|[-+]?[1-9][0-9_]*(?::[0-5]?[0-9])+)$/;
const NULL = /^(?:~|null|Null|NULL|)$/;
const DATE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
const DATETIME = /^[0-9]{4}-[0-9]{1,2}-[0-9]{1,2}(?:[Tt]|[ \t]+)[0-9]{1,2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]*)?(?:[ \t]*(?:Z|[-+][0-9]{1,2}(?::[0-9]{2})?))?$/;

/** Resolve a plain (unquoted) scalar to its PyYAML type. */
export function resolvePlain(s) {
  if (NULL.test(s)) return null;
  if (BOOL.test(s)) return /^(?:yes|true|on)$/i.test(s);
  if (INT.test(s)) return new PyScalar("int", s);
  if (FLOAT.test(s)) return new PyScalar("float", s);
  if (DATE.test(s)) return new PyScalar("date", s);
  if (DATETIME.test(s)) return new PyScalar("datetime", s);
  return s;
}

/** Python type name of a loaded value, as `type(v).__name__` prints it. */
export function pyType(v) {
  if (v === null || v === undefined) return "NoneType";
  if (typeof v === "string") return "str";
  if (typeof v === "boolean") return "bool";
  if (v instanceof PyScalar) return v.type;
  if (Array.isArray(v)) return "list";
  if (v instanceof Map) return "dict";
  return typeof v;
}

/** Python repr of a scalar, close enough for messages. */
export function pyRepr(v) {
  if (typeof v === "string") return "'" + v.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n") + "'";
  if (v === null || v === undefined) return "None";
  if (v === true) return "True";
  if (v === false) return "False";
  if (v instanceof PyScalar) {
    if (v.type === "int") return String(pyInt(v.src));
    if (v.type === "float") return String(pyFloat(v.src));
    if (v.type === "date") { const [y, m, d] = v.src.split("-").map(Number); return `datetime.date(${y}, ${m}, ${d})`; }
    return v.src;
  }
  if (Array.isArray(v)) return "[" + v.map(pyRepr).join(", ") + "]";
  if (v instanceof Map) return "{" + [...v].map(([k, x]) => `${pyRepr(k)}: ${pyRepr(x)}`).join(", ") + "}";
  return String(v);
}

function pyInt(src) {
  let s = src.replace(/_/g, "");
  let sign = 1;
  if (s[0] === "-") { sign = -1; s = s.slice(1); } else if (s[0] === "+") s = s.slice(1);
  if (s === "0") return 0;
  if (s.startsWith("0b")) return sign * parseInt(s.slice(2), 2);
  if (s.startsWith("0x")) return sign * parseInt(s.slice(2), 16);
  if (s[0] === "0") return sign * parseInt(s, 8);
  if (s.includes(":")) return sign * s.split(":").reduce((a, p) => a * 60 + Number(p), 0);
  return sign * Number(s);
}

function pyFloat(src) {
  const s = src.replace(/_/g, "").toLowerCase();
  if (s.endsWith("inf")) return s[0] === "-" ? "-inf" : "inf";
  if (s.endsWith("nan")) return "nan";
  let v;
  if (s.includes(":")) {
    let t = s, sign = 1;
    if (t[0] === "-") { sign = -1; t = t.slice(1); } else if (t[0] === "+") t = t.slice(1);
    v = sign * t.split(":").reduce((a, p) => a * 60 + Number(p), 0);
  } else v = Number(s);
  // Python prints floats with at least one decimal place.
  const out = String(v);
  return /[.e]|inf|nan/i.test(out) ? out.replace("e+", "e+") : out + ".0";
}

// ------------------------------------------------------------------ lexing

function stripComment(line) {
  // A # starts a comment at line start or after whitespace, outside quotes.
  // Quotes only open at the start of a scalar (after ": ", "- ", "[", ",", "{").
  let q = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q === '"') { if (c === "\\") { i++; continue; } if (c === '"') q = null; continue; }
    if (q === "'") { if (c === "'") { if (line[i + 1] === "'") { i++; continue; } q = null; } continue; }
    if ((c === '"' || c === "'") && (i === 0 || /[\s\[{,]/.test(line[i - 1]) || (line[i - 1] === ":" ) || (line[i-1]==="-"))) {
      // only a quote at a token start opens a quoted scalar
      const before = line.slice(0, i).trimEnd();
      if (i === 0 || /[\s\[{,]$/.test(line.slice(0, i)) || before === "" || /[:\-\[{,]$/.test(before)) { q = c; continue; }
    }
    if (c === "#" && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i);
  }
  return line;
}

class Parser {
  constructor(text) {
    const norm = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
    this.raw = norm.split("\n");
    this.anchors = new Map();
    this.docLines();
  }

  docLines() {
    // Find the single document's line range.
    let start = 0;
    let end = this.raw.length;
    let seenContent = false;
    let docs = 0;
    for (let i = 0; i < this.raw.length; i++) {
      const l = this.raw[i];
      if (/^%/.test(l) && !seenContent) { start = i + 1; continue; }
      if (/^---(\s|$)/.test(l)) {
        if (seenContent || docs > 0) {
          // A second document marker after content.
          const rest = this.raw.slice(i + 1).some((x) => stripComment(x).trim() !== "");
          if (seenContent && rest) throw new YamlError("expected a single document in the stream, but found another document", i + 1);
          end = i;
          break;
        }
        docs++;
        start = i + 1;
        const after = l.slice(3).trim();
        if (after && !after.startsWith("#")) throw new YamlError("content on the --- line is not supported here", i + 1);
        continue;
      }
      if (/^\.\.\.(\s|$)/.test(l)) {
        const rest = this.raw.slice(i + 1).some((x) => stripComment(x).trim() !== "");
        if (rest) throw new YamlError("expected a single document in the stream, but found another document", i + 1);
        end = i;
        break;
      }
      if (stripComment(l).trim() !== "") seenContent = true;
    }
    this.start = start;
    this.end = end;
  }

  // Lines as {n, indent, text} with comments removed, empty lines skipped;
  // block scalars read raw lines themselves.
  line(i) {
    if (i >= this.end) return null;
    const raw = this.raw[i];
    if (/^\t+\S/.test(raw) || /^ *\t/.test(raw) && stripComment(raw).trim()) {
      const body = stripComment(raw);
      if (body.trim() && /^\s*\t/.test(raw)) throw new YamlError("found character '\\t' that cannot start any token", i + 1);
    }
    const body = stripComment(raw).replace(/\s+$/, "");
    const indent = body.length - body.trimStart().length;
    return { n: i, indent, text: body.trim() };
  }

  nextContent(i) {
    for (; i < this.end; i++) {
      const l = this.line(i);
      if (l.text !== "") return l;
    }
    return null;
  }

  parse() {
    const first = this.nextContent(this.start);
    if (!first) return null;
    const { value, next } = this.parseNode(first.n, first.indent, null, -1);
    const extra = this.nextContent(next);
    if (extra) throw new YamlError("expected <document end>, but found more content (check its indentation)", extra.n + 1);
    return value;
  }

  // Parse the block node starting at line i whose content begins at column col.
  parseNode(i, col, inlineText, parentCol = -1) {
    const l = this.line(i);
    const text = inlineText !== null ? inlineText : l.text;
    if (/^-(\s|$)/.test(text)) return this.parseSeq(i, col, text);
    if (this.looksLikeKey(text)) return this.parseMap(i, col, text);
    // A scalar or flow node spanning possibly several lines.
    return this.parseScalarAt(i, col, text, parentCol);
  }

  looksLikeKey(text) {
    if (/^[\[{]/.test(text) && !/^[\[{].*[\]}]\s*:(\s|$)/.test(text)) return false;
    return this.splitKey(text) !== null;
  }

  // Split "key: rest" -> [keyText, rest] or null.
  splitKey(text) {
    if (text.startsWith("? ")) throw new YamlError("complex mapping keys ('? ') are not supported", null);
    if (text[0] === '"' || text[0] === "'") {
      const q = text[0];
      let i = 1;
      for (; i < text.length; i++) {
        if (q === '"' && text[i] === "\\") { i++; continue; }
        if (text[i] === q) { if (q === "'" && text[i + 1] === "'") { i++; continue; } break; }
      }
      if (i >= text.length) return null;
      const rest = text.slice(i + 1);
      const m = /^\s*:(\s|$)/.exec(rest);
      if (!m) return null;
      return [text.slice(0, i + 1), rest.slice(m[0].length).trim()];
    }
    if (/^[&*!|>%@`\[{]/.test(text) && !/^[&!]/.test(text)) return null;
    const m = /:(\s|$)/.exec(text);
    if (!m) return null;
    return [text.slice(0, m.index).trim(), text.slice(m.index + m[0].length).trim()];
  }

  keyValue(keyText, line) {
    let k = keyText;
    let anchor = null;
    const am = /^&(\S+)\s+/.exec(k);
    if (am) { anchor = am[1]; k = k.slice(am[0].length); }
    let v;
    if (k[0] === '"' || k[0] === "'") v = this.quoted(k, line).value;
    else if (k.startsWith("*")) v = this.alias(k.slice(1), line);
    else v = resolvePlain(k);
    if (anchor) this.anchors.set(anchor, v);
    return v;
  }

  mapKey(v) {
    // JS Map keys: strings stay strings; other scalars get a tagged string
    // so `1` and '1' stay distinct as they do in Python.
    if (typeof v === "string") return v;
    if (v instanceof PyScalar || typeof v === "boolean" || v === null) return v === null ? "\u0000None" : "\u0000" + pyRepr(v);
    throw new YamlError("a collection used as a mapping key is not supported", null);
  }

  parseMap(i, col, firstText) {
    const map = new Map();
    map[LINE] = i + 1;
    map[KEY_LINES] = new Map();
    map[DUP_KEYS] = [];
    const merges = [];
    let text = firstText;
    let n = i;
    for (;;) {
      const kv = this.splitKey(text);
      if (!kv) throw new YamlError("could not find expected ':'", n + 1);
      const [keyText, rest] = kv;
      const keyVal = keyText === "<<" ? "<<" : this.keyValue(keyText, n + 1);
      const { value, next } = this.parseValue(n, col, rest);
      if (keyText === "<<") merges.push({ value, line: n + 1 });
      else {
        const key = this.mapKey(keyVal);
        if (map.has(key)) map[DUP_KEYS].push({ key, line: n + 1, firstLine: map[KEY_LINES].get(key) });
        map.set(key, value);
        map[KEY_LINES].set(key, n + 1);
      }
      const nl = this.nextContent(next);
      if (!nl || nl.indent < col) { this.applyMerges(map, merges); return { value: map, next }; }
      if (nl.indent > col) throw new YamlError("mapping values are not allowed here (unexpected indentation)", nl.n + 1);
      if (/^-(\s|$)/.test(nl.text)) {
        this.applyMerges(map, merges);
        return { value: map, next };
      }
      n = nl.n;
      text = nl.text;
    }
  }

  applyMerges(map, merges) {
    if (!merges.length) return;
    // PyYAML puts merged keys first (in source order), then the map's own.
    const merged = new Map();
    const lines = new Map();
    for (const m of merges) {
      const sources = Array.isArray(m.value) ? m.value : [m.value];
      for (const s of sources) {
        if (!(s instanceof Map)) throw new YamlError("expected a mapping or list of mappings for merging", m.line);
        for (const [k, v] of s) if (!merged.has(k)) { merged.set(k, v); lines.set(k, m.line); }
      }
    }
    const own = [...map];
    map.clear();
    const ownMap = new Map(own);
    for (const [k, v] of merged) {
      map.set(k, ownMap.has(k) ? ownMap.get(k) : v);
      if (!ownMap.has(k)) map[KEY_LINES].set(k, lines.get(k));
    }
    for (const [k, v] of own) if (!merged.has(k)) map.set(k, v);
  }

  parseSeq(i, col, firstText) {
    const seq = [];
    seq[LINE] = i + 1;
    seq[ITEM_LINES] = [];
    let text = firstText;
    let n = i;
    for (;;) {
      const rest = text.replace(/^-/, "");
      const inner = rest.trimStart();
      const itemCol = col + 1 + (rest.length - inner.length);
      let res;
      if (inner === "") {
        res = this.parseValue(n, col, "");
      } else if (/^-(\s|$)/.test(inner) || this.looksLikeKey(inner)) {
        res = this.parseNode(n, itemCol, inner, col);
      } else {
        res = this.parseScalarAt(n, col, inner, col);
      }
      seq.push(res.value);
      seq[ITEM_LINES].push(n + 1);
      const nl = this.nextContent(res.next);
      if (!nl || nl.indent < col) return { value: seq, next: res.next };
      if (nl.indent > col) throw new YamlError("unexpected indentation inside a sequence", nl.n + 1);
      if (!/^-(\s|$)/.test(nl.text)) return { value: seq, next: res.next };
      n = nl.n;
      text = nl.text;
    }
  }

  // The value after "key:" on line n of a map at column col.
  parseValue(n, col, rest) {
    let anchor = null;
    let tag = null;
    for (;;) {
      const am = /^&(\S+)(\s+|$)/.exec(rest);
      if (am) { anchor = am[1]; rest = rest.slice(am[0].length); continue; }
      const tm = /^!(\S*)(\s+|$)/.exec(rest);
      if (tm) { tag = tm[1]; rest = rest.slice(tm[0].length); continue; }
      break;
    }
    if (tag !== null && tag !== "!str") throw new YamlError(`the tag !${tag} is not supported here`, n + 1);
    let res;
    if (rest === "") {
      const nl = this.nextContent(n + 1);
      if (nl && (nl.indent > col || (nl.indent === col && /^-(\s|$)/.test(nl.text) && this.isMapLine(n)))) {
        res = this.parseNode(nl.n, nl.indent, null, col);
      } else res = { value: null, next: n + 1 };
    } else if (/^[|>]/.test(rest)) {
      res = this.blockScalar(n, col, rest);
    } else {
      res = this.parseScalarAt(n, col, rest, col);
    }
    if (tag === "!str" && !/^["'\[{|>*]/.test(rest) && rest !== "") res.value = rest;
    else if (tag === "!str" && res.value !== null && typeof res.value !== "string") {
      if (res.value instanceof PyScalar) res.value = res.value.src;
      else if (typeof res.value === "boolean") res.value = String(res.value);
      else throw new YamlError("!!str on a collection", n + 1);
    }
    if (anchor) this.anchors.set(anchor, res.value);
    return res;
  }

  isMapLine(n) { return this.splitKey(this.line(n).text.replace(/^-\s+/, "")) !== null; }

  alias(name, line) {
    if (!this.anchors.has(name)) throw new YamlError(`found undefined alias '${name}'`, line);
    return this.anchors.get(name);
  }

  // A scalar, quoted scalar, alias or flow collection starting with `text`
  // on line n. Continuation lines must be indented more than `parentCol`.
  parseScalarAt(n, parentCol, text, parentColForPlain) {
    if (text.startsWith("*")) {
      const name = text.slice(1).trim();
      return { value: this.alias(name, n + 1), next: n + 1 };
    }
    if (text[0] === "[" || text[0] === "{") return this.flow(n, text);
    if (text[0] === '"' || text[0] === "'") {
      const joined = this.gatherQuoted(n, text);
      const q = this.quoted(joined.text, n + 1);
      if (q.rest.trim() !== "") throw new YamlError("unexpected text after a quoted scalar", joined.endLine + 1);
      return { value: q.value, next: joined.endLine + 1 };
    }
    if (/^[|>]/.test(text)) return this.blockScalar(n, parentCol, text);
    if (/^[@`%]/.test(text)) throw new YamlError(`found character '${text[0]}' that cannot start any token`, n + 1);
    if (/^- /.test(text)) throw new YamlError("block sequence entries are not allowed in this context", n + 1);
    // plain scalar, maybe multi-line
    const parts = [text];
    let i = n + 1;
    let blank = 0;
    let lastContent = n;
    for (; i < this.end; i++) {
      const l = this.line(i);
      if (l.text === "") { if (this.raw[i].trim().startsWith("#")) break; blank++; continue; }
      if (l.indent <= parentColForPlain) break;
      if (this.splitKey(l.text) !== null && !/^[\[{]/.test(l.text)) {
        throw new YamlError("mapping values are not allowed here", i + 1);
      }
      if (/^#/.test(this.raw[i].trim())) break;
      parts.push(blank ? "\n".repeat(blank) + l.text : " " + l.text);
      blank = 0;
      lastContent = i;
    }
    const s = parts.length === 1 ? text : parts[0] + parts.slice(1).join("");
    if (/: /.test(text)) throw new YamlError("mapping values are not allowed here", n + 1);
    return { value: parts.length === 1 ? resolvePlain(s) : s.replace(/ \n/g, "\n"), next: lastContent + 1 };
  }

  gatherQuoted(n, text) {
    const q = text[0];
    let buf = text;
    let line = n;
    for (;;) {
      if (closed(buf, q)) return { text: buf, endLine: line };
      line++;
      if (line >= this.end) throw new YamlError("found unexpected end of stream while scanning a quoted scalar", n + 1);
      buf += "\n" + this.raw[line];
    }
    function closed(s, quote) {
      for (let i = 1; i < s.length; i++) {
        if (quote === '"' && s[i] === "\\") { i++; continue; }
        if (s[i] === quote) { if (quote === "'" && s[i + 1] === "'") { i++; continue; } return true; }
      }
      return false;
    }
  }

  // Parse a quoted scalar at the start of s. Returns {value, rest}.
  quoted(s, line) {
    const q = s[0];
    let out = "";
    let i = 1;
    for (; i < s.length; i++) {
      const c = s[i];
      if (q === "'" && c === "'") { if (s[i + 1] === "'") { out += "'"; i++; continue; } break; }
      if (q === '"' && c === '"') break;
      if (q === '"' && c === "\\") {
        const e = s[++i];
        const simple = { 0: "\0", a: "\x07", b: "\b", t: "\t", "\t": "\t", n: "\n", v: "\v", f: "\f", r: "\r", e: "\x1b", " ": " ", '"': '"', "/": "/", "\\": "\\", N: "\x85", _: "\xa0", L: " ", P: " " };
        if (e in simple) { out += simple[e]; continue; }
        const len = { x: 2, u: 4, U: 8 }[e];
        if (len) {
          const h = s.slice(i + 1, i + 1 + len);
          if (!new RegExp(`^[0-9a-fA-F]{${len}}$`).test(h)) throw new YamlError(`expected escape sequence of ${len} hexadecimal numbers`, line);
          const cp = parseInt(h, 16);
          // \UFFFFFFFF is a YAML error, not a crash (fromCodePoint throws a RangeError past U+10FFFF).
          if (cp > 0x10ffff) throw new YamlError(`escape \\${e}${h} is past U+10FFFF`, line);
          out += String.fromCodePoint(cp);
          i += len;
          continue;
        }
        if (e === "\n") { while (s[i + 1] === " " || s[i + 1] === "\t") i++; continue; }
        throw new YamlError(`found unknown escape character '${e}' in a double-quoted scalar`, line);
      }
      if (c === "\n") {
        // Line folding: trailing spaces dropped, a single break becomes a
        // space, n blank lines become n newlines.
        out = out.replace(/[ \t]+$/, "");
        let breaks = 0;
        let j = i;
        while (s[j] === "\n") {
          breaks++;
          j++;
          while (s[j] === " " || s[j] === "\t") j++;
        }
        out += breaks === 1 ? " " : "\n".repeat(breaks - 1);
        i = j - 1;
        continue;
      }
      out += c;
    }
    if (i >= s.length) throw new YamlError("found unexpected end of stream while scanning a quoted scalar", line);
    return { value: out, rest: s.slice(i + 1) };
  }

  blockScalar(n, parentCol, header) {
    const m = /^([|>])([+-]?)([1-9]?)([+-]?)\s*$/.exec(header);
    if (!m) throw new YamlError("unsupported block scalar header " + header, n + 1);
    const folded = m[1] === ">";
    const chomp = m[2] || m[4];
    let indent = m[3] ? parentCol + Number(m[3]) : null;
    const lines = [];
    let i = n + 1;
    let last = n;
    for (; i < this.end; i++) {
      const raw = this.raw[i];
      if (raw.trim() === "") { lines.push(""); continue; }
      const ind = raw.length - raw.trimStart().length;
      if (indent === null) {
        if (ind <= parentCol) break;
        indent = ind;
      }
      if (ind < indent) break;
      lines.push(raw.slice(indent));
      last = i;
    }
    // trailing blank lines belong to chomping
    let trailing = 0;
    while (lines.length && lines[lines.length - 1] === "") { lines.pop(); trailing++; }
    let body = folded ? foldFix(lines) : lines.join("\n");
    if (lines.length === 0) body = "";
    if (chomp === "-") { /* strip */ }
    else if (chomp === "+") body += lines.length ? "\n" + "\n".repeat(trailing) : "\n".repeat(trailing);
    else if (lines.length) body += "\n";
    return { value: body, next: last + 1 };
  }

  flow(n, text) {
    // Gather lines until brackets balance, then parse the flow text.
    let buf = text;
    let line = n;
    while (!balanced(buf)) {
      line++;
      if (line >= this.end) throw new YamlError("unterminated flow collection", n + 1);
      buf += " " + stripComment(this.raw[line]).trim();
    }
    const p = new FlowParser(buf, n + 1, this);
    const v = p.value();
    p.ws();
    if (p.i < buf.length) throw new YamlError("unexpected text after a flow collection", line + 1);
    if (Array.isArray(v)) { v[LINE] = n + 1; }
    else if (v instanceof Map) { v[LINE] = n + 1; }
    return { value: v, next: line + 1 };
    function balanced(s) {
      let depth = 0, q = null;
      for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (q) { if (q === '"' && c === "\\") { i++; continue; } if (c === q) { if (q === "'" && s[i + 1] === "'") { i++; continue; } q = null; } continue; }
        if ((c === '"' || c === "'") && (i === 0 || /[\s\[{,:]/.test(s[i - 1]))) { q = c; continue; }
        if (c === "[" || c === "{") depth++;
        if (c === "]" || c === "}") depth--;
      }
      return depth <= 0 && !q;
    }
  }
}

// YAML 1.2/1.1 folding for `>` block scalars: a line break between two
// non-blank, non-indented lines becomes a space; blank lines become
// newlines; more-indented lines keep their breaks.
function foldFix(lines) {
  let out = "";
  for (let k = 0; k < lines.length; k++) {
    const cur = lines[k];
    if (k === 0) { out = cur; continue; }
    const prev = lines[k - 1];
    const curMore = /^\s/.test(cur);
    const prevMore = /^\s/.test(prev);
    if (cur === "") { out += "\n"; continue; }
    if (prev === "") {
      // blank line(s) already emitted as \n each; the first blank only ends
      // the fold, so nothing more unless more-indented
      if (curMore) out += "\n";
      out += cur;
      continue;
    }
    out += curMore || prevMore ? "\n" : " ";
    out += cur;
  }
  return out;
}

class FlowParser {
  constructor(s, line, owner) { this.s = s; this.i = 0; this.line = line; this.owner = owner; }
  ws() { while (this.i < this.s.length && /\s/.test(this.s[this.i])) this.i++; }
  value() {
    this.ws();
    const c = this.s[this.i];
    if (c === "[") return this.seq();
    if (c === "{") return this.map();
    return this.scalar(false);
  }
  seq() {
    this.i++;
    const out = [];
    out[ITEM_LINES] = [];
    for (;;) {
      this.ws();
      if (this.s[this.i] === "]") { this.i++; return out; }
      let v = this.value();
      this.ws();
      if (this.s[this.i] === ":" && /[\s,\]]/.test(this.s[this.i + 1] || " ")) {
        // single-pair mapping inside a flow sequence
        this.i++;
        const val = this.value();
        const m = new Map();
        m.set(this.owner.mapKey(v), val);
        m[KEY_LINES] = new Map();
        m[DUP_KEYS] = [];
        v = m;
        this.ws();
      }
      out.push(v);
      out[ITEM_LINES].push(this.line);
      if (this.s[this.i] === ",") { this.i++; continue; }
      if (this.s[this.i] === "]") { this.i++; return out; }
      throw new YamlError("expected ',' or ']' in a flow sequence", this.line);
    }
  }
  map() {
    this.i++;
    const out = new Map();
    out[KEY_LINES] = new Map();
    out[DUP_KEYS] = [];
    for (;;) {
      this.ws();
      if (this.s[this.i] === "}") { this.i++; return out; }
      const k = this.scalar(true);
      this.ws();
      let v = null;
      if (this.s[this.i] === ":") { this.i++; v = this.value(); this.ws(); }
      const key = this.owner.mapKey(k);
      if (out.has(key)) out[DUP_KEYS].push({ key, line: this.line, firstLine: this.line });
      out.set(key, v);
      out[KEY_LINES].set(key, this.line);
      if (this.s[this.i] === ",") { this.i++; continue; }
      if (this.s[this.i] === "}") { this.i++; return out; }
      throw new YamlError("expected ',' or '}' in a flow mapping", this.line);
    }
  }
  scalar(isKey) {
    this.ws();
    const c = this.s[this.i];
    if (c === '"' || c === "'") {
      const q = this.owner.quoted(this.s.slice(this.i), this.line);
      this.i = this.s.length - q.rest.length;
      return q.value;
    }
    if (c === "*") {
      const m = /^\*([^\s,\[\]{}]+)/.exec(this.s.slice(this.i));
      this.i += m[0].length;
      return this.owner.alias(m[1], this.line);
    }
    let j = this.i;
    while (j < this.s.length) {
      const ch = this.s[j];
      if (ch === "," || ch === "]" || ch === "}" || ch === "[" || ch === "{") break;
      if (ch === ":" && (j + 1 >= this.s.length || /[\s,\[\]{}]/.test(this.s[j + 1]))) break;
      j++;
    }
    const raw = this.s.slice(this.i, j).trim();
    this.i = j;
    return resolvePlain(raw);
  }
}

/** Load one YAML document. Throws YamlError. */
export function loadYaml(text) {
  return new Parser(text).parse();
}
