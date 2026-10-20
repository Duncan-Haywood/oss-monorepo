// Error grouping, regression and spike detection. Pure functions, no I/O, runs in a browser and in Node.
export const HOUR = 3_600_000, DAY = 24 * HOUR;
const MAX_ISSUES = 5000, MAX_SAMPLES = 5, KEEP_HOURS = 24 * 14, MAX_USERS = 200;

export const newState = () => ({ issues: {}, seen: {}, alerted: {} });

/** 53-bit string hash (cyrb53): enough to tell groups apart, nothing to do with security. */
export function hash(str) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) { const c = str.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, "0");
}

/** Numbers, ids, hex blobs, quoted values and URLs differ per event but not per bug; strip them so one bug is one group. */
export function normalizeMessage(msg) {
  return String(msg ?? "").slice(0, 2000)
    .replace(/https?:\/\/[^\s'")]+/g, "<url>")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "<uuid>")
    .replace(/\b0x[0-9a-f]+\b|\b[0-9a-f]{16,}\b/gi, "<hex>")
    .replace(/"[^"]{1,80}"|'[^']{1,80}'/g, "<str>")
    .replace(/\d+/g, "<n>").replace(/\s+/g, " ").trim();
}

/** Parses V8 ("at fn (file:1:2)") and Firefox/Safari ("fn@file:1:2") stack text into frames. Line numbers are kept for display, not for grouping. */
export function parseStack(stack) {
  const frames = [];
  for (const raw of String(stack ?? "").split("\n")) {
    const line = raw.trim(); let m;
    if ((m = line.match(/^at (?:async )?(.*?) \((.*):(\d+):(\d+)\)$/)) || (m = line.match(/^at ()(.*):(\d+):(\d+)$/))) frames.push(frame(m[1], m[2], m[3], m[4]));
    else if ((m = line.match(/^(.*?)@(.*):(\d+):(\d+)$/))) frames.push(frame(m[1], m[2], m[3], m[4]));
  }
  return frames;
}
const frame = (fn, file, line, col) => ({ fn: fn || "<anonymous>", file, line: +line, col: +col, inApp: !/node_modules|^node:|^internal\/|\/\(webpack\)|^native |extensions?:\/\//.test(file) });
const baseName = (file) => file.replace(/[?#].*$/, "").replace(/^.*[\\/]/, "").replace(/\.[0-9a-f]{6,}\./i, ".");

/** Group key: the error type plus the top three in-app frames (function and file name, never line numbers, so a deploy that shifts lines does not split a group) or, with no stack, the normalised message. */
export function fingerprint(ev) {
  if (Array.isArray(ev.fingerprint) && ev.fingerprint.length) return hash("custom|" + ev.fingerprint.map(String).join("|"));
  const frames = parseStack(ev.stack), app = frames.filter((f) => f.inApp), top = (app.length ? app : frames).slice(0, 3);
  const where = top.map((f) => `${f.fn}@${baseName(f.file)}`).join(">");
  return hash(`${ev.type || "Error"}|${where || normalizeMessage(ev.message)}`);
}

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, SECRET = /\b(?:Bearer\s+[A-Za-z0-9._~+/=-]{12,}|sk_(?:live|test)_[A-Za-z0-9]{10,}|gh[pousr]_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*)/g;
/** Error text and URLs often carry what the user typed. Mask emails, tokens and sensitive query values before anything is stored. */
export function scrub(s) {
  return String(s ?? "").replace(SECRET, "[token]").replace(EMAIL, "[email]")
    .replace(/([?&;](?:token|key|secret|password|passwd|auth|code|session|sig|signature|api_key|apikey)=)[^&#\s]+/gi, "$1[redacted]");
}

const bucket = (t) => Math.floor(t / HOUR);
const clip = (s, n) => String(s ?? "").slice(0, n);

/**
 * Records one event. Returns {issue, isNew, regressed, duplicate}. Callers alert on isNew / regressed.
 * An id makes a retried send harmless. Nothing here reads the clock: `now` is the server's.
 */
export function ingest(state, ev, now) {
  if (!ev || typeof ev !== "object" || (!ev.message && !ev.stack)) throw Object.assign(new Error("event needs a message or a stack"), { status: 400 });
  if (ev.id) { if (state.seen[ev.id]) return { duplicate: true }; state.seen[ev.id] = now; }
  const at = Number.isFinite(Date.parse(ev.timestamp)) && Date.parse(ev.timestamp) <= now + 5 * 60_000 ? Date.parse(ev.timestamp) : now;
  const project = clip(ev.project || "default", 60), release = ev.release ? clip(ev.release, 60) : null, env = clip(ev.environment || "production", 30);
  const key = hash(project + "|" + fingerprint(ev));
  let issue = state.issues[key], isNew = false, regressed = false;
  if (!issue) {
    isNew = true;
    if (Object.keys(state.issues).length >= MAX_ISSUES) prune(state, now, true);
    issue = state.issues[key] = { id: key, project, type: clip(ev.type || "Error", 80), title: clip(scrub(ev.message), 200), status: "unresolved", firstSeen: at, lastSeen: at, firstRelease: release, count: 0, users: [], userCount: 0, releases: {}, envs: {}, hours: {}, samples: [] };
  }
  if (issue.status === "resolved") {
    // Regression: it was marked fixed in a release and an event shows up from that release or a later one (or from any, when releases are not tracked).
    const fixed = issue.resolvedInRelease;
    if (!fixed || !release || release === fixed || newerThan(release, fixed)) { issue.status = "unresolved"; issue.regressedAt = at; regressed = true; }
  }
  issue.count++; issue.lastSeen = Math.max(issue.lastSeen, at); issue.firstSeen = Math.min(issue.firstSeen, at);
  if (release) { issue.releases[release] = (issue.releases[release] || 0) + 1; issue.lastRelease = release; }
  issue.envs[env] = (issue.envs[env] || 0) + 1;
  issue.hours[bucket(at)] = (issue.hours[bucket(at)] || 0) + 1;
  if (ev.user) { const u = hash(String(ev.user)); if (!issue.users.includes(u)) { issue.userCount++; if (issue.users.length < MAX_USERS) issue.users.push(u); } }
  issue.samples.unshift({ at, release, environment: env, url: clip(scrub(ev.url), 300), message: clip(scrub(ev.message), 500), stack: clip(scrub(ev.stack), 4000), tags: cleanTags(ev.tags) });
  issue.samples.length = Math.min(issue.samples.length, MAX_SAMPLES);
  return { issue, isNew, regressed, duplicate: false };
}
const cleanTags = (t) => Object.fromEntries(Object.entries(t && typeof t === "object" ? t : {}).slice(0, 10).map(([k, v]) => [clip(k, 30), clip(scrub(v), 80)]));

/** Dotted-number releases compare numerically ("1.10.0" > "1.9.2"); anything else compares as text, which is only right for date or zero-padded names. */
export function newerThan(a, b) {
  const pa = String(a).replace(/^v/i, "").split(/[.\-+]/), pb = String(b).replace(/^v/i, "").split(/[.\-+]/);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? "0", y = pb[i] ?? "0", nx = /^\d+$/.test(x), ny = /^\d+$/.test(y);
    if (nx && ny) { if (+x !== +y) return +x > +y; } else if (x !== y) return x > y;
  }
  return false;
}

export function resolve(state, id, release) { const i = need(state, id); i.status = "resolved"; i.resolvedAt = Date.now(); i.resolvedInRelease = release ? clip(release, 60) : null; delete i.regressedAt; return i; }
export function ignore(state, id) { need(state, id).status = "ignored"; return state.issues[id]; }
export function reopen(state, id) { const i = need(state, id); i.status = "unresolved"; return i; }
function need(state, id) { const i = state.issues[id]; if (!i) throw Object.assign(new Error("unknown issue"), { status: 404 }); return i; }

/**
 * Spike: the last hour holds at least `minCount` events and sits above the issue's own 24-hour baseline
 * (mean + 4 standard deviations of the hourly counts, never less than 3x the mean). Quiet new issues are
 * reported as new, not as spikes, so a spike always means "this got worse".
 */
export function spike(issue, now, minCount = 10) {
  const cur = bucket(now), last = issue.hours[cur] || 0;
  if (last < minCount) return null;
  const base = Array.from({ length: 24 }, (_, k) => issue.hours[cur - 1 - k] || 0), mean = base.reduce((a, b) => a + b, 0) / 24;
  const sd = Math.sqrt(base.reduce((a, b) => a + (b - mean) ** 2, 0) / 24), limit = Math.max(mean + 4 * sd, 3 * mean, minCount);
  return last > limit ? { last, baseline: Number(mean.toFixed(2)), limit: Number(limit.toFixed(1)) } : null;
}

/** Issues for the list view, worst first: unresolved before the rest, then by events in the last 24 hours, then by users. */
export function list(state, { project, status = "unresolved", now = Date.now(), limit = 50 } = {}) {
  const day = (i) => { const c = bucket(now); let n = 0; for (let k = 0; k < 24; k++) n += i.hours[c - k] || 0; return n; };
  return Object.values(state.issues).filter((i) => (!project || i.project === project) && (status === "all" || i.status === status))
    .map((i) => ({ id: i.id, project: i.project, type: i.type, title: i.title, status: i.status, count: i.count, last24h: day(i), users: i.userCount, firstSeen: new Date(i.firstSeen).toISOString(), lastSeen: new Date(i.lastSeen).toISOString(), firstRelease: i.firstRelease, lastRelease: i.lastRelease || null, regressed: Boolean(i.regressedAt), spiking: Boolean(spike(i, now)) }))
    .sort((a, b) => (b.spiking - a.spiking) || (b.last24h - a.last24h) || (b.users - a.users) || (b.count - a.count)).slice(0, limit);
}

/** What shipped with each release: how many errors, and which groups first appeared in it. */
export function releases(state, project) {
  const out = {};
  for (const i of Object.values(state.issues)) {
    if (project && i.project !== project) continue;
    for (const [r, n] of Object.entries(i.releases)) { const e = (out[r] ||= { release: r, events: 0, issues: 0, newIssues: 0 }); e.events += n; e.issues++; }
    if (i.firstRelease && out[i.firstRelease]) out[i.firstRelease].newIssues++;
  }
  return Object.values(out).sort((a, b) => (newerThan(b.release, a.release) ? 1 : -1));
}

/** Drops hourly buckets older than two weeks, old dedupe ids and, when full, the stalest resolved or ignored issues. */
export function prune(state, now, makeRoom = false) {
  const min = bucket(now) - KEEP_HOURS;
  for (const i of Object.values(state.issues)) for (const h of Object.keys(i.hours)) if (+h < min) delete i.hours[h];
  for (const [id, t] of Object.entries(state.seen)) if (now - t > 2 * DAY) delete state.seen[id];
  for (const [id, t] of Object.entries(state.alerted)) if (now - t > 7 * DAY) delete state.alerted[id];
  if (makeRoom) {
    const all = Object.values(state.issues).sort((a, b) => (a.status === "unresolved") - (b.status === "unresolved") || a.lastSeen - b.lastSeen);
    for (const i of all.slice(0, Math.ceil(MAX_ISSUES / 10))) delete state.issues[i.id];
  }
}
