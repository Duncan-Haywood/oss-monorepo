// robots.txt parsing and matching per RFC 9309 / Google's robots.txt spec.
// Pure functions (no I/O) so they can be unit-tested exhaustively.
//
//  - Groups start with one or more `user-agent` lines; a `user-agent` line after rules starts a new group.
//  - The crawler obeys the group(s) whose user-agent equals its product token (case-insensitive);
//    if none match, the `*` group(s). Multiple groups for the same agent are merged.
//  - The most specific (longest) matching pattern wins; on a tie, `allow` wins.
//  - Patterns support `*` (any sequence) and a trailing `$` (end of URL).
//  - Rules before the first user-agent line are ignored. Empty `disallow:` means "allow everything".

export interface RobotsRule {
  allow: boolean;
  pattern: string; // normalized (percent-encoding canonicalized)
}

export interface RobotsGroup {
  userAgents: string[]; // lower-cased product tokens, or "*"
  rules: RobotsRule[];
  crawlDelay: number | null; // seconds
}

export interface RobotsTxt {
  groups: RobotsGroup[];
  sitemaps: string[];
}

/** What a crawler should do for a host after fetching (or failing to fetch) robots.txt. */
export type RobotsPolicy =
  | { kind: "rules"; robots: RobotsTxt }
  | { kind: "allow_all" }
  | { kind: "disallow_all" };

/** Google ignores everything after the first 500 KiB. */
export const ROBOTS_MAX_BYTES = 500 * 1024;

const USER_AGENT_KEYS = new Set(["user-agent", "useragent", "user agent"]);
const ALLOW_KEYS = new Set(["allow"]);
const DISALLOW_KEYS = new Set([
  "disallow",
  "dissallow",
  "dissalow",
  "disalow",
  "diasllow",
  "disallaw",
]);
const CRAWL_DELAY_KEYS = new Set(["crawl-delay", "crawldelay", "crawl delay"]);
const SITEMAP_KEYS = new Set(["sitemap", "site-map"]);

/** Product token from a full user-agent string: "GrantAutopilotBot/0.1 (+...)" -> "grantautopilotbot". */
export function productToken(userAgent: string): string {
  const m = userAgent.trim().match(/^[A-Za-z_-]+/);
  return (m?.[0] ?? userAgent.trim()).toLowerCase();
}

export function parseRobotsTxt(input: string): RobotsTxt {
  let text = input.length > ROBOTS_MAX_BYTES ? input.slice(0, ROBOTS_MAX_BYTES) : input;
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // BOM
  const groups: RobotsGroup[] = [];
  const sitemaps: string[] = [];
  let current: RobotsGroup | null = null;
  let inAgentRun = false; // true while consecutive user-agent lines are being collected

  for (const rawLine of text.split(/\r\n|\r|\n/)) {
    const hash = rawLine.indexOf("#");
    const line = (hash >= 0 ? rawLine.slice(0, hash) : rawLine).trim();
    if (!line) continue;
    const colon = line.indexOf(":");
    let key: string;
    let value: string;
    if (colon >= 0) {
      key = line.slice(0, colon).trim().toLowerCase();
      value = line.slice(colon + 1).trim();
    } else {
      // Google tolerates a missing colon ("user-agent foo"): split on first whitespace.
      const m = line.match(/^(\S+)\s+(.*)$/);
      if (!m) continue;
      key = (m[1] ?? "").toLowerCase();
      value = (m[2] ?? "").trim();
    }

    if (USER_AGENT_KEYS.has(key)) {
      if (!current || !inAgentRun) {
        current = { userAgents: [], rules: [], crawlDelay: null };
        groups.push(current);
        inAgentRun = true;
      }
      const agent = value.startsWith("*") ? "*" : productToken(value);
      if (agent) current.userAgents.push(agent);
      continue;
    }
    if (SITEMAP_KEYS.has(key)) {
      if (value) sitemaps.push(value);
      continue; // sitemaps are global and do not end a user-agent run
    }
    if (ALLOW_KEYS.has(key) || DISALLOW_KEYS.has(key)) {
      inAgentRun = false;
      if (!current) continue; // rules before any user-agent are ignored
      if (!value) continue; // empty allow/disallow = no rule
      current.rules.push({ allow: ALLOW_KEYS.has(key), pattern: normalizePattern(value) });
      continue;
    }
    if (CRAWL_DELAY_KEYS.has(key)) {
      inAgentRun = false;
      if (!current) continue;
      const n = Number.parseFloat(value);
      if (Number.isFinite(n) && n >= 0) current.crawlDelay = n;
    }
    // Unknown keys are ignored.
  }
  return { groups, sitemaps };
}

/** Rules + crawl-delay that apply to `token` (merged across groups). null = no group applies. */
export function selectGroup(
  robots: RobotsTxt,
  token: string,
): { rules: RobotsRule[]; crawlDelay: number | null } | null {
  const t = productToken(token);
  const pick = (pred: (ua: string) => boolean) => {
    const matched = robots.groups.filter((g) => g.userAgents.some(pred));
    if (matched.length === 0) return null;
    const delays = matched.map((g) => g.crawlDelay).filter((d): d is number => d !== null);
    return {
      rules: matched.flatMap((g) => g.rules),
      crawlDelay: delays.length ? Math.max(...delays) : null,
    };
  };
  return pick((ua) => ua !== "*" && ua === t) ?? pick((ua) => ua === "*");
}

/** Is `pathAndQuery` (e.g. "/fish.php?id=1") allowed for `token`? /robots.txt is always allowed. */
export function isAllowed(robots: RobotsTxt, token: string, pathAndQuery: string): boolean {
  const path = normalizePath(pathAndQuery || "/");
  if (path === "/robots.txt") return true;
  const group = selectGroup(robots, token);
  if (!group) return true;
  let best: RobotsRule | null = null;
  for (const rule of group.rules) {
    if (!matchesPattern(path, rule.pattern)) continue;
    if (
      !best ||
      rule.pattern.length > best.pattern.length ||
      (rule.pattern.length === best.pattern.length && rule.allow && !best.allow)
    ) {
      best = rule;
    }
  }
  return best ? best.allow : true;
}

export function crawlDelaySeconds(robots: RobotsTxt, token: string): number | null {
  return selectGroup(robots, token)?.crawlDelay ?? null;
}

export function isAllowedByPolicy(policy: RobotsPolicy, token: string, pathAndQuery: string) {
  if (policy.kind === "allow_all") return true;
  if (policy.kind === "disallow_all") return normalizePath(pathAndQuery) === "/robots.txt";
  return isAllowed(policy.robots, token, pathAndQuery);
}

/**
 * Google's matcher (robots.cc): `*` matches any sequence, `$` at the end anchors. Linear in
 * |path| x |pattern| (no regex backtracking blow-ups on hostile patterns).
 */
export function matchesPattern(path: string, pattern: string): boolean {
  const pathLen = path.length;
  const pos: number[] = [0];
  let numPos = 1;
  for (let j = 0; j < pattern.length; j++) {
    const ch = pattern[j];
    if (ch === "$" && j + 1 === pattern.length) return pos[numPos - 1] === pathLen;
    if (ch === "*") {
      const start = pos[0] ?? 0;
      numPos = pathLen - start + 1;
      for (let i = 0; i < numPos; i++) pos[i] = start + i;
    } else {
      let next = 0;
      for (let i = 0; i < numPos; i++) {
        const p = pos[i] ?? 0;
        if (p < pathLen && path[p] === ch) pos[next++] = p + 1;
      }
      numPos = next;
      if (numPos === 0) return false;
    }
  }
  return true;
}

const UNRESERVED = /[A-Za-z0-9\-._~]/;

/** Canonical percent-encoding: encode non-ASCII/space, decode encoded unreserved chars, upper-case hex. */
function canonicalize(s: string): string {
  let out = "";
  for (const ch of s) {
    const code = ch.codePointAt(0) ?? 0;
    if (code > 0x7e || code <= 0x20) out += encodeURIComponent(ch);
    else out += ch;
  }
  return out.replace(/%([0-9a-fA-F]{2})/g, (_m, hex: string) => {
    const c = String.fromCharCode(Number.parseInt(hex, 16));
    return UNRESERVED.test(c) ? c : `%${hex.toUpperCase()}`;
  });
}

export function normalizePattern(p: string): string {
  const c = canonicalize(p);
  // Google treats a pattern not starting with "/" or "*" as if prefixed with "/".
  return c.startsWith("/") || c.startsWith("*") ? c : `/${c}`;
}

export function normalizePath(p: string): string {
  const c = canonicalize(p);
  return c.startsWith("/") ? c : `/${c}`;
}
