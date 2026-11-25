// sshd_config Check, engine. Reads sshd_config and the files its Include
// lines pull in, in the order sshd reads them, and reports what the server
// will actually do: the value that wins for each keyword (sshd keeps the
// FIRST value it reads, unlike most config files), the lines it silently
// ignores, Match blocks that change the picture for some connections, and
// settings that open the server wider than intended.
//
// The reading follows OpenSSH 9.6p1's servconf.c and match.c
// (https://github.com/openssh/openssh-portable/tree/V_9_6_P1) and the
// sshd_config(5) manual of that release. Zero dependencies; runs in a
// browser and in Node 18+.

export const SSHDIR = "/etc/ssh";

// Keyword table: canonical name -> { scope: "all" | "global", kind }.
// scope "all" means allowed inside Match (SSHCFG_ALL in servconf.c).
// kind: "first" (first value wins, later lines ignored),
//       "list" (every line adds), "byname" (Subsystem: first per name),
//       "include", "match", "deprecated", "unsupported", "ignore".
const G = "global", A = "all";
const K = Object.create(null);
function kw(names, scope, kind = "first", canonical) {
  for (const n of names.split(" ")) K[n] = { scope, kind, name: canonical || names.split(" ")[0] };
}
kw("usepam", G);
kw("port", G, "list");
kw("hostkey hostdsakey", G, "list");
kw("hostkeyagent", G); kw("pidfile", G); kw("modulifile", G);
kw("logingracetime", G);
kw("permitrootlogin", A);
kw("syslogfacility", G); kw("loglevel", A); kw("logverbose", A);
kw("hostbasedauthentication", A); kw("hostbasedusesnamefrompacketonly", A);
kw("hostbasedacceptedalgorithms hostbasedacceptedkeytypes", A);
kw("hostkeyalgorithms", G);
kw("pubkeyauthentication", A); kw("dsaauthentication", G, "first", "pubkeyauthentication");
kw("pubkeyacceptedalgorithms pubkeyacceptedkeytypes", A);
kw("pubkeyauthoptions", A);
kw("kerberosauthentication", A); kw("kerberosorlocalpasswd", G); kw("kerberosticketcleanup", G);
kw("kerberosgetafstoken", G);
kw("gssapiauthentication", A); kw("gssapicleanupcredentials", G); kw("gssapistrictacceptorcheck", G);
kw("gssapikeyexchange", G, "unsupported"); kw("gssapistorecredentialsonrekey", G, "unsupported");
kw("passwordauthentication", A);
kw("kbdinteractiveauthentication challengeresponseauthentication skeyauthentication", A);
kw("listenaddress", G, "list"); kw("addressfamily", G); kw("printmotd", G); kw("printlastlog", G);
kw("ignorerhosts", A); kw("ignoreuserknownhosts", G);
kw("x11forwarding", A); kw("x11displayoffset", A); kw("x11uselocalhost", A); kw("xauthlocation", G);
kw("strictmodes", G); kw("permitemptypasswords", A); kw("permituserenvironment", G);
kw("compression", G); kw("rekeylimit", A); kw("tcpkeepalive keepalive", G);
kw("allowtcpforwarding", A); kw("allowagentforwarding", A);
kw("allowusers", A, "list"); kw("denyusers", A, "list"); kw("allowgroups", A, "list"); kw("denygroups", A, "list");
kw("ciphers", G); kw("macs", G); kw("protocol", G, "ignore");
kw("gatewayports", A); kw("subsystem", A, "byname");
kw("maxstartups", G); kw("persourcemaxstartups", G); kw("persourcenetblocksize", G);
kw("maxauthtries", A); kw("maxsessions", A); kw("banner", A); kw("usedns", G);
kw("clientaliveinterval", A); kw("clientalivecountmax", A);
kw("authorizedkeysfile", A);
kw("acceptenv", A, "list"); kw("setenv", A);
kw("permittunnel", A); kw("permittty", A); kw("permituserrc", A);
kw("match", A, "match"); kw("include", A, "include");
kw("permitopen", A); kw("permitlisten", A); kw("forcecommand", A); kw("chrootdirectory", A);
kw("hostcertificate", G, "list"); kw("revokedkeys", A); kw("trustedusercakeys", A);
kw("authorizedprincipalsfile", A); kw("kexalgorithms", G); kw("ipqos", A);
kw("authorizedkeyscommand", A); kw("authorizedkeyscommanduser", A);
kw("authorizedprincipalscommand", A); kw("authorizedprincipalscommanduser", A);
kw("versionaddendum", G); kw("authenticationmethods", A);
kw("streamlocalbindmask", A); kw("streamlocalbindunlink", A); kw("allowstreamlocalforwarding", A);
kw("fingerprinthash", G); kw("disableforwarding", A); kw("exposeauthinfo", A); kw("rdomain", A);
kw("casignaturealgorithms", A); kw("securitykeyprovider", G); kw("requiredrsasize", A);
kw("channeltimeout", A); kw("unusedconnectiontimeout", A);
for (const n of "pamauthenticationviakbdint serverkeybits keyregenerationinterval rhostsauthentication rhostsrsaauthentication rsaauthentication checkmail uselogin verifyreversemapping reversemappingcheck authorizedkeysfile2 useprivilegeseparation".split(" ")) {
  const scope = ["rhostsrsaauthentication", "rsaauthentication", "authorizedkeysfile2"].includes(n) ? A : G;
  K[n] = { scope, kind: "deprecated", name: n };
}
for (const n of "kerberostgtpassing afstokenpassing".split(" ")) K[n] = { scope: G, kind: "unsupported", name: n };

// Keywords whose value sshd -T would show, with the 9.6 compiled-in default
// (fill_default_server_options) where it matters for a finding.
export const DEFAULTS = {
  permitrootlogin: "prohibit-password",
  passwordauthentication: "yes",
  kbdinteractiveauthentication: "yes",
  permitemptypasswords: "no",
  usepam: "no",
  pubkeyauthentication: "yes",
  x11forwarding: "no",
  permituserenvironment: "no",
  strictmodes: "yes",
  ignorerhosts: "yes",
  hostbasedauthentication: "no",
  gatewayports: "no",
  permittunnel: "no",
  allowtcpforwarding: "yes",
  allowagentforwarding: "yes",
  maxauthtries: "6",
  logingracetime: "120",
  authenticationmethods: "any",
};

// Values sshd accepts (parse_flag and parse_multistate use strcasecmp;
// anything else is fatal "unsupported option").
const FLAG = ["yes", "no"];
const STATES = Object.assign(Object.create(null), {
  permitrootlogin: ["yes", "no", "prohibit-password", "without-password", "forced-commands-only"],
  gatewayports: ["yes", "no", "clientspecified"],
  permittunnel: ["yes", "no", "point-to-point", "ethernet"],
  allowtcpforwarding: ["yes", "all", "no", "local", "remote"],
  allowstreamlocalforwarding: ["yes", "all", "no", "local", "remote"],
  compression: ["yes", "delayed", "no"],
  addressfamily: ["any", "inet", "inet6"],
  ignorerhosts: ["yes", "no", "shosts-only"],
  fingerprinthash: ["md5", "sha256"],
});
for (const n of "usepam hostbasedauthentication hostbasedusesnamefrompacketonly pubkeyauthentication kerberosauthentication kerberosorlocalpasswd kerberosticketcleanup kerberosgetafstoken gssapiauthentication gssapicleanupcredentials gssapistrictacceptorcheck passwordauthentication kbdinteractiveauthentication printmotd printlastlog ignoreuserknownhosts x11forwarding x11uselocalhost strictmodes permitemptypasswords tcpkeepalive allowagentforwarding usedns permittty permituserrc streamlocalbindunlink disableforwarding exposeauthinfo".split(" ")) STATES[n] = FLAG;

const CASE_SENSITIVE = new Set(["permittunnel"]);

// How many words each keyword takes; any more stop sshd ("keyword X extra
// arguments at end of line"). Checked keyword by keyword against sshd 9.6p1
// (parity/README.md). Unlisted keywords take one.
const MAX_ARGS = Object.assign(Object.create(null), { ipqos: 2, rekeylimit: 2, listenaddress: 3 });
for (const n of "acceptenv allowgroups allowusers authorizedkeysfile denygroups denyusers forcecommand include logverbose subsystem versionaddendum authenticationmethods authorizedkeyscommand authorizedprincipalscommand channeltimeout permitopen permitlisten setenv pubkeyauthoptions".split(" ")) MAX_ARGS[n] = Infinity;

// Integer keywords (strtonum 0..INT_MAX, decimal: "011" is 11, "0x10" is
// invalid) and time keywords (convtime).
const INT_KW = new Set(["maxauthtries", "maxsessions", "clientalivecountmax", "x11displayoffset", "requiredrsasize"]);
const TIME_KW = new Set(["logingracetime", "clientaliveinterval"]);
const INT_MAX = 2147483647;

// misc.c convtime(): digits with an optional s, m, h, d or w (either case),
// concatenated ("1h30m"); a bare number is seconds. -1 when invalid.
export function convtime(value) {
  const v = String(value);
  if (!v.length) return -1;
  let total = 0;
  const re = /\s*([+-]?\d+)([sSmMhHdDwW]?)/y;
  let i = 0;
  while (i < v.length) {
    re.lastIndex = i;
    const m = re.exec(v);
    if (!m) return -1;
    const secs = Number(m[1]);
    if (secs < 0 || secs > INT_MAX) return -1;
    const mult = { "": 1, s: 1, m: 60, h: 3600, d: 86400, w: 604800 }[m[2].toLowerCase()];
    if (secs * mult > INT_MAX || total + secs * mult > INT_MAX) return -1;
    total += secs * mult;
    i = re.lastIndex;
  }
  return total;
}

// strtonum(value, 0, INT_MAX): the integer, or an error word.
export function intValue(value) {
  const v = String(value);
  if (!/^\s*[+-]?\d+$/.test(v)) return { error: "invalid" };
  const n = Number(v);
  if (n < 0) return { error: "too small" };
  if (n > INT_MAX) return { error: "too large" };
  return { value: n };
}

const MATCH_CRITERIA = ["all", "user", "group", "host", "address", "localaddress", "localport", "rdomain"];

// ---------------------------------------------------------------- tokenising

// strdelim(): the keyword ends at whitespace or a single '='.
function splitKeyword(line) {
  const m = /^[ \t\f\r\n]*([^ \t\f\r\n=]*)[ \t\f\r\n]*(=?)[ \t\f\r\n]*(.*)$/s.exec(line);
  if (!m) return null;
  return { keyword: m[1], rest: m[3] };
}

// argv_split(str, ..., terminate_on_comment=1): whitespace-separated words,
// double or single quotes group, backslash escapes quotes and backslash, an
// unquoted word starting with '#' ends the line.
export function argvSplit(s) {
  const out = [];
  let i = 0;
  while (i < s.length) {
    while (i < s.length && /[ \t\r\n]/.test(s[i])) i++;
    if (i >= s.length) break;
    if (s[i] === "#") break;
    let word = "";
    let quote = null;
    for (; i < s.length; i++) {
      const c = s[i];
      if (c === "\\" && (s[i + 1] === "\\" || s[i + 1] === '"' || s[i + 1] === "'" || (quote === null && s[i + 1] === " "))) {
        word += s[++i];
        continue;
      }
      if (quote === null && /[ \t\r\n]/.test(c)) break;
      if (quote === null && (c === '"' || c === "'")) { quote = c; continue; }
      if (quote !== null && c === quote) { quote = null; continue; }
      word += c;
    }
    if (quote !== null) throw new Error("invalid quotes");
    out.push(word);
  }
  return out;
}

// ------------------------------------------------------------- glob, paths

export function absPath(name) {
  const n = String(name).trim().replace(/\\/g, "/");
  if (n.startsWith("/")) return n.replace(/\/+/g, "/");
  return `${SSHDIR}/${n.replace(/^\.\//, "")}`.replace(/\/+/g, "/");
}

function globToRegExp(glob) {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") re += "[^/]*";
    else if (c === "?") re += "[^/]";
    else if (c === "[") {
      const j = glob.indexOf("]", i + 2);
      if (j < 0) { re += "\\["; continue; }
      let body = glob.slice(i + 1, j);
      if (body.startsWith("!")) body = "^" + body.slice(1);
      re += "[" + body.replace(/\\/g, "\\\\") + "]";
      i = j;
    } else re += c.replace(/[.+^${}()|\\]/g, "\\$&");
  }
  return new RegExp("^" + re + "$");
}

// glob(3) without GLOB_NOSORT sorts; sshd does not set a locale, so the
// order is byte order. A leading '.' is not matched by '*' or '?'.
function globFiles(pattern, byPath) {
  if (!/[*?[]/.test(pattern)) return byPath.has(pattern) ? [pattern] : [];
  const re = globToRegExp(pattern);
  return [...byPath.keys()]
    .filter((p) => re.test(p) && !p.split("/").some((seg, k, segs) => seg.startsWith(".") && !pattern.split("/")[k]?.startsWith(".")))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

// ------------------------------------------------------------------ reading

// Walk the files the way parse_server_config_depth does and return every
// directive with its file, line and the Match block it sits in.
export function readConfig(files, { mainName } = {}) {
  const byPath = new Map();
  for (const f of files) byPath.set(absPath(f.name), { name: f.name, text: String(f.text ?? "") });
  const errors = [];
  const notes = [];
  const directives = [];
  const matches = [];
  const order = [];

  let main = mainName ? absPath(mainName) : [...byPath.keys()].find((p) => p === `${SSHDIR}/sshd_config` || /(^|\/)sshd_config$/.test(p));
  let synthetic = null;
  if (!main) {
    // No main file: read the drop-ins as Ubuntu/Debian's stock first line
    // `Include /etc/ssh/sshd_config.d/*.conf` would.
    synthetic = `Include ${SSHDIR}/sshd_config.d/*.conf\n`;
    notes.push("No file named sshd_config was given, so the files are read as if the stock Ubuntu/Debian line `Include /etc/ssh/sshd_config.d/*.conf` included them (only names ending in .conf in sshd_config.d). Add your sshd_config for the full picture.");
    const loose = [...byPath.keys()].filter((p) => !/^\/etc\/ssh\/sshd_config\.d\/[^/]*\.conf$/.test(p));
    if (loose.length) notes.push(`Not read: ${loose.map((p) => byPath.get(p).name).join(", ")} (not sshd_config and not matched by sshd_config.d/*.conf).`);
  }

  const reached = new Set();
  const state = { match: null };

  // parent: the Match block the Include that pulled this file in sits under
  // (null at top level). sshd parses an included file with SSHCFG_NEVERMATCH
  // when that block is inactive, so the file's own Match blocks apply only to
  // connections the enclosing block selects; at startup, when no Match but
  // `Match all` is active, they never do.
  function parse(path, text, depth, parent) {
    const neverMatch = parent !== null && !isAll(parent);
    if (depth > 16) {
      errors.push({ file: byPath.get(path)?.name ?? path, line: 0, message: "Include nested deeper than 16 levels: sshd refuses to start." });
      return;
    }
    const name = byPath.get(path)?.name ?? path;
    order.push({ name, path, depth });
    reached.add(path);
    const lines = text.split("\n");
    lines.forEach((raw, idx) => {
      const lineNo = idx + 1;
      const line = raw.replace(/[ \t\f\r\n]+$/, "");
      const sk = splitKeyword(line);
      if (!sk || !sk.keyword || sk.keyword.startsWith("#")) return;
      if (!sk.rest) {
        errors.push({ file: name, line: lineNo, message: `no argument after keyword "${sk.keyword}": sshd refuses to start.` });
        return;
      }
      const lk = sk.keyword.toLowerCase();
      const def = K[lk];
      if (!def) {
        errors.push({ file: name, line: lineNo, keyword: sk.keyword, message: `Bad configuration option: ${sk.keyword}. sshd refuses to start with an unknown keyword (check the spelling, or whether your OpenSSH version has it).` });
        return;
      }
      let args;
      try { args = argvSplit(sk.rest); } catch {
        errors.push({ file: name, line: lineNo, message: "invalid quotes: sshd refuses to start." });
        return;
      }
      const indent = /^[ \t]/.test(raw);
      if (def.kind === "match") {
        const m = parseMatch(args, name, lineNo);
        if (m.error) { errors.push({ file: name, line: lineNo, message: m.error }); return; }
        const block = { id: matches.length, file: name, line: lineNo, criteria: m.criteria, all: m.all, text: args.join(" "), parent, neverMatch, indentBody: null };
        matches.push(block);
        // `Match all` does not return to global scope: its lines are read
        // with the global ones at startup (so Port or UsePAM may follow it)
        // and also form a block that applies to every connection, overriding
        // earlier global values (match_cfg_line returns 1 for "all").
        state.match = block;
        return;
      }
      if (def.kind === "include") {
        const saved = state.match;
        for (const a of args) {
          const pat = a.startsWith("/") || a.startsWith("~") ? a : `${SSHDIR}/${a}`;
          const hits = globFiles(pat, byPath);
          const d = { file: name, line: lineNo, keyword: "include", raw: sk.keyword, args: [a], match: state.match, indent, files: hits.map((h) => byPath.get(h).name) };
          directives.push(d);
          if (!hits.length) notes.push(`${name}:${lineNo}: Include ${a} matched none of the files given${/[*?[]/.test(a) ? "" : " (paste that file too)"}.`);
          for (const h of hits) {
            parse(h, byPath.get(h).text, depth + 1, state.match);
            state.match = saved;
          }
        }
        return;
      }
      if (state.match && state.match.indentBody === null) state.match.indentBody = indent;
      directives.push({ file: name, line: lineNo, keyword: def.name, raw: sk.keyword, args, match: state.match, indent, def });
    });
  }

  function parseMatch(args, file, line) {
    const criteria = [];
    if (!args.length) return { error: "Bad Match condition (Match needs criteria): sshd refuses to start." };
    for (let i = 0; i < args.length; i++) {
      const a = args[i].toLowerCase();
      if (a === "all") {
        if (i > 0 || args.length > 1) return { error: "'all' cannot be combined with other Match attributes: sshd refuses to start." };
        return { criteria: [], all: true };
      }
      if (!MATCH_CRITERIA.includes(a)) return { error: `Unsupported Match attribute ${args[i]}: sshd refuses to start.` };
      const v = args[++i];
      if (v === undefined || v === "") return { error: `Match ${args[i - 1]} has no value: sshd refuses to start.` };
      if (a === "address" || a === "localaddress") {
        const bad = addrListError(v);
        if (bad) return { error: `Invalid Match ${a === "address" ? "address" : "localaddress"} argument '${v}': ${bad} is not a network (a /${bad.split("/")[1]} mask with host bits set, or a mask over 32). sshd refuses to start; write the network address, for example ${suggestNet(bad)}.` };
      }
      criteria.push({ attr: a, value: v });
    }
    return { criteria, all: false };
  }

  if (synthetic) parse(`${SSHDIR}/(stock include)`, synthetic, 0, null);
  else parse(main, byPath.get(main).text, 0, null);
  const unread = [...byPath.keys()].filter((p) => !reached.has(p));
  const dropins = unread.filter((p) => p.startsWith(`${SSHDIR}/sshd_config.d/`));
  const others = unread.filter((p) => !dropins.includes(p));
  if (!synthetic && others.length) notes.push(`Not read by sshd from what was given: ${others.map((p) => byPath.get(p).name).join(", ")} (no Include line reaches ${others.length === 1 ? "it" : "them"}).`);
  const unreadDropins = synthetic ? [] : dropins.map((p) => ({ name: byPath.get(p).name, text: byPath.get(p).text }));
  return { directives, matches, errors, notes, unreadDropins, order: order.filter((o) => !o.path.endsWith("(stock include)")) };
}

// ------------------------------------------------------- Match evaluation

// match_pattern_list(): comma list, '!' negates and a negated hit wins.
export function patternList(string, pattern, lower = false) {
  if (string == null) return 0;
  const s = lower ? string.toLowerCase() : string;
  let positive = 0;
  for (let sub of pattern.split(",")) {
    let neg = false;
    if (sub.startsWith("!")) { neg = true; sub = sub.slice(1); }
    if (lower) sub = sub.toLowerCase();
    if (wild(s, sub)) { if (neg) return -1; positive = 1; }
  }
  return positive;
}

// match_pattern() from OpenSSH's match.c: '*' is any run of characters
// (including none), '?' is exactly one, everything else is literal. A plain
// backtracking matcher, so the pattern is never compiled into a RegExp.
function wild(s, p) {
  let si = 0, pi = 0, star = -1, mark = 0;
  while (si < s.length) {
    if (pi < p.length && (p[pi] === "?" || p[pi] === s[si])) { si++; pi++; }
    else if (pi < p.length && p[pi] === "*") { star = pi++; mark = si; }
    else if (star !== -1) { pi = star + 1; si = ++mark; }
    else return false;
  }
  while (pi < p.length && p[pi] === "*") pi++;
  return pi === p.length;
}

function suggestNet(sub) {
  const [a, b] = sub.split("/");
  const bits = Math.min(32, Number(b));
  const n = ipv4(a);
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  const net = (n & mask) >>> 0;
  return `${[24, 16, 8, 0].map((s) => (net >>> s) & 255).join(".")}/${bits}`;
}

function ipv4(a) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(a || "");
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  if (parts.some((x) => x > 255)) return null;
  return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

// addr_match_list(): CIDR entries compare numerically (IPv4 here), others
// as wildcard patterns; a negated hit wins.
export function addrList(addr, pattern) {
  if (addr == null) return 0;
  let positive = 0;
  for (let sub of pattern.split(",")) {
    let neg = false;
    if (sub.startsWith("!")) { neg = true; sub = sub.slice(1); }
    let hit = false;
    const cidr = /^([^/]+)\/(\d+)$/.exec(sub);
    if (cidr) {
      const net = ipv4(cidr[1]); const ip = ipv4(addr); const bits = Number(cidr[2]);
      if (net !== null && ip !== null && bits <= 32) {
        const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
        hit = ((ip & mask) >>> 0) === ((net & mask) >>> 0);
      } else hit = wild(addr.toLowerCase(), sub.toLowerCase());
    } else hit = wild(addr.toLowerCase(), sub.toLowerCase());
    if (hit) { if (neg) return -1; positive = 1; }
  }
  return positive;
}

// The entry of a Match Address / LocalAddress list that makes sshd refuse to
// start, or null. addr_match_list(NULL, list) at startup rejects an IPv4
// network whose mask is over 32 or whose host bits are set (10.1.2.3/24,
// 10.0.0.0/0); an entry that does not parse as a network falls back to a
// wildcard and is fine (checked against sshd 9.6p1, parity/README.md).
// IPv6 networks are not checked here.
export function addrListError(pattern) {
  for (let sub of pattern.split(",")) {
    if (sub.startsWith("!")) sub = sub.slice(1);
    const cidr = /^([^/]+)\/(\d+)$/.exec(sub);
    if (!cidr) continue;
    const net = ipv4(cidr[1]);
    if (net === null) continue;
    const bits = Number(cidr[2]);
    if (bits > 32) return sub;
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    if (((net & ~mask) >>> 0) !== 0) return sub;
  }
  return null;
}

export function matchApplies(block, conn) {
  if (block.parent && !matchApplies(block.parent, conn)) return false;
  if (block.all) return true;
  for (const { attr, value } of block.criteria) {
    let ok;
    switch (attr) {
      case "user": ok = patternList(conn.user, value) === 1; break;
      case "group": {
        // ga_match_pattern_list: any group positively matched, none negated.
        const groups = conn.groups || [];
        let pos = false, neg = false;
        for (const g of groups) { const r = patternList(g, value); if (r === 1) pos = true; if (r === -1) neg = true; }
        ok = pos && !neg; break;
      }
      case "host": ok = patternList(conn.host, value, true) === 1; break;
      case "address": ok = addrList(conn.addr, value) === 1; break;
      case "localaddress": ok = addrList(conn.laddr, value) === 1; break;
      case "localport": ok = conn.lport != null && String(conn.lport) === value; break;
      case "rdomain": ok = patternList(conn.rdomain, value) === 1; break;
      default: ok = false;
    }
    if (!ok) return false;
  }
  return true;
}

// ------------------------------------------------------- effective values

function valueOf(d) {
  if (d.keyword === "subsystem") return d.args.join(" ");
  return d.args.join(" ");
}

// A `Match all` block that can apply (not inside an included file that sits
// under another Match).
export function isAll(m) { return !!(m && m.all && !m.neverMatch); }

function putter(shadowed) {
  return (map, d, track, reason) => {
    const k = d.keyword;
    const kind = d.def.kind;
    if (kind === "deprecated" || kind === "unsupported" || kind === "ignore") return;
    if (kind === "list") {
      const e = map.get(k) || { value: [], at: [], list: true };
      e.value.push(...d.args); e.at.push(d); map.set(k, e);
      return;
    }
    const key = kind === "byname" ? `${k}:${d.args[0]}` : k;
    if (!map.has(key)) map.set(key, { value: valueOf(d), at: d });
    else if (track) shadowed.push({ d, winner: map.get(key).at, key, reason });
  };
}

// The values the given Match blocks set, in the order sshd reads them: the
// first value among all matching blocks wins (the re-parse in
// parse_server_match_config), list keywords add up, and only keywords
// allowed inside Match are copied over the global ones
// (copy_set_server_options).
function overlay(read, blocks, shadowed = null) {
  const put = putter(shadowed || []);
  const mo = new Map();
  for (const d of read.directives) {
    if (!d.def || d.keyword === "include" || !d.match || !blocks.includes(d.match)) continue;
    if (d.def.scope !== "all") continue;
    put(mo, d, !!shadowed, "first");
  }
  return mo;
}

// Resolve the global settings, and the settings for a connection if one is
// given (match_cfg_line + copy_set_server_options: Match values replace the
// global ones; within the matching blocks the first value read wins).
// `global` is what a connection that no other Match block selects gets:
// the global lines, then any `Match all` block over them.
export function resolve(read, conn = null) {
  const base = new Map();
  const shadowed = [];
  const put = putter(shadowed);
  const allBlocks = read.matches.filter(isAll);
  for (const d of read.directives) {
    if (d.keyword === "include" || !d.def) continue;
    if (d.match && !isAll(d.match)) continue;
    // A Match all line of a Match keyword is not ignored when an earlier
    // global line set it: it overrides that line for every connection.
    put(base, d, !(d.match && d.def.scope === "all"), "first");
  }
  const allOver = overlay(read, allBlocks, shadowed);
  for (const [k, v] of allOver) {
    for (const d of read.directives) {
      if (!d.def || d.match || d.keyword === "include") continue;
      const key = d.def.kind === "byname" ? `${d.keyword}:${d.args[0]}` : d.keyword;
      if (key === k && d.def.kind !== "list") shadowed.push({ d, winner: v.at, key, reason: "match-all" });
    }
  }
  const global = new Map(base);
  for (const [k, v] of allOver) global.set(k, v);
  let effective = global;
  let applied = [];
  if (conn) {
    applied = read.matches.filter((m) => matchApplies(m, conn));
    effective = new Map(base);
    for (const [k, v] of overlay(read, applied)) effective.set(k, v);
  }
  return { base, global, effective, shadowed, applied };
}

// Settings one Match block applies on top of the global ones, with any
// Match all blocks taking part in file order.
function blockOverlay(read, block, base) {
  const own = overlay(read, [block]);
  const chain = [];
  for (let b = block; b; b = b.parent) chain.push(b);
  const eff = new Map(base);
  for (const [k, v] of overlay(read, [...read.matches.filter(isAll), ...chain])) eff.set(k, v);
  return { own, eff };
}

// ---------------------------------------------------------------- checks

const WEAK = {
  ciphers: {
    "3des-cbc": "medium", "aes128-cbc": "medium", "aes192-cbc": "medium", "aes256-cbc": "medium",
    "rijndael-cbc@lysator.liu.se": "medium", "blowfish-cbc": "medium", "cast128-cbc": "medium",
    "arcfour": "high", "arcfour128": "high", "arcfour256": "high",
  },
  macs: {
    "hmac-md5": "medium", "hmac-md5-96": "medium", "hmac-md5-etm@openssh.com": "medium", "hmac-md5-96-etm@openssh.com": "medium",
    "hmac-sha1-96": "low", "hmac-sha1-96-etm@openssh.com": "low", "hmac-sha1": "low", "hmac-sha1-etm@openssh.com": "low",
    "umac-64@openssh.com": "low", "umac-64-etm@openssh.com": "low",
  },
  kexalgorithms: {
    "diffie-hellman-group1-sha1": "medium", "diffie-hellman-group14-sha1": "low", "diffie-hellman-group-exchange-sha1": "low",
  },
  hostkeyalgorithms: { "ssh-rsa": "low", "ssh-dss": "medium", "ssh-rsa-cert-v01@openssh.com": "low", "ssh-dss-cert-v01@openssh.com": "medium" },
  pubkeyacceptedalgorithms: { "ssh-rsa": "low", "ssh-dss": "medium", "ssh-rsa-cert-v01@openssh.com": "low", "ssh-dss-cert-v01@openssh.com": "medium" },
  casignaturealgorithms: { "ssh-rsa": "low", "ssh-dss": "medium" },
};
const WEAK_WHY = {
  ciphers: "CBC-mode and RC4 ciphers are off by default since OpenSSH 6.7/7.2 because of known attacks on them",
  macs: "MD5 and SHA-1 based and 64-bit-tag MACs are weaker than the defaults (hmac-sha2-*-etm, umac-128-etm)",
  kexalgorithms: "SHA-1 Diffie-Hellman key exchange (group1 is a 1024-bit group) is off by default for that reason",
  hostkeyalgorithms: "ssh-rsa signs with SHA-1 and ssh-dss is 1024-bit DSA; OpenSSH turned both off by default (8.8 and 7.0)",
  pubkeyacceptedalgorithms: "ssh-rsa signs with SHA-1 and ssh-dss is 1024-bit DSA; OpenSSH turned both off by default (8.8 and 7.0)",
  casignaturealgorithms: "ssh-rsa signs with SHA-1; OpenSSH turned it off by default in 8.2",
};

const RANK = { error: 0, high: 1, medium: 2, low: 3 };
const rank = (sev) => (Object.hasOwn(RANK, sev) ? RANK[sev] : 9);
const SECURITY = new Set(["permitrootlogin", "passwordauthentication", "kbdinteractiveauthentication", "permitemptypasswords", "usepam", "pubkeyauthentication", "authenticationmethods", "x11forwarding", "permituserenvironment", "strictmodes", "ignorerhosts", "hostbasedauthentication", "gatewayports", "permittunnel", "allowtcpforwarding", "allowagentforwarding", "ciphers", "macs", "kexalgorithms", "hostkeyalgorithms", "pubkeyacceptedalgorithms", "maxauthtries", "logingracetime", "allowusers", "denyusers", "allowgroups", "denygroups", "forcecommand", "chrootdirectory", "authorizedkeysfile", "disableforwarding", "trustedusercakeys", "revokedkeys", "loglevel"]);

const lc = (v) => String(v ?? "").toLowerCase();
const where = (d) => (d ? `${d.file}:${d.line}` : "default");
function val(map, k) { const e = map.get(k); return e ? (e.list ? e.value.join(" ") : e.value) : DEFAULTS[k]; }
function at(map, k) { const e = map.get(k); return e ? (e.list ? e.at[0] : e.at) : null; }
function srcText(map, k) { const d = at(map, k); return d ? `set at ${where(d)}` : "the compiled-in default, since no line sets it"; }

function passwordsOn(map) {
  const pw = lc(val(map, "passwordauthentication")) === "yes";
  const kbd = lc(val(map, "kbdinteractiveauthentication")) === "yes" && lc(val(map, "usepam")) === "yes";
  return { pw, kbd, any: pw || kbd };
}

// The algorithm list after +/-/^ against the default (we only need to know
// whether weak names end up enabled).
function algoAdds(value) {
  const v = String(value);
  if (v.startsWith("-")) return [];
  const body = v.startsWith("+") || v.startsWith("^") ? v.slice(1) : v;
  return body.split(",").filter(Boolean);
}

function settingChecks(map, scope, out) {
  const add = (sev, type, keyword, detail, remediation, anchor) => {
    const d = at(map, keyword) || (anchor ? at(map, anchor) : null);
    out.push({ severity: sev, type, keyword, file: d ? d.file : "(not set)", line: d ? d.line : 0, scope, detail, remediation });
  };
  const pass = passwordsOn(map);
  const prl = lc(val(map, "permitrootlogin"));
  if (prl === "yes") {
    add(pass.any ? "high" : "low", "permit-root-login-yes", "permitrootlogin",
      pass.any
        ? `PermitRootLogin yes lets anyone who guesses or steals root's password log straight in as root (passwords are on: ${pass.pw ? "PasswordAuthentication" : "KbdInteractiveAuthentication with UsePAM"}). Root is the one account name every scanner tries.`
        : "PermitRootLogin yes with password and keyboard-interactive logins off behaves like prohibit-password today, but turns into a root password login the day a drop-in switches passwords back on.",
      "Set PermitRootLogin no (log in as a user and use sudo) or prohibit-password (keys only), before any Include line so it wins.");
  }
  if (pass.pw) {
    const isDefault = !map.get("passwordauthentication");
    add(prl === "yes" ? "medium" : "medium", "password-auth-on", "passwordauthentication",
      isDefault
        ? "PasswordAuthentication is not set anywhere, so sshd uses its default: yes. Every account with a password can be guessed at from the network."
        : `PasswordAuthentication yes (${srcText(map, "passwordauthentication")}): every account with a password can be guessed at from the network.`,
      "Once every user has a working key, set PasswordAuthentication no in a file read before any line that sets it to yes (sshd keeps the first value). Keep a session open while you test.");
  }
  if (pass.kbd) {
    add("medium", "kbd-interactive-pam", "kbdinteractiveauthentication",
      `KbdInteractiveAuthentication is ${map.get("kbdinteractiveauthentication") ? "yes" : "on by default"} and UsePAM is yes, so PAM asks for the Unix password through keyboard-interactive login${pass.pw ? "" : ", even though PasswordAuthentication is no"}.`,
      "Set KbdInteractiveAuthentication no unless PAM drives a second factor (TOTP, Duo); then require keys first with AuthenticationMethods publickey,keyboard-interactive.", "usepam");
  }
  if (lc(val(map, "permitemptypasswords")) === "yes") {
    add(pass.any ? "high" : "medium", "permit-empty-passwords", "permitemptypasswords",
      "PermitEmptyPasswords yes lets an account with an empty password log in with no password at all.",
      "Set PermitEmptyPasswords no (the default).");
  }
  if (lc(val(map, "x11forwarding")) === "yes") {
    add("low", "x11-forwarding-on", "x11forwarding",
      "X11Forwarding yes lets a user's X session be reached through the server; a client that also trusts the server (ssh -Y) can have its screen and keystrokes read by anyone with root there.",
      "Set X11Forwarding no unless people run graphical programs over SSH (Ubuntu's stock sshd_config turns it on).");
  }
  const pue = val(map, "permituserenvironment");
  if (pue !== undefined && pue !== "no") {
    // strcmp, not strcasecmp: "Yes" is a pattern list, not yes.
    const pattern = pue !== "yes";
    const dangerous = !pattern || /(^|,)(\*|LD_\*|LD_PRELOAD|LD_LIBRARY_PATH|BASH_ENV|ENV)(,|$)/.test(pue);
    add(dangerous ? "high" : "low", "permit-user-environment", "permituserenvironment",
      pattern
        ? `PermitUserEnvironment ${pue} is read as a pattern list (only lowercase yes and no are keywords here); ${dangerous ? "it admits LD_PRELOAD-style variables" : "it admits the variables it names"} from ~/.ssh/environment and environment= options in authorized_keys.`
        : "PermitUserEnvironment yes lets users set LD_PRELOAD and similar from ~/.ssh/environment or authorized_keys, which bypasses ForceCommand and restricted keys.",
      "Set PermitUserEnvironment no, or a short list of harmless names such as LANG,LC_*.");
  }
  if (lc(val(map, "strictmodes")) === "no") {
    add("medium", "strict-modes-off", "strictmodes",
      "StrictModes no makes sshd accept authorized_keys files and home directories that other users can write, so another local user can add their key to someone else's account.",
      "Set StrictModes yes (the default) and fix the permissions it complains about.");
  }
  if (lc(val(map, "ignorerhosts")) === "no") {
    add("medium", "rhosts-honoured", "ignorerhosts",
      "IgnoreRhosts no makes host-based login trust ~/.rhosts and ~/.shosts files that users control.",
      "Set IgnoreRhosts yes (the default).");
  }
  if (lc(val(map, "hostbasedauthentication")) === "yes") {
    add("low", "hostbased-auth-on", "hostbasedauthentication",
      "HostbasedAuthentication yes trusts whole client machines listed in /etc/ssh/shosts.equiv: root on any of them can log in as any user here.",
      "Set HostbasedAuthentication no unless this is a managed cluster that needs it.");
  }
  const gp = lc(val(map, "gatewayports"));
  if (gp === "yes" || gp === "clientspecified") {
    add("low", "gateway-ports-on", "gatewayports",
      `GatewayPorts ${gp} lets users publish remote-forwarded ports (ssh -R) on the server's public addresses, exposing whatever they tunnel to the internet.`,
      "Set GatewayPorts no (the default).");
  }
  const pt = lc(val(map, "permittunnel"));
  if (pt && pt !== "no") {
    add("low", "tunnel-devices-on", "permittunnel",
      `PermitTunnel ${pt} lets users create tun/tap network devices, a full VPN into the server's network.`,
      "Set PermitTunnel no unless this host is meant to be a VPN endpoint.");
  }
  const mat = intValue(val(map, "maxauthtries")).value;
  if (Number.isFinite(mat) && mat > 10) {
    add("low", "max-auth-tries-high", "maxauthtries",
      `MaxAuthTries ${mat} gives each connection ${mat} guesses before sshd drops it (default 6).`,
      "Leave MaxAuthTries at 6 or lower.");
  }
  if (convtime(val(map, "logingracetime")) === 0) {
    add("low", "login-grace-unlimited", "logingracetime",
      "LoginGraceTime 0 lets an unauthenticated connection hang on forever, so a handful of idle connections fill MaxStartups and lock real users out.",
      "Use a limit such as 30s or the default 120.");
  }
  for (const k of Object.keys(WEAK)) {
    const v = val(map, k);
    if (!map.get(k)) continue;
    const enabled = algoAdds(v).filter((n) => Object.hasOwn(WEAK[k], n.toLowerCase()));
    if (!enabled.length) continue;
    const sev = enabled.map((n) => WEAK[k][n.toLowerCase()]).sort((a, b) => rank(a) - rank(b))[0];
    add(sev, "weak-algorithm", k,
      `${at(map, k).raw} ${String(v).startsWith("+") ? "adds" : "enables"} ${enabled.join(", ")}: ${WEAK_WHY[k]}.`,
      String(v).startsWith("+") ? `Drop the ${at(map, k).raw} line (the defaults are strong) once the old clients that needed it are gone.` : `Remove ${enabled.join(", ")} from the list, or delete the line to use OpenSSH's defaults.`);
  }
}

export function scanFiles(files, options = {}) {
  const read = readConfig(files, options);
  const findings = [];
  const notes = [...read.notes];
  for (const e of read.errors) findings.push({ severity: "error", type: "sshd-will-not-start", keyword: e.keyword || null, file: e.file, line: e.line, scope: "global", detail: e.message, remediation: "Fix this line; test with sshd -t before restarting, and keep a session open." });

  for (const f of read.unreadDropins) {
    const first = f.text.split("\n").findIndex((l) => /^\s*[A-Za-z]/.test(l));
    const sets = f.text.split("\n").map((l) => splitKeyword(l.replace(/[ \t\r]+$/, ""))).filter((x) => x && x.keyword && !x.keyword.startsWith("#"));
    const security = sets.some((x) => SECURITY.has(K[x.keyword.toLowerCase()]?.name));
    const inc = read.directives.filter((d) => d.keyword === "include").map((d) => d.args[0]);
    findings.push({ severity: security ? "medium" : "low", type: "dropin-not-read", keyword: null, file: f.name, line: first + 1 || 1, scope: "global",
      detail: `sshd never reads this file: ${inc.length ? `the Include line${inc.length === 1 ? "" : "s"} (${inc.join(", ")}) do${inc.length === 1 ? "es" : ""} not match its name` : "no Include line in what was given pulls in sshd_config.d"}${/\.conf$/.test(f.name) ? "" : ", and Ubuntu and Debian include only names ending in .conf"}. ${sets.length ? `Its ${sets.length} setting${sets.length === 1 ? "" : "s"} (${sets.slice(0, 3).map((x) => x.keyword).join(", ")}${sets.length > 3 ? ", ..." : ""}) ${sets.length === 1 ? "has" : "have"} no effect.` : ""}`,
      remediation: "Rename it to end in .conf (for example 10-hardening.conf, so it sorts before 50-cloud-init.conf), or add an Include line that matches it." });
  }

  // Value checks, and keyword placement.
  for (const d of read.directives) {
    if (!d.def) continue;
    if (d.match && !isAll(d.match) && d.def.scope === "global") {
      findings.push({ severity: "error", type: "global-only-in-match", keyword: d.keyword, file: d.file, line: d.line, scope: `Match ${d.match.text}`, detail: `${d.raw} is not allowed inside a Match block (it sits under Match ${d.match.text} at ${d.match.file}:${d.match.line}); sshd refuses to start.`, remediation: `Move ${d.raw} above the first Match line, or end the block with Match all before it.` });
      continue;
    }
    if (d.def.kind === "deprecated" || d.def.kind === "unsupported") {
      findings.push({ severity: "low", type: "ignored-option", keyword: d.keyword, file: d.file, line: d.line, scope: d.match ? `Match ${d.match.text}` : "global", detail: `${d.raw} is ${d.def.kind} in OpenSSH 9.6 and is ignored${d.def.kind === "unsupported" ? " (this build does not support it)" : ""}: the line does nothing.`, remediation: "Delete the line, and check that whatever it was meant to do is set another way." });
      continue;
    }
    const scopeOf = d.match ? `Match ${d.match.text}` : "global";
    const max = MAX_ARGS[d.keyword] ?? 1;
    if (d.def.kind !== "match" && d.def.kind !== "include" && d.args.length > max) {
      findings.push({ severity: "error", type: "sshd-will-not-start", keyword: d.keyword, file: d.file, line: d.line, scope: scopeOf, detail: `${d.raw} ${d.args.join(" ")}: sshd stops with "keyword ${d.raw} extra arguments at end of line"; ${d.raw} takes ${max === 1 ? "one value" : `at most ${max} values`}${d.def.kind === "list" ? " per line (repeat the line for more)" : ""}.`, remediation: d.def.kind === "list" ? `Put each value on its own ${d.raw} line.` : `Keep one value, or comment out the rest with #.` });
      continue;
    }
    if (INT_KW.has(d.keyword) && intValue(d.args[0]).error) {
      findings.push({ severity: "error", type: "sshd-will-not-start", keyword: d.keyword, file: d.file, line: d.line, scope: scopeOf, detail: `${d.raw} ${d.args[0]}: integer value ${intValue(d.args[0]).error}; sshd refuses to start.`, remediation: `Use a whole number from 0 to ${INT_MAX}, in decimal.` });
      continue;
    }
    if (TIME_KW.has(d.keyword) && convtime(d.args[0]) < 0) {
      findings.push({ severity: "error", type: "sshd-will-not-start", keyword: d.keyword, file: d.file, line: d.line, scope: scopeOf, detail: `${d.raw} ${d.args[0]}: invalid time value; sshd refuses to start.`, remediation: "Use seconds (120) or units such as 30s, 2m or 1h30m." });
      continue;
    }
    const states = STATES[d.keyword];
    // PermitTunnel's values are compared with strcmp in servconf.c, so
    // "PermitTunnel NO" stops sshd; the other multi-state options ignore case.
    const given = CASE_SENSITIVE.has(d.keyword) ? d.args[0] : lc(d.args[0]);
    if (states && d.def.kind === "first" && !states.includes(given)) {
      findings.push({ severity: "error", type: "sshd-will-not-start", keyword: d.keyword, file: d.file, line: d.line, scope: d.match ? `Match ${d.match.text}` : "global", detail: `${d.raw} ${d.args[0]}: unsupported option; sshd accepts ${states.join(", ")}${CASE_SENSITIVE.has(d.keyword) ? ", in lowercase only" : ""}.`, remediation: `Use one of ${states.join(", ")}.` });
    }
    if (d.match && !d.match.all && d.match.indentBody === true && !d.indent && d.def.kind !== "match") {
      const looksGlobal = d.def.scope === "all";
      if (looksGlobal) findings.push({ severity: SECURITY.has(d.keyword) ? "medium" : "low", type: "looks-global-but-in-match", keyword: d.keyword, file: d.file, line: d.line, scope: `Match ${d.match.text}`, detail: `${d.raw} ${d.args.join(" ")} is written flush left like a global setting, but sshd ignores indentation: it belongs to Match ${d.match.text} (${d.match.file}:${d.match.line}) and applies only to those connections.`, remediation: "Move the line above the first Match block, or put Match all on the line before it." });
    }
  }

  const res = resolve(read);
  for (const s of res.shadowed) {
    const winnerVal = valueOf(s.winner);
    const mine = valueOf(s.d);
    if (lc(winnerVal) === lc(mine)) continue;
    const security = SECURITY.has(s.d.keyword);
    findings.push({ severity: security ? "medium" : "low", type: "setting-ignored", keyword: s.d.keyword, file: s.d.file, line: s.d.line, scope: "global",
      detail: s.reason === "match-all"
        ? `${s.d.raw} ${mine} does not reach any connection: ${s.winner.raw} ${winnerVal} at ${s.winner.file}:${s.winner.line} sits under Match ${s.winner.match.text} (${s.winner.match.file}:${s.winner.match.line}), and a Match all block is not a return to global settings: it applies to every connection and overrides the global value.`
        : `${s.d.raw} ${mine} is ignored: sshd keeps the first value it reads, and ${s.winner.file}:${s.winner.line} already set ${s.winner.raw} ${winnerVal}${s.winner.file !== s.d.file ? " (an Include earlier in the order pulled that file in first)" : ""}.`,
      remediation: `Set it once, in the file read first (drop-ins in sshd_config.d are read at the Include line, usually the top of sshd_config, in name order: 00-x.conf before 50-cloud-init.conf). Or remove ${s.winner.file}:${s.winner.line}.` });
  }
  settingChecks(res.global, "global", findings);

  // Each Match block, overlaid on the global settings.
  const perMatch = [];
  for (const m of read.matches) {
    if (isAll(m)) continue;
    const { own, eff } = blockOverlay(read, m, res.base);
    const before = [];
    settingChecks(res.global, "x", before);
    const keyOf = (f) => `${f.type}|${f.severity}`;
    const had = new Set(before.map(keyOf));
    const tmp = [];
    settingChecks(eff, `Match ${m.text}`, tmp);
    for (const f of tmp) if (!had.has(keyOf(f)) && own.has(f.keyword)) findings.push(f);
    const pass = passwordsOn(eff);
    perMatch.push({ match: `Match ${m.text}`, file: m.file, line: m.line, sets: [...own.entries()].map(([k, v]) => `${(v.list ? v.at[0] : v.at).raw} ${v.list ? v.value.join(" ") : v.value}`), passwords: pass.any, rootLogin: lc(val(eff, "permitrootlogin")) });
  }

  findings.sort((a, b) => rank(a.severity) - rank(b.severity) || (a.file === b.file ? a.line - b.line : 0));

  const g = res.global;
  const pass = passwordsOn(g);
  const login = {
    root: lc(val(g, "permitrootlogin")),
    rootAt: where(at(g, "permitrootlogin")),
    passwords: pass.any,
    passwordVia: pass.pw && pass.kbd ? "PasswordAuthentication and keyboard-interactive (PAM)" : pass.pw ? "PasswordAuthentication" : pass.kbd ? "keyboard-interactive (PAM)" : "off",
    passwordAt: where(at(g, "passwordauthentication")),
    keys: lc(val(g, "pubkeyauthentication")) === "yes",
    allowUsers: g.get("allowusers")?.value || null,
    allowGroups: g.get("allowgroups")?.value || null,
  };

  let connection = null;
  if (options.connection) {
    const r = resolve(read, options.connection);
    const p = passwordsOn(r.effective);
    connection = {
      applied: r.applied.map((m) => `Match ${m.text} (${m.file}:${m.line})`),
      root: lc(val(r.effective, "permitrootlogin")),
      passwords: p.any,
      settings: effectiveTable(r.effective),
    };
    if (read.matches.some((m) => m.criteria.some((c) => (c.attr === "group" && !options.connection.groups?.length) || (c.attr === "host" && !options.connection.host) || (c.attr === "address" && !options.connection.addr)))) {
      notes.push("Some Match lines test a group, host or address the connection details leave blank; those blocks are counted as not matching (sshd -T -C would stop with an error instead).");
    }
  }

  return { findings, notes, order: read.order, effective: effectiveTable(g), shadowed: res.shadowed.length, perMatch, login, connection };
}

function effectiveTable(map) {
  const rows = [];
  for (const [k, e] of map) rows.push({ keyword: e.list ? e.at[0].raw : e.at.raw, value: e.list ? e.value.join(" ") : e.value, at: e.list ? e.at.map(where).join(", ") : where(e.at) });
  for (const k of ["permitrootlogin", "passwordauthentication", "kbdinteractiveauthentication", "pubkeyauthentication", "x11forwarding"]) {
    if (!map.has(k)) rows.push({ keyword: k, value: DEFAULTS[k], at: "default" });
  }
  return rows.sort((a, b) => a.keyword.toLowerCase().localeCompare(b.keyword.toLowerCase()));
}

export function hasRisk(findings) {
  return findings.some((f) => f.severity === "error" || f.severity === "high" || f.severity === "medium");
}

export function summaryLine(findings) {
  if (!findings.length) return "No listed pattern found. That is not proof the server is safe.";
  const c = { error: 0, high: 0, medium: 0, low: 0 };
  for (const f of findings) c[f.severity]++;
  const parts = [];
  if (c.error) parts.push(`${c.error} line${c.error === 1 ? " that stops" : "s that stop"} sshd starting`);
  if (c.high) parts.push(`${c.high} high`);
  if (c.medium) parts.push(`${c.medium} medium`);
  if (c.low) parts.push(`${c.low} low`);
  return `${findings.length} finding${findings.length === 1 ? "" : "s"}: ${parts.join(", ")}.`;
}

// Every finding type, for the guide and its test.
export const TYPES = [
  "sshd-will-not-start", "global-only-in-match", "permit-root-login-yes", "permit-empty-passwords",
  "permit-user-environment", "password-auth-on", "kbd-interactive-pam", "setting-ignored",
  "dropin-not-read", "looks-global-but-in-match", "weak-algorithm", "strict-modes-off", "rhosts-honoured",
  "hostbased-auth-on", "x11-forwarding-on", "gateway-ports-on", "tunnel-devices-on", "max-auth-tries-high",
  "login-grace-unlimited", "ignored-option",
];
