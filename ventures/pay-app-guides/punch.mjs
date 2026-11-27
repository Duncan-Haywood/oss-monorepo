// Punch list tracker: the items a GC, architect, owner or inspector lists at a walk-through near the
// end of a job, which the subcontractor fixes, marks done and asks the GC to back-check and accept.
// The same status rules as PayApps' own punch list (ventures/payapps/apps/payapps/src/shared/
// punch-list.ts): accepted, else "not ours" (a reason given), else done (fixed, awaiting the
// back-check), else overdue (the due date the user entered has passed), else open. "Not ours" items
// are left out of the count until settled. Nothing is estimated: every date is one the user typed.
// Pure functions, no I/O. Dates are whole UTC days; money is integer cents.
// Every exported CSV cell goes through colog.mjs csvCell (the formula-injection guard).
import { parseCsv, parseMoney, parseDate, dayText, dollars, csvCell } from "./colog.mjs";

export const STATUS_LABEL = {
  open: "Open",
  overdue: "Overdue",
  done: "Done, awaiting back-check",
  accepted: "Accepted",
  disputed: "Not ours",
};

export const statusLabel = (s) => (Object.hasOwn(STATUS_LABEL, s) ? STATUS_LABEL[s] : String(s));

const HEADERS = {
  number: /^(#|no\.?|item( no\.?| number| #)?|punch( item)?( no\.?| #)?|number|id)$/,
  desc: /^(description|desc|item description|punch item|issue|deficiency|work|what)$/,
  location: /^(location|room|area|where|loc\.?)$/,
  source: /^(listed by|by|source|from|who listed|written by|inspector)$/,
  listed: /^(listed|listed on|date listed|walk( date)?|date)$/,
  due: /^(due|due on|due date|needed by)$/,
  fixed: /^(fixed|fixed on|completed|completed on|done|done on|date fixed|date completed)$/,
  fixedBy: /^(fixed by|completed by|done by)$/,
  accepted: /^(accepted|accepted on|signed off|signed off on|back-?checked|date accepted|closed)$/,
  acceptedBy: /^(accepted by|signed off by|back-?checked by|closed by)$/,
  notOurs: /^(not ours|dispute|disputed|not our work|reason not ours|backcharge to)$/,
};

function mapHeaders(row) {
  const idx = {};
  row.forEach((h, i) => {
    const t = String(h).trim().toLowerCase().replace(/\s+/g, " ");
    for (const [k, re] of Object.entries(HEADERS)) if (idx[k] == null && re.test(t)) { idx[k] = i; break; }
  });
  return idx;
}

// One item per line, as a list pasted from the GC's email: numbering dropped ("1.", "2)", "#3",
// "P-004", "-", "*"), the location split off before a tab, " - " or ": ", nothing else guessed.
export function parseLines(text) {
  const items = [];
  for (const raw of String(text ?? "").replace(/\r\n?/g, "\n").split("\n")) {
    let line = raw.trim();
    if (!line) continue;
    line = line.replace(/^(?:[-*•]\s+|#?\d{1,4}[.)]\s+|#\d{1,4}\s+|P-\d{1,4}\s*[:.-]?\s+)/i, "").trim();
    if (!line) continue;
    let location = "", desc = line;
    const tab = line.indexOf("\t");
    const m = tab > 0 ? [line.slice(0, tab), line.slice(tab + 1)] : /^(.+?)(?: - |: )(.+)$/.exec(line)?.slice(1);
    if (m && m[0].trim() && m[1].trim()) { location = m[0].trim(); desc = m[1].trim(); }
    items.push({ description: desc, location });
  }
  return items;
}

const looksLikeHeader = (row) => {
  const idx = mapHeaders(row);
  return idx.desc != null;
};

export function parse(text) {
  const errors = [];
  const rows = parseCsv(text).filter((r) => r.some((c) => String(c).trim() !== ""));
  if (!rows.length) return { items: [], errors };
  if (!looksLikeHeader(rows[0])) {
    return { items: parseLines(text).map((x, i) => ({ number: null, ...x, line: i + 1 })), errors, mode: "lines" };
  }
  const idx = mapHeaders(rows[0]);
  const get = (r, k) => (idx[k] == null ? "" : String(r[idx[k]] ?? "").trim());
  const items = [];
  rows.slice(1).forEach((r, i) => {
    const line = i + 2;
    const description = get(r, "desc");
    if (!description) { errors.push(`Row ${line}: no description.`); return; }
    const item = { line, description, location: get(r, "location"), source: get(r, "source"), fixedBy: get(r, "fixedBy"), acceptedBy: get(r, "acceptedBy"), notOurs: get(r, "notOurs") };
    const n = get(r, "number");
    item.number = n === "" ? null : n;
    for (const k of ["listed", "due", "fixed", "accepted"]) {
      const d = parseDate(get(r, k));
      if (d === null) { errors.push(`Row ${line}: "${get(r, k)}" is not a date (use YYYY-MM-DD or MM/DD/YYYY).`); return; }
      item[k] = d ?? null;
    }
    if (item.fixed != null && item.listed != null && item.fixed < item.listed) { errors.push(`Row ${line}: fixed before it was listed.`); return; }
    if (item.accepted != null && item.fixed != null && item.accepted < item.fixed) { errors.push(`Row ${line}: accepted before it was fixed.`); return; }
    items.push(item);
  });
  return { items, errors, mode: "table" };
}

export function status(item, today) {
  if (item.accepted != null) return "accepted";
  if (item.notOurs) return "disputed";
  if (item.fixed != null) return "done";
  if (item.due != null && today != null && item.due < today) return "overdue";
  return "open";
}

// Numbers for items that have none: one past the highest numeric item number given (P-001 style).
function numberItems(items) {
  let max = 0;
  for (const x of items) { const m = /(\d+)\s*$/.exec(String(x.number ?? "")); if (m) max = Math.max(max, +m[1]); }
  return items.map((x) => (x.number ? x : { ...x, number: `P-${String(++max).padStart(3, "0")}` }));
}

export function compute(text, { asOf, retainage } = {}) {
  const { items: parsed, errors } = parse(text);
  const today = parseDate(asOf ?? "") ?? null;
  const held = String(retainage ?? "").trim() === "" ? 0 : parseMoney(retainage);
  if (held == null || held < 0) errors.push("Retainage held is not an amount of zero or more.");
  if (errors.length) return { errors, items: [] };
  const items = numberItems(parsed).map((x) => {
    const s = status(x, today);
    return { ...x, status: s, daysOverdue: s === "overdue" ? today - x.due : 0, daysOpen: s !== "accepted" && x.listed != null && today != null ? today - x.listed : null };
  });
  const count = (s) => items.filter((x) => x.status === s).length;
  const summary = { total: items.length, open: count("open"), overdue: count("overdue"), done: count("done"), accepted: count("accepted"), disputed: count("disputed") };
  summary.counted = summary.total - summary.disputed;
  summary.left = summary.open + summary.overdue + summary.done;
  summary.acceptedPct = summary.counted ? Math.floor((summary.accepted * 100) / summary.counted) : 0;
  summary.complete = summary.counted > 0 && summary.accepted === summary.counted;
  const findings = [];
  const overdue = items.filter((x) => x.status === "overdue").sort((a, b) => b.daysOverdue - a.daysOverdue);
  if (overdue.length) findings.push({ severity: "high", text: `${overdue.length} item${overdue.length === 1 ? " is" : "s are"} past the due date you entered: ${overdue.map((x) => `${x.number} (${x.daysOverdue} day${x.daysOverdue === 1 ? "" : "s"})`).join(", ")}. Fix these first; an open item is the most common reason given for holding retainage.` });
  const done = items.filter((x) => x.status === "done");
  if (done.length) findings.push({ severity: "normal", text: `${done.length} item${done.length === 1 ? " is" : "s are"} fixed and waiting on the GC's back-check: send the email below so they are walked and accepted.` });
  const disputed = items.filter((x) => x.status === "disputed");
  if (disputed.length) findings.push({ severity: "normal", text: `${disputed.length} item${disputed.length === 1 ? " is" : "s are"} marked not yours and left out of the count. Get the GC to agree in writing (or reassign them), or the list can stay open on your name.` });
  const noDue = items.filter((x) => (x.status === "open") && x.due == null);
  if (noDue.length) findings.push({ severity: "normal", text: `${noDue.length} open item${noDue.length === 1 ? " has" : "s have"} no due date. Ask the GC when they need them, so "done" has a target.` });
  const noAcceptor = items.filter((x) => x.status === "accepted" && !x.acceptedBy);
  if (items.some((x) => x.acceptedBy != null && x.acceptedBy !== "") && noAcceptor.length) findings.push({ severity: "normal", text: `${noAcceptor.length} accepted item${noAcceptor.length === 1 ? " does" : "s do"} not say who accepted ${noAcceptor.length === 1 ? "it" : "them"}. A name and date is what you show when the release is held "for the punch list".` });
  if (summary.complete) findings.push({ severity: "normal", text: `Every item that counts is accepted. If the rest of close-out is in, ask for your retainage in writing (the release letter on the retainage release page).` });
  return { errors: [], items, summary, findings, held: held ?? 0, today };
}

export function summaryText(r) {
  const s = r.summary;
  if (!s.total) return "No items yet.";
  const parts = [`${s.total} item${s.total === 1 ? "" : "s"}`, `${s.accepted} accepted (${s.acceptedPct}% of the ${s.counted} that count)`, `${s.done} done awaiting back-check`, `${s.open} open`, `${s.overdue} overdue`];
  if (s.disputed) parts.push(`${s.disputed} marked not ours`);
  let t = parts.join(", ") + ".";
  if (r.held > 0) t += s.complete ? ` Punch list complete; ${dollars(r.held)} of retainage held.` : ` ${dollars(r.held)} of retainage held while ${s.left} item${s.left === 1 ? "" : "s"} ${s.left === 1 ? "is" : "are"} not accepted.`;
  return t;
}

const greeting = (name) => (String(name ?? "").trim() ? `Hi ${String(name).trim().split(/\s+/)[0]},` : "Hi,");

// The back-check request: every fixed item awaiting acceptance, and how many are still open.
// It says what was fixed; it does not say any contract condition is met.
export function backCheckEmail(r, { gc, pm, project, sub, date } = {}) {
  const done = r.items.filter((x) => x.status === "done");
  if (!done.length) return "";
  const left = r.summary.open + r.summary.overdue;
  const lines = [
    `Subject: ${project ? `${project}: ` : ""}punch list items ready for back-check`,
    "",
    greeting(pm),
    "",
    `The following punch list items${gc ? ` from ${gc}'s list` : ""} are complete and ready for your back-check:`,
    "",
    ...done.map((x) => `  ${x.number}  ${x.location ? `${x.location}: ` : ""}${x.description}${x.fixed != null ? ` (fixed ${dayText(x.fixed)})` : ""}`),
    "",
    left ? `${left} item${left === 1 ? " is" : "s are"} still open on our side; we will send those when they are done.` : "With these, every item on the list for us is complete.",
    "Please let us know a time to walk them, or initial them as accepted.",
    "",
    "Thank you,",
    sub || "",
  ];
  if (date) lines.splice(1, 0, `Date: ${date}`);
  return lines.join("\n").trimEnd();
}

export function itemsCsv(r) {
  const head = ["Item", "Location", "Description", "Listed by", "Listed", "Due", "Fixed", "Fixed by", "Accepted", "Accepted by", "Not ours", "Status", "Days overdue", "GC initials"];
  const rows = r.items.map((x) => [x.number, x.location, x.description, x.source, dayText(x.listed), dayText(x.due), dayText(x.fixed), x.fixedBy, dayText(x.accepted), x.acceptedBy, x.notOurs, statusLabel(x.status), x.daysOverdue || "", ""]);
  return [head, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
}

export const SAMPLE_SETTINGS = { asOf: "2026-11-20", retainage: "18,400.00" };

export function sampleItems() {
  return [
    "Item,Location,Description,Listed by,Listed,Due,Fixed,Fixed by,Accepted,Accepted by,Not ours",
    "P-001,Corridor 2,Missing cover plate at receptacle by door 214,GC,2026-11-03,2026-11-10,2026-11-07,R. Diaz,2026-11-12,M. Hill,",
    "P-002,Room 104,Label panel LP-1 directory,Architect,2026-11-03,2026-11-10,2026-11-09,R. Diaz,,,",
    "P-003,Room 118,Exit sign not illuminated,Inspector,2026-11-03,2026-11-14,,,,,",
    "P-004,Lobby,Device plate cracked at reception desk,GC,2026-11-03,2026-11-24,,,,,",
    "P-005,Room 210,Ceiling tile damaged above fixture,GC,2026-11-03,2026-11-14,,,,,Ceiling contractor's tile; reported to GC 11/04",
    "P-006,Mech room,Seal conduit penetration at fire wall,Inspector,2026-11-05,2026-11-12,2026-11-11,T. Park,2026-11-13,M. Hill,",
  ].join("\n");
}
