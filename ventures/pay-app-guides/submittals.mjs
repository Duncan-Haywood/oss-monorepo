// Submittal log template and tracker: the shop drawings, product data, samples and close-out documents
// a subcontractor sends the GC for review, what came back, and which ones put the schedule at risk.
// The same rules as PayApps' own submittal log (ventures/payapps/apps/payapps/src/shared/submittals.ts):
// - state: superseded (a later revision of the same number is on the log), else not submitted (no sent
//   date), else with the GC (no returned date or no action), else closed (approved, approved as noted,
//   received for record), else resubmit needed (revise and resubmit, rejected);
// - overdue: with the GC past the required-back date typed for it;
// - submit by: needed on site minus the lead time minus the review days (zero when none typed);
// - delivery at risk: when the approval lands (or is expected to) plus the lead time is after the
//   needed-on-site date; a resubmittal goes back through review from today.
// Nothing is assumed: no review period, no lead time, no calendar. Every date and day count is typed.
// Pure functions, no I/O. Dates are whole UTC days (colog.mjs parseDate).
// Every exported CSV cell goes through colog.mjs csvCell (the formula-injection guard).
import { parseCsv, parseDate, dayText, csvCell } from "./colog.mjs";

export const MAX_SUBMITTALS = 500;
// Longest lead time or review period accepted, in calendar days (two years), as in PayApps.
export const MAX_DAYS = 730;

export const NOTE =
  "Dates, lead times and review days are the ones you typed. The submittal log tracks what you " +
  "sent and what came back; the GC's stamp and the contract documents govern what was approved.";

export const ACTION_LABEL = {
  approved: "Approved",
  approved_as_noted: "Approved as noted",
  revise_resubmit: "Revise and resubmit",
  rejected: "Rejected",
  for_record: "Received for record",
};
const CLOSING = ["approved", "approved_as_noted", "for_record"];

// The stamp wordings GCs and architects use, read to PayApps' five actions. Anything else is refused
// with the row number, so a stamp is never guessed.
const ACTION_WORDS = {
  approved: ["approved", "a", "app", "no exceptions taken", "net", "no exception taken", "reviewed no exceptions"],
  approved_as_noted: ["approved as noted", "aan", "as noted", "make corrections noted", "mcn", "furnish as corrected", "exceptions noted", "approved as corrected", "reviewed as noted"],
  revise_resubmit: ["revise and resubmit", "revise & resubmit", "r&r", "rr", "rar", "resubmit", "revise resubmit", "amend and resubmit"],
  rejected: ["rejected", "rej", "not approved", "disapproved", "not accepted"],
  for_record: ["received for record", "for record", "record", "received", "rfr", "for information", "reviewed for record"],
};

export function normAction(s) {
  const t = String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ").replace(/[.]$/, "");
  if (t === "") return null;
  for (const [k, words] of Object.entries(ACTION_WORDS)) if (words.includes(t)) return k;
  return undefined;
}

export const STATE_LABEL = {
  not_submitted: "Not submitted",
  with_gc: "With the GC",
  approved: "Closed",
  resubmit: "Resubmit needed",
  superseded: "Superseded",
};
export const stateLabel = (s) => (Object.hasOwn(STATE_LABEL, s) ? STATE_LABEL[s] : String(s));

const HEADERS = {
  number: /^(#|no\.?|number|submittal( no\.?| number| #)?|sub(mittal)? #|item( no\.?| #)?|id)$/,
  revision: /^(rev\.?|revision|rev( no\.?| #)?|revision( no\.?| #))$/,
  spec: /^(spec( section)?|section|spec #|specification( section)?|csi( section)?)$/,
  title: /^(title|description|desc|item|submittal|what|name)$/,
  type: /^(type|kind|submittal type)$/,
  sent: /^(sent|sent on|submitted|submitted on|date sent|date submitted|to gc|transmitted)$/,
  requiredBy: /^(required back|required by|due back|back by|return by|due|due date|review due)$/,
  returned: /^(returned|returned on|date returned|back|received back|came back)$/,
  action: /^(action|gc action|stamp|status|result|review action|disposition)$/,
  needed: /^(needed on site|on site by|need on site|needed|required on site|onsite by|delivery needed)$/,
  lead: /^(lead time|lead time \(days\)|lead days|lead|fab(rication)? time)$/,
  review: /^(review days|review time|review period|review \(days\)|review)$/,
};

function mapHeaders(row) {
  const idx = {};
  row.forEach((h, i) => {
    const t = String(h).trim().toLowerCase().replace(/\s+/g, " ");
    for (const [k, re] of Object.entries(HEADERS)) if (idx[k] == null && re.test(t)) { idx[k] = i; break; }
  });
  return idx;
}

function parseDays(s) {
  const t = String(s ?? "").trim().toLowerCase().replace(/\s*(calendar )?days?$/, "");
  if (t === "") return undefined;
  if (!/^\d{1,4}$/.test(t)) return null;
  const n = +t;
  return n <= MAX_DAYS ? n : null;
}

export function parse(text) {
  const errors = [];
  const rows = parseCsv(text).filter((r) => r.some((c) => String(c).trim() !== ""));
  if (!rows.length) return { items: [], errors };
  const idx = mapHeaders(rows[0]);
  if (idx.title == null) {
    errors.push('The first row must be a header row with a "Title" (or "Description") column.');
    return { items: [], errors };
  }
  if (rows.length - 1 > MAX_SUBMITTALS) {
    errors.push(`At most ${MAX_SUBMITTALS} submittals at a time; this has ${rows.length - 1}.`);
    return { items: [], errors };
  }
  const get = (r, k) => (idx[k] == null ? "" : String(r[idx[k]] ?? "").trim());
  const items = [];
  rows.slice(1).forEach((r, i) => {
    const line = i + 2;
    const title = get(r, "title");
    if (!title) { errors.push(`Row ${line}: no title.`); return; }
    const item = { line, title, spec: get(r, "spec"), type: get(r, "type"), number: get(r, "number") || null };
    const rev = get(r, "revision").replace(/^rev\.?\s*/i, "");
    if (rev !== "" && !/^\d{1,3}$/.test(rev)) { errors.push(`Row ${line}: revision "${get(r, "revision")}" is not a whole number.`); return; }
    item.revision = rev === "" ? 0 : +rev;
    for (const k of ["sent", "requiredBy", "returned", "needed"]) {
      const d = parseDate(get(r, k));
      if (d === null) { errors.push(`Row ${line}: "${get(r, k)}" is not a date (use YYYY-MM-DD or MM/DD/YYYY).`); return; }
      item[k] = d ?? null;
    }
    for (const k of ["lead", "review"]) {
      const n = parseDays(get(r, k));
      if (n === null) { errors.push(`Row ${line}: "${get(r, k)}" is not a number of days from 0 to ${MAX_DAYS}.`); return; }
      item[k] = n ?? null;
    }
    const a = normAction(get(r, "action"));
    if (a === undefined) { errors.push(`Row ${line}: "${get(r, "action")}" is not a GC action this reads (approved, approved as noted, revise and resubmit, rejected, for record). Leave it blank while the submittal is out.`); return; }
    item.action = a;
    // PayApps' submittalProblem, in the same order.
    const problem =
      item.returned != null && item.sent == null ? "enter the date it was sent before the date it came back" :
      item.returned != null && item.returned < item.sent ? "the date it came back is before the date it was sent" :
      item.requiredBy != null && item.sent != null && item.requiredBy < item.sent ? "the required-back date is before the date it was sent" :
      item.action && item.returned == null ? "enter the date it came back with the GC's action" :
      item.returned != null && !item.action ? "pick the GC's action for the date it came back" : null;
    if (problem) { errors.push(`Row ${line}: ${problem}.`); return; }
    items.push(item);
  });
  return { items, errors };
}

// Numbers for rows that have none: one past the highest whole number given.
function numberItems(items) {
  let max = 0;
  for (const x of items) { const m = /(\d+)\s*$/.exec(String(x.number ?? "")); if (m) max = Math.max(max, +m[1]); }
  return items.map((x) => (x.number ? x : { ...x, number: String(++max) }));
}

// Where one submittal stands on `today` (a day number). Mirrors PayApps' submittalStatus.
export function status(s, today, superseded = false) {
  let state;
  if (superseded) state = "superseded";
  else if (s.sent == null) state = "not_submitted";
  else if (s.returned == null || !s.action) state = "with_gc";
  else if (CLOSING.includes(s.action)) state = "approved";
  else state = "resubmit";
  const out = s.sent != null && s.returned == null;
  const daysWithGc = s.sent != null ? Math.max(0, (s.returned ?? today) - s.sent) : null;
  const daysOverdue = !superseded && out && s.requiredBy != null ? Math.max(0, today - s.requiredBy) : 0;
  const submitBy = s.needed != null && s.lead != null ? s.needed - (s.lead + (s.review ?? 0)) : null;
  const lateToSubmit = state === "not_submitted" && submitBy != null && today > submitBy;
  let deliveryAtRisk = null;
  if (!superseded && state !== "resubmit" && s.needed != null && s.lead != null) {
    let back = null;
    if (state === "approved") back = s.returned;
    else if (state === "with_gc") {
      back = s.requiredBy ?? (s.review != null && s.sent != null ? s.sent + s.review : null);
      if (back != null && back < today) back = today;
    } else if (submitBy != null) back = (today > submitBy ? today : submitBy) + (s.review ?? 0);
    if (back != null) deliveryAtRisk = back + s.lead > s.needed;
  } else if (!superseded && state === "resubmit" && s.needed != null && s.lead != null) {
    deliveryAtRisk = today + (s.review ?? 0) + s.lead > s.needed;
  }
  return { state, overdue: daysOverdue > 0, daysOverdue, daysWithGc, submitBy, lateToSubmit, deliveryAtRisk };
}

// "#7", "#7 Rev 1"; with a spec section, "03 30 00 #7 Rev 1" (PayApps' submittalLabel).
export const label = (s) => `${s.spec ? `${s.spec} ` : ""}#${s.number}${s.revision > 0 ? ` Rev ${s.revision}` : ""}`;

const dayWord = (n) => `${n} day${n === 1 ? "" : "s"}`;

export function compute(text, { asOf } = {}) {
  const { items: parsed, errors } = parse(text);
  const today = parseDate(asOf ?? "");
  if (today == null) errors.push("Enter the as-of date (today) to work out what is late.");
  if (errors.length) return { errors, items: [] };
  const numbered = numberItems(parsed);
  const newest = new Map();
  for (const x of numbered) { const cur = newest.get(x.number); if (!cur || x.revision > cur.revision) newest.set(x.number, x); }
  const items = numbered.map((x) => ({ ...x, ...status(x, today, newest.get(x.number) !== x) }));
  const live = items.filter((x) => x.state !== "superseded");
  const count = (f) => live.filter(f).length;
  const summary = {
    total: live.length,
    notSubmitted: count((x) => x.state === "not_submitted"),
    withGc: count((x) => x.state === "with_gc"),
    overdue: count((x) => x.overdue),
    closed: count((x) => x.state === "approved"),
    resubmit: count((x) => x.state === "resubmit"),
    lateToSubmit: count((x) => x.lateToSubmit),
    deliveryAtRisk: count((x) => x.deliveryAtRisk === true),
    superseded: items.length - live.length,
  };
  // The list to chase, as PayApps' submittalsToChase orders it: delivery at risk first, then most days late.
  const chase = [];
  for (const x of live) {
    let reason = null, since = null;
    if (x.overdue) { reason = "overdue_back"; since = x.requiredBy; }
    else if (x.lateToSubmit) { reason = "late_to_send"; since = x.submitBy; }
    else if (x.state === "resubmit") { reason = "resubmit"; since = x.returned; }
    if (reason) chase.push({ ...x, reason, since, days: Math.max(0, today - since) });
  }
  chase.sort((a, b) => (b.deliveryAtRisk === true ? 1 : 0) - (a.deliveryAtRisk === true ? 1 : 0) || b.days - a.days || String(a.number).localeCompare(String(b.number), "en", { numeric: true }));
  const findings = chase.map((c) => ({ severity: c.deliveryAtRisk ? "high" : "normal", text: chaseText(c) }));
  const atRiskNotChased = live.filter((x) => x.deliveryAtRisk === true && !chase.some((c) => c.line === x.line));
  for (const x of atRiskNotChased) findings.push({ severity: "high", text: `${label(x)} ${x.title}: from the dates typed, the material cannot be on site by ${dayText(x.needed)} (${x.state === "approved" ? `approved ${dayText(x.returned)}` : x.state === "with_gc" ? "still with the GC" : `send by ${dayText(x.submitBy)}`}, then ${dayWord(x.lead)} lead time). Tell the GC in writing now, as your subcontract asks.` });
  const noDates = live.filter((x) => x.state !== "approved" && (x.needed == null || x.lead == null));
  if (noDates.length) findings.push({ severity: "normal", text: `${noDates.length} open submittal${noDates.length === 1 ? " has" : "s have"} no needed-on-site date or lead time, so nothing can say ${noDates.length === 1 ? "it is" : "they are"} late to send. Get the date from the GC's schedule and the lead time from your supplier.` });
  const noBack = live.filter((x) => x.state === "with_gc" && x.requiredBy == null && x.review == null);
  if (noBack.length) findings.push({ severity: "normal", text: `${noBack.length} submittal${noBack.length === 1 ? " is" : "s are"} with the GC with no required-back date or review days, so ${noBack.length === 1 ? "it" : "they"} can never show as overdue. The spec's Section 01 33 00 usually states the review period.` });
  return { errors: [], items, summary, chase, findings, today };
}

export function chaseText(c) {
  const what = `${label(c)} ${c.title}`;
  const why =
    c.reason === "overdue_back" ? `back from the GC by ${dayText(c.since)}, ${dayWord(c.days)} overdue` :
    c.reason === "late_to_send" ? `not sent, last day to send was ${dayText(c.since)}, ${dayWord(c.days)} ago` :
    `returned "${ACTION_LABEL[c.action]}" ${dayText(c.since)}${c.days > 0 ? `, ${dayWord(c.days)} ago` : ", today"}: send Rev ${c.revision + 1}`;
  return `${what}: ${why}.${c.deliveryAtRisk ? " Delivery on site is at risk." : ""}`;
}

export function summaryText(r) {
  const s = r.summary;
  if (!s.total) return "No submittals yet.";
  const parts = [`${s.total} submittal${s.total === 1 ? "" : "s"}`, `${s.closed} closed`, `${s.withGc} with the GC (${s.overdue} overdue)`, `${s.resubmit} to resubmit`, `${s.notSubmitted} not sent (${s.lateToSubmit} late to send)`];
  let t = parts.join(", ") + ".";
  if (s.deliveryAtRisk) t += ` ${s.deliveryAtRisk} put${s.deliveryAtRisk === 1 ? "s" : ""} a needed-on-site date at risk.`;
  if (s.superseded) t += ` ${s.superseded} earlier revision${s.superseded === 1 ? "" : "s"} kept on the log, not counted.`;
  return t;
}

const greeting = (name) => (String(name ?? "").trim() ? `Hi ${String(name).trim().split(/\s+/)[0]},` : "Hi,");

// The status request to the GC: the submittals overdue back, each with the date it was due and, where
// typed, the date the material is needed on site. It states dates; it is not a notice of delay.
export function overdueEmail(r, { gc, pm, project, sub } = {}) {
  const late = r.chase.filter((c) => c.reason === "overdue_back");
  if (!late.length) return "";
  return [
    `Subject: ${project ? `${project}: ` : ""}submittals past their review date`,
    "",
    greeting(pm),
    "",
    `The following submittal${late.length === 1 ? " is" : "s are"} past the date ${late.length === 1 ? "it was" : "they were"} due back from review${gc ? ` (${gc}'s log)` : ""}:`,
    "",
    ...late.map((c) => `  ${label(c)}  ${c.title}: sent ${dayText(c.sent)}, due back ${dayText(c.requiredBy)}${c.needed != null ? `; needed on site ${dayText(c.needed)}${c.lead != null ? ` with a ${c.lead}-day lead time after approval` : ""}` : ""}`),
    "",
    "Could you let us know when we can expect them back? We cannot release the material until they are back.",
    "",
    "Thank you,",
    sub || "",
  ].join("\n").trimEnd();
}

export function logCsv(r) {
  const head = ["Number", "Revision", "Spec section", "Title", "Type", "Sent", "Required back", "Returned", "Action", "Needed on site", "Lead time (days)", "Review days", "Submit by", "Status", "Days overdue", "Days with GC", "Delivery at risk"];
  const rows = r.items.map((x) => [x.number, x.revision, x.spec, x.title, x.type, dayText(x.sent), dayText(x.requiredBy), dayText(x.returned), x.action ? ACTION_LABEL[x.action] : "", dayText(x.needed), x.lead ?? "", x.review ?? "", dayText(x.submitBy), stateLabel(x.state), x.daysOverdue || "", x.daysWithGc ?? "", x.deliveryAtRisk == null ? "" : x.deliveryAtRisk ? "Yes" : "No"]);
  return [head, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
}

// The blank template: the columns, with one example row a user deletes.
export function templateCsv() {
  return [
    "Number,Revision,Spec section,Title,Type,Sent,Required back,Returned,Action,Needed on site,Lead time (days),Review days",
    "1,0,08 11 13,Hollow metal frames shop drawings,Shop drawings,,,,,,,",
  ].join("\n");
}

export const SAMPLE_SETTINGS = { asOf: "2026-11-20" };

export function sampleLog() {
  return [
    "Number,Revision,Spec section,Title,Type,Sent,Required back,Returned,Action,Needed on site,Lead time (days),Review days",
    "1,0,26 24 16,Panelboards product data,Product data,2026-10-01,2026-10-15,2026-10-14,Approved as noted,2026-12-15,42,14",
    "2,0,26 51 00,Light fixtures product data,Product data,2026-10-20,2026-11-03,2026-11-05,Revise and resubmit,2026-12-20,35,14",
    "2,1,26 51 00,Light fixtures product data,Product data,2026-11-10,2026-11-17,,,2026-12-20,35,14",
    "3,0,26 24 13,Switchboard shop drawings,Shop drawings,2026-10-27,2026-11-10,,,2027-01-15,56,14",
    "4,0,26 05 33,Raceway and boxes product data,Product data,,,,,2026-12-01,7,10",
    "5,0,26 27 26,Wiring devices samples,Samples,,,,,2027-02-01,21,14",
    "6,0,26 05 26,Grounding test report,Test report,,,,,,,",
  ].join("\n");
}
