// Babysitting Business Kit: after-sit reports, incident records and the medication log.
// Pure functions over the desk; the Families tab (sitreport-ui.mjs) and the optional
// server route ("email this report to the parent") both use them.
//
// Where things live (no new top-level desk keys, so normalizeDesk keeps them as they are):
//   booking.sitReports[date]  one report per sit date (a weekly series has one per week)
//   family.medAuths[]         the parents' written medication authorizations on file
//   report.doses[]            each dose given during that sit
//
// The medication log is a record of what the parents authorized and what was given.
// It is not medical advice: it never suggests a medicine, a dose or a time.

import { toMin, expandBookings, addDays, dayOf, DAYS } from "./engine.mjs";
import { contactsOf } from "./automations.mjs";

export const MOODS = ["happy", "calm", "silly", "mixed", "tired", "sad", "upset"];
export const DEFAULT_WINDOW_MIN = 30; // how far from an authorized time still counts as "on time"; the parents can set their own per medicine
const CAP = { short: 80, text: 1000 };
const REPORT_TEXT = ["meals", "naps", "diapers", "activities", "moodNote", "notes"];
const INCIDENT_TEXT = ["what", "firstAid", "toldHow", "followUp"];

const str = (v, n = CAP.text) => String(v ?? "").replace(/\r\n?/g, "\n").trim().slice(0, n);
const hhmm = (v) => { const m = toMin(v); return Number.isFinite(m) && m >= 0 && m < 1440 ? `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}` : ""; };
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// "18:05" -> "6:05pm"
export function clock(t) {
  const m = toMin(t);
  if (!Number.isFinite(m)) return "";
  const h = Math.floor(m / 60) % 24, mm = m % 60;
  return `${h % 12 || 12}${mm ? `:${String(mm).padStart(2, "0")}` : ""}${h < 12 ? "am" : "pm"}`;
}
export function niceDate(date) {
  if (!isDate(date)) return "";
  const [, mo, d] = date.split("-").map(Number);
  return `${DAYS[dayOf(date)]} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][mo - 1]} ${d}`;
}

// ---------- reports ----------

// Clean a report from a form or a request: known fields only, trimmed and capped.
export function normalizeReport(r = {}, date = "") {
  const out = { date: isDate(r.date) ? r.date : date, arrived: hhmm(r.arrived), left: hhmm(r.left), mood: MOODS.includes(r.mood) ? r.mood : "" };
  for (const k of REPORT_TEXT) out[k] = str(r[k]);
  const inc = r.incident && typeof r.incident === "object" ? r.incident : {};
  out.incident = { happened: inc.happened === true || inc.happened === "on" || inc.happened === "yes", time: hhmm(inc.time), parentsTold: hhmm(inc.parentsTold) };
  for (const k of INCIDENT_TEXT) out.incident[k] = str(inc[k]);
  if (!out.incident.happened && !out.incident.what) out.incident = { happened: false };
  else out.incident.happened = true;
  out.doses = (Array.isArray(r.doses) ? r.doses : []).filter((d) => d && typeof d === "object").slice(0, 40).map((d) => ({ id: str(d.id, CAP.short), authId: str(d.authId, CAP.short), child: str(d.child, CAP.short), drug: str(d.drug, CAP.short), dose: str(d.dose, CAP.short), at: hhmm(d.at), note: str(d.note, 300), beforeSit: !!d.beforeSit, warnings: Array.isArray(d.warnings) ? d.warnings.map((w) => str(w, 200)).slice(0, 8) : [] }));
  for (const k of ["created", "updated", "emailedAt"]) if (r[k]) out[k] = str(r[k], 40);
  return out;
}

export const hasIncident = (r) => !!(r && r.incident && r.incident.happened);

// Store a report on its booking (for the given sit date); returns the stored report.
export function saveReport(desk, bookingId, date, report, nowIso = new Date().toISOString()) {
  const b = desk.bookings.find((x) => x.id === bookingId);
  if (!b) throw new Error("That sit is not on the schedule.");
  if (!sitDates(b).includes(date)) throw new Error("That date is not one of this sit's dates.");
  const prev = (b.sitReports && b.sitReports[date]) || {};
  const r = normalizeReport({ ...report, date }, date);
  r.created = prev.created || nowIso;
  r.updated = nowIso;
  if (prev.emailedAt) r.emailedAt = prev.emailedAt;
  b.sitReports = { ...(b.sitReports || {}), [date]: r };
  return r;
}

export function getReport(desk, bookingId, date) {
  const b = desk.bookings.find((x) => x.id === bookingId);
  return (b && b.sitReports && b.sitReports[date]) || null;
}

const sitDates = (b) => expandBookings([{ ...b, sitReports: undefined }]).map((o) => o.date);

// Sits a report could be written for: from `days` ago to tomorrow, newest first, not cancelled.
export function reportableSits(desk, today, days = 14) {
  const from = addDays(today, -days), to = addDays(today, 1);
  return expandBookings(desk.bookings.map((b) => ({ ...b, sitReports: undefined })))
    .filter((o) => o.date >= from && o.date <= to && o.status !== "cancelled")
    .map((o) => ({ bookingId: o.id, date: o.date, start: o.start, end: o.end, familyId: o.familyId, has: !!getReport(desk, o.id, o.date) }))
    .reverse();
}

// Every report for one family, newest first.
export function familyReports(desk, familyId) {
  const out = [];
  for (const b of desk.bookings) {
    if (b.familyId !== familyId || !b.sitReports) continue;
    for (const [date, report] of Object.entries(b.sitReports)) if (report && typeof report === "object") out.push({ bookingId: b.id, date, start: b.start, end: b.end, report });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

export function reportStats(desk) {
  let reports = 0, incidents = 0, doses = 0, flagged = 0;
  for (const b of desk.bookings) for (const r of Object.values(b.sitReports || {})) {
    reports++; if (hasIncident(r)) incidents++;
    for (const d of r.doses || []) { doses++; if ((d.warnings || []).length) flagged++; }
  }
  return { reports, incidents, doses, flagged };
}

const firstName = (s) => String(s || "").trim().split(/\s+/)[0] || "";
const kidNames = (family) => (family && Array.isArray(family.kids) ? family.kids.map((k) => k && k.name).filter(Boolean) : []);
const joinAnd = (xs) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

export function reportSubject(report, { family = {}, profile = {} } = {}) {
  return `${hasIncident(report) ? "Sit report (please read: something happened)" : "Sit report"}: ${niceDate(report.date)}${family.name ? `, ${family.name}` : ""}${profile.name ? ` from ${firstName(profile.name)}` : ""}`;
}

// The friendly message the sitter copies into a text or email. Empty sections are left out.
export function reportMessage(report, { family = {}, profile = {} } = {}) {
  const r = normalizeReport(report, report.date);
  const kids = joinAnd(kidNames(family));
  const when = [niceDate(r.date), r.arrived && r.left ? `${clock(r.arrived)} to ${clock(r.left)}` : r.arrived ? `from ${clock(r.arrived)}` : ""].filter(Boolean).join(", ");
  const lines = [`Hi${family.contactName ? ` ${firstName(family.contactName)}` : ""}! Here's how ${kids ? `it went with ${kids}` : "the sit went"}${when ? ` (${when})` : ""}.`, ""];
  const add = (label, v) => { if (v) lines.push(`${label}: ${v}`); };
  add("Food", r.meals);
  add("Sleep", r.naps);
  add("Diapers / potty", r.diapers);
  add("What we did", r.activities);
  add("Mood", [r.mood && r.mood[0].toUpperCase() + r.mood.slice(1), r.moodNote].filter(Boolean).join(". "));
  const given = r.doses.filter((d) => !d.beforeSit);
  if (given.length) lines.push(`Medicine given: ${given.map((d) => `${d.child ? `${d.child}, ` : ""}${d.drug} ${d.dose} at ${clock(d.at)}${(d.warnings || []).length ? ` (please check: ${d.warnings.join(" ")})` : ""}`).join("; ")}`);
  add("Good to know", r.notes);
  if (hasIncident(r)) {
    const i = r.incident;
    lines.push("", "INCIDENT (in writing, as promised):");
    add("What happened", [i.time && `At ${clock(i.time)}:`, i.what].filter(Boolean).join(" "));
    add("First aid given", i.firstAid || "none");
    add("When I told you", [i.parentsTold && clock(i.parentsTold), i.toldHow].filter(Boolean).join(", ") || "telling you now");
    add("Keep an eye on", i.followUp);
  }
  lines.push("", `Thank you${profile.name ? `, ${firstName(profile.name)}` : "!"}`);
  return lines.join("\n");
}

// ---------- medication authorizations ----------

// Times on the form: "8am, 8pm", "08:00 20:00" -> ["08:00", "20:00"]
export function parseTimes(text) {
  return [...new Set(String(text || "").split(/[,;\s]+(?![ap]m\b)/i).map((s) => hhmm(s.trim())).filter(Boolean))].sort();
}

export function normalizeAuth(a = {}) {
  const out = {
    id: str(a.id, CAP.short), child: str(a.child, CAP.short), drug: str(a.drug, CAP.short), dose: str(a.dose, CAP.short),
    times: Array.isArray(a.times) ? parseTimes(a.times.join(",")) : parseTimes(a.times),
    asNeeded: a.asNeeded === true || a.asNeeded === "on" || a.asNeeded === "yes",
    windowMin: Math.min(180, Math.max(0, Math.round(Number(a.windowMin === "" || a.windowMin == null ? DEFAULT_WINDOW_MIN : a.windowMin) || 0))),
    minHours: Math.max(0, Number(a.minHours) || 0), maxDoses: Math.max(0, Math.round(Number(a.maxDoses) || 0)),
    reason: str(a.reason, 200), instructions: str(a.instructions, 500), parentName: str(a.parentName, CAP.short),
    signedOn: isDate(a.signedOn) ? a.signedOn : "", expires: isDate(a.expires) ? a.expires : "",
  };
  return out;
}

// Is this authorization usable on `date`? Problems are the reasons it is not.
export function authStatus(auth, date) {
  const a = normalizeAuth(auth), problems = [];
  if (!a.parentName || !a.signedOn) problems.push("no parent's name and signature date on file");
  if (a.signedOn && date < a.signedOn) problems.push(`not signed until ${a.signedOn}`);
  if (!a.expires) problems.push("no end date: ask the parents to date it");
  else if (date > a.expires) problems.push(`expired ${a.expires}`);
  if (!a.drug || !a.dose) problems.push("medicine or dose missing");
  if (!a.asNeeded && !a.times.length) problems.push("no times given (or mark it as needed)");
  return { valid: !problems.length, problems };
}

const minutesApart = (a, b) => { const d = Math.abs(toMin(a) - toMin(b)); return Math.min(d, 1440 - d); };
const sameDose = (a, b) => String(a).toLowerCase().replace(/\s+/g, "") === String(b).toLowerCase().replace(/\s+/g, "");

// Check one dose against the family's authorizations. `given` is the doses already logged
// on this report. Every warning is a reason to stop and call the parents, not a judgment.
export function checkDose(dose, family = {}, date, given = []) {
  const warnings = [];
  const auths = (family.medAuths || []).map(normalizeAuth);
  const auth = auths.find((a) => a.id && a.id === dose.authId) || auths.find((a) => a.drug && a.drug.toLowerCase() === String(dose.drug || "").trim().toLowerCase() && (!a.child || !dose.child || a.child.toLowerCase() === String(dose.child).trim().toLowerCase()));
  if (!auth) return { auth: null, warnings: ["No written authorization from the parents is on file for this medicine. Do not give it without one."] };
  for (const p of authStatus(auth, date).problems) warnings.push(`Authorization: ${p}.`);
  if (dose.dose && !sameDose(dose.dose, auth.dose)) warnings.push(`Dose ${dose.dose} is not the authorized ${auth.dose}.`);
  const at = hhmm(dose.at);
  if (!at) warnings.push("No time recorded for this dose.");
  const before = given.filter((g) => g && g.id !== dose.id && (g.authId === auth.id || (g.drug || "").toLowerCase() === auth.drug.toLowerCase()) && hhmm(g.at));
  if (at && !auth.asNeeded && auth.times.length) {
    const near = auth.times.map((t) => minutesApart(t, at)).reduce((m, x) => Math.min(m, x), 1440);
    if (near > auth.windowMin) warnings.push(`${clock(at)} is outside the authorized times (${auth.times.map(clock).join(", ")}, give or take ${auth.windowMin} minutes).`);
    const slot = auth.times.reduce((best, t) => (minutesApart(t, at) < minutesApart(best, at) ? t : best), auth.times[0]);
    if (near <= auth.windowMin && before.some((g) => minutesApart(g.at, slot) <= auth.windowMin)) warnings.push(`A dose for the ${clock(slot)} time is already logged.`);
  }
  if (at && auth.asNeeded && auth.minHours) {
    const last = before.map((g) => minutesApart(g.at, at)).reduce((m, x) => Math.min(m, x), Infinity);
    if (last < auth.minHours * 60) warnings.push(`Only ${Math.round(last)} minutes since the last dose; the parents allowed one every ${auth.minHours} hours at most.`);
  }
  const during = before.filter((g) => !g.beforeSit);
  if (auth.maxDoses && during.length + 1 > auth.maxDoses) warnings.push(`That would be dose ${during.length + 1}; the parents allowed at most ${auth.maxDoses} during a sit.`);
  return { auth, warnings };
}

// Log a dose on a report; the warnings are stored with it so the record shows them.
export function logDose(report, dose, family, date, id) {
  const d = { id: id || `dose_${(report.doses || []).length + 1}`, authId: dose.authId || "", child: str(dose.child, CAP.short), drug: str(dose.drug, CAP.short), dose: str(dose.dose, CAP.short), at: hhmm(dose.at), note: str(dose.note, 300), beforeSit: !!dose.beforeSit };
  const chk = checkDose(d, family, date, report.doses || []);
  // A dose the parents gave before the sit is a fact to plan around, not one the sitter gave.
  if (d.beforeSit) chk.warnings = [];
  if (chk.auth) { d.authId = chk.auth.id; d.drug = d.drug || chk.auth.drug; d.dose = d.dose || chk.auth.dose; d.child = d.child || chk.auth.child; }
  d.warnings = chk.warnings;
  return { report: { ...report, doses: [...(report.doses || []), d] }, dose: d, warnings: chk.warnings };
}

// Authorizations that need the sitter's attention: expired, expiring within `days`, or incomplete.
export function authAlerts(desk, today, days = 7) {
  const out = [];
  for (const f of desk.families) for (const raw of f.medAuths || []) {
    const a = normalizeAuth(raw), s = authStatus(a, today);
    if (!s.valid) out.push({ familyId: f.id, family: f.name, authId: a.id, drug: a.drug, child: a.child, problems: s.problems });
    else if (a.expires && a.expires <= addDays(today, days)) out.push({ familyId: f.id, family: f.name, authId: a.id, drug: a.drug, child: a.child, problems: [`expires ${a.expires}`] });
  }
  return out;
}

// ---------- printable pages ----------

const CLAUSE = `<p><strong>No warranty.</strong> Provided free and as-is, without warranty of any kind, express or implied. It is not legal, tax, or financial advice, and it is not medical advice; it does not replace a doctor, a pharmacist, 911 or your own judgment. You are responsible for reviewing and verifying it before relying on it. To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use.</p><p>Made with the free <a href="https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/babysitting-business-kit">Babysitting Business Kit</a> (MIT). Optional support: <a href="https://github.com/sponsors/Duncan-Haywood">github.com/sponsors/Duncan-Haywood</a>.</p>`;
const STYLE = "body{font:15px/1.5 system-ui,sans-serif;max-width:46rem;margin:1.6rem auto;padding:0 1rem;color:#2b2433;background:#fff}h1{font-size:1.45rem;margin:0 0 .3rem}h2{font-size:1.05rem;margin:1.2rem 0 .3rem;border-bottom:1px solid #e8ded8}dl{display:grid;grid-template-columns:11rem 1fr;gap:4px 12px;margin:0}dt{font-weight:700}dd{margin:0;white-space:pre-wrap}.box{border:2px solid #7d1f16;border-radius:8px;padding:6px 12px;margin:10px 0}.sig{display:grid;grid-template-columns:1fr 1fr;gap:28px;margin-top:28px}.sig div{border-top:1px solid #2b2433;padding-top:3px;font-size:.85rem}table{width:100%;border-collapse:collapse}td,th{border:1px solid #bfb2bb;padding:6px;text-align:left;vertical-align:top}footer{margin-top:1.6rem;font-size:.8rem;color:#5f5669}button{margin:6px 0;padding:8px 14px}@media print{button{display:none}body{margin:0}}";
const pageShell = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title><style>${STYLE}</style></head><body>${body}<footer>${CLAUSE}</footer></body></html>`;

// A printable incident report: what happened, first aid, when the parents were told, with signature lines.
export function incidentReportPage(report, { family = {}, profile = {}, booking = {} } = {}) {
  const r = normalizeReport(report, report.date), i = r.incident || {};
  const row = (k, v) => `<dt>${esc(k)}</dt><dd>${esc(v || "-")}</dd>`;
  return pageShell(`Incident report ${r.date}`, `<button onclick="print()">Print</button>
<h1>Incident report</h1>
<p>A record of what happened during a babysitting sit, written by the sitter. It is a record, not medical or legal advice.</p>
<h2>The sit</h2><dl>${row("Date", `${niceDate(r.date)} (${r.date})`)}${row("Family", family.name)}${row("Parent", family.contactName)}${row("Children", joinAnd(kidNames(family)))}${row("Sitter", [profile.name, profile.phone].filter(Boolean).join(", "))}${row("Booked time", booking.start && booking.end ? `${clock(booking.start)} to ${clock(booking.end)}` : "")}${row("Arrived / left", [r.arrived && clock(r.arrived), r.left && clock(r.left)].filter(Boolean).join(" / "))}</dl>
<div class="box"><h2>What happened</h2><dl>${row("Time", i.time && clock(i.time))}${row("What happened", i.what)}${row("First aid given", i.firstAid)}${row("Parents told at", i.parentsTold && clock(i.parentsTold))}${row("Told how", i.toldHow)}${row("Follow-up", i.followUp)}</dl></div>
${r.doses.length ? `<h2>Medicine given during this sit</h2><table><tr><th>Time</th><th>Child</th><th>Medicine and dose</th><th>Notes</th></tr>${r.doses.map((d) => `<tr><td>${esc(clock(d.at))}</td><td>${esc(d.child)}</td><td>${esc(d.drug)} ${esc(d.dose)}</td><td>${esc([d.note, ...(d.warnings || [])].filter(Boolean).join(" "))}</td></tr>`).join("")}</table>` : ""}
<div class="sig"><div>Sitter's signature and date</div><div>Parent's signature and date</div></div>`);
}

// A blank (or partly filled) medication authorization for the parents to fill in and sign.
export function medAuthFormPage(family = {}, profile = {}, auth = {}) {
  const a = normalizeAuth(auth);
  const line = (k, v) => `<tr><th style="width:38%">${esc(k)}</th><td>${esc(v || "")}&nbsp;</td></tr>`;
  return pageShell("Medication authorization", `<button onclick="print()">Print</button>
<h1>Medication authorization for the babysitter</h1>
<p><strong>A template, not legal or medical advice.</strong> One medicine per form. The babysitter gives only what is written here, only at these times, and calls you before anything else.</p>
<table>${line("Child's name", a.child || joinAnd(kidNames(family)))}${line("Medicine (name on the label)", a.drug)}${line("Dose (amount, e.g. 5 ml)", a.dose)}${line("Times to give it", a.asNeeded ? "as needed" : a.times.map(clock).join(", "))}${line("If as needed: what for, and at least how many hours apart", [a.reason, a.minHours ? `${a.minHours} hours` : ""].filter(Boolean).join(", "))}${line("Most doses during one sit", a.maxDoses || "")}${line("How to give it, storage, side effects to watch", a.instructions)}${line("Doctor or pharmacy phone", "")}${line("Valid from", a.signedOn)}${line("Valid until", a.expires)}</table>
<p>I authorize ${esc(profile.name || "____________________")}, our babysitter, to give this medicine to my child exactly as written above.</p>
<div class="sig"><div>Parent's name: ${esc(a.parentName || family.contactName || "")}</div><div>Parent's signature and date</div></div>
<p style="font-size:.85rem">Healthy Children (American Academy of Pediatrics) advises writing medicine instructions down and not giving two doses at once or extra doses without speaking with a doctor: <a href="https://www.healthychildren.org/English/safety-prevention/at-home/medication-safety/Pages/Medication-Safety-Tips.aspx">Medication Safety Tips for Families</a>.</p>`);
}

// ---------- server: email a report to the parent, and keep "emailed" stamps across syncs ----------

// The parent's email for a family, if one is on file (never a phone number).
export const parentEmail = (family) => contactsOf(family || {}).email;

// POST /api/sitreport/email {bookingId, date, report?} behind the admin key. The report in
// the request (if any) is saved first, so an unsynced report can still be sent. Recipients
// come only from the family on the server's desk, never from the request.
export async function sitReportApi(req, url, send, state, save, { email, configured, readBody, now = Date.now }) {
  if (url.pathname !== "/api/sitreport/email") return false;
  const json = (code, o) => send(code, JSON.stringify(o), "application/json");
  if (req.method !== "POST") { json(405, { error: "POST only" }); return true; }
  if (!configured) { json(503, { error: "Email is off on this server: set RESEND_API_KEY and FROM_EMAIL." }); return true; }
  let body;
  try { body = JSON.parse((await readBody(req, 64 * 1024)) || "{}"); } catch { json(400, { error: "not JSON" }); return true; }
  const desk = state.desk;
  const b = desk.bookings.find((x) => x.id === String(body.bookingId || ""));
  if (!b) { json(404, { error: "That sit is not on the server yet. Sync first." }); return true; }
  const date = String(body.date || "");
  let report;
  try { report = body.report && typeof body.report === "object" ? saveReport(desk, b.id, date, body.report, new Date(now()).toISOString()) : getReport(desk, b.id, date); } catch (e) { json(400, { error: e.message }); return true; }
  if (!report) { json(404, { error: "No report for that date." }); return true; }
  const family = desk.families.find((f) => f.id === b.familyId) || {};
  const to = parentEmail(family);
  if (!to) { json(422, { error: "No email address for this family. Copy the message and text it instead." }); return true; }
  const ok = await email(to, reportSubject(report, { family, profile: desk.profile }), reportMessage(report, { family, profile: desk.profile }));
  if (!ok) { save(); json(502, { error: "The email service did not accept it. Try again, or copy the message." }); return true; }
  report.emailedAt = new Date(now()).toISOString();
  save();
  json(200, { ok: true, emailedAt: report.emailedAt, to: to.replace(/^(.).*(@.*)$/, "$1...$2") });
  return true;
}

// PUT /api/desk replaces the desk; carry over reports the server holds (saved by the email
// route) that the app has not seen, and every "emailed" stamp.
export function mergeSitReports(serverDesk, incoming) {
  if (!incoming || !Array.isArray(incoming.bookings)) return incoming;
  const held = new Map((serverDesk.bookings || []).filter((b) => b && b.sitReports).map((b) => [b.id, b.sitReports]));
  for (const b of incoming.bookings) {
    const s = b && held.get(b.id);
    if (!s) continue;
    const mine = b.sitReports && typeof b.sitReports === "object" ? { ...b.sitReports } : {};
    for (const [date, r] of Object.entries(s)) {
      if (!mine[date]) mine[date] = r;
      else if (r.emailedAt && !mine[date].emailedAt) mine[date] = { ...mine[date], emailedAt: r.emailedAt };
    }
    b.sitReports = mine;
  }
  return incoming;
}
