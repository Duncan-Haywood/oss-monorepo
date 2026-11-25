// CMMC Level 1 (Self) self-check logic. Pure functions; the page and the
// tests share them.
//
// The rule it encodes (32 CFR 170.15 and 170.21, SOURCES.md): every one of the
// 15 requirements must be MET for Final Level 1 (Self) status. There is no
// score and no POA&M at Level 1, so one requirement not met means the shop
// cannot claim Level 1 until it is fixed. The self-assessment is repeated
// annually, with an affirmation each year.

import { L1_REQUIREMENTS } from "./l1-data.mjs";

export const STATUSES = ["met", "not_met"];

/**
 * @param {Record<string, "met"|"not_met">} answers keyed by requirement id
 * @returns {{met:number, notMet:string[], unanswered:string[], complete:boolean, allMet:boolean, verdict:string}}
 */
export function assessL1(answers = {}) {
  const notMet = [];
  const unanswered = [];
  let met = 0;
  for (const r of L1_REQUIREMENTS) {
    const a = answers[r.id];
    if (a === "met") met++;
    else if (a === "not_met") notMet.push(r.id);
    else unanswered.push(r.id);
  }
  const complete = unanswered.length === 0;
  const allMet = complete && notMet.length === 0;
  let verdict;
  if (notMet.length) verdict = "not-met";
  else if (!complete) verdict = "incomplete";
  else verdict = "all-met";
  return { met, notMet, unanswered, complete, allMet, verdict };
}

/** Parse YYYY-MM-DD as a calendar date (no time zone drift). */
function parseDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ""));
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return { y, mo, d };
}

/**
 * The date a year after the assessment, when the annual self-assessment and
 * affirmation come round again. 29 Feb rolls to 28 Feb so the reminder is not
 * late. Returns null for an invalid date.
 */
export function nextAnnualDate(isoDate) {
  const p = parseDate(isoDate);
  if (!p) return null;
  let { y, mo, d } = p;
  y += 1;
  if (mo === 2 && d === 29) d = 28;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

const esc = (v) => {
  const s = String(v ?? "");
  // Neutralise spreadsheet formula injection as well as quoting.
  const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/**
 * A worksheet CSV: one row per requirement with the status and the shop's own
 * evidence notes, headed by the assessment details the shop will need when it
 * enters a result in SPRS.
 */
export function l1ToCsv(answers = {}, notes = {}, meta = {}) {
  const r = assessL1(answers);
  const label = { met: "Met", not_met: "Not met" };
  const lines = [
    ["CMMC Level 1 self-check worksheet (not an SPRS submission)"],
    ["Organization", meta.org ?? ""],
    ["CAGE code(s)", meta.cage ?? ""],
    ["Assessment scope", meta.scope ?? ""],
    ["Assessment date", meta.date ?? ""],
    ["Next annual self-assessment and affirmation due", nextAnnualDate(meta.date) ?? ""],
    ["Result", r.verdict === "all-met" ? "All 15 requirements marked met" : r.verdict === "not-met" ? `${r.notMet.length} not met: Level 1 cannot be claimed until fixed (no POA&M at Level 1)` : `${r.unanswered.length} not yet answered`],
    [],
    ["Requirement", "FAR 52.204-21", "NIST SP 800-171 Rev. 2", "Requirement text", "Status", "How it is met (evidence)"],
    ...L1_REQUIREMENTS.map((q) => [q.id, q.far, q.nist.join(" "), q.text, label[answers[q.id]] ?? "Not answered", notes[q.id] ?? ""]),
  ];
  return lines.map((l) => l.map(esc).join(",")).join("\n") + "\n";
}
