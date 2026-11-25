// CMMC Level 1 (Self) self-check logic. Pure functions; the page and the
// tests share them.
//
// The rule it encodes (SOURCES.md):
// - 32 CFR 170.15(c)(1): the self-assessment uses the NIST SP 800-171A
//   objectives each requirement maps to (59 in all, `L1_OBJECTIVES`).
// - 32 CFR 170.24(b): each objective is MET, NOT MET or N/A, and "an
//   assessment objective assessed as N/A is equivalent to the same assessment
//   objective being assessed as MET".
// - 32 CFR 170.24(c)(1): "All CMMC Level 1 security requirements must be fully
//   implemented to be considered MET. No POA&M is permitted for CMMC Level 1,
//   and self-assessment results are scored as MET or NOT MET in their
//   entirety." So a requirement is met only when all its objectives are, and
//   one requirement not met means Level 1 cannot be claimed until it is fixed.
// The self-assessment is repeated annually, with an affirmation each year.

import { L1_REQUIREMENTS, L1_OBJECTIVES } from "./l1-data.mjs";

export const STATUSES = ["met", "not_met", "na"];

/**
 * An objective's answer: its own (keyed "3.1.1[a]"), else the answer given to
 * its whole requirement (keyed "AC.L1-b.1.i"), which marks every objective.
 */
export function objectiveAnswer(answers, req, obj) {
  const own = answers[obj.id];
  if (STATUSES.includes(own)) return own;
  const all = answers[req.id];
  return STATUSES.includes(all) ? all : undefined;
}

/**
 * @param {Record<string, "met"|"not_met"|"na">} answers keyed by objective id, or by requirement id for all its objectives
 * @returns {{met:number, notMet:string[], unanswered:string[], complete:boolean, allMet:boolean, verdict:string,
 *   objectives:number, answered:number, requirements:Array<{id:string,status:string,notMet:string[],unanswered:number,na:number,objectives:number}>}}
 */
export function assessL1(answers = {}) {
  const notMet = [];
  const unanswered = [];
  const requirements = [];
  let met = 0, objectives = 0, answered = 0;
  for (const r of L1_REQUIREMENTS) {
    const objs = L1_OBJECTIVES[r.id];
    const bad = [];
    let open = 0, na = 0;
    for (const o of objs) {
      const a = objectiveAnswer(answers, r, o);
      objectives++;
      if (a) answered++;
      if (a === "not_met") bad.push(o.id);
      else if (a === "na") na++;
      else if (a !== "met") open++;
    }
    const status = bad.length ? "not_met" : open ? "incomplete" : "met";
    if (status === "met") met++;
    else if (status === "not_met") notMet.push(r.id);
    else unanswered.push(r.id);
    requirements.push({ id: r.id, status, notMet: bad, unanswered: open, na, objectives: objs.length });
  }
  const complete = unanswered.length === 0;
  const allMet = complete && notMet.length === 0;
  let verdict;
  if (notMet.length) verdict = "not-met";
  else if (!complete) verdict = "incomplete";
  else verdict = "all-met";
  return { met, notMet, unanswered, complete, allMet, verdict, objectives, answered, requirements };
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
 * A worksheet CSV: one row per assessment objective with its finding, the
 * requirement's result and the shop's own evidence note, headed by the
 * assessment details the shop will need when it enters a result in SPRS.
 */
export function l1ToCsv(answers = {}, notes = {}, meta = {}) {
  const r = assessL1(answers);
  const label = { met: "Met", not_met: "Not met", na: "N/A" };
  const reqStatus = Object.fromEntries(r.requirements.map((q) => [q.id, q.status]));
  const lines = [
    ["CMMC Level 1 self-check worksheet (not an SPRS submission)"],
    ["Organization", meta.org ?? ""],
    ["CAGE code(s)", meta.cage ?? ""],
    ["Assessment scope", meta.scope ?? ""],
    ["Assessment date", meta.date ?? ""],
    ["Next annual self-assessment and affirmation due", nextAnnualDate(meta.date) ?? ""],
    ["Result", r.verdict === "all-met" ? "All 15 requirements met (all 59 objectives met or N/A)" : r.verdict === "not-met" ? `${r.notMet.length} not met: Level 1 cannot be claimed until fixed (no POA&M at Level 1)` : `${r.unanswered.length} requirement(s) not fully answered`],
    [],
    ["Requirement", "FAR 52.204-21", "NIST SP 800-171A objective", "Determine if (FCI read for CUI)", "Objective finding", "Requirement result", "How it is met (evidence)"],
    ...L1_REQUIREMENTS.flatMap((q) => L1_OBJECTIVES[q.id].map((o) => [
      q.id, q.far, o.id, o.text, label[objectiveAnswer(answers, q, o)] ?? "Not answered",
      label[reqStatus[q.id]] ?? "Incomplete", notes[q.id] ?? "",
    ])),
  ];
  return lines.map((l) => l.map(esc).join(",")).join("\n") + "\n";
}
