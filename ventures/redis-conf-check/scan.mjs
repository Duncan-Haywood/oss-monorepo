// redis.conf Check engine. Reads redis.conf and the files its include lines
// pull in the way Redis 7.0 reads them (src/config.c loadServerConfig and
// loadServerConfigFromString, sds.c sdssplitargs, acl.c for `user` lines),
// then says whether Redis would start, which line set each value, who can
// connect without a password, and which settings widen what a client can do.
//
// Zero dependencies; runs in a browser or Node. It never connects to a
// server. The behaviour followed is described in the README and checked
// against a real redis-server 7.0.15 in parity/.

import { CONFIGS, COMMANDS, CATEGORIES, CATEGORY_COMMANDS, VERSION } from "./redis70.mjs";

export { VERSION };

export const TYPES = [
  "refuses-to-start", "inline-comment", "include-not-found", "include-glob-no-match",
  "include-joined-lines", "include-relative-path", "no-listener", "bind-address-unavailable",
  "tls-port-without-cert", "acl-file-and-users", "module-config-without-module",
  "open-without-password", "local-without-password", "protected-mode-only",
  "default-user-nopass", "requirepass-replaced", "weak-password", "password-in-file",
  "protected-configs-enabled", "debug-command-enabled", "module-command-enabled",
  "plaintext-port-beside-tls", "unixsocket-world-writable", "listens-on-all-interfaces",
  "overridden-directive", "rename-command-used", "decimal-memory-unit", "aclfile-not-read",
];

const SEVERITY_ORDER = { error: 0, high: 1, medium: 2, low: 3 };
// Lookups keyed by text from the file must not reach Object.prototype
// ("maxmemory 1constructor").
const own = (obj, k) => (Object.hasOwn(obj, k) ? obj[k] : undefined);

// ---------------------------------------------------------------- tokens --

const isspace = (c) => c === " " || c === "\t" || c === "\n" || c === "\r" || c === "\v" || c === "\f";
const isHex = (c) => /^[0-9a-fA-F]$/.test(c || "");

// sdssplitargs: returns an array of tokens, or null for unbalanced quotes
// (or a closing quote not followed by a space).
export function splitArgs(line) {
  const out = [];
  let p = 0;
  const at = (i) => (i < line.length ? line[i] : "");
  for (;;) {
    while (p < line.length && isspace(line[p])) p++;
    if (p >= line.length) return out;
    let inq = false, insq = false, done = false, cur = "";
    while (!done) {
      const c = at(p);
      if (inq) {
        if (c === "\\" && at(p + 1) === "x" && isHex(at(p + 2)) && isHex(at(p + 3))) {
          cur += String.fromCharCode(parseInt(at(p + 2) + at(p + 3), 16));
          p += 3;
        } else if (c === "\\" && at(p + 1)) {
          p++;
          const e = at(p);
          cur += own({ n: "\n", r: "\r", t: "\t", b: "\b", a: "\x07" }, e) ?? e;
        } else if (c === '"') {
          if (at(p + 1) && !isspace(at(p + 1))) return null;
          done = true;
        } else if (!c) return null;
        else cur += c;
      } else if (insq) {
        if (c === "\\" && at(p + 1) === "'") { p++; cur += "'"; }
        else if (c === "'") {
          if (at(p + 1) && !isspace(at(p + 1))) return null;
          done = true;
        } else if (!c) return null;
        else cur += c;
      } else if (c === " " || c === "\n" || c === "\r" || c === "\t" || c === "") done = true;
      else if (c === '"') inq = true;
      else if (c === "'") insq = true;
      else cur += c;
      if (p < line.length) p++;
    }
    out.push(cur);
  }
}

const trimSet = (s) => s.replace(/^[ \t\r\n]+/, "").replace(/[ \t\r\n]+$/, "");

// ------------------------------------------------------------- numbers --

const U64 = 1n << 64n;
const toSigned = (u) => (u >= 1n << 63n ? u - U64 : u);
const LONG_STR_SIZE = 21;

function string2ll(s) {
  if (!s.length || s.length >= LONG_STR_SIZE) return null;
  if (s === "0") return 0n;
  let i = 0, neg = false;
  if (s[0] === "-") { neg = true; i = 1; if (i === s.length) return null; }
  if (!(s[i] >= "1" && s[i] <= "9")) return null;
  if (!/^\d+$/.test(s.slice(i))) return null;
  const v = BigInt(s.slice(i));
  if (v >= U64) return null;
  if (neg) { if (v > 1n << 63n) return null; return -v; }
  if (v > (1n << 63n) - 1n) return null;
  return v;
}

// memtoull: digits then an optional unit; "" and "kb" read as 0. Overflow
// wraps the way the C code does.
function memtoull(s) {
  if (s[0] === "-") return null;
  const m = s.match(/^(\d*)(.*)$/s);
  const unit = m[2].toLowerCase();
  const mul = own({ "": 1n, b: 1n, k: 1000n, kb: 1024n, m: 1000000n, mb: 1048576n, g: 1000000000n, gb: 1073741824n }, unit);
  if (mul === undefined) return null;
  if (m[1].length >= 128) return null;
  let v = m[1] === "" ? 0n : BigInt(m[1]);
  if (v >= U64) v = U64 - 1n; // strtoull saturates on ERANGE; the C check lets it through
  return (v * mul) % U64;
}

// strtoll(s, &end, 8) with *end == '\0' and no overflow.
function octal(s) {
  const m = s.match(/^[ \t\n\r\v\f]*([+-]?)([0-7]*)$/);
  if (!m) return null;
  if (m[2] === "") return m[1] === "" && s.trim() === "" ? 0n : (m[1] ? null : 0n);
  const v = BigInt("0o" + m[2]);
  if (v > (1n << 63n) - 1n) return null;
  return m[1] === "-" ? -v : v;
}

// strtoll(s, &end, 10): leading space, sign, digits; returns [value, rest].
function strtoll(s) {
  const m = s.match(/^[ \t\n\r\v\f]*([+-]?\d+)(.*)$/s);
  if (!m) return [0n, s];
  let v = BigInt(m[1]);
  const max = (1n << 63n) - 1n;
  if (v > max) v = max;
  if (v < -max - 1n) v = -max - 1n;
  return [v, m[2]];
}

function string2d(s) {
  if (!s.length || isspace(s[0])) return null;
  if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s) && !/^[+-]?inf(inity)?$/i.test(s)) return null;
  const v = Number(s);
  return Number.isNaN(v) ? null : v;
}

function trimDouble(v) {
  let s = v.toFixed(6);
  if (s.includes(".")) s = s.replace(/0+$/, "").replace(/\.$/, "");
  return s;
}

// ------------------------------------------------------------- configs --

const BY_NAME = new Map();
for (const c of CONFIGS) {
  BY_NAME.set(c.name, c);
  if (c.alias) BY_NAME.set(c.alias, c);
}
const UNSIGNED = new Set(["ulonglong", "uint", "size_t"]);

function enumError(c) {
  return `argument(s) must be one of the following: ${c.values.join(", ")}`;
}

const ENUM_BITS = { default: 0, save: 1, nosave: 2, now: 4, force: 8 };
const OOM_VALUES = { no: 0, yes: 1, relative: 1, absolute: 2 };
const NOTIFY = { K: 1, E: 2, g: 4, $: 8, l: 16, s: 32, h: 64, z: 128, x: 256, e: 512, t: 1024, m: 2048, d: 8192, n: 16384 };
const NOTIFY_ALL = 4 | 8 | 16 | 32 | 64 | 128 | 256 | 512 | 1024 | 8192;

function enumValue(c, args) {
  const multi = c.flags.includes("multi_arg");
  if (!args.length || (!multi && args.length !== 1)) return null;
  const table = c.name === "oom-score-adj" ? OOM_VALUES : c.name.startsWith("shutdown-on-") ? ENUM_BITS : null;
  let v = 0;
  for (const a of args) {
    const hit = c.values.filter((n) => n.toLowerCase() === a.toLowerCase());
    if (!hit.length) return null;
    v |= table ? table[hit[0]] : c.values.indexOf(hit[0]) + 1000; // non-bitflag enums: identity by name
    if (!table) return hit[0];
  }
  return v;
}

function enumName(c, v) {
  if (typeof v === "string") return v;
  const table = c.name === "oom-score-adj" ? OOM_VALUES : ENUM_BITS;
  for (const n of c.values) if (table[n] === v) return n;
  const multi = c.flags.includes("multi_arg");
  let names = [], left = v;
  if (multi) for (const n of c.values) if (table[n] && (left & table[n]) === table[n]) { names.push(n); left &= ~table[n]; }
  return names.length && !left ? names.join(" ") : "unknown";
}

function validString(c, v) {
  switch (c.valid) {
    case "isValidDBfilename": return v.includes("/") ? "dbfilename can't be a path, just a filename" : null;
    case "isValidAOFfilename": return v === "" ? "appendfilename can't be empty" : v.includes("/") ? "appendfilename can't be a path, just a filename" : null;
    case "isValidAOFdirname": return v === "" ? "appenddirname can't be empty" : v.includes("/") ? "appenddirname can't be a path, just a dirname" : null;
    case "isValidAnnouncedHostname":
      if (v.length >= 256) return "Hostnames must be less than 256 characters";
      return /^[A-Za-z0-9.-]*$/.test(v) ? null : "Hostnames may only contain alphanumeric characters, hyphens or dots";
    default: return null;
  }
}

function numericSet(c, s) {
  const f = c.numFlags;
  let ll = null;
  if (f.includes("memory")) { const u = memtoull(s); if (u !== null) ll = toSigned(u); }
  if (ll === null && f.includes("percent") && s.length > 1 && s.endsWith("%")) {
    const p = string2ll(s.slice(0, -1));
    if (p !== null && p >= 0n) ll = -p;
  }
  if (ll === null && f.includes("octal")) ll = octal(s);
  if (ll === null && !f.length) ll = string2ll(s);
  if (ll === null) {
    if (f.includes("memory") && f.includes("percent")) return { err: "argument must be a memory or percent value" };
    if (f.includes("memory")) return { err: "argument must be a memory value" };
    if (f.includes("octal")) return { err: "argument couldn't be parsed as an octal number" };
    return { err: "argument couldn't be parsed into an integer" };
  }
  const min = BigInt(c.min), max = BigInt(c.max);
  if (UNSIGNED.has(c.numericType)) {
    const u = ll < 0n ? ll + U64 : ll;
    const umin = min < 0n ? min + U64 : min;
    if (u > max || u < umin) {
      return { err: f.includes("octal") ? `argument must be between ${umin.toString(8)} and ${max.toString(8)} inclusive` : `argument must be between ${umin} and ${max} inclusive` };
    }
  } else if (f.includes("percent") && ll < 0n) {
    if (ll < min) return { err: `percentage argument must be less or equal to ${-min}` };
  } else if (ll > max || ll < min) {
    return { err: `argument must be between ${min} and ${max} inclusive` };
  }
  return { value: ll };
}

function numericGet(c, ll) {
  if (c.numFlags.includes("percent") && ll < 0n) return `${-ll}%`;
  if (c.numFlags.includes("memory")) return String(ll < 0n ? ll + U64 : ll);
  if (c.numFlags.includes("octal")) return (ll < 0n ? ll + U64 : ll).toString(8);
  return String(ll);
}

// ---------------------------------------------------------------- paths --

export function normalize(p) {
  const abs = p.startsWith("/");
  const parts = [];
  for (const seg of p.split("/")) {
    if (!seg || seg === ".") continue;
    if (seg === "..") { if (parts.length) parts.pop(); continue; }
    parts.push(seg);
  }
  return (abs ? "/" : "") + parts.join("/");
}
const join = (a, b) => (b.startsWith("/") ? normalize(b) : normalize(`${a}/${b}`));
const dirname = (p) => { const n = normalize(p); const i = n.lastIndexOf("/"); return i <= 0 ? "/" : n.slice(0, i); };
const hasGlob = (s) => /[*?[]/.test(s);

// fnmatch for one path segment, as glob(3) uses it (no FNM_PERIOD games
// beyond: a leading dot must be matched literally).
function segMatch(pat, name) {
  if (name.startsWith(".") && !pat.startsWith(".")) return false;
  let re = "^";
  for (let i = 0; i < pat.length; i++) {
    const ch = pat[i];
    if (ch === "*") re += "[^/]*";
    else if (ch === "?") re += "[^/]";
    else if (ch === "[") {
      const close = pat.indexOf("]", i + 2);
      if (close < 0) { re += "\\["; continue; }
      let body = pat.slice(i + 1, close);
      if (body[0] === "!") body = "^" + body.slice(1);
      re += "[" + body.replace(/\\/g, "\\\\") + "]";
      i = close;
    } else if (ch === "\\" && i + 1 < pat.length) { re += "\\" + pat[++i]; }
    else re += ch.replace(/[.+^${}()|\\]/g, "\\$&");
  }
  try { return new RegExp(re + "$").test(name); } catch { return false; }
}

function globPaths(resolver, pattern) {
  const abs = pattern.startsWith("/");
  const segs = pattern.split("/").filter((s, i) => s !== "" || i === 0);
  let bases = [abs ? "/" : ""];
  for (const seg of segs) {
    if (seg === "") continue;
    const next = [];
    for (const b of bases) {
      if (!hasGlob(seg)) { next.push(b === "/" ? `/${seg}` : b ? `${b}/${seg}` : seg); continue; }
      const names = resolver.listDir(b || ".") || [];
      for (const n of names) if (segMatch(seg, n)) next.push(b === "/" ? `/${n}` : b ? `${b}/${n}` : n);
    }
    bases = next;
  }
  // glob(3) only returns paths that exist; sorted (strcoll in the C locale).
  return bases.filter((p) => resolver.read(p) !== null || resolver.isDir?.(p)).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

// ---------------------------------------------------------------- users --

const CMD_SET = new Set(COMMANDS);
const SUBS = new Map();
for (const c of COMMANDS) if (c.includes("|")) { const [p] = c.split("|"); if (!SUBS.has(p)) SUBS.set(p, []); SUBS.get(p).push(c); }

function lookupCommand(name) {
  const parts = name.toLowerCase().split("|");
  if (parts.length > 2) return null;
  if (!CMD_SET.has(parts[0])) return null;
  if (parts.length === 1) return parts[0];
  if (!SUBS.has(parts[0])) return null;
  return CMD_SET.has(parts.join("|")) ? parts.join("|") : null;
}

const ERR = {
  ENOENT: "Unknown command or category name in ACL",
  EINVAL: "Syntax error",
  EEXIST: "Adding a pattern after the * pattern (or the 'allkeys' flag) is not valid and does not have any effect. Try 'resetkeys' to start with an empty list of patterns",
  EISDIR: "Adding a pattern after the * pattern (or the 'allchannels' flag) is not valid and does not have any effect. Try 'resetchannels' to start with an empty list of channels",
  ENODEV: "The password you are trying to remove from the user does not exist",
  EBADMSG: "The password hash must be exactly 64 characters and contain only lowercase hexadecimal characters",
  EALREADY: "Duplicate user found. A user can only be defined once in config files",
  ECHILD: "Allowing first-arg of a subcommand is not supported",
};

function newSelector() { return { allKeys: false, keys: [], allChannels: false, channels: [], allowed: new Set(), allCommands: false }; }
export function newUser(name, pubsubAll = false) {
  return { name, on: false, nopass: false, passwords: [], root: { ...newSelector(), allChannels: pubsubAll }, selectors: [] };
}
export function defaultUser() {
  const u = newUser("default");
  applyRule(u, "+@all"); applyRule(u, "~*"); applyRule(u, "&*"); applyRule(u, "on"); applyRule(u, "nopass");
  return u;
}

function setPerm(sel, cmd, on) {
  const all = [cmd, ...(SUBS.get(cmd) || [])];
  for (const c of all) on ? sel.allowed.add(c) : sel.allowed.delete(c);
  if (!on) sel.allCommands = false;
}

// ACLSetSelector. Returns null or an errno name.
function selectorRule(sel, op) {
  const lc = op.toLowerCase();
  if (lc === "allkeys" || lc === "~*") { sel.allKeys = true; sel.keys = []; }
  else if (lc === "resetkeys") { sel.allKeys = false; sel.keys = []; }
  else if (lc === "allchannels" || lc === "&*") { sel.allChannels = true; sel.channels = []; }
  else if (lc === "resetchannels") { sel.allChannels = false; sel.channels = []; }
  else if (lc === "allcommands" || lc === "+@all") { sel.allCommands = true; sel.allowed = new Set(COMMANDS); }
  else if (lc === "nocommands" || lc === "-@all") { sel.allCommands = false; sel.allowed = new Set(); }
  else if (op[0] === "~" || op[0] === "%") {
    if (sel.allKeys) return "EEXIST";
    let off = 1;
    if (op[0] === "%") {
      let r = false, w = false;
      for (; off < op.length; off++) {
        const ch = op[off].toUpperCase();
        if (ch === "R" && !r) r = true;
        else if (ch === "W" && !w) w = true;
        else if (op[off] === "~") { off++; break; }
        else return "EINVAL";
      }
    }
    if (/[\s\0]/.test(op.slice(off))) return "EINVAL";
    sel.keys.push(op.slice(off));
  } else if (op[0] === "&") {
    if (sel.allChannels) return "EISDIR";
    if (/[\s\0]/.test(op.slice(1))) return "EINVAL";
    sel.channels.push(op.slice(1));
  } else if (op[0] === "+" && op[1] !== "@") {
    const name = op.slice(1);
    if (!name.includes("|")) {
      const c = lookupCommand(name);
      if (!c) return "ENOENT";
      setPerm(sel, c, true);
    } else {
      const i = name.lastIndexOf("|");
      const base = name.slice(0, i), sub = name.slice(i + 1);
      const c = lookupCommand(base);
      if (!c) return "ENOENT";
      if (c.includes("|")) return "ECHILD";
      if (!sub.length) return "EINVAL";
      if (SUBS.has(c)) {
        const s = lookupCommand(name);
        if (!s) return "ENOENT";
        setPerm(sel, s, true);
      } // else: first-arg allowance, which does not change PING or CONFIG
    }
  } else if (op[0] === "-" && op[1] !== "@") {
    const c = lookupCommand(op.slice(1));
    if (!c) return "ENOENT";
    setPerm(sel, c, false);
  } else if ((op[0] === "+" || op[0] === "-") && op[1] === "@") {
    const cat = CATEGORIES.find((k) => k.toLowerCase() === op.slice(2).toLowerCase());
    if (!cat) return "ENOENT";
    for (const c of CATEGORY_COMMANDS[cat]) op[0] === "+" ? sel.allowed.add(c) : sel.allowed.delete(c);
    if (op[0] === "-") sel.allCommands = false;
  } else return "EINVAL";
  return null;
}

// ACLSetUser. Returns null or an errno name. `sha` hashes a cleartext
// password; any stable function works for matching '<' against '>'.
export function applyRule(u, op, pubsubAll = false) {
  if (!op.length) return null;
  const lc = op.toLowerCase();
  if (lc === "on") u.on = true;
  else if (lc === "off") u.on = false;
  else if (lc === "skip-sanitize-payload" || lc === "sanitize-payload") { /* no effect on access */ }
  else if (lc === "nopass") { u.nopass = true; u.passwords = []; }
  else if (lc === "resetpass") { u.nopass = false; u.passwords = []; }
  else if (op[0] === ">" || op[0] === "#") {
    let key;
    if (op[0] === ">") key = `clear:${op.slice(1)}`;
    else { if (!/^[0-9a-f]{64}$/.test(op.slice(1))) return "EBADMSG"; key = `hash:${op.slice(1)}`; }
    if (!u.passwords.some((p) => p.key === key)) u.passwords.push({ key, clear: op[0] === ">" ? op.slice(1) : null });
    u.nopass = false;
  } else if (op[0] === "<" || op[0] === "!") {
    let key;
    if (op[0] === "<") key = `clear:${op.slice(1)}`;
    else { if (!/^[0-9a-f]{64}$/.test(op.slice(1))) return "EBADMSG"; key = `hash:${op.slice(1)}`; }
    const i = u.passwords.findIndex((p) => p.key === key);
    if (i < 0) return "ENODEV";
    u.passwords.splice(i, 1);
  } else if (op[0] === "(" && op[op.length - 1] === ")") {
    const sel = newSelector();
    const args = splitArgs(op.slice(1, -1)) || [];
    for (const a of args) { const e = selectorRule(sel, a); if (e) return e; }
    u.selectors.push(sel);
  } else if (lc === "clearselectors") u.selectors = [];
  else if (lc === "reset") {
    u.nopass = false; u.passwords = [];
    u.root.allKeys = false; u.root.keys = [];
    u.root.allChannels = pubsubAll; u.root.channels = [];
    u.on = false; u.selectors = [];
    u.root.allCommands = false; u.root.allowed = new Set();
  } else return selectorRule(u.root, op);
  return null;
}

// ACLMergeSelectorArguments: "(" ... ")" spread over several tokens become one.
function mergeSelectors(args) {
  const out = [];
  let open = -1, cur = null;
  for (let j = 0; j < args.length; j++) {
    const op = args[j];
    if (op[0] === "(" && op[op.length - 1] !== ")") { cur = op; open = j; continue; }
    if (open !== -1) {
      cur += ` ${op}`;
      if (op[op.length - 1] === ")") { open = -1; out.push(cur); }
      continue;
    }
    out.push(op);
  }
  return open === -1 ? { args: out } : { bad: open };
}

export function userCan(u, cmd) {
  if (u.root.allowed.has(cmd)) return true;
  return u.selectors.some((s) => s.allowed.has(cmd));
}

// ------------------------------------------------------------------ load --

function makeState(opts) {
  const values = new Map();
  for (const c of CONFIGS) {
    if (c.type === "numeric") values.set(c.name, { v: BigInt(c.def) });
    else values.set(c.name, { v: c.def });
  }
  values.set("dir", { v: opts.cwd });
  return {
    values, sets: new Map(), cwd: opts.cwd, saveLoaded: false, renames: [], commands: new Set(COMMANDS.filter((c) => !c.includes("|"))),
    users: [], userNames: new Set(), modules: [], moduleConfigs: [], order: [], findings: [], notes: [], fatal: null,
    obuf: { normal: [0n, 0n, 0n], slave: [268435456n, 67108864n, 60n], pubsub: [33554432n, 8388608n, 60n] },
    notify: 0, includes: [],
  };
}

function add(st, f) { st.findings.push(f); }

function fail(st, where, message, extra = {}) {
  if (st.fatal) return;
  st.fatal = { ...where, message, ...extra };
}

// One call of loadServerConfigFromString over `text`, whose lines map back
// to real files through `origin(i)`.
function loadString(st, text, origin, ctx) {
  const lines = text.split("\n");
  for (let i = 0; i < lines.length && !st.fatal; i++) {
    const raw = lines[i];
    const line = trimSet(raw);
    const where = { ...origin(i), redisLine: i + 1, raw: line };
    if (line[0] === "#" || line === "") continue;
    const argv = splitArgs(line);
    if (argv === null) { fail(st, where, "Unbalanced quotes in configuration line"); return; }
    if (!argv.length) continue;
    argv[0] = argv[0].toLowerCase();
    const name = argv[0];
    const c = BY_NAME.get(name);
    if (c) {
      const multi = c.flags.includes("multi_arg");
      if (!multi && argv.length !== 2) {
        const hash = argv.slice(2).some((a) => a.startsWith("#"));
        fail(st, where, "wrong number of arguments", hash ? { hint: "inline-comment" } : {});
        return;
      }
      let args = argv.slice(1);
      if (multi && argv.length === 2 && argv[1].length) args = splitArgs(argv[1]) || [];
      if (multi && args.some((a, k) => k > 0 && a.startsWith("#"))) where.inlineComment = true;
      const err = setConfig(st, c, args, where, ctx);
      if (err) { fail(st, where, err, where.inlineComment ? { hint: "inline-comment" } : {}); return; }
      continue;
    }
    if (["list-max-ziplist-entries", "list-max-ziplist-value", "lua-replicate-commands"].includes(name) && argv.length === 2) continue;
    if (name === "include" && argv.length === 2) {
      includeFile(st, argv[1], where, ctx);
      continue;
    }
    if (name === "rename-command" && argv.length === 3) {
      const from = argv[1].toLowerCase(), to = argv[2].toLowerCase();
      if (from.includes("|") || !st.commands.has(from)) { fail(st, where, from.includes("|") && lookupCommand(from) ? "rename-command of a subcommand: Redis aborts on an assertion" : "No such command in rename-command"); return; }
      st.commands.delete(from);
      if (to.length) {
        if (st.commands.has(to)) { fail(st, where, "Target command name already exists"); return; }
        st.commands.add(to);
      }
      st.renames.push({ ...where, from, to: argv[2] });
      continue;
    }
    if (name === "user" && argv.length >= 2) {
      const res = appendUser(st, argv);
      if (res !== null) { fail(st, where, `Error in user declaration '${argv[res.idx] ?? ""}': ${res.msg}`); return; }
      st.users.push({ ...where, argv });
      continue;
    }
    if (name === "loadmodule" && argv.length >= 2) { st.modules.push({ ...where, path: argv[1] }); continue; }
    if (name.includes(".")) {
      if (argv.length < 2) { fail(st, where, "Module config specified without value"); return; }
      st.moduleConfigs.push({ ...where, name });
      continue;
    }
    if (name === "sentinel") {
      if (argv.length !== 1) { fail(st, where, "sentinel directive while not in sentinel mode"); return; }
      continue;
    }
    const hash = argv.slice(1).some((a) => a.startsWith("#"));
    fail(st, where, "Bad directive or wrong number of arguments", hash && BY_NAME.has(name) ? { hint: "inline-comment" } : {});
    return;
  }
  if (st.fatal) return;
  // Checks run at the end of every file load, includes too.
  if (st.values.get("cluster-enabled").v === "yes" && st.values.get("replicaof").v) {
    fail(st, { file: origin(lines.length - 1).file, line: null, redisLine: null }, "replicaof directive not allowed in cluster mode");
  }
  const hz = st.values.get("hz");
  if (hz.v < 1n) hz.v = 1n;
  if (hz.v > 500n) hz.v = 500n;
}

function appendUser(st, argv) {
  if (st.userNames.has(argv[1])) return { idx: 1, msg: ERR.EALREADY };
  const merged = mergeSelectors(argv.slice(2));
  if (merged.bad !== undefined) return { idx: merged.bad, msg: "Wrong format" };
  const fake = newUser(argv[1]);
  for (let j = 0; j < merged.args.length; j++) {
    const e = applyRule(fake, merged.args[j]);
    // Unknown commands pass here (modules may add them) and fail at startup.
    if (e && e !== "ENOENT") return { idx: j, msg: own(ERR, e) };
  }
  st.userNames.add(argv[1]);
  st.usersMerged ||= new Map();
  st.usersMerged.set(argv[1], merged.args);
  return null;
}

function record(st, c, where, value) {
  if (!st.sets.has(c.name)) st.sets.set(c.name, []);
  st.sets.get(c.name).push({ ...where, value });
}

function setConfig(st, c, args, where, ctx) {
  const cur = st.values.get(c.name);
  if (c.type === "bool") {
    const a = args[0].toLowerCase();
    if (a !== "yes" && a !== "no") return "argument must be 'yes' or 'no'";
    if (c.name === "activedefrag" && a === "yes" && ctx.build?.defrag === false) return "Active defragmentation cannot be enabled: it requires a Redis server compiled with a modified Jemalloc like the one shipped by default with the Redis source distribution";
    cur.v = a;
  } else if (c.type === "string") {
    const e = validString(c, args[0]);
    if (e) return e;
    cur.v = args[0];
  } else if (c.type === "enum") {
    const v = enumValue(c, args);
    if (v === null) return enumError(c);
    if (c.name.startsWith("shutdown-on-") && v & 1 && v & 2) return "shutdown options SAVE and NOSAVE can't be used simultaneously";
    cur.v = enumName(c, v);
  } else if (c.type === "numeric") {
    const r = numericSet(c, args[0]);
    if (r.err) return r.err;
    cur.v = r.value;
  } else {
    const e = setSpecial(st, c, args, ctx);
    if (e) return e;
  }
  record(st, c, where, args);
  return null;
}

function setSpecial(st, c, args, ctx) {
  const cur = st.values.get(c.name);
  switch (c.name) {
    case "dir": {
      if (args.length !== 1) return "wrong number of arguments";
      const target = join(st.cwd, args[0]);
      const ok = ctx.resolver.isDir ? ctx.resolver.isDir(target) : null;
      if (ok === false) return "No such file or directory";
      if (ok === null) st.dirUnknown = true;
      st.cwd = target;
      cur.v = target;
      return null;
    }
    case "save": {
      let a = args;
      if (a.length === 1 && a[0] === "") { cur.v = ""; a = []; }
      if (a.length & 1) return "Invalid save parameters";
      for (let j = 0; j < a.length; j++) {
        const [v, rest] = strtoll(a[j]);
        if (rest !== "" || (j % 2 === 0 && v < 1n) || (j % 2 === 1 && v < 0n)) return "Invalid save parameters";
      }
      if (!st.saveLoaded) { st.saveLoaded = true; cur.v = ""; }
      const pairs = [];
      for (let j = 0; j < a.length; j += 2) pairs.push(`${strtoll(a[j])[0]} ${BigInt.asIntN(32, strtoll(a[j + 1])[0])}`);
      cur.v = [cur.v, ...pairs].filter(Boolean).join(" ");
      return null;
    }
    case "client-output-buffer-limit": {
      if (args.length % 4) return "Wrong number of arguments in buffer limit configuration.";
      const next = {};
      for (let j = 0; j < args.length; j += 4) {
        const cls = own({ normal: "normal", slave: "slave", replica: "slave", pubsub: "pubsub", master: "master" }, args[j].toLowerCase());
        if (!cls || cls === "master") return "Invalid client class specified in buffer limit configuration.";
        const hard = memtoull(args[j + 1]), soft = memtoull(args[j + 2]);
        const [secs, rest] = strtoll(args[j + 3]);
        const s32 = BigInt.asIntN(32, secs);
        if (hard === null || soft === null || s32 < 0n || rest !== "") return "Error in hard, soft or soft_seconds setting in buffer limit configuration.";
        next[cls] = [hard, soft, s32];
      }
      Object.assign(st.obuf, next);
      cur.v = ["normal", "slave", "pubsub"].map((k) => `${k} ${st.obuf[k][0]} ${st.obuf[k][1]} ${st.obuf[k][2]}`).join(" ");
      return null;
    }
    case "oom-score-adj-values": {
      if (args.length !== 3) return "wrong number of arguments";
      const vals = [];
      for (const a of args) {
        const [v, rest] = strtoll(a);
        if (rest !== "" || v < -2000n || v > 2000n) return "Invalid oom-score-adj-values, elements must be between -2000 and 2000.";
        vals.push(v);
      }
      cur.v = vals.join(" ");
      return null;
    }
    case "notify-keyspace-events": {
      if (args.length !== 1) return "wrong number of arguments";
      let flags = 0;
      for (const ch of args[0]) { if (ch === "A") flags |= NOTIFY_ALL; else if (own(NOTIFY, ch)) flags |= NOTIFY[ch]; else return "Invalid event class character. Use 'Ag$lshzxeKEtmdn'."; }
      let s = "";
      if ((flags & NOTIFY_ALL) === NOTIFY_ALL) s = "A";
      else for (const ch of "g$lshzxetdn") if (flags & NOTIFY[ch]) s += ch;
      for (const ch of "KEm") if (flags & NOTIFY[ch]) s += ch;
      cur.v = s;
      return null;
    }
    case "bind": {
      if (args.length > 16) return "Too many bind addresses specified.";
      const a = args.length === 1 && args[0] === "" ? [] : args;
      cur.v = a.join(" ");
      cur.list = a;
      return null;
    }
    case "replicaof": {
      if (args.length !== 2) return "wrong number of arguments";
      if (args[0].toLowerCase() === "no" && args[1].toLowerCase() === "one") { cur.v = ""; return null; }
      cur.v = "";
      const [port, rest] = strtoll(args[1]);
      const p = BigInt.asIntN(64, port);
      if (p < 0n || p > 65535n || rest !== "" || !/^[ \t]*[+-]?\d/.test(args[1])) return "Invalid master port";
      cur.v = `${args[0]} ${p}`;
      return null;
    }
    case "latency-tracking-info-percentiles": {
      const a = args.length === 1 && args[0] === "" ? [] : args;
      const out = [];
      for (const x of a) {
        const d = string2d(x);
        if (d === null) { cur.v = ""; return "Invalid latency-tracking-info-percentiles parameters"; }
        if (d > 100 || d < 0) { cur.v = ""; return "latency-tracking-info-percentiles parameters should sit between [0.0,100.0]"; }
        out.push(trimDouble(d));
      }
      cur.v = out.join(" ");
      return null;
    }
    default:
      return null;
  }
}

function readFileContent(resolver, p) {
  const t = resolver.read(p);
  return t === null || t === undefined ? null : t;
}

// loadServerConfig(filename): wildcards glob and concatenate; a plain name
// that cannot be opened stops Redis.
function includeFile(st, name, where, ctx) {
  const pattern = join(st.cwd, name);
  if (!name.startsWith("/")) add(st, { severity: "low", type: "include-relative-path", ...where, detail: `Redis opens "${name}" relative to its working directory at this point (${st.cwd}${st.cwdMoved ? ", moved there by an earlier dir line" : ", the directory it was started from"}), not relative to the file that includes it.`, remediation: "Use an absolute path in include lines." });
  let parts;
  if (hasGlob(name)) {
    const paths = globPaths(ctx.resolver, pattern);
    if (!paths.length) {
      add(st, { severity: "low", type: "include-glob-no-match", ...where, detail: `No file matches ${pattern}, so Redis skips this line without a word.`, remediation: "Check the path; a wildcard include that matches nothing is not an error." });
      return;
    }
    parts = paths.map((p) => ({ file: p, text: readFileContent(ctx.resolver, p) ?? "" }));
  } else {
    const t = readFileContent(ctx.resolver, pattern);
    if (t === null) {
      if (ctx.resolver.unknown?.(pattern)) { st.notes.push(`${pattern} was not given, so what it sets is not known.`); return; }
      fail(st, where, `Fatal error, can't open config file '${name}': No such file or directory`, { hint: "include-not-found" });
      return;
    }
    parts = [{ file: pattern, text: t }];
  }
  loadParts(st, parts, ctx, where);
}

function loadParts(st, parts, ctx, includedFrom) {
  let text = "";
  const starts = [];
  for (const [k, p] of parts.entries()) {
    if (st.order.length > 200) { fail(st, includedFrom || {}, "include nesting too deep (Redis would recurse until it crashes)"); return; }
    st.order.push(p.file);
    starts.push({ file: p.file, at: text.length, text: p.text });
    if (k < parts.length - 1 && p.text.length && !p.text.endsWith("\n")) {
      const nextName = parts[k + 1].file;
      const last = p.text.split("\n").length;
      add(st, { severity: "high", type: "include-joined-lines", file: p.file, line: last, raw: trimSet(p.text.split("\n").pop()), detail: `This file does not end with a newline, so Redis glues its last line to the first line of ${nextName} and reads them as one line.`, remediation: "End every included file with a newline." });
    }
    text += p.text;
  }
  // Line i starts at offset; find which file holds that offset.
  const offsets = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === "\n") offsets.push(i + 1);
  const origin = (i) => {
    const off = offsets[i] ?? text.length;
    let s = starts[0];
    for (const x of starts) if (x.at <= off && (x.at < off || x.text.length || x === starts[starts.length - 1])) s = x;
    const before = text.slice(s.at, off);
    return { file: s.file, line: before.split("\n").length };
  };
  loadString(st, text, origin, ctx);
}

// ---------------------------------------------------------------- scan ---

/**
 * scan({ resolver, main, cwd, hostAddrs })
 *   resolver.read(path) -> text | null
 *   resolver.listDir(dir) -> names | null
 *   resolver.isDir(path) -> true | false | null (unknown)
 *   resolver.unknown(path) -> true when a missing file was simply not given
 *   main: absolute path of redis.conf
 *   cwd: the directory redis-server starts in (default: main's directory)
 *   hostAddrs: the machine's IPv4/IPv6 addresses, if known
 *   build: { defrag: false } for builds without active defrag (distribution
 *     packages linked against the system jemalloc, such as Ubuntu's)
 */
export function scan({ resolver, main, cwd, hostAddrs, build } = {}) {
  main = normalize(main || "/etc/redis/redis.conf");
  const st = makeState({ cwd: normalize(cwd || dirname(main)) });
  const text = resolver.read(main);
  if (text === null || text === undefined) {
    st.fatal = { file: main, line: null, redisLine: null, message: `Fatal error, can't open config file '${main}': No such file or directory` };
  } else {
    const orig = st.cwd;
    Object.defineProperty(st, "cwdMoved", { get: () => st.cwd !== orig });
    loadParts(st, [{ file: main, text }], { resolver, build }, null);
  }
  return finish(st, { resolver, hostAddrs });
}

function finish(st, { resolver, hostAddrs }) {
  const v = (n) => st.values.get(n).v;
  const where1 = (n) => { const s = st.sets.get(n); return s ? s[s.length - 1] : null; };
  const result = { version: VERSION, order: st.order, findings: st.findings, notes: st.notes, loads: !st.fatal, startup: null, values: {}, setBy: {}, exposure: null };
  for (const [name, x] of st.values) {
    const c = BY_NAME.get(name);
    result.values[name] = typeof x.v === "bigint" ? numericGet(c, x.v) : x.v;
    if (c.alias) result.values[c.alias] = result.values[name];
  }
  for (const [name, s] of st.sets) result.setBy[name] = { file: s[s.length - 1].file, line: s[s.length - 1].line };

  if (st.fatal) {
    const f = st.fatal;
    const inc = f.file && st.order.length > 1 && f.file !== st.order[0];
    add(st, {
      severity: "error", type: f.hint === "inline-comment" ? "inline-comment" : f.hint === "include-not-found" ? "include-not-found" : "refuses-to-start",
      file: f.file, line: f.line, raw: f.raw,
      detail: f.hint === "inline-comment"
        ? `Redis stops with "${f.message}". A # starts a comment only at the start of a line; after a value it is read as more arguments.`
        : `Redis ${VERSION} will not start: "${f.message}"${f.redisLine ? `, reported as "at line ${f.redisLine}"${inc ? ` (of ${f.file}, though the message does not name the file)` : ""}` : ""}.`,
      remediation: f.hint === "inline-comment" ? "Move the comment to its own line." : f.hint === "include-not-found" ? "Fix the path, or use a wildcard (conf.d/*.conf) if the file is optional." : "Fix this line; Redis reads nothing after it.",
    });
    result.startup = { ok: false, stage: "config", message: f.message, file: f.file, line: f.line, redisLine: f.redisLine };
    sortFindings(st.findings);
    return result;
  }

  // ---- what happens after the file loads (server.c main, initServer, ACL)
  const port = Number(v("port")), tlsPort = Number(v("tls-port"));
  const unixsocket = v("unixsocket");
  const bindList = st.values.get("bind").list || v("bind").split(" ").filter(Boolean);
  const startupFail = (type, message, at, extra = "") => {
    if (result.startup) return;
    result.startup = { ok: false, stage: "startup", message, file: at?.file ?? null, line: at?.line ?? null };
    add(st, { severity: "error", type, file: at?.file ?? null, line: at?.line ?? null, raw: at?.raw, detail: `The file loads, but Redis exits at start-up: "${message}".${extra}`, remediation: remedy[type] });
  };
  const remedy = {
    "tls-port-without-cert": "Set tls-cert-file and tls-key-file (and tls-ca-cert-file or tls-ca-cert-dir, since tls-auth-clients defaults to yes), or set tls-port 0.",
    "bind-address-unavailable": "Bind only addresses this machine has, or prefix optional ones with - (bind 127.0.0.1 -::1).",
    "no-listener": "Set a port, a tls-port or a unixsocket.",
    "acl-file-and-users": "Keep users in one place: either user lines in redis.conf or an aclfile.",
    "module-config-without-module": "Add the loadmodule line for this module, or remove its settings.",
  };
  if ((tlsPort > 0 || v("tls-cluster") === "yes" || v("tls-replication") === "yes") && (!v("tls-cert-file") || !v("tls-key-file") || (!v("tls-ca-cert-file") && !v("tls-ca-cert-dir")))) {
    startupFail("tls-port-without-cert", "Failed to configure TLS. Check logs for more info.", where1(tlsPort > 0 ? "tls-port" : v("tls-cluster") === "yes" ? "tls-cluster" : "tls-replication"));
  }
  // listenToPort: each bind address in turn. An address family the machine
  // lacks is skipped; any other failure stops Redis unless the address is
  // prefixed with "-".
  let tcpListeners = 0;
  if (port > 0 && !result.startup) {
    const have = hostAddrs ? new Set(hostAddrs) : null;
    const v6 = hostAddrs ? hostAddrs.some((a) => a.includes(":")) : true;
    const unknownAddrs = [];
    for (const raw of bindList) {
      const optional = raw.startsWith("-");
      const a = optional ? raw.slice(1) : raw;
      const isV6 = a.includes(":");
      if (isV6 && !v6) continue;
      const ok = a === "*" || a === "0.0.0.0" || a === "::*" || a === "::" ? true : have ? have.has(a) : (unknownAddrs.push(a), true);
      if (ok) tcpListeners++;
      else if (!optional) { startupFail("bind-address-unavailable", `Failed listening on port ${port} (TCP), aborting.`, where1("bind"), a.startsWith("#") ? ` "${a}" is a comment read as an address.` : ` This machine has no address ${a}.`); break; }
    }
    const shown = unknownAddrs.filter((a) => !["127.0.0.1", "::1"].includes(a));
    if (shown.length && !result.startup) st.notes.push(`Redis exits at start-up if this machine has no ${shown.join(" or ")} address; prefix an address with - to make it optional.`);
  }
  if (!result.startup && unixsocket && unixsocket.length >= 108) startupFail("refuses-to-start", `Failed opening Unix socket: unix socket path too long (${unixsocket.length}), must be under 108`, where1("unixsocket"));
  if (!result.startup && tcpListeners === 0 && tlsPort === 0 && !unixsocket) startupFail("no-listener", "Configured to not listen anywhere, exiting.", where1(port === 0 ? "port" : "bind") || where1("port"));
  if (!result.startup && st.moduleConfigs.length && !st.modules.length) {
    startupFail("module-config-without-module", "Module Configuration detected without loadmodule directive or no ApplyConfig call: aborting", st.moduleConfigs[0]);
  }
  if (!result.startup && v("aclfile") && st.users.length) {
    startupFail("acl-file-and-users", "Configuring Redis with users defined in redis.conf and at the same setting an ACL file path is invalid.", st.users[0]);
  }

  // Users: requirepass first (initServer), then user lines (ACLLoadUsersAtStartup).
  const pubsubAll = v("acl-pubsub-default") === "allchannels";
  const users = new Map([["default", defaultUser()]]);
  const du = users.get("default");
  applyRule(du, "resetpass");
  if (v("requirepass")) applyRule(du, `>${v("requirepass")}`); else applyRule(du, "nopass");
  let userDefault = null;
  if (!result.startup) {
    for (const u of st.users) {
      const name = u.argv[1];
      if (/[\s\0]/.test(name)) { startupFail("refuses-to-start", "Critical error while loading ACLs. Exiting.", u, " (spaces are not allowed in ACL usernames)"); break; }
      let user = users.get(name);
      if (!user) { user = newUser(name, pubsubAll); users.set(name, user); }
      else applyRule(user, "reset", pubsubAll);
      if (name === "default") userDefault = u;
      let bad = null;
      for (const op of st.usersMerged.get(name)) { const e = applyRule(user, op, pubsubAll); if (e) { bad = { op, e }; break; } }
      if (bad) { startupFail("refuses-to-start", "Critical error while loading ACLs. Exiting.", u, ` Redis logs: Error loading ACL rule '${bad.op}' for the user named '${name}': ${own(ERR, bad.e)}.`); break; }
    }
  }
  if (!result.startup && v("aclfile")) {
    const path = join(st.cwd, v("aclfile"));
    const t = resolver.read(path);
    if (t === null && resolver.isDir && resolver.unknown && !resolver.unknown(path)) {
      startupFail("refuses-to-start", `Aborting Redis startup because of ACL errors: Error loading ACLs, opening file '${path}': No such file or directory`, where1("aclfile"));
    } else {
      add(st, { severity: "low", type: "aclfile-not-read", ...(where1("aclfile") || {}), detail: `Users come from ${path}, which this tool does not read, so who can log in (including the default user) is decided there.`, remediation: "Check that file has a strong password for every enabled user and no 'nopass' on a user with +@all." });
      result.aclfileDecides = true;
    }
  }
  result.startup ||= { ok: true };
  result.users = [...users.values()].map((u) => ({ name: u.name, on: u.on, nopass: u.nopass, passwords: u.passwords.length }));

  // ---- exposure
  const def = users.get("default");
  const loopbackOnly = (a) => ["127.0.0.1", "::1", "-127.0.0.1", "-::1"].includes(a) || /^-?127\./.test(a);
  const networkBind = port > 0 || tlsPort > 0 ? bindList.filter((a) => !loopbackOnly(a)) : [];
  const unknownUsers = result.aclfileDecides;
  const protectedMode = v("protected-mode") === "yes";
  const commandName = (cmd) => {
    const base = cmd.split("|")[0];
    if (!st.commands.has(base)) return null; // renamed or removed
    return base;
  };
  function classify(local, path) {
    if (unknownUsers) return { outcome: "unknown", why: "users are defined in the aclfile" };
    if (protectedMode && def.nopass && !local) return { outcome: "denied", why: "protected mode refuses non-loopback clients while the default user has no password" };
    if (!(def.nopass && def.on)) return { outcome: "noauth", why: def.on ? "the default user has a password" : "the default user is off" };
    const can = (cmd) => {
      if (!commandName(cmd)) return "unknown";
      if (!userCan(def, cmd)) return "noperm";
      return "ok";
    };
    const ping = can("ping");
    const guard = (opt) => (v(opt) === "yes" || (v(opt) === "local" && local));
    // CONFIG SET checks protected configs after ACL; DEBUG and MODULE are
    // gated by enable-*-command before ACL is consulted.
    const special = (cmd, opt) => { const c = can(cmd); return c !== "ok" ? c : guard(opt) ? "ok" : "blocked"; };
    const gated = (cmd, opt) => { if (!commandName(cmd)) return "unknown"; if (!guard(opt)) return "blocked"; return userCan(def, cmd) ? "ok" : "noperm"; };
    return { outcome: ping === "ok" ? "open" : ping, ping, configSetDir: special("config|set", "enable-protected-configs"), debug: gated("debug", "enable-debug-command"), moduleLoad: gated("module|load", "enable-module-command"), why: "no password is needed" };
  }
  const remote = networkBind.length ? classify(false) : { outcome: "refused", why: port === 0 && tlsPort === 0 ? "no TCP port" : "bound to loopback only" };
  const local = port > 0 || tlsPort > 0 ? (bindList.some((a) => loopbackOnly(a) || a === "*" || a === "0.0.0.0") ? classify(true) : { outcome: "refused", why: bindList.length ? "not bound to 127.0.0.1" : "bind is empty: no TCP listener" }) : { outcome: "refused", why: "no TCP port" };
  const sock = unixsocket ? classify(true) : null;
  result.exposure = { bind: bindList, port, tlsPort, unixsocket: unixsocket || null, network: networkBind, remote, local, socket: sock, protectedMode };
  if (!result.startup.ok) { sortFindings(st.findings); return result; }

  // ---- findings
  const at = (n) => where1(n) || {};
  const exposedText = networkBind.length ? `listens on ${networkBind.join(" ")} (port ${port || tlsPort})` : null;
  if (remote.outcome === "open") {
    add(st, { severity: "high", type: "open-without-password", ...at(v("protected-mode") === "no" ? "protected-mode" : "bind"), detail: `Redis ${exposedText}, protected mode is off and the default user needs no password: anyone who can reach the port can read and change every key${remote.configSetDir === "ok" ? ", and CONFIG SET dir/dbfilename lets them write files on the server" : ""}${remote.moduleLoad === "ok" ? ", and MODULE LOAD lets them run code" : ""}.`, remediation: "Set requirepass (or a user default line with a long password), bind to 127.0.0.1 -::1 or a private address only, and keep protected-mode yes." });
  } else if (remote.outcome === "denied") {
    add(st, { severity: "low", type: "protected-mode-only", ...at("bind"), detail: `Redis ${exposedText} with no password on the default user; only protected mode turns remote clients away (they get -DENIED). Remote clients cannot use it at all, and anyone who sets protected-mode no or a bind change later opens it.`, remediation: "If remote clients need it, add a password or ACL users; otherwise bind 127.0.0.1 -::1." });
  }
  if (local.outcome === "open" && remote.outcome !== "open" && v("protected-mode") === "no") {
    add(st, { severity: "medium", type: "local-without-password", ...at("protected-mode"), detail: "Any process on this machine (or a server-side request forgery that reaches 127.0.0.1) can run every command without a password, and protected mode is switched off as well.", remediation: "Set a password even for local use, and keep protected-mode yes." });
  }
  if (userDefault && def.nopass && def.on && userCan(def, "config|set")) {
    add(st, { severity: networkBind.length && !protectedMode ? "high" : "medium", type: "default-user-nopass", file: userDefault.file, line: userDefault.line, raw: userDefault.raw, detail: "This user line gives the default user nopass with admin commands, so every connection is logged in as an administrator without a password.", remediation: "Give the default user a password (>long-secret or #sha256) or turn it off and create named users." });
  }
  if (v("requirepass") && userDefault) {
    add(st, { severity: def.nopass ? "high" : "medium", type: "requirepass-replaced", ...at("requirepass"), detail: `requirepass is set, but the user default line at ${userDefault.file}:${userDefault.line} resets the default user after it, so the requirepass password is not accepted${def.nopass ? " and no password is needed at all" : ""}.`, remediation: "Use one of them: delete requirepass, or delete the user default line." });
  }
  const pwSources = [];
  if (v("requirepass")) pwSources.push({ where: at("requirepass"), pw: v("requirepass"), what: "requirepass" });
  for (const u of st.users) for (const op of st.usersMerged.get(u.argv[1])) if (op[0] === ">") pwSources.push({ where: u, pw: op.slice(1), what: `user ${u.argv[1]}` });
  for (const s of pwSources) {
    if (s.pw.length < 16 || /^(password|redis|foobared|changeme|secret|admin)/i.test(s.pw)) {
      add(st, { severity: "medium", type: "weak-password", ...s.where, detail: `The ${s.what} password is ${s.pw.length} characters${/^(password|redis|foobared|changeme|secret|admin)/i.test(s.pw) ? " and starts with a common word" : ""}. Redis checks passwords fast and has no lockout, so short ones fall to guessing.`, remediation: "Use a long random password (openssl rand -base64 32), and rotate it." });
    }
  }
  if (pwSources.length || v("masterauth")) {
    const first = pwSources[0]?.where || at("masterauth");
    add(st, { severity: "low", type: "password-in-file", ...first, detail: "Cleartext passwords are stored in this file, so anyone who can read it (backups, config repositories, other users on the box) can log in.", remediation: "Keep the file mode 640 or tighter and out of version control; for user lines, store #<sha256 hex> instead of >password." });
  }
  const guardFinding = (opt, type, what) => {
    const val = v(opt);
    if (val === "no") return;
    const sev = val === "yes" ? (networkBind.length ? "high" : "medium") : "low";
    add(st, { severity: sev, type, ...at(opt), detail: `${opt} ${val}: ${what}${val === "local" ? " Only local connections can do this." : ""}`, remediation: `Leave ${opt} at its default, no, and change it only for the time you need it.` });
  };
  guardFinding("enable-protected-configs", "protected-configs-enabled", "clients can CONFIG SET dir and dbfilename, which is how Redis worms write SSH keys and cron files to disk.");
  guardFinding("enable-debug-command", "debug-command-enabled", "clients can run DEBUG, which can crash the server, stall it and read internals.");
  guardFinding("enable-module-command", "module-command-enabled", "clients can run MODULE LOAD, which loads a shared library from any path: code execution as the Redis user.");
  if (tlsPort > 0 && port > 0 && networkBind.length) add(st, { severity: "medium", type: "plaintext-port-beside-tls", ...at("tls-port"), detail: `TLS listens on ${tlsPort}, but the plaintext port ${port} is still open on the same addresses, so passwords and data can still cross the network unencrypted.`, remediation: "Set port 0 once clients use the TLS port." });
  if (unixsocket) {
    const perm = Number(BigInt("0o" + result.values.unixsocketperm));
    if (perm & 0o002) add(st, { severity: sock?.outcome === "open" ? "medium" : "low", type: "unixsocket-world-writable", ...at("unixsocketperm"), detail: `The socket ${unixsocket} is mode ${result.values.unixsocketperm}, so every local user can connect${sock?.outcome === "open" ? ", and the default user needs no password" : ""}.`, remediation: "Use unixsocketperm 770 (or 700) and add the client users to the Redis group." });
  }
  if (networkBind.some((a) => ["*", "0.0.0.0", "::*", "-::*", "::"].includes(a)) && remote.outcome !== "open" && remote.outcome !== "denied") {
    add(st, { severity: "low", type: "listens-on-all-interfaces", ...at("bind"), detail: `bind ${bindList.join(" ") || "(empty)"}${st.sets.has("bind") ? "" : " (the default, since no bind line is set)"}: Redis listens on every interface, public ones included. Only the password stands between the internet and the data.`, remediation: "Bind only the private addresses clients use, and firewall the port." });
  }
  const SECURITY = new Set(["bind", "protected-mode", "requirepass", "port", "tls-port", "enable-protected-configs", "enable-debug-command", "enable-module-command", "aclfile", "unixsocketperm", "unixsocket", "masterauth"]);
  for (const [name, s] of st.sets) {
    if (s.length < 2 || ["save", "client-output-buffer-limit"].includes(name)) continue;
    const last = s[s.length - 1];
    for (const e of s.slice(0, -1)) {
      if (e.file === last.file && e.line === last.line) continue;
      const shown = e.raw;
      add(st, { severity: SECURITY.has(name) ? "medium" : "low", type: "overridden-directive", file: e.file, line: e.line, raw: shown, detail: `${name} is set again at ${last.file}:${last.line}, and the last line wins, so this one has no effect${last.file !== e.file ? " (an include's position decides which file wins)" : ""}.`, remediation: "Keep one line per setting, or move the include to the end of the file if the included file should win." });
    }
  }
  for (const r of st.renames) {
    add(st, { severity: "low", type: "rename-command-used", file: r.file, line: r.line, raw: r.raw, detail: `rename-command ${r.from} ${r.to === "" ? '""' : "(renamed)"}: renaming hides a command from clients that do not know the new name, but every user keeps the permission, and the new name is a shared secret in this file. ACL rules do the same job per user.`, remediation: `Prefer an ACL rule such as user app on >secret ~* +@all -@dangerous, and keep rename-command only where a client cannot use ACLs.` });
  }
  const mm = st.sets.get("maxmemory");
  if (mm) {
    const last = mm[mm.length - 1];
    const m = String(last.value[0]).match(/^\d+([kmg])$/i);
    if (m) add(st, { severity: "low", type: "decimal-memory-unit", file: last.file, line: last.line, raw: last.raw, detail: `maxmemory ${last.value[0]} is ${result.values.maxmemory} bytes: Redis reads k, m and g as powers of 1000 and kb, mb and gb as powers of 1024.`, remediation: `Write ${last.value[0]}b if you meant ${String(last.value[0]).slice(0, -1)} ${m[1].toUpperCase()}iB.` });
  }
  if (st.dirUnknown) st.notes.push("A dir line names a directory this tool could not check; if it does not exist Redis stops with \"No such file or directory\".");
  if (st.modules.length) st.notes.push(`loadmodule lines (${st.modules.length}) were not checked: Redis exits if a module cannot be loaded.`);
  if (v("logfile")) st.notes.push(`Redis exits at start-up if it cannot open the log file ${v("logfile")} for appending.`);
  sortFindings(st.findings);
  return result;
}

// Findings quote the line they are about; a password on it is masked, so a
// report can go into a CI log or a ticket.
export function redact(raw) {
  if (typeof raw !== "string") return raw;
  const t = raw.trimStart();
  if (/^(requirepass|masterauth|tls-key-file-pass|tls-client-key-file-pass)\b/i.test(t)) return raw.replace(/^(\s*\S+)(\s.*)?$/s, (m, k, rest) => (rest ? `${k} ****` : k));
  if (/^user\b/i.test(t)) return raw.replace(/(^|\s)([><])("[^"]*"|'[^']*'|\S+)/g, "$1$2****");
  return raw;
}

function sortFindings(fs) {
  for (const f of fs) {
    f.raw = redact(f.raw);
    // Internal fields of the line records spread into findings: drop them.
    for (const k of ["value", "argv", "path", "name", "inlineComment", "redisLine"]) delete f[k];
  }
  fs.sort((a, b) => own(SEVERITY_ORDER, a.severity) - own(SEVERITY_ORDER, b.severity));
}

// ----------------------------------------------------- pasted-file mode --

// scanFiles([{ name, text }], opts): the browser entry point. The first file
// is redis.conf; names are paths relative to its directory or absolute.
export function scanFiles(files, opts = {}) {
  const mainName = opts.main || "/etc/redis/redis.conf";
  const base = dirname(mainName);
  const map = new Map();
  files.forEach((f, i) => {
    const n = i === 0 ? normalize(mainName) : join(base, f.name.replace(/^\.\//, ""));
    map.set(n, f.text);
  });
  const dirs = new Set();
  for (const p of map.keys()) { let d = dirname(p); while (d !== "/" && !dirs.has(d)) { dirs.add(d); d = dirname(d); } dirs.add("/"); }
  const resolver = {
    read: (p) => (map.has(normalize(p)) ? map.get(normalize(p)) : null),
    listDir: (d) => {
      const nd = normalize(d);
      const names = new Set();
      for (const p of [...map.keys(), ...dirs]) if (p !== nd && dirname(p) === nd) names.add(p.slice(nd === "/" ? 1 : nd.length + 1));
      return [...names];
    },
    isDir: (p) => (dirs.has(normalize(p)) ? true : null),
    unknown: () => true,
  };
  return scan({ resolver, main: mainName, cwd: opts.cwd, hostAddrs: opts.hostAddrs, build: opts.build });
}

export function hasRisk(findings) {
  return findings.some((f) => f.severity === "error" || f.severity === "high" || f.severity === "medium");
}

export function summaryLine(findings) {
  if (!findings.length) return "no findings";
  const n = {};
  for (const f of findings) n[f.severity] = (n[f.severity] || 0) + 1;
  return ["error", "high", "medium", "low"].filter((s) => n[s]).map((s) => `${n[s]} ${s}`).join(", ");
}

export const OUTCOME_TEXT = {
  open: "connects and runs commands with no password",
  denied: "refused by protected mode (-DENIED)",
  noauth: "must log in first (-NOAUTH)",
  noperm: "connects, but the default user may not run PING (-NOPERM)",
  unknown: "decided by the ACL file",
  refused: "cannot connect",
};
