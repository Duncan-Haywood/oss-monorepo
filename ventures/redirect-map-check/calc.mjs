// Site-migration redirect map checker. Pure functions, no DOM, no network.
// Input: a CSV/TSV (or pasted two-column text) of old URL -> new URL, optionally with a status code.
// It finds the faults that quietly cost search traffic after a migration -- loops, chains, conflicting
// duplicates, mass redirects to the homepage, targets that are not on the new site -- and rewrites the map
// flattened, in the format a platform imports. Platform limits are read from memory and stated as such.

export const SEVERITIES = ["error", "warning", "info"];
export const LIMITS = { rows: 100000, maxHops: 1, urlLength: 2000, homepageShare: 0.1 };
export const FORMATS = ["shopify", "netlify", "apache", "nginx", "csv"];
const CODES = new Set([301, 302, 303, 307, 308, 410, 451]);
const PERMANENT = new Set([301, 308]);

export function decodeBuffer(buf) {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (u8[0] === 0xff && u8[1] === 0xfe) return new TextDecoder("utf-16le").decode(u8.subarray(2));
  if (u8[0] === 0xfe && u8[1] === 0xff) return new TextDecoder("utf-16be").decode(u8.subarray(2));
  return new TextDecoder("utf-8").decode(u8);
}

export function parseCsv(text, delim = ",") {
  const rows = [];
  let row = [], cell = "", q = false, line = 1, start = 1, i = 0, quoteLine = 0, sawAny = false;
  const push = () => { row.push(cell); cell = ""; };
  const endRow = () => { push(); rows.push({ cells: row, line: start }); row = []; sawAny = false; };
  while (i < text.length) {
    const ch = text[i];
    if (q) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i += 2; continue; }
        q = false; i++; continue;
      }
      if (ch === "\n") line++;
      cell += ch; i++; continue;
    }
    if (ch === '"' && cell === "") { q = true; quoteLine = line; sawAny = true; i++; continue; }
    if (ch === delim) { push(); sawAny = true; i++; continue; }
    if (ch === "\r") { i++; continue; }
    if (ch === "\n") { endRow(); line++; start = line; i++; continue; }
    cell += ch; sawAny = true; i++;
  }
  if (q) return { rows, unterminated: quoteLine };
  if (sawAny || cell !== "" || row.length) endRow();
  return { rows, unterminated: 0 };
}

export function toCsv(rows, delim = ",") {
  const esc = (v) => (v.includes(delim) || /[\r\n"]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return rows.map((r) => r.map(esc).join(delim)).join("\r\n") + "\r\n";
}

// Delimiter of the first non-empty line, counting only characters outside double quotes. A map that is
// just "/old /new" per line (spaces) is also accepted, as is the arrow form "/old -> /new".
export function detectDelim(text) {
  const counts = { ",": 0, "\t": 0, ";": 0, "|": 0 };
  let q = false, seen = false;
  for (const ch of text) {
    if (ch === '"') q = !q;
    else if (!q && ch === "\n") { if (seen) break; }
    else if (!q && ch in counts) { counts[ch]++; seen = true; }
    else if (!q && !/\s/.test(ch)) seen = true;
  }
  let best = ",";
  for (const d of ["\t", ";", "|"]) if (counts[d] > counts[best]) best = d;
  if (!counts[best]) return " ";
  return best;
}
const delimName = (d) => (d === ";" ? "semicolon" : d === "\t" ? "tab" : d === "|" ? "pipe" : d === " " ? "space" : "comma");

const FROM_NAMES = new Set(["redirectfrom", "from", "source", "sourceurl", "oldurl", "old", "origin", "originurl", "path", "url", "legacyurl", "src", "requestpath", "oldpath", "fromurl", "frompath"]);
const TO_NAMES = new Set(["redirectto", "to", "target", "targeturl", "destination", "destinationurl", "newurl", "new", "redirecturl", "dest", "dst", "newpath", "tourl", "topath", "redirect", "location"]);
const CODE_NAMES = ["code", "status", "statuscode", "httpcode", "httpstatus", "redirecttype", "type"];
const canon = (h) => String(h).trim().replace(/[^A-Za-z0-9]+/g, "").toLowerCase();

const looksUrl = (v) => /^(https?:\/\/|\/|www\.)/i.test(v.trim()) || /^[\w-]+(\.[\w-]+)+(\/|$)/.test(v.trim());

// Split a URL into { host, path } where path keeps the query string. Fragment is reported separately.
export function splitUrl(raw) {
  let s = String(raw).trim();
  let host = "", scheme = "", fragment = "";
  const hash = s.indexOf("#");
  if (hash >= 0) { fragment = s.slice(hash); s = s.slice(0, hash); }
  const m = s.match(/^(https?:)?\/\/([^/?#]+)(.*)$/i);
  if (m) { scheme = (m[1] || "").toLowerCase(); host = m[2].toLowerCase().replace(/:80$|:443$/, ""); s = m[3] || "/"; }
  else if (/^www\./i.test(s) || (/^[\w-]+(\.[\w-]+)+(\/|$)/.test(s) && !s.startsWith("/"))) {
    const slash = s.search(/[/?]/);
    host = (slash < 0 ? s : s.slice(0, slash)).toLowerCase();
    s = slash < 0 ? "/" : s.slice(slash);
  }
  if (s === "") s = "/";
  if (s[0] === "?") s = "/" + s;
  return { host, scheme, path: s, fragment };
}

const stripWww = (h) => h.replace(/^www\./, "");
const noSlash = (p) => { const q = p.indexOf("?"); const a = q < 0 ? p : p.slice(0, q); const b = q < 0 ? "" : p.slice(q); return (a.length > 1 ? a.replace(/\/+$/, "") : a) + b; };

function findColumns(head) {
  const c = head.map(canon);
  const from = c.findIndex((h) => FROM_NAMES.has(h));
  let to = c.findIndex((h, i) => i !== from && TO_NAMES.has(h));
  let code = -1;
  for (const n of CODE_NAMES) { code = c.indexOf(n); if (code >= 0) break; }
  return { from, to, code, named: from >= 0 && to >= 0 };
}

// Read the input into rows of { line, from, to, code }. Never throws.
export function readMap(input) {
  let text = String(input ?? "");
  const notes = [];
  if (text.charCodeAt(0) === 0xfeff) { text = text.slice(1); notes.push("bom"); }
  if (!text.trim()) return { rows: [], notes, error: "The file is empty.", delim: ",", header: false };
  let delim = detectDelim(text);
  let table;
  if (delim === " ") {
    // "/old /new" or "/old -> /new" or Netlify "/old /new 301"
    table = { rows: [], unterminated: 0 };
    text.split(/\r?\n/).forEach((l, i) => {
      const t = l.trim();
      if (!t || t.startsWith("#")) return;
      const parts = t.split(/\s*(?:->|=>|→)\s*|\s+/).filter(Boolean);
      table.rows.push({ cells: parts, line: i + 1 });
    });
  } else table = parseCsv(text, delim);
  if (table.unterminated) return { rows: [], notes, error: `A quote opened on line ${table.unterminated} is never closed; fix that first.`, delim, header: false };
  const all = table.rows.filter((r) => !r.cells.every((x) => x.trim() === ""));
  if (!all.length) return { rows: [], notes, error: "The file is empty.", delim, header: false };
  let cols = findColumns(all[0].cells);
  let header = cols.named;
  if (!header) {
    // No recognisable header: if the first row's first two cells look like URLs, treat it as data.
    const first = all[0].cells;
    if (first.length >= 2 && looksUrl(first[0]) && (looksUrl(first[1]) || first[1].trim() === "")) cols = { from: 0, to: 1, code: first[2] !== undefined && /^\d{3}$/.test(first[2].trim()) ? 2 : -1, named: false };
    else if (first.length >= 2) { header = true; cols = { from: 0, to: 1, code: first.length > 2 ? 2 : -1, named: false }; notes.push("guessed-header"); }
    else return { rows: [], notes, error: "Could not find two columns (old URL and new URL).", delim, header: false };
  }
  const rows = [];
  for (let i = header ? 1 : 0; i < all.length; i++) {
    const r = all[i];
    const code = cols.code >= 0 && r.cells[cols.code] !== undefined ? r.cells[cols.code].trim() : "";
    rows.push({ line: r.line, from: (r.cells[cols.from] ?? ""), to: (r.cells[cols.to] ?? ""), code, extra: r.cells.length });
  }
  return { rows, notes, error: null, delim, header, cols };
}

const r410 = (c) => String(c || "").trim();

function parseList(text) {
  return String(text ?? "").split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
}

// Normalised lookup key for a source or target path.
const keyOf = (p, caseSensitive) => (caseSensitive ? p : p.toLowerCase());

// Resolve every source in the exact-match table in linear time: { final, hops, loop } per key, memoised.
// A key that leads into a cycle (or is on one) is `loop`.
function resolveAll(table) {
  const memo = new Map();
  for (const start of table.keys()) {
    if (memo.has(start)) continue;
    const stack = [], onStack = new Set();
    let cur = start, tail;
    for (;;) {
      if (memo.has(cur)) { tail = memo.get(cur); break; }
      if (onStack.has(cur)) { tail = { loop: true }; break; }
      const next = table.get(cur);
      if (next === undefined) { tail = { final: cur, hops: 0, loop: false }; break; }
      onStack.add(cur);
      stack.push(cur);
      cur = next;
    }
    for (let i = stack.length - 1; i >= 0; i--) {
      tail = tail.loop ? { final: null, hops: 0, loop: true } : { final: tail.final, hops: tail.hops + 1, loop: false };
      memo.set(stack[i], tail);
    }
  }
  return memo;
}

// The visible path from a key, at most `max` steps, ending at a repeat or the end.
function trace(start, table, max = 8) {
  const out = [start];
  let cur = start;
  while (out.length <= max) {
    const next = table.get(cur);
    if (next === undefined) return { path: out, truncated: false };
    out.push(next);
    if (out.indexOf(next) !== out.length - 1) return { path: out, truncated: false };
    cur = next;
  }
  return { path: out, truncated: true };
}

export function validate(input, options = {}) {
  const opts = { caseSensitive: false, site: "", newUrls: "", oldUrls: "", ...options };
  const findings = [];
  const add = (severity, code, title, detail, line) => findings.push({ severity, code, title, detail, line: line || 0 });
  const read = readMap(input);
  const summary = { rows: 0, redirects: 0, loops: 0, chains: 0, conflicts: 0, duplicates: 0, toHomepage: 0, gone: 0, delimiter: read.delim, flattenable: 0, uncovered: 0, missingTargets: 0 };
  if (read.error) {
    add("error", "empty", read.error, "Nothing could be checked.", 0);
    return { findings, summary, fixes: [], rows: [], flat: [] };
  }
  if (read.notes.includes("bom")) add("info", "bom", "File starts with a UTF-8 byte-order mark", "Harmless to most importers; the cleaned file drops it.", 1);
  if (read.delim !== ",") add("warning", "delimiter", `The file is ${delimName(read.delim)}-separated`, read.delim === " " ? "Read as one 'old new' pair per line. Importers want a CSV or a platform's own syntax; the cleaned output is written in the format you pick." : `Importers expect commas (Shopify) or their own syntax. The cleaned output is written in the format you pick.`, 1);
  if (read.notes.includes("guessed-header")) add("warning", "header", "No old/new URL headers recognised", "The first row was treated as a header and the first two columns as old URL and new URL. Name them Redirect from and Redirect to if that is wrong.", 1);
  if (read.rows.length > LIMITS.rows) add("error", "too-many", `${read.rows.length.toLocaleString()} rows`, `Shopify's URL-redirect limit is 100,000 (from memory of its help pages); most hosts cap rules far lower. Split or collapse the map.`, 0);

  // 1. Per-row parse and shape checks.
  const items = [];
  const hostCount = new Map();
  for (const r of read.rows) {
    const f = r.from.trim(), t = r.to.trim();
    if (/^(\s*)(=|\+|-|@)/.test(r.from) && /^=/.test(r.from)) add("error", "formula", "Source starts with =", "A spreadsheet will treat it as a formula and corrupt it.", r.line);
    const fs = splitUrl(f);
    if (fs.host) hostCount.set(stripWww(fs.host), (hostCount.get(stripWww(fs.host)) || 0) + 1);
    items.push({ line: r.line, rawFrom: f, rawTo: t, code: r.code, from: fs, to: t ? splitUrl(t) : splitUrl("/") });
  }
  const siteHost = stripWww((opts.site || "").trim() ? splitUrl(opts.site).host || splitUrl("https://" + opts.site.trim()).host : [...hostCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "");

  // Normalised path for sources: the host is stripped when it is the site's own.
  const own = (u) => !u.host || stripWww(u.host) === siteHost;
  const key = (p) => keyOf(p, opts.caseSensitive);

  const good = [];
  for (const it of items) {
    summary.rows++;
    const { line, rawFrom: f, rawTo: t } = it;
    if (!f && !t) continue;
    if (!f) { add("error", "no-source", "Old URL is empty", `This row has a target (${t}) but no source.`, line); continue; }
    if (/\s/.test(f) || /\s/.test(t)) add("error", "space", "URL contains a space", `"${/\s/.test(f) ? f : t}" has a space inside it. Spaces must be %20, and importers split on them.`, line);
    if (it.from.fragment) add("error", "fragment", "Source contains a #fragment", `${f} — the part after # is never sent to the server, so this rule can never match. Remove it.`, line);
    if (f.length > LIMITS.urlLength || t.length > LIMITS.urlLength) add("warning", "long", "Very long URL", `Over ${LIMITS.urlLength} characters; several servers and importers truncate or reject these.`, line);
    if (/[*]|\(\.\*\)|\[\^?\w+\]|\$$/.test(f) || /\{[a-z_]+\}/i.test(f)) add("warning", "wildcard", "Source looks like a wildcard or regular expression", `${f} — Shopify's importer matches exact paths only (from memory), and the other formats here write exact matches. Expand it into real URLs or move it to a platform rule.`, line);
    if (!own(it.from)) add("error", "other-host", "Source is on a different host", `${it.from.host} is not ${siteHost || "the site's host"}. A redirect can only be served by the host that receives the request.`, line);
    if (it.from.path[0] !== "/") add("error", "relative", "Source path does not start with /", `${f} — use /path, not path.`, line);
    if (!t && Number(r410(it.code)) !== 410) { add("error", "no-target", "New URL is empty", `${f} has no destination.`, line); continue; }
    if (t && /%[^0-9a-f]|%[0-9a-f][^0-9a-f]/i.test(f + t) ) add("warning", "bad-escape", "Malformed percent-escape", "A % that is not followed by two hex digits; the importer or server may reject or mangle it.", line);
    if (/[^\x00-\x7f]/.test(f)) add("info", "non-ascii", "Source has non-ASCII characters", `${f} — servers see the percent-encoded form; make sure the map holds what the old site actually served.`, line);
    if (t && (/^\s*(\.\/|\.\.\/)/.test(t) || (it.to.path[0] !== "/" && !it.to.host))) add("error", "relative-target", "New URL is relative", `${t} — use an absolute path (/new) or a full https:// URL.`, line);
    if (it.to && it.to.scheme === "http:") add("warning", "http-target", "Target is http, not https", `${t} — sends visitors to an insecure URL, which then usually redirects again to https.`, line);
    let code = 301;
    if (it.code) {
      const n = Number(it.code);
      if (!Number.isInteger(n) || !CODES.has(n)) add("warning", "bad-code", `Status "${it.code}" is not a redirect code`, "Expected 301, 302, 303, 307, 308 or 410. The cleaned output uses 301.", line);
      else code = n;
    }
    good.push({ ...it, status: code });
  }
  summary.redirects = good.length;

  // 2. Duplicate and conflicting sources.
  const bySource = new Map();
  for (const it of good) {
    const exact = key(it.from.path);
    if (!bySource.has(exact)) bySource.set(exact, []);
    bySource.get(exact).push(it);
  }
  const targetPath = (it) => (it.status === 410 ? "\u0000gone" : own(it.to) ? it.to.path : it.rawTo);
  const table = new Map();
  const kept = [];
  for (const [src, list] of bySource) {
    const targets = new Set(list.map((x) => key(targetPath(x))));
    if (list.length > 1) {
      if (targets.size > 1) {
        summary.conflicts++;
        add("error", "conflict", "Same old URL sent to different places", `${list[0].from.path} appears ${list.length} times with ${targets.size} different targets (lines ${list.map((x) => x.line).join(", ")}). Only one can win, and which one depends on the platform.`, list[0].line);
      } else {
        summary.duplicates++;
        add("warning", "duplicate", "Duplicate row", `${list[0].from.path} is listed ${list.length} times with the same target (lines ${list.map((x) => x.line).join(", ")}). The cleaned output keeps one.`, list[1].line);
      }
      const caseVariants = new Set(list.map((x) => x.from.path));
      if (caseVariants.size > 1) add("info", "case-dup", "Duplicates that differ only by letter case", `${[...caseVariants].join(" and ")} — treated as one source (turn on case-sensitive matching if your server distinguishes them).`, list[0].line);
    }
    const first = list[0];
    kept.push(first);
    table.set(src, key(targetPath(first)));
  }
  // Trailing-slash twins: /a and /a/ both present with different targets.
  const stripped = new Map();
  for (const [src, list] of bySource) {
    const s = noSlash(src);
    if (!stripped.has(s)) stripped.set(s, []);
    stripped.get(s).push(list[0]);
  }
  for (const [, list] of stripped) {
    if (list.length > 1 && new Set(list.map((x) => key(targetPath(x)))).size > 1 && new Set(list.map((x) => x.from.path)).size > 1) {
      add("warning", "slash-twin", "Same page with and without a trailing slash goes to different places", `${list.map((x) => x.from.path).join(" and ")} — usually one page; decide which target is right.`, list[0].line);
    }
  }

  // 3. Loops, self-redirects, chains.
  const resolved = new Map(); // source key -> { final, hops, loop }
  const slashLookup = new Map();
  for (const k of table.keys()) slashLookup.set(noSlash(k), k);
  const memo = resolveAll(table);
  const itemByKey = new Map(kept.map((x) => [key(x.from.path), x]));
  const origByKey = new Map();
  for (const x of kept) if (x.status !== 410) { const k = key(targetPath(x)); if (!origByKey.has(k)) origByKey.set(k, targetPath(x)); }
  const shown = (k) => itemByKey.get(k)?.from.path || k;
  for (const it of kept) {
    const src = key(it.from.path);
    const tgt = key(targetPath(it));
    if (it.status === 410) { resolved.set(src, { final: null, hops: 0, loop: false, gone: true }); summary.gone++; continue; }
    if (own(it.to) && (tgt === src || noSlash(tgt) === noSlash(src))) {
      summary.loops++;
      add("error", "self", "Redirects to itself", `${it.from.path} → ${it.rawTo} — a loop of one. Visitors get ERR_TOO_MANY_REDIRECTS.`, it.line);
      resolved.set(src, { final: null, hops: 0, loop: true });
      continue;
    }
    if (!own(it.to)) { resolved.set(src, { final: it.rawTo, hops: 1, loop: false }); continue; }
    const m = memo.get(src);
    if (m.loop) {
      summary.loops++;
      const t = trace(src, table);
      add("error", "loop", "Redirect loop", `${t.path.map(shown).join(" → ")}${t.truncated ? " → …" : ""}. None of these pages ever resolves.`, it.line);
      resolved.set(src, { final: null, hops: 0, loop: true });
      continue;
    }
    resolved.set(src, { final: m.final, hops: m.hops, loop: false });
    if (m.hops > LIMITS.maxHops) {
      summary.chains++;
      const t = trace(src, table);
      add("warning", "chain", `Chain of ${m.hops} redirects`, `${t.path.map(shown).join(" → ")}${t.truncated ? " → …" : ""}. Google follows a few hops but recommends one; each extra hop adds latency and can drop link signals. The cleaned output points ${it.from.path} straight at the end.`, it.line);
    } else {
      const alt = slashLookup.get(noSlash(tgt));
      if (alt && alt !== tgt && alt !== src) add("warning", "slash-chain", "Target may redirect again via its trailing slash", `${it.rawTo} → ${alt}. If your server treats /x and /x/ as the same page, this is a two-hop chain.`, it.line);
    }
  }

  for (const it of kept) {
    if (it.status === 410) continue;
    const hit = itemByKey.get(key(targetPath(it)));
    if (hit && hit.status === 410) add("error", "to-gone", "Redirects to a page you marked 410 Gone", `${it.from.path} → ${hit.from.path}, which is itself gone. Point it at a live page.`, it.line);
  }

  // 4. Homepage mass-redirects (soft 404 pattern).
  const isHome = (u) => own(u) && /^\/(index\.html?|\?.*)?$/.test(u.path);
  const homeRows = kept.filter((it) => it.to && isHome(it.to) && it.status !== 410);
  summary.toHomepage = homeRows.length;
  if (kept.length >= 10 && homeRows.length / kept.length > LIMITS.homepageShare) {
    add("warning", "homepage", `${homeRows.length} of ${kept.length} rows (${Math.round((homeRows.length / kept.length) * 100)}%) redirect to the homepage`, `Google treats a redirect to an unrelated page, especially the homepage, as a soft 404 and may not pass the old page's ranking. Send each old page to its closest equivalent, or use 410 Gone for pages with none.`, homeRows[0].line);
  } else for (const it of homeRows.slice(0, 5)) add("info", "homepage-row", "Redirects to the homepage", `${it.from.path} → ${it.rawTo}. Fine if the homepage really is the closest page.`, it.line);

  // 5. Mixed permanent/temporary.
  const temp = kept.filter((it) => !PERMANENT.has(it.status) && it.status !== 410);
  if (temp.length) add("warning", "temporary", `${temp.length} row${temp.length === 1 ? "" : "s"} use a temporary status`, `A migration is permanent: 301 or 308 tell search engines to move the old URL's ranking to the new one. 302/303/307 do not. First: line ${temp[0].line}.`, temp[0].line);

  // 6. Optional new-site URL list: targets must exist.
  const newList = parseList(opts.newUrls);
  if (newList.length) {
    const have = new Set(newList.map((u) => { const s = splitUrl(u); return key(noSlash(s.path.split("#")[0])); }));
    for (const it of kept) {
      if (it.status === 410 || !own(it.to)) continue;
      const res = resolved.get(key(it.from.path));
      const finalPath = res && res.final && !res.loop ? res.final : key(it.to.path);
      if (!have.has(noSlash(finalPath))) {
        summary.missingTargets++;
        add("error", "target-missing", "Target is not in your new-site URL list", `${it.from.path} ends at ${finalPath}, which is not among the ${newList.length.toLocaleString()} URLs you pasted. That is a redirect to a 404.`, it.line);
      }
    }
  }
  // 7. Optional old-site URL list: coverage.
  const oldList = parseList(opts.oldUrls);
  if (oldList.length) {
    const covered = new Set([...table.keys()].map(noSlash));
    const missing = [];
    for (const u of oldList) {
      const s = splitUrl(u);
      const k = noSlash(key(s.path));
      if (!covered.has(k)) missing.push(s.path);
    }
    summary.uncovered = missing.length;
    if (missing.length) add("warning", "uncovered", `${missing.length.toLocaleString()} of ${oldList.length.toLocaleString()} old URLs have no redirect`, `Each will 404 after launch unless the new site serves it. First few: ${missing.slice(0, 8).join(", ")}${missing.length > 8 ? ", …" : ""}.`, 0);
    else add("info", "covered", `All ${oldList.length.toLocaleString()} old URLs have a rule`, "Every URL in your old-site list appears as a source.", 0);
  }

  // Flattened output.
  const flat = [];
  const fixes = [];
  const tidy = (p, what, line) => {
    let o = p;
    if (o && o[0] !== "/" && !/^https?:\/\//i.test(o)) { o = "/" + o; fixes.push(`Line ${line}: added a leading / to ${what} "${p}".`); }
    if (/ /.test(o)) { const n = o.replace(/ /g, "%20"); fixes.push(`Line ${line}: encoded the space in ${what} "${o}" as %20.`); o = n; }
    return o;
  };
  for (const it of kept) {
    const res = resolved.get(key(it.from.path));
    if (!res || res.loop) continue;
    if (res.gone) { flat.push({ from: tidy(it.from.path, "the source", it.line), to: "", status: 410 }); continue; }
    let to = it.rawTo;
    if (own(it.to)) to = res.hops > 1 ? origByKey.get(res.final) || res.final : it.to.path;
    if (res.hops > 1) summary.flattenable++;
    if (it.from.fragment) fixes.push(`Line ${it.line}: removed "${it.from.fragment}" from the source; a fragment is never sent to the server.`);
    flat.push({ from: tidy(it.from.path, "the source", it.line), to: tidy(to, "the target", it.line), status: it.status === 410 ? 410 : PERMANENT.has(it.status) ? it.status : 301 });
  }
  const errs = findings.filter((f) => f.severity === "error").length;
  summary.errors = errs;
  summary.warnings = findings.filter((f) => f.severity === "warning").length;
  summary.site = siteHost;
  findings.sort((a, b) => (a.severity === b.severity ? a.line - b.line : SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity)));
  return { findings, summary, fixes, rows: kept.map((k) => ({ line: k.line, from: k.from.path, to: k.rawTo, status: k.status })), flat };
}

// Render the flattened map in the format a platform imports.
export function render(flat, format = "shopify", options = {}) {
  const rows = flat.filter((r) => r.to || r.status === 410);
  const keep410 = format === "netlify" || format === "apache" || format === "nginx" || format === "csv";
  const list = rows.filter((r) => keep410 || r.status !== 410);
  const q = (s) => `"${String(s).replace(/(["\\$])/g, "\\$1")}"`;
  switch (format) {
    case "shopify":
      return toCsv([["Redirect from", "Redirect to"], ...list.map((r) => [r.from, r.to])]);
    case "csv":
      return toCsv([["from", "to", "status"], ...list.map((r) => [r.from, r.to, String(r.status)])]);
    case "netlify":
      return list.map((r) => (r.status === 410 ? `${r.from}  /410.html  410!` : `${r.from}  ${r.to}  ${r.status}!`)).join("\n") + "\n" + (list.some((r) => r.status === 410) ? "# 410 rows need a /410.html page on the new site; Netlify serves its body with the 410 status.\n" : "");
    case "apache":
      return list.map((r) => (r.status === 410 ? `Redirect gone ${r.from}` : `Redirect ${r.status} ${r.from} ${r.to}`)).join("\n") + "\n";
    case "nginx": {
      const lines = ["map $request_uri $redirect_to {", "    default \"\";"];
      const gone = [];
      for (const r of list) { if (r.status === 410) gone.push(r.from); else lines.push(`    ${q(r.from)} ${q(r.to)};`); }
      lines.push("}");
      if (gone.length) lines.push("map $request_uri $is_gone {", "    default 0;", ...gone.map((g) => `    ${q(g)} 1;`), "}");
      lines.push("# server { ... if ($is_gone) { return 410; }  if ($redirect_to) { return 301 $redirect_to; } }");
      return lines.join("\n") + "\n";
    }
    default:
      return "";
  }
}

export function repair(input, options = {}) {
  const r = validate(input, options);
  const changes = [];
  if (!r.flat.length) return { text: "", changes, error: r.findings.find((f) => f.code === "empty")?.title || "There is nothing to write." };
  const loops = r.findings.filter((f) => f.code === "loop" || f.code === "self").length;
  changes.push(...r.fixes);
  if (r.summary.flattenable) changes.push(`Pointed ${r.summary.flattenable} chained redirect(s) straight at their final destination.`);
  if (r.summary.duplicates) changes.push(`Dropped ${r.summary.duplicates} duplicate row(s) with identical targets.`);
  if (loops) changes.push(`Left out ${loops} row(s) caught in a loop; they need a human decision.`);
  if (r.summary.conflicts) changes.push(`Kept the first row where one old URL had different targets (${r.summary.conflicts}); check them.`);
  if (r.summary.delimiter !== ",") changes.push(`Rewrote the ${delimName(r.summary.delimiter)}-separated file in the format you chose.`);
  return { text: render(r.flat, options.format || "shopify"), changes, error: null };
}

export function findingsCsv(result) {
  return toCsv([["severity", "line", "code", "title", "detail"], ...result.findings.map((f) => [f.severity, String(f.line || ""), f.code, f.title, f.detail])]);
}

export function sampleFile() {
  return toCsv([["Redirect from", "Redirect to"],
    ["/blog/2019/spring-sale", "/blog/spring-sale"],
    ["/about-us", "/about"],
    ["/products/blue-widget", "/shop/widgets/blue"],
    ["/products/red-widget", "/shop/widgets/red"],
    ["/contact-us", "/contact"],
    ["/old-pricing", "/pricing"]]);
}

export function sampleBrokenFile() {
  return toCsv([["Redirect from", "Redirect to"],
    ["/about-us", "/about"],
    ["/about", "/company/about"],
    ["/company/about", "/about-us"],
    ["/products/blue-widget", "/shop/widgets/blue"],
    ["/Products/Blue-Widget", "/shop/widgets/navy"],
    ["/shop/widgets/blue", "/shop/blue"],
    ["/contact-us", "/contact"],
    ["/contact-us", "/contact"],
    ["/blog/post one", "/blog/post-one"],
    ["products/red-widget", "/shop/widgets/red"],
    ["/faq#shipping", "/help"],
    ["/pricing", "/pricing"],
    ["/old-1", "/"], ["/old-2", "/"], ["/old-3", "/"], ["/old-4", "/"],
    ["/legacy/page", "http://example.com/new-page"]]);
}
