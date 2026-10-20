// Cookie-free visit counting. Pure functions over one JSON state object; no I/O, no clock reads.
// A visitor is sha256(secret | UTC day | site | ip | user-agent). The IP and user-agent are never
// stored, and the secret plus the day in the hash mean a visitor cannot be followed across days.
import { createHash } from "node:crypto";

export const VISIT_GAP_MS = 30 * 60 * 1000;
export const LIMITS = { keysPerDimension: 500, visitorsPerSiteDay: 100_000, pagesPerVisitor: 50, pathLen: 200, valueMax: 1e9 };
export const newState = () => ({ v: 1, sites: {}, seen: {} });

export const dayKey = (ms) => new Date(ms).toISOString().slice(0, 10);
export const addDays = (key, n) => dayKey(Date.parse(`${key}T00:00:00Z`) + n * 86_400_000);

const BOT = /bot|crawl|spider|slurp|headless|phantom|lighthouse|preview|fetch|monitor|curl|wget|python|java\/|go-http|axios|node-|httpclient|scrapy|facebookexternalhit|embedly|pingdom|uptime/i;
export const isBot = (ua) => !ua || ua.length < 12 || BOT.test(ua);

export function parseUa(ua) {
  const u = String(ua || "");
  const browser = /Edg\//.test(u) ? "Edge" : /OPR\/|Opera/.test(u) ? "Opera" : /SamsungBrowser/.test(u) ? "Samsung Internet"
    : /Firefox\/|FxiOS/.test(u) ? "Firefox" : /Chrome\/|CriOS/.test(u) ? "Chrome" : /Safari\//.test(u) ? "Safari" : "Other";
  const os = /iPhone|iPad|iPod/.test(u) ? "iOS" : /Android/.test(u) ? "Android" : /Windows/.test(u) ? "Windows"
    : /Mac OS X|Macintosh/.test(u) ? "macOS" : /CrOS/.test(u) ? "ChromeOS" : /Linux/.test(u) ? "Linux" : "Other";
  const device = /iPad|Tablet/.test(u) || (/Android/.test(u) && !/Mobile/.test(u)) ? "Tablet" : /Mobi|iPhone|iPod/.test(u) ? "Mobile" : "Desktop";
  return { browser, os, device };
}

export const siteOf = (host) => String(host || "").toLowerCase().replace(/^www\./, "").replace(/:\d+$/, "");

export function visitorHash(secret, day, site, ip, ua) {
  return createHash("sha256").update(`${secret}\n${day}\n${site}\n${ip}\n${ua}`).digest("hex").slice(0, 16);
}

function cleanPath(pathname) {
  let p = String(pathname || "/");
  try { p = decodeURIComponent(p); } catch { /* keep raw */ }
  p = p.replace(/[\u0000-\u001f\u007f]/g, "");
  if (p.length > 1) p = p.replace(/\/+$/, "") || "/";
  return p.slice(0, LIMITS.pathLen) || "/";
}

// Where a visit came from: utm_source beats the referrer; a referrer from the site itself is ignored.
export function sourceOf(pageUrl, referrer, site) {
  const q = pageUrl.searchParams;
  const utm = { source: q.get("utm_source") || q.get("ref") || q.get("source") || "", medium: q.get("utm_medium") || "", campaign: q.get("utm_campaign") || "" };
  let refHost = "";
  try { if (referrer) refHost = siteOf(new URL(referrer).host); } catch { /* ignore bad referrers */ }
  if (refHost === site) refHost = "";
  const clip = (s) => s.slice(0, 80);
  const source = clip(utm.source.toLowerCase() || refHost || "(direct)");
  return { source, medium: clip(utm.medium.toLowerCase()), campaign: clip(utm.campaign.toLowerCase()), referrer: refHost };
}

function bump(map, key, by = 1) {
  if (!(key in map) && Object.keys(map).length >= LIMITS.keysPerDimension) key = "(other)";
  map[key] = (map[key] || 0) + by;
}
const bumpPage = (map, key, field) => {
  if (!(key in map) && Object.keys(map).length >= LIMITS.keysPerDimension) key = "(other)";
  const row = (map[key] ||= { v: 0, u: 0 });
  row[field]++;
};

const newDay = () => ({ views: 0, visitors: 0, visits: 0, bounces: 0, seconds: 0, pages: {}, entries: {}, sources: {}, mediums: {}, campaigns: {}, browsers: {}, os: {}, devices: {}, countries: {}, goals: {} });

// event: {site, name, url, referrer, value, hash, ua, country, now}. Returns "counted" or a reason it was dropped.
export function record(state, ev) {
  if (isBot(ev.ua)) return "bot";
  const site = siteOf(ev.site);
  let url;
  try { url = new URL(ev.url); } catch { return "bad-url"; }
  const day = dayKey(ev.now);
  const d = ((state.sites[site] ||= { days: {} }).days[day] ||= newDay());
  const seen = ((state.seen[day] ||= {})[site] ||= {});
  let vis = seen[ev.hash];
  const src = sourceOf(url, ev.referrer, site);

  if (!vis) {
    if (Object.keys(seen).length >= LIMITS.visitorsPerSiteDay) return "capacity";
    const { browser, os, device } = parseUa(ev.ua);
    vis = seen[ev.hash] = { t: ev.now, n: 0, src: src.source, pages: [], goals: [] };
    d.visitors++;
    bump(d.browsers, browser); bump(d.os, os); bump(d.devices, device);
    if (ev.country && /^[A-Za-z]{2}$/.test(ev.country) && ev.country.toUpperCase() !== "XX") bump(d.countries, ev.country.toUpperCase());
    vis.fresh = true;
  }

  if (ev.name === "pageview") {
    const path = cleanPath(url.pathname);
    const newVisit = vis.fresh || vis.n === 0 || ev.now - vis.t > VISIT_GAP_MS;
    if (newVisit) {
      d.visits++; d.bounces++;
      bump(d.entries, path);
      if (!vis.fresh) vis.src = src.source; // a returning visit the same day takes the source it arrived with
      bump(d.sources, src.source);
      if (src.medium) bump(d.mediums, src.medium);
      if (src.campaign) bump(d.campaigns, src.campaign);
      vis.n = 0;
    } else {
      if (vis.n === 1) d.bounces--; // the second page of a visit un-bounces it
      d.seconds += Math.round((ev.now - vis.t) / 1000);
    }
    vis.n++; vis.t = ev.now; delete vis.fresh;
    d.views++;
    bumpPage(d.pages, path, "v");
    if (!vis.pages.includes(path) && vis.pages.length < LIMITS.pagesPerVisitor) { vis.pages.push(path); bumpPage(d.pages, path, "u"); }
    return "counted";
  }

  // A goal. Counted once per visitor per day per name; value is summed for every call.
  const name = String(ev.name).slice(0, 60);
  const g = ((d.goals[name] ||= { n: 0, u: 0, value: 0, sources: {} }));
  g.n++;
  const value = Number(ev.value);
  if (Number.isFinite(value) && value > 0) g.value += Math.min(value, LIMITS.valueMax);
  if (!vis.goals.includes(name)) {
    vis.goals.push(name); g.u++;
    bump(g.sources, vis.fresh ? src.source : vis.src);
  }
  delete vis.fresh;
  vis.t = Math.max(vis.t, ev.now);
  return "counted";
}

// Drops the per-visitor scratch data once it can no longer be matched, and old day counters.
export function prune(state, now, retentionDays = 730) {
  const today = dayKey(now), yesterday = addDays(today, -1);
  for (const day of Object.keys(state.seen)) if (day < yesterday) delete state.seen[day];
  const cutoff = addDays(today, -retentionDays);
  for (const s of Object.values(state.sites)) for (const day of Object.keys(s.days)) if (day < cutoff) delete s.days[day];
}

const sum = (ds, f) => ds.reduce((a, d) => a + (d ? d[f] : 0), 0);
const merge = (ds, f) => { const out = {}; for (const d of ds) for (const [k, v] of Object.entries(d?.[f] || {})) out[k] = (out[k] || 0) + v; return out; };
const top = (obj, n = 10) => Object.entries(obj).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n).map(([name, count]) => ({ name, count }));

function totals(ds) {
  const visits = sum(ds, "visits");
  return {
    visitors: sum(ds, "visitors"), visits, views: sum(ds, "views"),
    bounceRate: visits ? sum(ds, "bounces") / visits : 0,
    // Seconds between pages within a visit. The last page of a visit has no end time, so this undercounts: it is the usual caveat of any tool that does not run a heartbeat.
    avgVisitSeconds: visits ? Math.round(sum(ds, "seconds") / visits) : 0,
    viewsPerVisit: visits ? sum(ds, "views") / visits : 0,
  };
}

// Sum of daily unique visitors; a person who comes on two days counts twice. Say so wherever it is shown.
export function summarize(state, site, days, now, topN = 10) {
  site = siteOf(site);
  const s = state.sites[site];
  const today = dayKey(now);
  const keys = Array.from({ length: days }, (_, i) => addDays(today, i - days + 1));
  const prevKeys = Array.from({ length: days }, (_, i) => addDays(today, i - 2 * days + 1));
  const ds = keys.map((k) => s?.days[k]);
  const prev = prevKeys.map((k) => s?.days[k]);
  const pages = {}, entries = merge(ds, "entries");
  for (const d of ds) for (const [p, r] of Object.entries(d?.pages || {})) { const x = (pages[p] ||= { v: 0, u: 0 }); x.v += r.v; x.u += r.u; }
  const goals = {};
  for (const d of ds) for (const [name, g] of Object.entries(d?.goals || {})) {
    const x = (goals[name] ||= { n: 0, u: 0, value: 0, sources: {} });
    x.n += g.n; x.u += g.u; x.value += g.value;
    for (const [k, v] of Object.entries(g.sources)) x.sources[k] = (x.sources[k] || 0) + v;
  }
  const total = totals(ds);
  const sources = merge(ds, "sources");
  const goalRows = Object.entries(goals).map(([name, g]) => ({
    name, events: g.n, visitors: g.u, value: Math.round(g.value * 100) / 100,
    conversionRate: total.visitors ? g.u / total.visitors : 0,
    // Conversions per visit that arrived from that source: the number that says which channel is worth feeding.
    bySource: Object.entries(g.sources).sort((a, b) => b[1] - a[1]).slice(0, topN).map(([source, conversions]) => ({ source, conversions, visits: sources[source] || 0, rate: sources[source] ? conversions / sources[source] : 0 })),
  })).sort((a, b) => b.visitors - a.visitors);
  const todayRow = s?.days[today];
  const live = Object.values(state.seen[today]?.[site] || {}).filter((v) => now - v.t <= 5 * 60_000).length;
  return {
    site, days, from: keys[0], to: today, live,
    totals: total, previous: totals(prev),
    series: keys.map((k, i) => ({ day: k, visitors: ds[i]?.visitors || 0, views: ds[i]?.views || 0 })),
    pages: Object.entries(pages).sort((a, b) => b[1].v - a[1].v).slice(0, topN).map(([name, r]) => ({ name, views: r.v, visitors: r.u })),
    entries: top(entries, topN), sources: top(sources, topN), mediums: top(merge(ds, "mediums"), topN), campaigns: top(merge(ds, "campaigns"), topN),
    browsers: top(merge(ds, "browsers"), topN), os: top(merge(ds, "os"), topN), devices: top(merge(ds, "devices"), topN), countries: top(merge(ds, "countries"), topN),
    goals: goalRows, hasData: Boolean(s) && ds.some(Boolean), todayViews: todayRow?.views || 0,
  };
}

export const toCsv = (summary) => ["day,visitors,views", ...summary.series.map((r) => `${r.day},${r.visitors},${r.views}`)].join("\n") + "\n";
