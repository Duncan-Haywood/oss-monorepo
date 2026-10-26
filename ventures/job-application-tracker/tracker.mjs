// Job application tracker core. Pure functions over plain objects so the page
// is a thin shell and every rule here is testable. Dates are ISO "YYYY-MM-DD"
// strings; "today" is always passed in, never read from the clock.

export const STATUSES = ["wishlist", "applied", "screen", "interview", "offer", "rejected", "ghosted", "withdrawn"];
const OPEN = new Set(["wishlist", "applied", "screen", "interview", "offer"]);
const RESPONDED = new Set(["screen", "interview", "offer", "rejected"]);

// Default follow-up gaps in days, by the status the application is in.
export const FOLLOW_UP_DAYS = { applied: 7, screen: 3, interview: 3 };
export const GHOST_AFTER_DAYS = 30;

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(s) {
  if (typeof s !== "string" || !ISO.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function dayNumber(s) {
  return Math.floor(new Date(s + "T00:00:00Z").getTime() / 86400000);
}

export function addDays(s, n) {
  return new Date((dayNumber(s) + n) * 86400000).toISOString().slice(0, 10);
}

export function daysBetween(a, b) {
  return dayNumber(b) - dayNumber(a);
}

let seq = 0;
export function newId() {
  seq += 1;
  return "a" + Date.now().toString(36) + seq.toString(36);
}

// Coerce anything (form input, imported CSV row, old saved data) into a
// well-formed application, or return null if it has no usable identity.
export function normalizeApp(raw) {
  if (!raw || typeof raw !== "object") return null;
  const company = String(raw.company ?? "").trim();
  const role = String(raw.role ?? "").trim();
  if (!company && !role) return null;
  const status = STATUSES.includes(String(raw.status ?? "").toLowerCase()) ? String(raw.status).toLowerCase() : "applied";
  const applied = isIsoDate(raw.applied) ? raw.applied : "";
  let history = Array.isArray(raw.history)
    ? raw.history.filter((h) => h && STATUSES.includes(h.status) && isIsoDate(h.date)).map((h) => ({ status: h.status, date: h.date }))
    : [];
  if (history.length === 0 && applied) history = [{ status: status === "wishlist" ? "wishlist" : "applied", date: applied }];
  const money = Number(raw.salary);
  return {
    id: String(raw.id || newId()),
    company, role,
    source: String(raw.source ?? "").trim(),
    link: String(raw.link ?? "").trim(),
    salary: Number.isFinite(money) && money > 0 ? Math.round(money) : null,
    status,
    applied,
    followUp: isIsoDate(raw.followUp) ? raw.followUp : "",
    notes: String(raw.notes ?? "").trim(),
    history,
  };
}

// Move an application to a new status on a date, recording it in history.
export function setStatus(app, status, date) {
  if (!STATUSES.includes(status) || !isIsoDate(date)) return app;
  if (app.status === status) return app;
  return { ...app, status, followUp: "", history: [...app.history, { status, date }] };
}

// Date of the most recent thing that happened on the application.
export function lastActivity(app) {
  const dates = app.history.map((h) => h.date);
  if (app.applied) dates.push(app.applied);
  return dates.sort().pop() || "";
}

export function nextFollowUp(app) {
  if (!OPEN.has(app.status) || app.status === "offer" || app.status === "wishlist") return "";
  if (app.followUp) return app.followUp;
  const gap = FOLLOW_UP_DAYS[app.status];
  const last = lastActivity(app);
  return gap && last ? addDays(last, gap) : "";
}

// Applications still marked "applied" that have been silent long enough to
// call ghosted. A suggestion, never an automatic status change.
export function ghostCandidates(apps, today) {
  return apps.filter((a) => a.status === "applied" && lastActivity(a) && daysBetween(lastActivity(a), today) >= GHOST_AFTER_DAYS);
}

// What to do today, most overdue first.
export function nextActions(apps, today, horizonDays = 2) {
  const out = [];
  for (const a of apps) {
    const due = nextFollowUp(a);
    if (!due) continue;
    const late = daysBetween(due, today);
    if (late >= -horizonDays) out.push({ app: a, due, daysLate: late });
  }
  return out.sort((x, y) => y.daysLate - x.daysLate || x.app.company.localeCompare(y.app.company));
}

export function firstResponseDays(app) {
  const applied = app.history.find((h) => h.status === "applied")?.date || app.applied;
  if (!applied) return null;
  const reply = app.history.find((h) => RESPONDED.has(h.status));
  return reply ? Math.max(0, daysBetween(applied, reply.date)) : null;
}

function median(nums) {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : null);

// Funnel numbers. "Sent" is every application that left wishlist. A response
// is any move to screen / interview / offer / rejected -- a rejection is an
// answer too, and counting only good news would make every source look worse
// than it is.
export function funnel(apps, today) {
  const sent = apps.filter((a) => a.status !== "wishlist" || a.history.some((h) => h.status === "applied"));
  const reached = (set) => sent.filter((a) => a.history.some((h) => set.has(h.status)) || set.has(a.status));
  const responded = reached(RESPONDED);
  const interviewed = reached(new Set(["interview", "offer"]));
  const offers = reached(new Set(["offer"]));
  const bySource = new Map();
  for (const a of sent) {
    const key = a.source || "(no source)";
    const row = bySource.get(key) || { source: key, sent: 0, responded: 0, interviewed: 0 };
    row.sent += 1;
    if (responded.includes(a)) row.responded += 1;
    if (interviewed.includes(a)) row.interviewed += 1;
    bySource.set(key, row);
  }
  const sources = [...bySource.values()]
    .map((r) => ({ ...r, responseRate: pct(r.responded, r.sent), interviewRate: pct(r.interviewed, r.sent) }))
    .sort((a, b) => b.sent - a.sent || a.source.localeCompare(b.source));
  const weeks = [];
  for (let i = 3; i >= 0; i--) {
    const end = addDays(today, -7 * i), start = addDays(end, -6);
    weeks.push({ start, end, sent: sent.filter((a) => a.applied && a.applied >= start && a.applied <= end).length });
  }
  return {
    sent: sent.length, responded: responded.length, interviewed: interviewed.length, offers: offers.length,
    responseRate: pct(responded.length, sent.length),
    interviewRate: pct(interviewed.length, sent.length),
    medianDaysToResponse: median(sent.map(firstResponseDays).filter((n) => n !== null)),
    ghostCandidates: ghostCandidates(apps, today).length,
    sources, weeks,
  };
}

// One plain sentence a person can act on, or "" when there is too little data.
export function insight(f) {
  const rated = f.sources.filter((s) => s.sent >= 3 && s.responseRate !== null);
  if (f.sent < 5 || rated.length < 2) return "";
  const best = [...rated].sort((a, b) => b.responseRate - a.responseRate)[0];
  const worst = [...rated].sort((a, b) => a.responseRate - b.responseRate)[0];
  if (best.source === worst.source || best.responseRate === worst.responseRate) return "";
  return `${best.source} has drawn replies on ${best.responseRate}% of ${best.sent} applications; ${worst.source} on ${worst.responseRate}% of ${worst.sent}. Small samples -- treat this as a hint about where to spend the next hour, not a verdict.`;
}

// ---- CSV ----------------------------------------------------------------

export const CSV_COLUMNS = ["company", "role", "source", "link", "salary", "status", "applied", "followUp", "notes"];

function cell(v) {
  let s = v === null || v === undefined ? "" : String(v);
  // A spreadsheet treats a leading = + - @ as a formula. Prefix with a quote
  // so a note someone typed cannot execute when the file is opened.
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export function toCsv(apps) {
  return [CSV_COLUMNS.join(","), ...apps.map((a) => CSV_COLUMNS.map((c) => cell(a[c])).join(","))].join("\r\n") + "\r\n";
}

export function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  const src = String(text).replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((x) => x !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((x) => x !== "")) rows.push(row);
  return rows;
}

export function fromCsv(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) return { apps: [], skipped: 0 };
  const head = rows[0].map((h) => h.trim().toLowerCase().replace(/[\s_-]+/g, ""));
  const idx = (name) => head.indexOf(name.toLowerCase());
  const col = Object.fromEntries(CSV_COLUMNS.map((c) => [c, idx(c)]));
  if (col.company < 0 && col.role < 0) return { apps: [], skipped: rows.length - 1 };
  const apps = [];
  let skipped = 0;
  for (const r of rows.slice(1)) {
    const raw = {};
    for (const c of CSV_COLUMNS) raw[c] = col[c] >= 0 ? (r[col[c]] ?? "").replace(/^'(?=[=+\-@\t\r])/, "") : "";
    const app = normalizeApp(raw);
    if (app) apps.push(app); else skipped++;
  }
  return { apps, skipped };
}

// ---- Calendar -----------------------------------------------------------

const icsText = (s) => String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const icsDate = (s) => s.replace(/-/g, "");

// All-day reminder events for every pending follow-up, importable into any
// calendar app. Built locally; nothing is sent anywhere.
export function toIcs(apps, stamp = "20260101T000000Z") {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//job-application-tracker//EN", "CALSCALE:GREGORIAN"];
  for (const a of apps) {
    const due = nextFollowUp(a);
    if (!due) continue;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${a.id}-followup@job-application-tracker`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${icsDate(due)}`,
      `DTEND;VALUE=DATE:${icsDate(addDays(due, 1))}`,
      `SUMMARY:${icsText(`Follow up: ${a.company || a.role}${a.company && a.role ? " - " + a.role : ""}`)}`,
      `DESCRIPTION:${icsText(`Status: ${a.status}.${a.link ? " " + a.link : ""}`)}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
