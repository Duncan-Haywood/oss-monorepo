// pg_hba.conf Check: the engine. Zero dependencies; runs in a browser or Node.
//
// It reads pg_hba.conf, and every file its include, include_if_exists,
// include_dir and @file references pull in, the way PostgreSQL 16 does, then
// reports the lines PostgreSQL rejects (one bad line and the whole file is
// refused), the rules that can never match because an earlier rule always
// wins (the first matching line decides, not the most specific), and the
// rules that let people in more easily than they look: trust over TCP,
// cleartext passwords without TLS, ident over TCP, regexes that match
// anywhere in a name, quoted keywords, IPv4 shorthand such as 010.0.0.1.
//
// The behaviour follows PostgreSQL 16's src/backend/libpq/hba.c (tokenising,
// include handling, parse_hba_line, check_hba) and the pg_hba.conf chapter of
// the PostgreSQL 16 manual. It is an independent re-implementation, not a
// copy of PostgreSQL code. The parser was compared line by line with the
// pg_hba_file_rules view of a real PostgreSQL 16 server, and the matcher with
// real connections to it; see parity/README.md.
//
// A static read of the files given, not a security audit; a clean result
// only means these patterns were not found.

export const TYPES = [
  "parse-error",
  "include-missing",
  "no-entries",
  "hostssl-without-ssl",
  "trust-remote",
  "trust-loopback",
  "trust-local",
  "ident-over-tcp",
  "cleartext-password-no-tls",
  "password-method",
  "md5-method",
  "no-tls-required",
  "any-address",
  "secret-in-file",
  "unanchored-regex",
  "shadowed-rule",
  "quoted-keyword",
  "ipv4-shorthand",
  "address-is-hostname",
  "host-bits-set",
  "include-dir-file-ignored",
];

const RISK = new Set(["error", "high", "medium"]);
const MAX_DEPTH = 10;
const CONN_TYPES = ["local", "host", "hostssl", "hostnossl", "hostgssenc", "hostnogssenc"];
const KEYWORDS = new Set(["all", "sameuser", "samerole", "samegroup", "replication", "samehost", "samenet"]);
const CLEARTEXT = new Set(["password", "ldap", "radius", "pam", "bsd"]);

// The build the parser assumes: PGDG and Debian/Ubuntu packages of 16 are
// built with OpenSSL, GSSAPI, LDAP and PAM, without BSD auth or SSPI.
export const DEFAULT_BUILD = { ssl: true, gss: true, ldap: true, pam: true, bsd: false, sspi: false };

// ---------------------------------------------------------------- paths

function normalize(p) {
  const abs = p.startsWith("/");
  const out = [];
  for (const seg of p.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") { if (out.length && out[out.length - 1] !== "..") out.pop(); else if (!abs) out.push(".."); continue; }
    out.push(seg);
  }
  const s = out.join("/");
  return abs ? "/" + s : s || ".";
}
function dirname(p) {
  const i = p.lastIndexOf("/");
  if (i < 0) return ".";
  if (i === 0) return "/";
  return p.slice(0, i);
}
function basename(p) { return p.slice(p.lastIndexOf("/") + 1); }
// AbsoluteConfigLocation: an absolute path stays, a relative one is taken
// from the directory of the file that names it.
export function resolvePath(location, callingFile) {
  if (location.startsWith("/")) return normalize(location);
  const d = dirname(callingFile);
  return normalize(d === "." ? location : `${d}/${location}`);
}

// A resolver over pasted files: exact path, then (for an absolute path that
// was not pasted under that name) a pasted file whose name is a trailing part
// of it, so "conf.d/10-app.conf" stands for /etc/postgresql/16/main/conf.d/10-app.conf.
export function pastedResolver(files) {
  const map = new Map(files.map((f) => [normalize(f.name), f.text]));
  const names = [...map.keys()];
  function find(p) {
    if (map.has(p)) return p;
    if (p.startsWith("/")) {
      const parts = p.split("/").filter(Boolean);
      for (let k = parts.length - 1; k >= 1; k--) {
        const tail = parts.slice(parts.length - k).join("/");
        if (map.has(tail)) return tail;
      }
    }
    return null;
  }
  return {
    read(p) { const hit = find(p); return hit == null ? null : map.get(hit); },
    listDir(d) {
      const dn = normalize(d);
      let hits = names.filter((n) => dirname(n) === dn);
      if (!hits.length && dn.startsWith("/")) {
        const parts = dn.split("/").filter(Boolean);
        for (let k = parts.length; k >= 1 && !hits.length; k--) {
          const tail = parts.slice(parts.length - k).join("/");
          hits = names.filter((n) => dirname(n) === tail);
        }
      }
      return hits.length ? hits.map(basename) : null;
    },
  };
}

// ---------------------------------------------------------------- tokenising

const isBlank = (c) => c === " " || c === "\t" || c === "\r";

// next_token(): one token, bounded by blanks, commas and line ends; double
// quotes protect blanks, commas and '#', and "" inside quotes is a quote.
function nextToken(line, i) {
  let inQuote = false, wasQuote = false, sawQuote = false, initialQuote = false, comma = false;
  let buf = "";
  while (i < line.length && (isBlank(line[i]) || line[i] === ",")) i++;
  while (i < line.length && (!isBlank(line[i]) || inQuote)) {
    const c = line[i];
    if (c === "#" && !inQuote) { i = line.length; break; }
    if (c === "," && !inQuote) { comma = true; break; }
    if (c !== '"' || wasQuote) buf += c;
    if (inQuote && c === '"') wasQuote = !wasQuote; else wasQuote = false;
    if (c === '"') { inQuote = !inQuote; sawQuote = true; if (buf.length === 0) initialQuote = true; }
    i++;
  }
  return { tok: buf, i, quoted: initialQuote, comma, got: sawQuote || buf.length > 0 };
}

// Split a file into logical lines: CR/LF stripped, a trailing backslash joins
// the next physical line (with no separator), and the logical line keeps the
// number of its first physical line.
function logicalLines(text) {
  const phys = text.split("\n");
  if (phys.length && phys[phys.length - 1] === "") phys.pop();
  const out = [];
  let n = 1;
  for (let k = 0; k < phys.length;) {
    let buf = "";
    let lastBs = 0;
    let cont = 0;
    for (;;) {
      buf += phys[k++];
      buf = buf.replace(/[\r\n]+$/, "");
      if (buf.length > lastBs && buf.endsWith("\\")) {
        buf = buf.slice(0, -1);
        lastBs = buf.length;
        cont++;
        if (k < phys.length) continue;
      }
      break;
    }
    out.push({ n, raw: buf });
    n += cont + 1;
  }
  return out;
}

// tokenize_auth_file(): returns tokenised lines {file, line, raw, fields, err}.
// include lines are replaced by the lines of the files they name.
function tokenizeFile(ctx, file, text, depth, out) {
  for (const { n, raw } of logicalLines(text)) {
    let fields = [];
    let err = null;
    let i = 0;
    while (i < raw.length && err == null) {
      const r = nextField(ctx, file, raw, i, depth);
      i = r.i;
      err = r.err;
      if (r.tokens.length) fields.push(r.tokens);
    }
    if (!fields.length && err == null) continue;
    if (err == null && fields.length === 2) {
      const first = fields[0][0].s;
      const second = fields[1][0].s;
      if (first === "include" || first === "include_if_exists") {
        const e = includeFile(ctx, file, second, depth + 1, first === "include_if_exists", out, n);
        if (e == null) continue;
        err = e;
      } else if (first === "include_dir") {
        const e = includeDir(ctx, file, second, depth + 1, out, n);
        if (e == null) continue;
        err = e;
      }
    }
    out.push({ file, line: n, raw, fields, err });
  }
}

function nextField(ctx, file, raw, i, depth) {
  const tokens = [];
  let err = null;
  for (;;) {
    const t = nextToken(raw, i);
    i = t.i;
    if (!t.got) break;
    if (!t.quoted && t.tok.length > 1 && t.tok[0] === "@") {
      const r = expandAtFile(ctx, file, t.tok.slice(1), depth + 1);
      tokens.push(...r.tokens);
      if (r.err) err = r.err;
    } else tokens.push({ s: t.tok, quoted: t.quoted });
    if (!(t.comma && err == null)) break;
  }
  return { tokens, i, err };
}

function openFile(ctx, path, depth) {
  if (depth > MAX_DEPTH) return { err: `could not open file "${path}": maximum nesting depth exceeded` };
  const text = ctx.resolver.read(path);
  if (text == null) return { err: `could not open file "${path}": No such file or directory`, missing: true };
  ctx.readFiles.push(path);
  return { text };
}

function expandAtFile(ctx, outer, name, depth) {
  const path = resolvePath(name, outer);
  const f = openFile(ctx, path, depth);
  if (f.err) { if (f.missing) ctx.missing.push({ path, from: outer, how: "@" }); return { tokens: [], err: f.err }; }
  const lines = [];
  tokenizeFile(ctx, path, f.text, depth, lines);
  const tokens = [];
  for (const l of lines) {
    if (l.err) return { tokens, err: l.err };
    for (const field of l.fields) tokens.push(...field);
  }
  return { tokens, err: null };
}

function includeFile(ctx, outer, name, depth, missingOk, out, line) {
  const path = resolvePath(name, outer);
  const f = openFile(ctx, path, depth);
  if (f.err) {
    if (f.missing && missingOk) { ctx.skipped.push({ path, from: outer, line }); return null; }
    if (f.missing) ctx.missing.push({ path, from: outer, line, how: "include" });
    return f.err;
  }
  tokenizeFile(ctx, path, f.text, depth, out);
  return null;
}

function includeDir(ctx, outer, name, depth, out, line) {
  if (/^[ \t\r\n]*$/.test(name)) return "empty configuration directory name";
  const dir = resolvePath(name, outer);
  const names = ctx.resolver.listDir(dir);
  if (names == null) { ctx.missing.push({ path: dir, from: outer, line, how: "include_dir" }); return `could not open directory "${dir}"`; }
  const take = [];
  for (const n of names) {
    if (n.length < 6 || n[0] === "." || !n.endsWith(".conf")) { ctx.ignored.push({ path: `${dir}/${n}`, from: outer, line }); continue; }
    take.push(n);
  }
  take.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const errs = [];
  for (const n of take) {
    const e = includeFile(ctx, outer, `${dir}/${n}`, depth, false, out, line);
    if (e) errs.push(e);
  }
  return errs.length ? errs.join("\n") : null;
}

// ---------------------------------------------------------------- addresses

// inet_aton, which glibc's getaddrinfo(AI_NUMERICHOST) uses for IPv4: one to
// four parts, each decimal, octal (leading 0) or hex (0x); the last part
// fills the remaining bytes. So 10.1 is 10.0.0.1 and 010.0.0.1 is 8.0.0.1.
export function inetAton(s) {
  if (!s.length) return null;
  const parts = s.split(".");
  if (parts.length > 4) return null;
  const vals = [];
  for (const p of parts) {
    let v;
    if (/^0[xX][0-9a-fA-F]*$/.test(p)) v = p.length === 2 ? 0 : parseInt(p.slice(2), 16);
    else if (/^0[0-7]*$/.test(p)) v = p.length === 1 ? 0 : parseInt(p.slice(1), 8);
    else if (/^[1-9][0-9]*$/.test(p)) v = Number(p);
    else return null;
    if (!Number.isFinite(v)) return null;
    vals.push(v);
  }
  const last = vals.pop();
  for (const v of vals) if (v > 255) return null;
  const room = 4 - vals.length;
  if (last >= 2 ** (8 * room)) return null;
  const bytes = [...vals];
  for (let k = room - 1; k >= 0; k--) bytes.push(Math.floor(last / 2 ** (8 * k)) % 256);
  return bytes;
}

function parseIPv4Strict(s) {
  const p = "(0|[1-9]\\d{0,2})";
  const m = new RegExp(`^${p}\\.${p}\\.${p}\\.${p}$`).exec(s);
  if (!m) return null;
  const b = m.slice(1).map(Number);
  return b.every((x) => x <= 255) ? b : null;
}

// inet_pton for IPv6, with an embedded dotted IPv4 tail.
export function parseIPv6(s) {
  if (!/^[0-9a-fA-F:.]+$/.test(s) || !s.includes(":")) return null;
  const tail = [];
  let str = s;
  const lastColon = s.lastIndexOf(":");
  if (s.slice(lastColon + 1).includes(".")) {
    const v4 = parseIPv4Strict(s.slice(lastColon + 1));
    if (!v4) return null;
    tail.push((v4[0] << 8) | v4[1], (v4[2] << 8) | v4[3]);
    str = s.slice(0, lastColon + 1);
    if (!str.endsWith("::")) str = str.slice(0, -1);
  }
  const dbl = str.indexOf("::");
  if (dbl >= 0 && str.indexOf("::", dbl + 1) >= 0) return null;
  const parseGroups = (x) => (x === "" ? [] : x.split(":"));
  let head, rest;
  if (dbl >= 0) { head = parseGroups(str.slice(0, dbl)); rest = parseGroups(str.slice(dbl + 2)); }
  else { head = parseGroups(str); rest = null; }
  const toNum = (g) => (/^[0-9a-fA-F]{1,4}$/.test(g) ? parseInt(g, 16) : NaN);
  const h = head.map(toNum);
  const r = rest ? rest.map(toNum) : [];
  if ([...h, ...r].some((x) => Number.isNaN(x))) return null;
  const total = h.length + r.length + tail.length;
  let words;
  if (rest) { if (total > 7) return null; words = [...h, ...Array(8 - total).fill(0), ...r, ...tail]; }
  else { if (total !== 8) return null; words = [...h, ...tail]; }
  const bytes = [];
  for (const w of words) bytes.push(w >> 8, w & 255);
  return bytes;
}

// What getaddrinfo(AI_NUMERICHOST) makes of a token: an address, or null
// (EAI_NONAME, which PostgreSQL then reads as a host name).
export function numericAddress(s) {
  const v4 = inetAton(s);
  if (v4) return { family: 4, bytes: v4, shorthand: !parseIPv4Strict(s) };
  const v6 = parseIPv6(s);
  if (v6) return { family: 6, bytes: v6, shorthand: false };
  return null;
}

// pg_sockaddr_cidr_mask: strtol base 10 of the whole string.
function cidrMask(bitsStr, family) {
  if (!/^[ \t\n\v\f\r]*[+-]?\d+$/.test(bitsStr)) return null;
  const bits = Number(bitsStr.trim());
  const max = family === 4 ? 32 : 128;
  if (bits < 0 || bits > max) return null;
  const n = max / 8;
  const out = [];
  for (let k = 0; k < n; k++) {
    const b = Math.max(0, Math.min(8, bits - 8 * k));
    out.push((0xff << (8 - b)) & 0xff);
  }
  return out;
}

export function formatAddress(a) {
  if (a.family === 4) return a.bytes.join(".");
  const w = [];
  for (let k = 0; k < 16; k += 2) w.push((a.bytes[k] << 8) | a.bytes[k + 1]);
  // glibc inet_ntop: longest run of zero words (length >= 2, leftmost wins)
  let best = { base: -1, len: 0 }, cur = { base: -1, len: 0 };
  for (let k = 0; k < 8; k++) {
    if (w[k] === 0) { if (cur.base < 0) cur = { base: k, len: 1 }; else cur.len++; }
    else if (cur.base >= 0) { if (best.base < 0 || cur.len > best.len) best = cur; cur = { base: -1, len: 0 }; }
  }
  if (cur.base >= 0 && (best.base < 0 || cur.len > best.len)) best = cur;
  if (best.base >= 0 && best.len < 2) best = { base: -1, len: 0 };
  let s = "";
  for (let k = 0; k < 8; k++) {
    if (best.base >= 0 && k >= best.base && k < best.base + best.len) { if (k === best.base) s += ":"; continue; }
    if (k) s += ":";
    if (k === 6 && best.base === 0 && (best.len === 6 || (best.len === 7 && w[7] !== 1) || (best.len === 5 && w[5] === 0xffff))) {
      s += a.bytes.slice(12).join(".");
      break;
    }
    s += w[k].toString(16);
  }
  if (best.base >= 0 && best.base + best.len === 8) s += ":";
  return s;
}

function maskBits(mask) {
  let n = 0;
  for (const b of mask) for (let k = 7; k >= 0; k--) if (b & (1 << k)) n++;
  return n;
}
function contiguous(mask) {
  let seenZero = false;
  for (const b of mask) for (let k = 7; k >= 0; k--) { const one = (b >> k) & 1; if (one && seenZero) return false; if (!one) seenZero = true; }
  return true;
}
function inRange(ip, addr, mask) {
  if (ip.length !== addr.length) return false;
  for (let k = 0; k < ip.length; k++) if (((ip[k] ^ addr[k]) & mask[k]) !== 0) return false;
  return true;
}
// Every address the inner (addr, mask) matches is matched by the outer one.
function rangeCovers(outer, inner) {
  if (outer.family !== inner.family) return false;
  for (let k = 0; k < outer.mask.length; k++) {
    if ((outer.mask[k] & ~inner.mask[k]) & 0xff) return false;
    if (((outer.bytes[k] ^ inner.bytes[k]) & outer.mask[k]) !== 0) return false;
  }
  return true;
}
const LOOP4 = { family: 4, bytes: [127, 0, 0, 0], mask: [255, 0, 0, 0] };
const LOOP6 = { family: 6, bytes: [...Array(15).fill(0), 1], mask: Array(16).fill(255) };
function isLoopbackRange(a) { return rangeCovers(LOOP4, a) || rangeCovers(LOOP6, a); }
function isAnyRange(a) { return a.mask.every((b) => b === 0); }

// ---------------------------------------------------------------- parse_hba_line

function compileRegex(src) {
  // PostgreSQL uses its own (Tcl/Spencer ARE) engine; for the common syntax
  // a JavaScript RegExp agrees, which is what matching here relies on.
  try { return new RegExp(src, "u"); } catch { try { return new RegExp(src); } catch { return null; } }
}

function parseLine(tl, build) {
  const fail = (msg, extra = {}) => ({ ok: false, err: msg, ...extra });
  const f = tl.fields;
  let fi = 0;
  const rule = { file: tl.file, line: tl.line, raw: tl.raw, options: [], optionMap: {}, warn: null };
  let toks = f[fi];
  if (toks.length > 1) return fail("multiple values specified for connection type");
  const t = toks[0].s;
  if (!CONN_TYPES.includes(t)) return fail(`invalid connection type "${t}"`);
  rule.type = t;
  if (t === "hostssl" && !build.ssl) rule.warn = "hostssl record cannot match because SSL is disabled";
  if (t === "hostgssenc" && !build.gss) rule.warn = "hostgssenc record cannot match because GSSAPI is not supported by this build";

  if (!f[++fi]) return fail("end-of-line before database specification");
  rule.databases = [];
  for (const tok of f[fi]) {
    const d = { ...tok };
    if (d.s[0] === "/") { d.re = compileRegex(d.s.slice(1)); if (!d.re) return fail(`invalid regular expression "${d.s.slice(1)}"`, { regex: true }); }
    rule.databases.push(d);
  }
  if (!f[++fi]) return fail("end-of-line before role specification");
  rule.users = [];
  for (const tok of f[fi]) {
    const d = { ...tok };
    if (d.s[0] === "/") { d.re = compileRegex(d.s.slice(1)); if (!d.re) return fail(`invalid regular expression "${d.s.slice(1)}"`, { regex: true }); }
    rule.users.push(d);
  }

  if (t !== "local") {
    if (!f[++fi]) return fail("end-of-line before IP address specification");
    toks = f[fi];
    if (toks.length > 1) return fail("multiple values specified for host address");
    const tok = toks[0];
    rule.addressToken = tok;
    if (!tok.quoted && tok.s === "all") rule.address = { kind: "all" };
    else if (!tok.quoted && tok.s === "samehost") rule.address = { kind: "samehost" };
    else if (!tok.quoted && tok.s === "samenet") rule.address = { kind: "samenet" };
    else {
      const slash = tok.s.indexOf("/");
      const host = slash >= 0 ? tok.s.slice(0, slash) : tok.s;
      const num = numericAddress(host);
      if (!num) {
        if (slash >= 0) return fail(`specifying both host name and CIDR mask is invalid: "${tok.s}"`);
        rule.address = { kind: "hostname", name: host };
      } else if (slash >= 0) {
        const mask = cidrMask(tok.s.slice(slash + 1), num.family);
        if (!mask) return fail(`invalid CIDR mask in address "${tok.s}"`);
        rule.address = { kind: "mask", family: num.family, bytes: num.bytes, mask, shorthand: num.shorthand, cidr: true };
      } else {
        if (!f[++fi]) return fail("end-of-line before netmask specification");
        const mt = f[fi];
        if (mt.length > 1) return fail("multiple values specified for netmask");
        const m = numericAddress(mt[0].s);
        if (!m) return fail(`invalid IP mask "${mt[0].s}": Name or service not known`);
        if (m.family !== num.family) return fail("IP address and mask do not match");
        rule.address = { kind: "mask", family: num.family, bytes: num.bytes, mask: m.bytes, shorthand: num.shorthand || m.shorthand, cidr: false };
      }
    }
  }

  if (!f[++fi]) return fail("end-of-line before authentication method");
  toks = f[fi];
  if (toks.length > 1) return fail("multiple values specified for authentication type");
  let method = toks[0].s;
  const known = ["trust", "ident", "peer", "password", "gss", "sspi", "reject", "md5", "scram-sha-256", "pam", "bsd", "ldap", "cert", "radius"];
  if (!known.includes(method)) return fail(`invalid authentication method "${method}"`);
  const supported = { gss: build.gss, sspi: build.sspi, pam: build.pam, bsd: build.bsd, ldap: build.ldap, cert: build.sslBuild !== false };
  if (method in supported && !supported[method]) return fail(`invalid authentication method "${method}": not supported by this build`);
  rule.methodWritten = method;
  if (t === "local" && method === "ident") method = "peer";
  rule.method = method;
  if (t === "local" && method === "gss") return fail("gssapi authentication is not supported on local sockets");
  if (t !== "local" && method === "peer") return fail("peer authentication is only supported on local sockets");
  if (t !== "hostssl" && method === "cert") return fail("cert authentication is only supported on hostssl connections");
  if (method === "gss" || method === "sspi") rule.includeRealm = true;

  while (f[++fi]) {
    for (const tok of f[fi]) {
      const eq = tok.s.indexOf("=");
      if (eq < 0) return fail(`authentication option not in name=value format: ${tok.s}`);
      const name = tok.s.slice(0, eq);
      const val = tok.s.slice(eq + 1);
      const e = parseOption(rule, name, val);
      if (e) return fail(e.msg, e.silent ? { silent: true } : {});
    }
  }
  const o = rule.optionMap;
  if (method === "ldap") {
    if (o.ldapprefix != null || o.ldapsuffix != null) {
      if (o.ldapbasedn != null || o.ldapbinddn != null || o.ldapbindpasswd != null || o.ldapsearchattribute != null || o.ldapsearchfilter != null)
        return fail("cannot use ldapbasedn, ldapbinddn, ldapbindpasswd, ldapsearchattribute, ldapsearchfilter, or ldapurl together with ldapprefix");
    } else if (o.ldapbasedn == null) return fail('authentication method "ldap" requires argument "ldapbasedn", "ldapprefix", or "ldapsuffix" to be set');
    if (o.ldapsearchattribute != null && o.ldapsearchfilter != null) return fail("cannot use ldapsearchattribute together with ldapsearchfilter");
  }
  if (method === "radius") {
    if (o.radiusservers == null) return fail('authentication method "radius" requires argument "radiusservers" to be set');
    if (o.radiussecrets == null) return fail('authentication method "radius" requires argument "radiussecrets" to be set');
    const ns = rule.radiusservers.length, nk = rule.radiussecrets.length;
    if (!ns) return fail("list of RADIUS servers cannot be empty");
    if (!nk) return fail("list of RADIUS secrets cannot be empty");
    if (!(nk === 1 || nk === ns)) return fail(`the number of RADIUS secrets (${nk}) must be 1 or the same as the number of RADIUS servers (${ns})`);
    for (const [k, label] of [["radiusports", "ports"], ["radiusidentifiers", "identifiers"]]) {
      const n = (rule[k] || []).length;
      if (!(n === 0 || n === 1 || n === ns)) return fail(`the number of RADIUS ${label} (${n}) must be 1 or the same as the number of RADIUS servers (${ns})`);
    }
  }
  if (method === "cert") rule.clientcert = "verify-full";
  return { ok: true, rule };
}

// SplitGUCList-style: comma separated, blanks trimmed, double quotes allowed.
function splitList(val) {
  const out = [];
  let i = 0;
  const s = val;
  while (i < s.length && /\s/.test(s[i])) i++;
  if (i >= s.length) return out;
  for (;;) {
    let item = "";
    if (s[i] === '"') {
      i++;
      for (;;) {
        if (i >= s.length) return null;
        if (s[i] === '"') { if (s[i + 1] === '"') { item += '"'; i += 2; continue; } i++; break; }
        item += s[i++];
      }
    } else {
      while (i < s.length && s[i] !== "," && !/\s/.test(s[i])) item += s[i++];
      if (!item.length) return null;
    }
    while (i < s.length && /\s/.test(s[i])) i++;
    out.push(item);
    if (i >= s.length) break;
    if (s[i] !== ",") return null;
    i++;
    while (i < s.length && /\s/.test(s[i])) i++;
  }
  return out;
}

function parseOption(rule, name, val) {
  const m = rule.method;
  const only = (methods, label) => (methods.includes(m) ? null : { msg: `authentication option "${name}" is only valid for authentication methods ${label}` });
  const set = (v = val) => { rule.optionMap[name] = v; rule.options.push(`${name}=${v}`); return null; };
  switch (name) {
    case "map": return only(["ident", "peer", "gss", "sspi", "cert"], "ident, peer, gssapi, sspi, and cert") || set();
    case "clientcert":
      if (rule.type !== "hostssl") return { msg: 'clientcert can only be configured for "hostssl" rows' };
      if (val === "verify-full") { rule.clientcert = "verify-full"; return null; }
      if (val === "verify-ca") { if (m === "cert") return { msg: 'clientcert can only be set to "verify-full" when using "cert" authentication' }; rule.clientcert = "verify-ca"; return null; }
      return { msg: `invalid value for clientcert: "${val}"`, silent: true };
    case "clientname":
      if (rule.type !== "hostssl") return { msg: 'clientname can only be configured for "hostssl" rows' };
      if (val === "CN" || val === "DN") { rule.clientname = val; return null; }
      return { msg: `invalid value for clientname: "${val}"`, silent: true };
    case "pamservice": return only(["pam"], "pam") || set();
    case "pam_use_hostname": return only(["pam"], "pam") || (rule.optionMap[name] = val, null);
    case "ldaptls": return only(["ldap"], "ldap") || (rule.optionMap[name] = val, null);
    case "ldapscheme": case "ldapserver": case "ldapbinddn": case "ldapbindpasswd": case "ldapsearchattribute":
    case "ldapsearchfilter": case "ldapbasedn": case "ldapprefix": case "ldapsuffix": case "ldapurl":
      return only(["ldap"], "ldap") || (rule.optionMap[name] = val, null);
    case "ldapport": {
      const e = only(["ldap"], "ldap"); if (e) return e;
      const n = parseInt(val, 10);
      if (!n) return { msg: `invalid LDAP port number: "${val}"` };
      rule.optionMap[name] = n; return null;
    }
    case "krb_realm": return only(["gss", "sspi"], "gssapi and sspi") || set();
    case "include_realm": { const e = only(["gss", "sspi"], "gssapi and sspi"); if (e) return e; rule.includeRealm = val === "1"; return null; }
    case "compat_realm": case "upn_username": return only(["sspi"], "sspi") || null;
    case "radiusservers": case "radiussecrets": case "radiusports": case "radiusidentifiers": {
      const e = only(["radius"], "radius"); if (e) return e;
      const list = splitList(val);
      const label = { radiusservers: "servers", radiussecrets: "secrets", radiusports: "ports", radiusidentifiers: "identifiers" }[name];
      if (list == null) return { msg: `could not parse RADIUS ${label} list "${val}"`, silent: name === "radiusidentifiers" };
      if (name === "radiusports") for (const p of list) { const n = parseInt(p, 10); if (!n) return { msg: `invalid RADIUS port number: "${val}"` }; }
      rule[name] = list; rule.optionMap[name] = val; return null;
    }
    default: return { msg: `unrecognized authentication option name: "${name}"` };
  }
}

// ---------------------------------------------------------------- reading

// Read pg_hba.conf and what it includes. Returns the tokenised lines and,
// for each, the parsed rule or its error, as pg_hba_file_rules would list them.
export function readHba({ resolver, main, build = {} }) {
  const b = { ...DEFAULT_BUILD, ...build };
  const ctx = { resolver, readFiles: [], missing: [], skipped: [], ignored: [] };
  const text = resolver.read(main);
  if (text == null) throw new Error(`could not open file "${main}"`);
  ctx.readFiles.push(main);
  const lines = [];
  tokenizeFile(ctx, main, text, 0, lines);
  const rows = [];
  for (const tl of lines) {
    if (tl.err != null) { rows.push({ file: tl.file, line: tl.line, raw: tl.raw, error: tl.err, viewError: tl.err, loaded: false }); continue; }
    const r = parseLine(tl, b);
    if (!r.ok) { rows.push({ file: tl.file, line: tl.line, raw: tl.raw, error: r.err, viewError: r.silent ? null : r.err, loaded: false, regex: !!r.regex }); continue; }
    const row = { ...r.rule, loaded: true, error: null, viewError: r.rule.warn };
    rows.push(row);
  }
  let loads = rows.every((r) => r.loaded);
  const rules = rows.filter((r) => r.loaded);
  let noEntries = false;
  if (loads && !rules.length) { loads = false; noEntries = true; }
  return { rows, rules, loads, noEntries, order: ctx.readFiles, missing: ctx.missing, skipped: ctx.skipped, ignored: ctx.ignored, build: b };
}

// The pg_hba_file_rules row PostgreSQL 16 shows for a line (parity uses it).
export function viewRow(row) {
  const out = { file_name: row.file, line_number: row.line, type: null, database: null, user_name: null, address: null, netmask: null, auth_method: null, options: null, error: row.viewError ?? null };
  if (!row.loaded && !row.warn) return out;
  out.type = row.type;
  out.database = row.databases.map((d) => d.s);
  out.user_name = row.users.map((d) => d.s);
  if (row.address) {
    const a = row.address;
    if (a.kind === "mask") { out.address = formatAddress(a); out.netmask = formatAddress({ family: a.family, bytes: a.mask }); }
    else if (a.kind === "hostname") out.address = a.name;
    else out.address = a.kind;
  }
  out.auth_method = row.method;
  const opts = [];
  if ((row.method === "gss" || row.method === "sspi")) { if (row.includeRealm) opts.push("include_realm=true"); if (row.optionMap.krb_realm != null) opts.push(`krb_realm=${row.optionMap.krb_realm}`); }
  if (row.optionMap.map != null) opts.push(`map=${row.optionMap.map}`);
  if (row.clientcert) opts.push(`clientcert=${row.clientcert}`);
  if (row.optionMap.pamservice != null) opts.push(`pamservice=${row.optionMap.pamservice}`);
  if (row.method === "ldap") {
    const o = row.optionMap;
    for (const k of ["ldapserver", "ldapport", "ldapscheme"]) if (o[k] != null) opts.push(`${k}=${o[k]}`);
    if (o.ldaptls === "1") opts.push("ldaptls=true");
    for (const k of ["ldapprefix", "ldapsuffix", "ldapbasedn", "ldapbinddn", "ldapbindpasswd", "ldapsearchattribute", "ldapsearchfilter"]) if (o[k] != null) opts.push(`${k}=${o[k]}`);
    if (Object.keys(o).length) opts.push("ldapscope=2");
  }
  if (row.method === "radius") for (const k of ["radiusservers", "radiussecrets", "radiusidentifiers", "radiusports"]) if (row.optionMap[k] != null) opts.push(`${k}=${row.optionMap[k]}`);
  out.options = opts.length ? opts : null;
  return out;
}

// ---------------------------------------------------------------- matching

// Connection-state sets: which (ssl, gssenc) states a rule type accepts.
const STATES = Object.freeze({ host: ["plain", "ssl", "gss"], hostssl: ["ssl"], hostnossl: ["plain", "gss"], hostgssenc: ["gss"], hostnogssenc: ["plain", "ssl"] });

// is_member_of_role_nosuper(): direct or indirect membership, and a role is
// a member of itself (so samerole matches a database named after the user).
// A superuser is not a member of other roles unless granted them.
const statesOf = (t) => (Object.hasOwn(STATES, t) ? STATES[t] : []);

function isMember(roles, user, group) {
  if (user === group) return true;
  const info = roles?.[user];
  if (!roles || !(user in roles)) return undefined;
  if (!roles[group] && !Object.values(roles).some((r) => (r.memberOf || []).includes(group))) return false;
  const seen = new Set();
  const stack = [...(info.memberOf || [])];
  while (stack.length) {
    const g = stack.pop();
    if (g === group) return true;
    if (seen.has(g)) continue;
    seen.add(g);
    stack.push(...((roles[g] && roles[g].memberOf) || []));
  }
  return false;
}

function dbMatches(tokens, conn, roles) {
  let unknown = false;
  for (const t of tokens) {
    if (conn.replication === "physical") { if (!t.quoted && t.s === "replication") return true; continue; }
    if (!t.quoted && t.s === "all") return true;
    if (!t.quoted && t.s === "sameuser") { if (conn.database === conn.user) return true; continue; }
    if (!t.quoted && (t.s === "samegroup" || t.s === "samerole")) { const m = isMember(roles, conn.user, conn.database); if (m) return true; if (m === undefined) unknown = true; continue; }
    if (!t.quoted && t.s === "replication") continue;
    if (t.re) { if (t.re.test(conn.database)) return true; continue; }
    if (t.s === conn.database) return true;
  }
  return unknown ? undefined : false;
}

function userMatches(tokens, conn, roles) {
  let unknown = false;
  for (const t of tokens) {
    if (!t.quoted && t.s[0] === "+") { const m = isMember(roles, conn.user, t.s.slice(1)); if (m) return true; if (m === undefined) unknown = true; continue; }
    if (!t.quoted && t.s === "all") return true;
    if (t.re) { if (t.re.test(conn.user)) return true; continue; }
    if (t.s === conn.user) return true;
  }
  return unknown ? undefined : false;
}

function addrMatches(rule, conn) {
  const a = rule.address;
  if (a.kind === "all") return true;
  if (a.kind === "mask") { const ip = numericAddress(conn.address || ""); return !!ip && ip.family === a.family && inRange(ip.bytes, a.bytes, a.mask); }
  if (a.kind === "samehost" || a.kind === "samenet") {
    const ip = numericAddress(conn.address || "");
    if (ip && (rangeCovers(LOOP4, { ...ip, mask: Array(4).fill(255) }) || (ip.family === 6 && inRange(ip.bytes, LOOP6.bytes, LOOP6.mask)))) return true;
    if (conn.serverAddresses) {
      for (const s of conn.serverAddresses) {
        const [h, bits] = s.split("/");
        const sa = numericAddress(h);
        if (!sa || !ip || sa.family !== ip.family) continue;
        const mask = a.kind === "samehost" ? Array(sa.bytes.length).fill(255) : cidrMask(bits ?? String(sa.family === 4 ? 32 : 128), sa.family);
        if (mask && inRange(ip.bytes, sa.bytes, mask)) return true;
      }
      return false;
    }
    return undefined;
  }
  if (a.kind === "hostname") {
    if (!conn.hostname) return undefined;
    const p = a.name.toLowerCase(), h = conn.hostname.toLowerCase();
    return p[0] === "." ? h.endsWith(p) : p === h;
  }
  return false;
}

// check_hba(): the first rule whose type, address, database and user all
// match decides. Rules that might match but depend on facts the tool does not
// know (group membership, server addresses, reverse DNS) are listed as
// `unknown` and the scan carries on past them.
export function matchConnection(rules, conn, roles) {
  const state = conn.type === "local" ? null : conn.gssenc ? "gss" : conn.ssl ? "ssl" : "plain";
  const unknown = [];
  for (const r of rules) {
    if (r.type === "local") { if (conn.type !== "local") continue; }
    else {
      if (conn.type === "local") continue;
      if (!statesOf(r.type).includes(state)) continue;
      const am = addrMatches(r, conn);
      if (am === false) continue;
      if (am === undefined) { unknown.push(r); continue; }
    }
    const dm = dbMatches(r.databases, conn, roles);
    if (dm === false) continue;
    const um = userMatches(r.users, conn, roles);
    if (um === false) continue;
    if (dm === undefined || um === undefined) { unknown.push(r); continue; }
    return { rule: r, unknown };
  }
  return { rule: null, unknown };
}

// ---------------------------------------------------------------- shadowing

function tokenCovers(a, b, kind) {
  // Does token a match every name token b matches?
  const kw = (t, k) => !t.quoted && t.s === k;
  if (kind === "db") {
    if (kw(b, "replication")) return kw(a, "replication");
    if (kw(a, "replication")) return false;
    if (kw(a, "all")) return true;
  } else {
    if (kw(a, "all")) return true;
    if (!b.quoted && b.s[0] === "+") return !a.quoted && a.s === b.s;
    if (!a.quoted && a.s[0] === "+") return false;
  }
  if (kind === "db" && (kw(b, "sameuser") || kw(b, "samerole") || kw(b, "samegroup") || kw(b, "all"))) {
    if (kw(b, "all")) return false;
    return (kw(a, "samerole") || kw(a, "samegroup")) ? (kw(b, "samerole") || kw(b, "samegroup")) : kw(a, b.s);
  }
  if (kind === "db" && (kw(a, "sameuser") || kw(a, "samerole") || kw(a, "samegroup"))) return false;
  if (kind === "user" && kw(b, "all")) return false;
  if (b.re) return !!a.re && a.s === b.s;
  if (a.re) return a.re.test(b.s);
  return a.s === b.s;
}
function listCovers(A, B, kind) { return B.every((b) => A.some((a) => tokenCovers(a, b, kind))); }

function addrCovers(a, b) {
  if (!a) return true;
  if (a.kind === "all") return true;
  if (b.kind === "all") return false;
  if (a.kind === "mask" && b.kind === "mask") return rangeCovers(a, b);
  if (a.kind === "mask" && isAnyRange(a) && b.kind !== "mask") return false;
  if (a.kind === b.kind && a.kind !== "mask") return a.kind !== "hostname" || a.name.toLowerCase() === b.name.toLowerCase() || (a.name[0] === "." && b.name.toLowerCase().endsWith(a.name.toLowerCase()));
  return false;
}

function typeCovers(a, b) {
  if (a === "local" || b === "local") return a === b;
  return statesOf(b).every((s) => statesOf(a).includes(s));
}

export function shadowedBy(rules, k) {
  const b = rules[k];
  for (let j = 0; j < k; j++) {
    const a = rules[j];
    if (!typeCovers(a.type, b.type)) continue;
    if (b.type !== "local" && !addrCovers(a.address, b.address)) continue;
    if (!listCovers(a.databases, b.databases, "db")) continue;
    if (!listCovers(a.users, b.users, "user")) continue;
    return a;
  }
  return null;
}

// ---------------------------------------------------------------- findings

function describeAddress(r) {
  if (r.type === "local") return "the local socket";
  const a = r.address;
  if (a.kind === "all") return "any address";
  if (a.kind === "samehost") return "this server's own addresses";
  if (a.kind === "samenet") return "any subnet this server is on";
  if (a.kind === "hostname") return `host name ${a.name}`;
  const bits = maskBits(a.mask);
  return contiguous(a.mask) ? `${formatAddress({ family: a.family, bytes: a.bytes.map((x, i) => x & a.mask[i]) })}/${bits}` : `${formatAddress(a)} mask ${formatAddress({ family: a.family, bytes: a.mask })}`;
}
function isLoopbackRule(r) {
  if (r.type === "local") return true;
  const a = r.address;
  if (a.kind === "samehost") return true;
  return a.kind === "mask" && isLoopbackRange(a);
}
function isWideOpen(r) { return r.type !== "local" && (r.address.kind === "all" || (r.address.kind === "mask" && isAnyRange(r.address))); }
const names = (toks) => toks.map((t) => (t.quoted ? `"${t.s}"` : t.s)).join(",");

export function scan({ resolver, main, build, roles } = {}) {
  const res = readHba({ resolver, main, build });
  const findings = [];
  const add = (row, type, severity, detail, remediation) => findings.push({ type, severity, file: row ? row.file : null, line: row ? row.line : null, detail, remediation, raw: row ? row.raw : null });

  for (const m of res.missing) {
    const row = res.rows.find((r) => r.file === m.from && r.line === m.line) || { file: m.from, line: m.line ?? null, raw: null };
    const what = m.how === "include_dir" ? "directory" : "file";
    add(row, "include-missing", "error", `${m.how === "@" ? "@" : m.how + " "}${m.path}: the ${what} is not among the files given. If it is missing on the server too, PostgreSQL refuses the whole pg_hba.conf (at start-up it will not start; on reload it keeps the old rules).`, `Paste the ${what} too, fix the path (a relative path is taken from the directory of the file that names it), or use include_if_exists for an optional file.`);
  }
  for (const r of res.rows) {
    if (r.loaded) continue;
    if (/^could not open (file|directory)/.test(r.error) && res.missing.some((m) => m.from === r.file)) continue;
    add(r, "parse-error", "error", `PostgreSQL 16 rejects this line: ${r.error}. One bad line and PostgreSQL refuses the whole file: a server will not start, and a reload (pg_ctl reload, SELECT pg_reload_conf()) keeps the old rules, so the edit silently does nothing.`, "Fix the line, then run SELECT * FROM pg_hba_file_rules WHERE error IS NOT NULL; before reloading.");
  }
  if (res.noEntries) add(null, "no-entries", "error", "No rule lines were found. PostgreSQL refuses a pg_hba.conf with no entries.", "Add at least one rule, for example local all postgres peer.");
  for (const i of res.ignored) add({ file: i.from, line: i.line, raw: null }, "include-dir-file-ignored", "low", `${i.path} is in an include_dir directory but PostgreSQL skips it: only names ending in .conf, not starting with a dot and at least six characters long are read.`, "Rename it to end in .conf, or delete it if it is a backup.");

  const rules = res.rules;
  rules.forEach((r, k) => {
    const where = describeAddress(r);
    const rem = isLoopbackRule(r) && r.type !== "local";
    if (r.warn) add(r, "hostssl-without-ssl", "medium", `${r.warn}. PostgreSQL still loads the file, but this rule never matches, so connections fall through to the rules below it.`, "Set ssl = on in postgresql.conf with a certificate and key, or change the rule.");
    if (r.method === "trust") {
      if (r.type === "local") add(r, "trust-local", "medium", `trust on the local socket for users ${names(r.users)}, databases ${names(r.databases)}: anyone with a shell on this machine can connect as any of those roles${r.users.some((u) => !u.quoted && u.s === "all") ? ", including the postgres superuser" : ""}, with no password.`, "Use peer (the OS user must match the role) or scram-sha-256.");
      else if (rem) add(r, "trust-loopback", "medium", `trust from ${where}: any process on the server (another user, a container sharing the network, a web app with an SSRF bug) can connect as ${names(r.users)} with no password.`, "Use scram-sha-256 for TCP, or connect over the local socket with peer.");
      else add(r, "trust-remote", "high", `trust from ${where}: anyone who can reach the port connects as ${names(r.users)} to ${names(r.databases)} with no password${r.users.some((u) => !u.quoted && u.s === "all") ? ", including the postgres superuser" : ""}.`, "Use scram-sha-256 (ideally on a hostssl line), and narrow the address.");
    }
    if (r.methodWritten === "ident" && r.type !== "local") add(r, "ident-over-tcp", rem ? "medium" : "high", `ident from ${where}: PostgreSQL asks the client machine's ident server who the user is and believes the answer. Anyone who controls that machine, or answers on its port 113, can claim any user name.`, "Use scram-sha-256, cert or gss for TCP connections; ident is only reasonable on a closed network you control end to end.");
    if (CLEARTEXT.has(r.method) && r.type !== "local") {
      const tls = r.type === "hostssl" || r.type === "hostgssenc";
      if (!tls && !rem) add(r, "cleartext-password-no-tls", "high", `${r.method} from ${where} on a ${r.type} line: the client sends the password in clear text, and this line also accepts connections without TLS, so anyone on the network path can read it.`, `Change the line to hostssl${r.method === "password" ? ", and use scram-sha-256 instead of password" : ""}.`);
      else if (r.method === "password") add(r, "password-method", "low", `password from ${where}: the server receives the password itself rather than a SCRAM proof.${tls ? "" : " The connection is local to this machine."}`, "Use scram-sha-256.");
    }
    if (r.method === "password" && r.type === "local") add(r, "password-method", "low", "password on the local socket: the server receives the password in clear text rather than a SCRAM proof.", "Use scram-sha-256 or peer.");
    if (r.method === "md5") add(r, "md5-method", "low", `md5 from ${where}: MD5 password hashes are weak and deprecated (PostgreSQL 18 warns on them). An md5 line already uses SCRAM for roles whose stored password is a SCRAM verifier, so the risk is roles still holding MD5 hashes.`, "Set password_encryption = scram-sha-256, re-set each role's password, then change the line to scram-sha-256.");
    if (!rem && r.type !== "local" && (r.type === "host" || r.type === "hostnossl" || r.type === "hostnogssenc") && ["scram-sha-256", "md5", "gss", "sspi"].includes(r.method))
      add(r, "no-tls-required", "medium", `${r.type} ${r.method} from ${where}: ${r.type === "hostnossl" ? "this line matches only connections without TLS" : "this line also accepts connections without TLS"}, so queries and results cross the network unencrypted${r.method === "gss" || r.method === "sspi" ? " unless GSSAPI encryption is used" : ""}, and an attacker in the path can take over the session after login.`, `Use hostssl${r.method === "gss" ? " or hostgssenc" : ""} for remote lines, and add a hostnossl ... reject line above them so non-TLS attempts are refused.`);
    if (isWideOpen(r) && r.method !== "reject" && r.method !== "trust") add(r, "any-address", "low", `${r.method} from ${where}: anyone on the internet who can reach the port can try passwords against ${names(r.users)}.`, "Narrow the address to the networks that need access, and keep the port off the public internet (firewall, security group, listen_addresses).");
    for (const k2 of ["ldapbindpasswd", "radiussecrets"]) if (r.optionMap[k2] != null) add(r, "secret-in-file", "medium", `${k2}= stores a secret in pg_hba.conf, and pg_hba_file_rules shows it to anyone granted that view (superusers and pg_read_all_settings members can read it).`, "Restrict who can read pg_hba.conf and the view, use a low-privilege bind account, and rotate it if the file was ever committed or shared.");
    for (const [label, toks] of [["database", r.databases], ["user", r.users]]) for (const t of toks) {
      if (t.re && (!t.s.startsWith("/^") || !t.s.endsWith("$"))) {
        const why = [];
        if (!t.s.startsWith("/^")) why.push(`with no ^ it also matches names that merely contain ${t.s.slice(1).replace(/\$$/, "")}`);
        if (!t.s.endsWith("$")) why.push(`with no $ it also matches longer names that start with it`);
        add(r, "unanchored-regex", "medium", `${label} regex ${t.s} is searched for anywhere in the name: ${why.join("; ")}.`, `Anchor it: /^${t.s.slice(1).replace(/^\^/, "").replace(/\$$/, "")}$.`);
      }
      if (t.quoted && KEYWORDS.has(t.s)) add(r, "quoted-keyword", "low", `"${t.s}" is quoted, so it means a ${label} literally named ${t.s}, not the keyword.`, `Remove the quotes if you meant the keyword ${t.s}.`);
    }
    if (r.addressToken && r.addressToken.quoted && KEYWORDS.has(r.addressToken.s)) add(r, "quoted-keyword", "low", `"${r.addressToken.s}" is quoted, so PostgreSQL reads it as a host name, not the keyword.`, `Remove the quotes if you meant ${r.addressToken.s}.`);
    if (r.address && r.address.kind === "mask" && r.address.shorthand) add(r, "ipv4-shorthand", "medium", `The address is read with inet_aton rules: it means ${formatAddress(r.address)}${r.address.cidr ? "" : ` mask ${formatAddress({ family: 4, bytes: r.address.mask })}`} (a leading 0 is octal, a 0x part is hex, and missing parts are filled from the last one).`, "Write all four parts in plain decimal.");
    if (r.address && r.address.kind === "mask" && r.address.cidr && r.address.bytes.some((x, i) => x & ~r.address.mask[i] & 0xff)) add(r, "host-bits-set", "low", `${r.addressToken.s} has host bits set, so it matches the whole ${describeAddress(r)}, not just ${formatAddress(r.address)}.`, `Write ${describeAddress(r)} if that is intended, or ${formatAddress(r.address)}/${r.address.family === 4 ? 32 : 128} for one host.`);
    if (r.address && r.address.kind === "hostname" && !(r.addressToken.quoted && KEYWORDS.has(r.addressToken.s))) {
      const looksIp = /^[0-9.]+$/.test(r.address.name) || /^[0-9a-fA-F:]*:[0-9a-fA-F:.]*$/.test(r.address.name);
      add(r, "address-is-hostname", looksIp ? "medium" : "low", looksIp ? `${r.address.name} is not a valid IP address, so PostgreSQL reads it as a host name; it looks up the client's address on every connection and the line almost certainly never matches.` : `${r.address.name} is a host name: PostgreSQL does a reverse lookup of each client address and then checks the name resolves back to it. Slow or broken DNS delays logins, and whoever controls that DNS decides who matches.`, looksIp ? "Fix the address (each IPv4 part 0-255, or a valid IPv6 address), with a /prefix." : "Prefer an address range; if you keep names, make sure reverse and forward DNS are under your control.");
    }
    const by = shadowedBy(rules, k);
    if (by) add(r, "shadowed-rule", r.method === "reject" ? "medium" : "low", `This rule can never match: ${by.file === r.file ? "line" : `${by.file} line`} ${by.line} (${by.type} ${names(by.databases)} ${names(by.users)}${by.type === "local" ? "" : " " + describeAddress(by)} ${by.method}) comes first and matches every connection this one would. PostgreSQL uses the first matching line, not the most specific one.${r.method === "reject" ? " The reject never fires, so the connections it was meant to block are let in by the earlier line." : ""}`, "Move this line above the broader one, or delete it.");
  });

  findings.sort((a, b) => sevRank(a.severity) - sevRank(b.severity));
  const probes = PROBES.map((p) => {
    const m = matchConnection(rules, p.conn, roles);
    return { label: p.label, conn: p.conn, rule: m.rule ? { file: m.rule.file, line: m.rule.line, method: m.rule.method } : null, unknown: m.unknown.map((u) => ({ file: u.file, line: u.line })) };
  });
  const notes = [];
  if (res.skipped.length) for (const s of res.skipped) notes.push(`include_if_exists ${s.path} was not given, so it was skipped (PostgreSQL does the same when the file is missing).`);
  if (!res.loads) notes.push("PostgreSQL 16 would refuse this file as a whole: a server starting with it fails, and a reload keeps the previous rules.");
  return { ...res, findings, probes, notes };
}

const PROBES = [
  { label: "local socket, user postgres, database postgres", conn: { type: "local", user: "postgres", database: "postgres" } },
  { label: "TCP from 127.0.0.1, user postgres", conn: { type: "host", address: "127.0.0.1", user: "postgres", database: "postgres" } },
  { label: "TCP from the internet (203.0.113.10), no TLS, user postgres", conn: { type: "host", address: "203.0.113.10", user: "postgres", database: "postgres" } },
  { label: "TCP from the internet (203.0.113.10), TLS, user postgres", conn: { type: "host", address: "203.0.113.10", ssl: true, user: "postgres", database: "postgres" } },
  { label: "replication from the internet (203.0.113.10), TLS, user postgres", conn: { type: "host", address: "203.0.113.10", ssl: true, user: "postgres", database: "postgres", replication: "physical" } },
];

function sevRank(s) { return { error: 0, high: 1, medium: 2, low: 3 }[s] ?? 4; }

// Convenience for pasted files: [{name, text}], main = the one named
// pg_hba.conf (or the first).
export function scanFiles(files, opts = {}) {
  const main = (files.find((f) => basename(normalize(f.name)) === "pg_hba.conf") || files[0])?.name;
  if (main == null) throw new Error("no files given");
  const result = scan({ resolver: pastedResolver(files), main: normalize(main), build: opts.build, roles: opts.roles });
  if (opts.connection) result.connection = matchConnection(result.rules, opts.connection, opts.roles);
  return result;
}

export function hasRisk(findings) { return findings.some((f) => RISK.has(f.severity)); }

export function summaryLine(findings) {
  if (!findings.length) return "none of the listed patterns found";
  const c = {};
  for (const f of findings) c[f.severity] = (c[f.severity] || 0) + 1;
  return ["error", "high", "medium", "low"].filter((s) => c[s]).map((s) => `${c[s]} ${s}`).join(", ");
}
