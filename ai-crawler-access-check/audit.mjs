// Deterministic robots.txt + llms.txt audit against a curated list of
// publicly documented AI-crawler user-agent tokens. No network call lives
// here -- this module only classifies text it is given, so the identical
// logic runs in the browser page (pasted text) and the Node CLI (fetched or
// read-from-disk text).
//
// The robots.txt matching implements the "longest matching rule wins, ties
// go to Allow" algorithm that Google publishes for its own crawlers (also
// followed by Bing and most other major crawlers) -- not a full RFC 9309
// parser. Percent-encoding normalisation, `Crawl-delay`, and multiple
// disjoint blocks for the same user-agent token are deliberately out of
// scope; see the README for exactly what is and isn't covered.

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

export function parseRobotsTxt(text) {
  const lines = String(text ?? "").split(/\r?\n/);
  const records = [];
  const sitemaps = [];
  let pendingAgents = [];
  let currentRules = null;

  const stripComment = (line) => {
    const idx = line.indexOf("#");
    return idx === -1 ? line : line.slice(0, idx);
  };

  for (const raw of lines) {
    const line = stripComment(raw).trim();
    if (!line) continue;
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const field = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();

    if (field === "user-agent") {
      if (currentRules) {
        // A rule already started for the running batch, so this User-agent
        // line begins a brand-new record rather than extending the old one.
        pendingAgents = [];
        currentRules = null;
      }
      pendingAgents.push(value);
    } else if (field === "allow" || field === "disallow") {
      if (!pendingAgents.length) continue; // a rule with no preceding User-agent is not valid
      if (!currentRules) {
        currentRules = [];
        records.push({ agents: pendingAgents.slice(), rules: currentRules });
      }
      if (field === "disallow" && value === "") continue; // empty Disallow means "block nothing"
      currentRules.push({ allow: field === "allow", pattern: value });
    } else if (field === "sitemap") {
      sitemaps.push(value);
    }
  }

  return { records, sitemaps };
}

function escapeForPattern(segment) {
  return segment.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
}

function pathMatchesPattern(path, pattern) {
  const anchored = pattern.endsWith("$");
  const core = anchored ? pattern.slice(0, -1) : pattern;
  const body = core.split("*").map(escapeForPattern).join(".*");
  const re = new RegExp(`^${body}${anchored ? "$" : ""}`);
  return re.test(path);
}

function findGroup(records, token) {
  const lower = token.toLowerCase();
  const named = records.find((r) => r.agents.some((a) => a.toLowerCase() === lower));
  if (named) return { group: named, matchedAs: "named" };
  const wildcard = records.find((r) => r.agents.some((a) => a === "*"));
  if (wildcard) return { group: wildcard, matchedAs: "wildcard" };
  return { group: null, matchedAs: "none" };
}

/**
 * @returns {{allowed: boolean, matchedAs: 'named'|'wildcard'|'none', matchedRule: object|null}}
 */
export function isAllowed(records, token, path = "/") {
  const { group, matchedAs } = findGroup(records, token);
  if (!group) return { allowed: true, matchedAs, matchedRule: null };

  const matching = group.rules.filter((r) => pathMatchesPattern(path, r.pattern));
  if (!matching.length) return { allowed: true, matchedAs, matchedRule: null };

  const topLength = Math.max(...matching.map((r) => r.pattern.length));
  const topMatches = matching.filter((r) => r.pattern.length === topLength);
  const allowed = topMatches.some((r) => r.allow);
  // Prefer showing a disallow rule when the decision is a block, an allow rule when it isn't.
  const matchedRule = topMatches.find((r) => r.allow === allowed) || topMatches[0];
  return { allowed, matchedAs, matchedRule };
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
