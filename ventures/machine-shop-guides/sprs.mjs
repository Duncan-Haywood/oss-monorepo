/**
 * SPRS-style score from a list of requirement statuses, following the DoD
 * Assessment Methodology v1.2.1 arithmetic: start at 110 and subtract the
 * point value of every requirement that is not implemented.
 *
 * statuses: { "3.1.1": "met" | "not_met" | "partial", ... }. A requirement
 * with no status is treated as not yet answered, and counted separately so a
 * half-finished self-check never reads as a finished score.
 */
import { REQUIREMENTS, PARTIAL, MAX_SCORE, FAMILIES } from "./sprs-data.mjs";

// The minimum score for Conditional Level 2 status under 32 CFR 170.21 is
// 80% of the maximum: 0.8 x 110 = 88.
export const CONDITIONAL_MIN = Math.round(MAX_SCORE * 0.8);

export function scoreSprs(statuses = {}) {
  let score = MAX_SCORE;
  let unanswered = 0;
  const gaps = [];
  const byFamily = {};
  for (const fam of Object.keys(FAMILIES)) byFamily[fam] = { name: FAMILIES[fam], deducted: 0, notMet: 0 };
  let sspMissing = false;

  for (const req of REQUIREMENTS) {
    const s = statuses[req.id];
    if (s !== "met" && s !== "not_met" && s !== "partial") {
      unanswered += 1;
      continue;
    }
    if (s === "met") continue;
    if (req.weight === null) {
      // 3.12.4: no points, but no SSP means no valid assessment.
      sspMissing = true;
      gaps.push({ ...req, deduct: 0, status: s });
      continue;
    }
    const deduct = s === "partial" && PARTIAL[req.id] ? PARTIAL[req.id].deduct : req.weight;
    score -= deduct;
    byFamily[req.family].deducted += deduct;
    byFamily[req.family].notMet += 1;
    gaps.push({ ...req, deduct, status: s === "partial" && PARTIAL[req.id] ? "partial" : "not_met" });
  }

  gaps.sort((a, b) => b.deduct - a.deduct || compareIds(a.id, b.id));

  // POA&M eligibility as 32 CFR 170.21 describes it for Conditional Level 2
  // status: only 1-point requirements, except 3.13.11 at its 3-point partial
  // value. 170.21(a)(2) also names specific requirements that may never be
  // on a POA&M; this check does not encode that list, and says so.
  const blocking = gaps.filter(
    (g) => g.weight !== null && !(g.deduct === 1 || (g.id === "3.13.11" && g.status === "partial")),
  );
  const conditional = {
    scoreOk: score >= CONDITIONAL_MIN,
    blocking: blocking.map((g) => g.id),
    possible: !sspMissing && unanswered === 0 && score >= CONDITIONAL_MIN && blocking.length === 0,
  };

  return {
    score,
    complete: unanswered === 0,
    unanswered,
    sspMissing,
    gaps,
    byFamily,
    conditional,
    deducted: MAX_SCORE - score,
  };
}

export function compareIds(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

/** A POA&M starter: one CSV row per gap, for the shop to complete. */
export function gapsToCsv(gaps) {
  const head = ["Requirement", "Short label", "Points deducted", "Status", "Planned action", "Responsible", "Milestone date", "Resources"];
  const esc = (v) => {
    const s = String(v ?? "");
    // Neutralise spreadsheet formula injection as well as quoting.
    const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) ? `'${s}` : s;
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const rows = gaps.map((g) => [
    g.id,
    g.label,
    g.deduct,
    g.status === "partial" ? PARTIAL[g.id]?.label ?? "Partial" : "Not met",
    "",
    "",
    "",
    "",
  ]);
  return [head, ...rows].map((r) => r.map(esc).join(",")).join("\n") + "\n";
}
