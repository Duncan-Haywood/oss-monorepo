// On-call load analysis from an incident export (CSV): who is carrying the pager, how
// many pages cost someone sleep, which alerts are noise, and how much of the load a
// cleanup would remove. Pure functions, no DOM, no network.

const ALIASES = {
  time: ["created_at", "created_on", "created", "triggered_at", "trigger_time", "started_at", "start_time", "opened_at", "timestamp", "time"],
  resolved: ["resolved_at", "resolved_on", "resolved", "resolve_time", "ended_at", "end_time", "closed_at"],
  service: ["service", "service_name", "service_id", "team", "component"],
  person: ["assigned_to", "assignee", "responder", "user", "acknowledged_by", "resolved_by", "responders", "owner", "on_call"],
  urgency: ["urgency", "priority", "severity"],
  title: ["title", "description", "summary", "alert", "alert_name", "name", "incident"],
};

export function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  const src = String(text ?? "").replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') { if (src[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows;
}

// Instant in ms since epoch, or null. A timestamp with no zone is read as UTC.
export function parseTime(v) {
  const s = String(v ?? "").trim();
  if (!s) return null;
  if (/^\d{10}(\.\d+)?$/.test(s)) return Math.round(Number(s) * 1000);
  if (/^\d{13}$/.test(s)) return Number(s);
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?\s*(Z|UTC|[+-]\d{2}:?\d{2})?$/i.exec(s);
  if (!m) return null;
  const [, y, mo, d, h = "0", mi = "0", se = "0", z] = m;
  let t = Date.UTC(+y, +mo - 1, +d, +h, +mi, +se);
  if (Number.isNaN(t) || +mo > 12 || +d > 31 || +h > 23 || +mi > 59) return null;
  if (z && !/^(z|utc)$/i.test(z)) {
    const sign = z[0] === "-" ? -1 : 1;
    const digits = z.slice(1).replace(":", "");
    t -= sign * (+digits.slice(0, 2) * 60 + +digits.slice(2)) * 60000;
  }
  return t;
}

const HEADER_KEY = (h) => String(h).trim().toLowerCase().replace(/[\s-]+/g, "_");

export function normalizeRows(table) {
  if (!table.length) return { error: "No rows found. Paste the CSV text including its header row.", incidents: [], skipped: [] };
  const header = table[0].map(HEADER_KEY);
  const idx = {};
  for (const [k, names] of Object.entries(ALIASES)) idx[k] = header.findIndex((h) => names.includes(h));
  if (idx.time < 0) return { error: `No timestamp column. Expected one of: ${ALIASES.time.slice(0, 5).join(", ")}. Found: ${header.join(", ")}.`, incidents: [], skipped: [] };
  if (idx.person < 0) return { error: `No responder column. Expected one of: ${ALIASES.person.slice(0, 5).join(", ")}. Found: ${header.join(", ")}.`, incidents: [], skipped: [] };
  const incidents = [], skipped = [];
  table.slice(1).forEach((r, n) => {
    const line = n + 2;
    const t = parseTime(r[idx.time]);
    if (t === null) { skipped.push({ line, reason: "unreadable timestamp" }); return; }
    const person = String(r[idx.person] ?? "").split(/[;|]/)[0].trim();
    if (!person) { skipped.push({ line, reason: "no responder" }); return; }
    const rt = idx.resolved >= 0 ? parseTime(r[idx.resolved]) : null;
    const urg = idx.urgency >= 0 ? String(r[idx.urgency] ?? "").trim().toLowerCase() : "";
    incidents.push({
      line, t, person,
      resolvedMin: rt !== null && rt >= t ? (rt - t) / 60000 : null,
      service: idx.service >= 0 ? String(r[idx.service] ?? "").trim() || "(none)" : "(none)",
      title: idx.title >= 0 ? String(r[idx.title] ?? "").trim() : "",
      high: ["high", "p1", "p2", "sev1", "sev2", "critical", "urgent", "1", "2"].includes(urg),
    });
  });
  if (!incidents.length) return { error: "No usable rows: every row was missing a timestamp or a responder.", incidents, skipped };
  return { error: null, incidents, skipped };
}

// Strip the parts of an alert title that change every time, so the same alert groups.
export function fingerprint(title) {
  return String(title ?? "").toLowerCase()
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, "<id>")
    .replace(/\b\d{1,3}(\.\d{1,3}){3}\b/g, "<ip>")
    .replace(/\b(i|ip|pod|host|node|vm)[-_][\w-]+/g, "$1-<x>")
    .replace(/\b0x[0-9a-f]+\b|\b[0-9a-f]{7,}\b/g, "<hex>")
    .replace(/\d+(\.\d+)?/g, "<n>")
    .replace(/\s+/g, " ").trim() || "(untitled)";
}

export const DEFAULTS = {
  tzOffsetHours: 0,
  nightStart: 22, // local hour a night page starts counting
  nightEnd: 7,
  flapMinutes: 5, // resolved this fast with no human work: probably self-healing
  dedupMinutes: 30, // the same alert again inside this window adds a page, not information
  minutesPerPage: 20, // focus lost per daytime page, an assumption you can change
  nightMinutesPerPage: 45, // recovery per sleep-interrupting page, an assumption
  overloadRatio: 1.5,
};

const WEIGHT = { business: 1, offHours: 2, night: 3 };

function local(t, tz) { return new Date(t + tz * 3600000); }
function kindOf(t, o) {
  const d = local(t, o.tzOffsetHours), h = d.getUTCHours(), wd = d.getUTCDay();
  const night = o.nightStart > o.nightEnd ? h >= o.nightStart || h < o.nightEnd : h >= o.nightStart && h < o.nightEnd;
  if (night) return "night";
  if (wd === 0 || wd === 6 || h < 9 || h >= 18) return "offHours";
  return "business";
}
// The night a page belongs to: the calendar date on which that night began.
function nightKey(t, o) {
  const d = local(t, o.tzOffsetHours);
  if (d.getUTCHours() < o.nightEnd) d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function gini(values) {
  const v = values.filter((x) => x >= 0).sort((a, b) => a - b);
  const n = v.length, sum = v.reduce((a, b) => a + b, 0);
  if (n < 2 || sum === 0) return 0;
  let acc = 0;
  v.forEach((x, i) => { acc += (2 * (i + 1) - n - 1) * x; });
  return acc / (n * sum);
}

const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

export function analyze(incidents, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const list = [...incidents].sort((a, b) => a.t - b.t || a.line - b.line);
  const lastSeen = new Map(); // fingerprint+service -> last page time
  const people = new Map(), alerts = new Map(), nights = new Map(), services = new Map();
  let first = Infinity, last = -Infinity;
  const get = (m, k, mk) => { if (!m.has(k)) m.set(k, mk()); return m.get(k); };

  for (const inc of list) {
    first = Math.min(first, inc.t); last = Math.max(last, inc.t);
    const kind = kindOf(inc.t, o);
    const fp = fingerprint(inc.title);
    const key = `${inc.service}\u0000${fp}`;
    const prev = lastSeen.get(key);
    const repeat = prev !== undefined && inc.t - prev <= o.dedupMinutes * 60000;
    lastSeen.set(key, inc.t);
    const flap = inc.resolvedMin !== null && inc.resolvedMin <= o.flapMinutes;
    // One page is avoidable once: a flap, else a repeat. The two never double count.
    const avoidable = flap ? "flap" : repeat ? "repeat" : null;
    inc.kind = kind; inc.avoidable = avoidable;

    const p = get(people, inc.person, () => ({ person: inc.person, pages: 0, night: 0, offHours: 0, business: 0, high: 0, weighted: 0, avoidable: 0, resolve: [] }));
    p.pages++; p[kind]++; p.weighted += WEIGHT[kind]; if (inc.high) p.high++; if (avoidable) p.avoidable++;
    if (inc.resolvedMin !== null) p.resolve.push(inc.resolvedMin);

    const a = get(alerts, key, () => ({ service: inc.service, fingerprint: fp, example: inc.title, pages: 0, night: 0, flaps: 0, repeats: 0, people: new Set() }));
    a.pages++; if (kind === "night") a.night++; if (avoidable === "flap") a.flaps++; if (avoidable === "repeat") a.repeats++; a.people.add(inc.person);

    const sv = get(services, inc.service, () => ({ service: inc.service, pages: 0, night: 0, avoidable: 0 }));
    sv.pages++; if (kind === "night") sv.night++; if (avoidable) sv.avoidable++;

    if (kind === "night") {
      const nk = nightKey(inc.t, o);
      const n = get(nights, nk, () => ({ night: nk, pages: 0, people: new Set() }));
      n.pages++; n.people.add(inc.person);
    }
  }

  const total = list.length;
  const n = people.size;
  const totalWeighted = [...people.values()].reduce((s, p) => s + p.weighted, 0);
  const fair = totalWeighted / n;
  const peopleOut = [...people.values()].map((p) => ({
    person: p.person, pages: p.pages, night: p.night, offHours: p.offHours, business: p.business, high: p.high,
    weighted: p.weighted, share: p.weighted / totalWeighted, ratio: fair ? p.weighted / fair : 0,
    medianResolveMin: median(p.resolve), avoidable: p.avoidable,
    overloaded: n > 1 && fair > 0 && p.weighted / fair >= o.overloadRatio,
  })).sort((a, b) => b.weighted - a.weighted || a.person.localeCompare(b.person));

  const alertOut = [...alerts.values()].map((a) => ({
    service: a.service, fingerprint: a.fingerprint, example: a.example, pages: a.pages, night: a.night,
    flaps: a.flaps, repeats: a.repeats, avoidable: a.flaps + a.repeats, people: a.people.size,
    avoidableShare: a.pages ? (a.flaps + a.repeats) / a.pages : 0,
  })).sort((x, y) => y.pages - x.pages || x.fingerprint.localeCompare(y.fingerprint));

  const nightsOut = [...nights.values()].sort((a, b) => a.night.localeCompare(b.night)).map((x) => ({ night: x.night, pages: x.pages, people: x.people.size }));
  const badNights = nightsOut.filter((x) => x.pages >= 3);
  // longest run of consecutive calendar nights with at least one page
  let streak = 0, run = 0, prev = null;
  for (const x of nightsOut) {
    const day = Date.parse(x.night + "T00:00:00Z");
    run = prev !== null && day - prev === 86400000 ? run + 1 : 1;
    streak = Math.max(streak, run); prev = day;
  }

  const kinds = { night: 0, offHours: 0, business: 0 };
  for (const i of list) kinds[i.kind]++;
  const avoidable = list.filter((i) => i.avoidable).length;
  const avoidableNight = list.filter((i) => i.avoidable && i.kind === "night").length;
  const spanDays = Math.max(1, Math.round((last - first) / 86400000) + 1);
  const minutes = (kinds.night * o.nightMinutesPerPage + (total - kinds.night) * o.minutesPerPage);
  const avoidMinutes = avoidableNight * o.nightMinutesPerPage + (avoidable - avoidableNight) * o.minutesPerPage;

  const summary = {
    pages: total, people: n, services: services.size, spanDays,
    perDay: total / spanDays, kinds, avoidable, avoidableShare: total ? avoidable / total : 0,
    nightShare: total ? kinds.night / total : 0,
    gini: gini(peopleOut.map((p) => p.weighted)),
    nightsWithPages: nightsOut.length, badNights: badNights.length, longestNightStreak: streak,
    hours: minutes / 60, avoidableHours: avoidMinutes / 60,
    from: new Date(first).toISOString().slice(0, 10), to: new Date(last).toISOString().slice(0, 10),
  };
  return {
    summary, people: peopleOut, alerts: alertOut, nights: nightsOut, badNights,
    services: [...services.values()].sort((a, b) => b.pages - a.pages || a.service.localeCompare(b.service)),
    advice: advise(summary, peopleOut, alertOut, o), options: o,
  };
}

function advise(s, people, alerts, o) {
  const out = [];
  const top = alerts[0];
  const noisy = alerts.filter((a) => a.avoidable >= 3).sort((x, y) => y.avoidable - x.avoidable).slice(0, 3);
  for (const a of noisy) {
    const parts = [a.flaps ? `${a.flaps} self-resolved within ${o.flapMinutes} min` : "", a.repeats ? `${a.repeats} repeated within ${o.dedupMinutes} min` : ""].filter(Boolean).join(" and ");
    out.push({ level: "high", text: `Fix or silence "${a.example || a.fingerprint}" on ${a.service}: ${a.avoidable} of its ${a.pages} pages were avoidable (${parts}). Add a for: duration, group the repeats, or make it a ticket instead of a page.` });
  }
  if (s.people > 1) {
    for (const p of people.filter((p) => p.overloaded)) out.push({ level: "high", text: `${p.person} carries ${(p.share * 100).toFixed(0)}% of the weighted load (${p.ratio.toFixed(1)}x an even split) with ${p.night} night page${p.night === 1 ? "" : "s"}. Rebalance the rotation or give them a recovery shift.` });
    const idle = people.filter((p) => p.weighted > 0 && p.ratio <= 0.4);
    if (idle.length && people.some((p) => p.overloaded)) out.push({ level: "info", text: `${idle.map((p) => p.person).join(", ")} ${idle.length === 1 ? "carries" : "carry"} under 40% of an even share. Check whether the rotation order or timezone coverage is the cause.` });
  }
  if (s.badNights) out.push({ level: "high", text: `${s.badNights} night${s.badNights === 1 ? "" : "s"} had three or more pages. Repeated broken sleep is a common driver of on-call burnout; review those nights first.` });
  if (s.longestNightStreak >= 4) out.push({ level: "medium", text: `The longest run of consecutive nights with a page was ${s.longestNightStreak}. Consider a handover rule when a shift reaches three paged nights in a row.` });
  if (s.nightShare >= 0.25) out.push({ level: "medium", text: `${(s.nightShare * 100).toFixed(0)}% of pages fall in the night window. If the team is in one timezone, a follow-the-sun or business-hours-only policy for low urgency alerts removes most of them.` });
  if (top && top.pages / s.pages >= 0.3) out.push({ level: "medium", text: `One alert on ${top.service} is ${(top.pages / s.pages * 100).toFixed(0)}% of all pages. Fixing that single alert changes the whole picture.` });
  if (!out.length) out.push({ level: "info", text: "Nothing crossed the thresholds. The load looks spread out and mostly actionable at these settings." });
  return out;
}

export function humanHours(h) { return h >= 100 ? `${Math.round(h)} h` : `${h.toFixed(1)} h`; }
export function humanMin(m) { return m === null || m === undefined ? "n/a" : m < 60 ? `${Math.round(m)} min` : `${(m / 60).toFixed(1)} h`; }

export function toCsv(people) {
  const esc = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  return ["person,pages,night,off_hours,business,high_urgency,weighted_load,share_of_load,vs_even_split,avoidable"]
    .concat(people.map((p) => [p.person, p.pages, p.night, p.offHours, p.business, p.high, p.weighted, p.share.toFixed(3), p.ratio.toFixed(2), p.avoidable].map(esc).join(","))).join("\n");
}

// A deterministic synthetic team: six weeks, five people, one noisy alert, one flapping alert.
export function sampleCsv() {
  const head = "created_at,resolved_at,service,assigned_to,urgency,title";
  const rows = [];
  const people = ["Priya", "Marcus", "Dana", "Leo", "Sam"];
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const base = Date.UTC(2026, 8, 1);
  const iso = (t) => new Date(t).toISOString().replace(".000Z", "Z");
  for (let day = 0; day < 42; day++) {
    const owner = people[Math.floor(day / 7) % 5];
    const other = people[(Math.floor(day / 7) + 2) % 5];
    const add = (hour, min, service, who, urg, title, dur) => {
      const t = base + day * 86400000 + (hour * 60 + min) * 60000;
      rows.push([iso(t), iso(t + dur * 60000), service, who, urg, `"${title}"`].join(","));
    };
    if (rnd() < 0.8) add(10 + Math.floor(rnd() * 6), 12, "checkout-api", owner, "high", "p99 latency above 800ms on checkout-api", 25 + Math.floor(rnd() * 40));
    // the noisy one: Priya's weeks get most of the night pages
    const burst = owner === "Priya" ? 3 : 1;
    for (let k = 0; k < burst; k++) if (rnd() < (owner === "Priya" ? 0.6 : 0.12)) add(1 + k, 10 + k * 7, "queue-worker", owner, "low", `Disk usage above 85% on host i-${Math.floor(rnd() * 90000 + 10000)}`, 2 + Math.floor(rnd() * 3));
    if (rnd() < 0.5) add(3, 40, "payments", owner, "high", "Error rate above 2% for payments", 35 + Math.floor(rnd() * 50));
    if (rnd() < 0.7) add(14, 5, "search", other, "low", `Elasticsearch yellow cluster status node ${Math.floor(rnd() * 9)}`, 4);
    if (day % 6 === 0) add(23, 30, "auth", owner, "high", "Login failures above 5%", 50);
  }
  return [head, ...rows].join("\n");
}
