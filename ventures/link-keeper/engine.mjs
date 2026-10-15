// Link Keeper engine: short links, UTM tagging, privacy-friendly click stats.
// Pure functions over a plain-JSON state, so the browser page and the Node
// server run the same code. No node: imports here.

export const ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz"; // no 0/1/i/l/o
export const RESERVED = new Set(["admin", "api", "v1", "healthz", "robots.txt", "favicon.ico", "sitemap.xml", "index.html"]);
export const KEEP_DAYS = 400;
const DAY = 86_400_000;
const MAX_URL = 2048;

export const newState = () => ({ links: {}, seen: {} });
export const dayOf = (ms) => new Date(ms).toISOString().slice(0, 10);

/** Returns {ok:true,url} (normalised) or {ok:false,error}. http(s) only, no credentials in the URL. */
export function checkTarget(raw, { allowHosts } = {}) {
  if (typeof raw !== "string" || !raw.trim()) return { ok: false, error: "url is required" };
  if (raw.length > MAX_URL) return { ok: false, error: `url is longer than ${MAX_URL} characters` };
  let u;
  try { u = new URL(raw.trim()); } catch { return { ok: false, error: "url is not a valid absolute URL" }; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return { ok: false, error: "only http and https URLs can be shortened" };
  if (u.username || u.password) return { ok: false, error: "URLs with a username or password are refused" };
  if (allowHosts?.length) {
    const h = u.hostname.toLowerCase();
    if (!allowHosts.some((a) => h === a || h.endsWith("." + a))) return { ok: false, error: `host ${h} is not in ALLOW_HOSTS` };
  }
  return { ok: true, url: u.toString() };
}

export function checkSlug(s) {
  if (typeof s !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,62}$/.test(s)) return "slug must be 1-63 letters, digits, - or _, starting with a letter or digit";
  if (RESERVED.has(s.toLowerCase())) return `"${s}" is reserved`;
  return null;
}

/** Random slug from `rand()` (returns [0,1)); longer on repeated collision. */
export function randomSlug(state, rand = Math.random, len = 6) {
  for (let tries = 0; ; tries++) {
    const n = len + Math.floor(tries / 20);
    let s = "";
    for (let i = 0; i < n; i++) s += ALPHABET[Math.floor(rand() * ALPHABET.length)];
    if (!state.links[s.toLowerCase()] && !RESERVED.has(s)) return s;
  }
}

const UTM_KEYS = ["source", "medium", "campaign", "term", "content"];
/** Adds utm_* parameters to a URL, replacing existing utm values of the same name and keeping everything else. */
export function addUtm(url, utm = {}) {
  const u = new URL(url);
  for (const k of UTM_KEYS) {
    const v = utm[k] ?? utm["utm_" + k];
    if (v !== undefined && v !== null && String(v).trim() !== "") u.searchParams.set("utm_" + k, String(v).trim());
  }
  return u.toString();
}

export function createLink(state, input, now, { rand = Math.random, allowHosts } = {}) {
  const t = checkTarget(input.url, { allowHosts });
  if (!t.ok) throw Object.assign(new Error(t.error), { status: 400 });
  let target = t.url;
  if (input.utm && typeof input.utm === "object") target = addUtm(target, input.utm);
  const targets = {};
  for (const k of ["ios", "android"]) {
    if (input[k] == null || input[k] === "") continue;
    const c = checkTarget(input[k], { allowHosts });
    if (!c.ok) throw Object.assign(new Error(`${k}: ${c.error}`), { status: 400 });
    targets[k] = c.url;
  }
  let slug = input.slug;
  if (slug != null && slug !== "") {
    const bad = checkSlug(slug);
    if (bad) throw Object.assign(new Error(bad), { status: 400 });
    if (state.links[slug.toLowerCase()]) throw Object.assign(new Error(`slug "${slug}" is taken`), { status: 409 });
  } else slug = randomSlug(state, rand);
  let expiresAt = null;
  if (input.expiresAt != null && input.expiresAt !== "") {
    expiresAt = Date.parse(input.expiresAt);
    if (!Number.isFinite(expiresAt)) throw Object.assign(new Error("expiresAt must be an ISO date"), { status: 400 });
  }
  const maxClicks = input.maxClicks == null || input.maxClicks === "" ? null : Number(input.maxClicks);
  if (maxClicks !== null && (!Number.isInteger(maxClicks) || maxClicks < 1)) throw Object.assign(new Error("maxClicks must be a whole number of 1 or more"), { status: 400 });
  const tags = Array.isArray(input.tags) ? input.tags.map(String).map((s) => s.trim().slice(0, 40)).filter(Boolean).slice(0, 10) : [];
  const link = {
    slug, url: target, ...(Object.keys(targets).length ? { targets } : {}), title: input.title ? String(input.title).slice(0, 200) : "",
    tags, createdAt: now, expiresAt, maxClicks, archived: false, clicks: 0, daily: {},
  };
  state.links[slug.toLowerCase()] = link;
  return link;
}

const BOT_RE = /bot|crawl|spider|slurp|facebookexternalhit|embedly|preview|headless|python-requests|curl\/|wget|go-http-client|okhttp|java\/|node-fetch|axios|monitor|uptime|pingdom|lighthouse|slackbot|whatsapp|telegram|discord|linkedinbot|skype|vkshare|bingpreview/i;
/** Coarse classification from a User-Agent string. Never stored raw. */
export function parseUA(ua = "") {
  const s = String(ua);
  const bot = !s || BOT_RE.test(s);
  const os = /iPhone|iPad|iPod/.test(s) ? "ios" : /Android/.test(s) ? "android" : /Windows/.test(s) ? "windows" : /Mac OS X|Macintosh/.test(s) ? "macos" : /Linux|X11/.test(s) ? "linux" : "other";
  const device = os === "ios" ? (/iPad/.test(s) ? "tablet" : "mobile") : os === "android" ? (/Mobile/.test(s) ? "mobile" : "tablet") : "desktop";
  const browser = /Edg\//.test(s) ? "edge" : /OPR\/|Opera/.test(s) ? "opera" : /Firefox|FxiOS/.test(s) ? "firefox" : /Chrome|CriOS/.test(s) ? "chrome" : /Safari/.test(s) ? "safari" : "other";
  return { bot, os, device, browser };
}

/** Hostname of a referer, or "direct". Never keeps the path or query. */
export function refHost(referer) {
  if (!referer) return "direct";
  try { return new URL(referer).hostname.replace(/^www\./, "").toLowerCase() || "direct"; } catch { return "direct"; }
}

const bump = (o, k) => { o[k] = (o[k] || 0) + 1; };

/** Where should `slug` go right now? Pure: does not record a click. */
export function lookup(state, slug, ua, now) {
  const link = state.links[String(slug).toLowerCase()];
  if (!link) return { status: "missing" };
  if (link.archived) return { status: "gone", link, reason: "archived" };
  if (link.expiresAt != null && now >= link.expiresAt) return { status: "gone", link, reason: "expired" };
  if (link.maxClicks != null && link.clicks >= link.maxClicks) return { status: "gone", link, reason: "click limit reached" };
  const c = parseUA(ua);
  const to = (c.os === "ios" && link.targets?.ios) || (c.os === "android" && link.targets?.android) || link.url;
  return { status: "redirect", link, location: to, client: c };
}

/**
 * Records one click. `visitor` is any per-request string the caller wants
 * counted as one visitor (the server passes ip+ua); it is hashed with a
 * salt that is discarded at the end of the UTC day, so unique counts work
 * without keeping an address or a way to link a visitor across days.
 */
export function recordClick(state, link, { client, referer, country, visitor, hash, newSalt }, now) {
  const d = dayOf(now);
  const day = (link.daily[d] ||= { n: 0, bots: 0, unique: 0, ref: {}, device: {}, browser: {}, country: {} });
  if (client.bot) { day.bots++; return; }
  link.clicks++;
  day.n++;
  bump(day.ref, refHost(referer));
  bump(day.device, client.device);
  bump(day.browser, client.browser);
  if (country && /^[A-Za-z]{2}$/.test(country)) bump(day.country, country.toUpperCase());
  if (visitor && hash && newSalt) {
    if (state.seen.day !== d) state.seen = { day: d, salt: newSalt(), ids: {} };
    const h = hash(state.seen.salt, visitor);
    const key = link.slug.toLowerCase() + ":" + h;
    if (!state.seen.ids[key]) { state.seen.ids[key] = 1; day.unique++; }
  }
}

export function prune(state, now) {
  const cutoff = dayOf(now - KEEP_DAYS * DAY);
  for (const l of Object.values(state.links)) for (const d of Object.keys(l.daily)) if (d < cutoff) delete l.daily[d];
}

const addInto = (acc, o) => { for (const [k, v] of Object.entries(o || {})) acc[k] = (acc[k] || 0) + v; };
const top = (o, n = 10) => Object.entries(o).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n).map(([name, clicks]) => ({ name, clicks }));

/** Stats for one link over [from,to] day strings (inclusive), default last 30 days. */
export function stats(link, now, from, to) {
  to = to || dayOf(now);
  from = from || dayOf(now - 29 * DAY);
  const tot = { clicks: 0, bots: 0, uniqueVisitorDays: 0 }, ref = {}, device = {}, browser = {}, country = {}, byDay = [];
  for (let t = Date.parse(from); t <= Date.parse(to); t += DAY) {
    const d = dayOf(t), x = link.daily[d];
    byDay.push({ day: d, clicks: x?.n || 0 });
    if (!x) continue;
    tot.clicks += x.n; tot.bots += x.bots; tot.uniqueVisitorDays += x.unique;
    addInto(ref, x.ref); addInto(device, x.device); addInto(browser, x.browser); addInto(country, x.country);
  }
  return { slug: link.slug, url: link.url, from, to, ...tot, lifetimeClicks: link.clicks, referrers: top(ref), devices: top(device), browsers: top(browser), countries: top(country), byDay };
}

const q = (v) => { const s = String(v ?? ""); return /^[=+\-@\t\r]/.test(s) ? `"'${s.replace(/"/g, '""')}"` : /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
/** CSV of every link with its totals; cells that start with =,+,-,@ are neutralised for spreadsheet import. */
export function toCsv(state, now) {
  const rows = [["slug", "url", "title", "tags", "created", "expires", "clicks", "clicks_30d", "archived"]];
  for (const l of Object.values(state.links)) {
    const s = stats(l, now);
    rows.push([l.slug, l.url, l.title, l.tags.join(" "), new Date(l.createdAt).toISOString(), l.expiresAt ? new Date(l.expiresAt).toISOString() : "", l.clicks, s.clicks, l.archived]);
  }
  return rows.map((r) => r.map(q).join(",")).join("\n") + "\n";
}

/** For the browser page: turn pasted lines of "url[, slug]" into createLink inputs with UTM applied. */
export function planBatch(text, utm, rand = Math.random) {
  const out = [], taken = new Set();
  for (const raw of String(text).split("\n")) {
    const line = raw.trim(); if (!line) continue;
    const [url, slug] = line.split(/[,\t]/).map((s) => s.trim());
    const t = checkTarget(url);
    if (!t.ok) { out.push({ input: line, error: t.error }); continue; }
    let s = slug || "";
    if (s) { const bad = checkSlug(s); if (bad) { out.push({ input: line, error: bad }); continue; } if (taken.has(s.toLowerCase())) { out.push({ input: line, error: `slug "${s}" is used twice` }); continue; } }
    else s = randomSlug({ links: Object.fromEntries([...taken].map((k) => [k, 1])) }, rand);
    taken.add(s.toLowerCase());
    out.push({ input: line, slug: s, url: addUtm(t.url, utm || {}) });
  }
  return out;
}
