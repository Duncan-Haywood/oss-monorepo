// Deterministic robots.txt + llms.txt audit against a curated list of
// publicly documented AI-crawler user-agent tokens. No network call lives
// here -- this module only classifies text it is given, so the identical
// logic runs in the browser page (pasted text) and the Node CLI (fetched or
// read-from-disk text).
//
// The robots.txt parsing and matching follow RFC 9309 as Google's open-source
// parser implements it (github.com/google/robotstxt, Apache-2.0; read, not
// copied, at commit 22b355f): every group naming a crawler is merged, the
// User-agent value is cut to its product token, the longest match wins and a
// tie goes to Allow, plus Google's own leniencies (common key typos, a missing
// colon, a byte-order mark, "index.html" meaning the directory). The cases
// in conformance.test.mjs restate that project's unit tests in our own words.
// Crawl-delay and other non-standard lines are ignored, as Google ignores them.

// Purpose is summarised from public reporting and each operator's own
// crawler documentation. Operators add crawlers and change stated purposes
// over time -- treat this list as a snapshot, not a live feed, and confirm
// anything load-bearing directly with the operator.
export const KNOWN_BOTS = [
  { token: "GPTBot", operator: "OpenAI", purpose: "training", note: "Crawls to improve OpenAI's models. Does not include ChatGPT's own browsing." },
  { token: "ChatGPT-User", operator: "OpenAI", purpose: "user-browsing", note: "Fetches a page because a ChatGPT user asked it to (plugins/actions/browsing), not for training." },
  { token: "OAI-SearchBot", operator: "OpenAI", purpose: "search-retrieval", note: "Crawls to build and serve ChatGPT's search results." },
  { token: "ClaudeBot", operator: "Anthropic", purpose: "training", note: "Crawls to improve Anthropic's models." },
  { token: "Claude-User", operator: "Anthropic", purpose: "user-browsing", note: "Fetches a page because a Claude user's session asked it to." },
  { token: "Claude-SearchBot", operator: "Anthropic", purpose: "search-retrieval", note: "Crawls to build Claude's search/citation index." },
  { token: "Google-Extended", operator: "Google", purpose: "training", note: "Controls use of a site's content for Gemini and Vertex AI training/grounding, separate from Googlebot's search indexing." },
  { token: "Applebot-Extended", operator: "Apple", purpose: "training", note: "Controls use of a site's content for Apple Intelligence training, separate from Applebot's Siri/Spotlight indexing." },
  { token: "CCBot", operator: "Common Crawl Foundation", purpose: "training", note: "A general-purpose web archive; its corpus is a widely used input to third-party model training, not just Common Crawl's own use." },
  { token: "PerplexityBot", operator: "Perplexity", purpose: "search-retrieval", note: "Crawls to build Perplexity's answer/search index." },
  { token: "Perplexity-User", operator: "Perplexity", purpose: "user-browsing", note: "Fetches a page because a Perplexity user's query asked it to." },
  { token: "Bytespider", operator: "ByteDance", purpose: "training", note: "Associated with ByteDance's AI and content products." },
  { token: "Amazonbot", operator: "Amazon", purpose: "training", note: "Amazon's crawler; stated uses include improving Amazon products and services, including AI features." },
  { token: "Meta-ExternalAgent", operator: "Meta", purpose: "training", note: "Crawls for Meta's AI model training and search features." },
  { token: "Meta-ExternalFetcher", operator: "Meta", purpose: "user-browsing", note: "Fetches a page because a Meta AI user's request asked it to; Meta documents that it may not honor robots.txt since the fetch is user-initiated." },
  { token: "Diffbot", operator: "Diffbot", purpose: "training", note: "Commercial web-extraction crawler; its structured data is resold as a data feed, including for AI training." },
  { token: "DuckAssistBot", operator: "DuckDuckGo", purpose: "search-retrieval", note: "Fetches pages to produce cited answers in DuckDuckGo's AI-assisted answers; DuckDuckGo states it is not used for model training." },
  { token: "MistralAI-User", operator: "Mistral AI", purpose: "user-browsing", note: "Fetches a page because a Le Chat user's request asked it to, not for training." },
  { token: "FacebookBot", operator: "Meta", purpose: "training", note: "Meta's crawler that Meta documents as improving language models for speech recognition; separate from Meta-ExternalAgent." },
  { token: "Google-CloudVertexBot", operator: "Google", purpose: "user-browsing", note: "Crawls at the request of a site owner who is building a Vertex AI agent over their own site; not a general-purpose crawler." },
];

// Google accepts these misspellings of the three keys (robots.cc,
// kAllowFrequentTypos). Keys are matched by prefix, case-insensitively.
const KEY_PREFIXES = [
  ["user-agent", "user-agent"], ["useragent", "user-agent"], ["user agent", "user-agent"],
  ["allow", "allow"],
  ["disallow", "disallow"], ["dissallow", "disallow"], ["dissalow", "disallow"],
  ["disalow", "disallow"], ["diasllow", "disallow"], ["disallaw", "disallow"],
  ["sitemap", "sitemap"], ["site-map", "sitemap"],
];

function keyType(key) {
  const lower = key.toLowerCase();
  for (const [prefix, type] of KEY_PREFIXES) if (lower.startsWith(prefix)) return type;
  return null;
}

// Google ignores everything past 8 * 2083 bytes on one line.
const MAX_LINE_BYTES = 2083 * 8 - 1;
const utf8 = new TextEncoder();

function clipLine(line) {
  if (line.length * 3 <= MAX_LINE_BYTES) return line;
  const bytes = utf8.encode(line);
  if (bytes.length <= MAX_LINE_BYTES) return line;
  return new TextDecoder().decode(bytes.slice(0, MAX_LINE_BYTES)).replace(/�$/, "");
}

// Split one line into [key, value], or null when it holds no directive.
// Rules look like `key: value`; with no colon Google still accepts
// `key value` when the line is exactly two words ("disallow /").
function keyValue(raw) {
  const hash = raw.indexOf("#");
  const line = (hash === -1 ? raw : raw.slice(0, hash)).trim();
  if (!line) return null;
  let sep = line.indexOf(":");
  if (sep === -1) {
    const m = /^(\S+)[ \t]+(\S+)$/.exec(line);
    if (!m) return null;
    return [m[1], m[2]];
  }
  const key = line.slice(0, sep).trim();
  if (!key) return null;
  return [key, line.slice(sep + 1).trim()];
}

/**
 * Percent-encode what RFC 9309 says must be encoded before comparison:
 * octets outside US-ASCII become %XX, and existing escapes are upper-cased
 * (%2f -> %2F), as Google's MaybeEscapePattern does for Allow/Disallow values.
 */
export function escapePattern(value) {
  let out = "";
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (c === "%" && /^[0-9A-Fa-f]{2}$/.test(value.slice(i + 1, i + 3))) {
      out += "%" + value.slice(i + 1, i + 3).toUpperCase();
      i += 2;
    } else if (value.charCodeAt(i) > 0x7f) {
      const cp = value.codePointAt(i);
      const ch = String.fromCodePoint(cp);
      for (const b of utf8.encode(ch)) out += "%" + b.toString(16).toUpperCase().padStart(2, "0");
      i += ch.length - 1;
    } else {
      out += c;
    }
  }
  return out;
}

/** The product token a crawler compares: the leading [A-Za-z_-] run ("CCBot/2.0" -> "CCBot"). */
export function productToken(value) {
  return /^[A-Za-z_-]*/.exec(value)[0];
}

function isGlobalAgent(value) {
  // Google: "*" alone, or "*" followed by whitespace and anything, is the global group.
  return value === "*" || /^\*\s/.test(value);
}

/**
 * Parse robots.txt into groups. Each record is one group as written:
 * `{ agents, rules, line }`, rules `{ allow, pattern, line }` with the
 * pattern percent-encoded. Rules before any User-agent line are dropped,
 * and a group is closed only by a User-agent line after a rule (Sitemap and
 * unknown lines do not close it). Empty Allow/Disallow values are dropped:
 * they match nothing.
 */
export function parseRobotsTxt(text) {
  const body = String(text ?? "").replace(/^\uFEFF/, "");
  const lines = body.split(/\r\n|\r|\n/);
  const records = [];
  const sitemaps = [];
  let current = null; // the group User-agent lines are being added to
  let sawRule = false;

  lines.forEach((raw, i) => {
    const kv = keyValue(clipLine(raw));
    if (!kv) return;
    const type = keyType(kv[0]);
    const value = kv[1];
    const line = i + 1;
    if (type === "user-agent") {
      if (!current || sawRule) {
        current = { agents: [], rules: [], line };
        records.push(current);
        sawRule = false;
      }
      current.agents.push(value);
    } else if (type === "allow" || type === "disallow") {
      if (!current) return; // a rule with no preceding User-agent belongs to no group
      sawRule = true;
      if (value === "") return; // an empty pattern matches nothing
      current.rules.push({ allow: type === "allow", pattern: escapePattern(value), line });
    } else if (type === "sitemap") {
      if (value) sitemaps.push(value);
    }
  });

  return { records, sitemaps };
}

/**
 * Google's matcher (RobotsMatchStrategy::Matches): `*` is any run of
 * characters, a trailing `$` anchors the end, anything else is literal.
 * Linear in path length times pattern length, with no regular expression,
 * so a pasted pattern full of `*` cannot make it backtrack.
 */
export function pathMatchesPattern(path, pattern) {
  const n = path.length;
  let pos = [0];
  for (let k = 0; k < pattern.length; k++) {
    const c = pattern[k];
    if (c === "$" && k === pattern.length - 1) return pos[pos.length - 1] === n;
    if (c === "*") {
      const from = pos[0];
      pos = [];
      for (let p = from; p <= n; p++) pos.push(p);
    } else {
      const next = [];
      for (const p of pos) if (p < n && path[p] === c) next.push(p + 1);
      if (!next.length) return false;
      pos = next;
    }
  }
  return true;
}

/**
 * The path a crawler compares: what follows scheme and host, without the
 * fragment, starting with "/". A bare path is kept as is. Characters outside
 * US-ASCII are percent-encoded, as a crawler's request line would carry them.
 */
export function pathOf(urlOrPath) {
  const url = String(urlOrPath ?? "");
  let start = url.startsWith("//") ? 2 : 0;
  const early = url.slice(start).search(/[/?;]/);
  let proto = url.indexOf("://", start);
  if (early !== -1 && early + start < proto) proto = -1;
  start = proto === -1 ? start : proto + 3;
  const rest = url.slice(start);
  const p = rest.search(/[/?;]/);
  if (p === -1) return "/";
  const hash = url.indexOf("#", url.startsWith("//") ? 2 : 0);
  if (hash !== -1 && hash < start + p) return "/";
  let out = url.slice(start + p, hash === -1 ? url.length : hash);
  if (out[0] !== "/") out = "/" + out;
  return out.replace(/[^\x00-\x7f]/gu, (ch) => [...utf8.encode(ch)].map((b) => "%" + b.toString(16).toUpperCase().padStart(2, "0")).join(""));
}

function groupsFor(records, token) {
  const lower = token.toLowerCase();
  const named = records.filter((r) => r.agents.some((a) => !isGlobalAgent(a) && productToken(a).toLowerCase() === lower && lower !== ""));
  if (named.length) return { groups: named, matchedAs: "named" };
  const wildcard = records.filter((r) => r.agents.some(isGlobalAgent));
  if (wildcard.length) return { groups: wildcard, matchedAs: "wildcard" };
  return { groups: [], matchedAs: "none" };
}

// Score one rule against a path: the pattern's length when it matches, else -1.
// Google's "index.html" leniency: `Allow: /dir/index.html` also allows `/dir/`.
function score(rule, path) {
  if (pathMatchesPattern(path, rule.pattern)) return rule.pattern.length;
  if (rule.allow) {
    const slash = rule.pattern.lastIndexOf("/");
    if (slash !== -1 && rule.pattern.slice(slash).startsWith("/index.htm")) {
      const dir = rule.pattern.slice(0, slash + 1) + "$";
      if (pathMatchesPattern(path, dir)) return dir.length;
    }
  }
  return -1;
}

/**
 * @param {Array} records  from parseRobotsTxt
 * @param {string} token   the crawler's product token, e.g. "GPTBot"
 * @param {string} path    a path ("/a/b?q") or a full URL
 * @returns {{allowed: boolean, matchedAs: 'named'|'wildcard'|'none', matchedRule: object|null, groupLines: number[]}}
 */
export function isAllowed(records, token, path = "/") {
  const target = pathOf(path);
  const { groups, matchedAs } = groupsFor(records, token);
  const groupLines = groups.map((g) => g.line);
  // RFC 9309 section 2.2.2: /robots.txt itself is implicitly allowed.
  if (target === "/robots.txt") return { allowed: true, matchedAs, matchedRule: null, groupLines };
  let best = { allow: null, disallow: null };
  for (const g of groups) {
    for (const r of g.rules) {
      const s = score(r, target);
      if (s <= 0) continue;
      const slot = r.allow ? "allow" : "disallow";
      if (!best[slot] || s > best[slot].s) best[slot] = { s, r };
    }
  }
  const a = best.allow?.s ?? 0;
  const d = best.disallow?.s ?? 0;
  if (!a && !d) return { allowed: true, matchedAs, matchedRule: null, groupLines };
  const allowed = d <= a; // longest wins; a tie goes to Allow
  return { allowed, matchedAs, matchedRule: (allowed ? best.allow : best.disallow).r, groupLines };
}

/**
 * Audits every known bot against one or more paths.
 * @param {string} robotsText
 * @param {string[]} paths
 */
export function auditRobots(robotsText, paths = ["/"]) {
  const { records, sitemaps } = parseRobotsTxt(robotsText);
  const rows = KNOWN_BOTS.map((bot) => {
    const results = paths.map((path) => ({ path, ...isAllowed(records, bot.token, path) }));
    const blockedPaths = results.filter((r) => !r.allowed);
    let status;
    if (blockedPaths.length === 0) status = "allowed";
    else if (blockedPaths.length === results.length) status = "blocked";
    else status = "partially-blocked";
    return { ...bot, results, status };
  });
  return { rows, sitemaps, recordCount: records.length };
}

// --- llms.txt (llmstxt.org convention) structural check -------------------
//
// This is a structural sanity check, not a spec-conformance certifier: it
// looks for the shape the convention describes (an H1 title, an optional
// blockquote summary, and Markdown link sections) and flags what's missing.

export function validateLlmsTxt(text) {
  const raw = String(text ?? "");
  const lines = raw.split(/\r?\n/);
  const nonBlank = lines.map((l, i) => ({ line: l, i })).filter((l) => l.line.trim() !== "");

  const errors = [];
  const warnings = [];

  if (!nonBlank.length) {
    errors.push("File is empty.");
    return { valid: false, errors, warnings, hasTitle: false, hasSummary: false, linkCount: 0, sectionCount: 0 };
  }

  const first = nonBlank[0].line.trim();
  const hasTitle = /^#\s+\S/.test(first);
  if (!hasTitle) errors.push("First non-blank line should be an H1 title (\"# Your Site Name\").");

  const hasSummary = nonBlank.slice(1, 3).some((l) => /^>\s*\S/.test(l.line.trim()));
  if (!hasSummary) warnings.push("No blockquote summary (\"> One-line description\") found right after the title. Recommended, not required.");

  const sectionHeadings = lines.filter((l) => /^##\s+\S/.test(l.trim()));
  const linkMatches = raw.match(/\[[^\]]+\]\([^)]+\)/g) || [];

  if (sectionHeadings.length === 0) warnings.push("No \"## Section\" headings found. The convention groups links under H2 sections (e.g. \"## Docs\").");
  if (linkMatches.length === 0) errors.push("No Markdown links (\"[title](url)\") found anywhere. Link sections are the whole point of llms.txt.");

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    hasTitle,
    hasSummary,
    sectionCount: sectionHeadings.length,
    linkCount: linkMatches.length,
  };
}
