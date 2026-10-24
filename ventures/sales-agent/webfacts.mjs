// Sales Agent, milestone 6b: public-page facts. For each account with a website in the CRM export it reads the home page
// (and nothing else) if, and only if, the site's robots.txt allows it, and returns a few facts a person can check: the
// page title, the meta description and the page URL. It never logs in, follows no links, reads no social network, and
// guesses no email address. The fetch function is injected so tests run offline and a deployer can swap in their own.
const UA = "SalesAgentBot";

/** Parse robots.txt into the rules for our agent (falling back to "*"): { allow: [], disallow: [] }. */
export function parseRobots(text) {
  const groups = [];
  let cur = null, lastWasAgent = false;
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) { if (!line) lastWasAgent = false; continue; }
    const k = m[1].toLowerCase(), v = m[2].trim();
    if (k === "user-agent") {
      if (!lastWasAgent || !cur) { cur = { agents: [], allow: [], disallow: [] }; groups.push(cur); }
      cur.agents.push(v.toLowerCase());
      lastWasAgent = true;
    } else {
      lastWasAgent = false;
      if (cur && k === "allow" && v) cur.allow.push(v);
      if (cur && k === "disallow") cur.disallow.push(v);
    }
  }
  const mine = groups.filter((g) => g.agents.some((a) => a !== "*" && UA.toLowerCase().includes(a)));
  const pick = mine.length ? mine : groups.filter((g) => g.agents.includes("*"));
  return { allow: pick.flatMap((g) => g.allow), disallow: pick.flatMap((g) => g.disallow) };
}

const toRe = (p) => new RegExp("^" + p.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$"));

/** Longest matching rule wins; Allow wins a tie; an empty Disallow allows everything. */
export function robotsAllows(rules, path) {
  let best = { len: -1, allow: true };
  for (const p of rules.disallow) if (p && toRe(p).test(path) && p.length > best.len) best = { len: p.length, allow: false };
  for (const p of rules.allow) if (toRe(p).test(path) && p.length >= best.len) best = { len: p.length, allow: true };
  return best.allow;
}

const decode = (s) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();

/** Title and meta description from HTML, nothing else. */
export function extractFacts(html) {
  const h = String(html || "").slice(0, 200000);
  const title = (h.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1];
  let desc;
  for (const tag of h.match(/<meta\b[^>]*>/gi) || []) {
    if (/\b(?:name|property)\s*=\s*["'](?:description|og:description)["']/i.test(tag)) { const c = tag.match(/\bcontent\s*=\s*"([^"]*)"|\bcontent\s*=\s*'([^']*)'/i); if (c) { desc = c[1] ?? c[2]; break; } }
  }
  return { title: title ? decode(title).slice(0, 160) : "", description: desc ? decode(desc).slice(0, 300) : "" };
}

/** Normalise a CRM "website" cell to an https origin, or null. */
export function originOf(site) {
  const s = String(site || "").trim();
  if (!s) return null;
  try { const u = new URL(/^https?:\/\//i.test(s) ? s : "https://" + s); return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(u.hostname) ? `https://${u.hostname}` : null; } catch { return null; }
}

/**
 * Read one site's home page if robots.txt allows. fetchText(url) must resolve { status, text } and may throw.
 * Returns { ok, origin, title, description, note } where note explains every refusal.
 */
export async function readSite(site, fetchText) {
  const origin = originOf(site);
  if (!origin) return { ok: false, origin: null, title: "", description: "", note: "no usable website in the export" };
  try {
    const r = await fetchText(origin + "/robots.txt");
    if (r.status === 401 || r.status === 403) return { ok: false, origin, title: "", description: "", note: `robots.txt returned ${r.status}: treated as closed` };
    if (r.status === 200 && !robotsAllows(parseRobots(r.text), "/")) return { ok: false, origin, title: "", description: "", note: "robots.txt disallows the home page: not read" };
    const p = await fetchText(origin + "/");
    if (p.status !== 200) return { ok: false, origin, title: "", description: "", note: `home page returned ${p.status}` };
    const f = extractFacts(p.text);
    if (!f.title && !f.description) return { ok: false, origin, ...f, note: "home page has no title or description" };
    return { ok: true, origin, ...f, note: "" };
  } catch (e) {
    return { ok: false, origin, title: "", description: "", note: `fetch failed: ${e.message}` };
  }
}

/** A fetch for the CLI: plain GET, 10 s timeout, 300 kB cap, identifies itself. Redirects stay on the same host. */
export async function liveFetch(url) {
  const res = await fetch(url, { headers: { "user-agent": `${UA}/1.0 (+self-hosted sales agent; reads robots.txt)` }, signal: AbortSignal.timeout(10000), redirect: "follow" });
  if (new URL(res.url).hostname.replace(/^www\./, "") !== new URL(url).hostname.replace(/^www\./, "")) return { status: 0, text: "" };
  return { status: res.status, text: (await res.text()).slice(0, 300000) };
}

/** Add `web` facts to ranked accounts (from runResearch). sites: Map company-key -> website is read from account.website. */
export async function enrich(accounts, fetchText, { gapMs = 0 } = {}) {
  const seen = new Map();
  for (const a of accounts) {
    const key = originOf(a.website) || "";
    if (!seen.has(key)) { seen.set(key, await readSite(a.website, fetchText)); if (gapMs) await new Promise((r) => setTimeout(r, gapMs)); }
    a.web = seen.get(key);
  }
  return accounts;
}
