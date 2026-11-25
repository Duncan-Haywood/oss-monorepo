/**
 * SPRS-style score from a list of requirement statuses, following the DoD
 * Assessment Methodology v1.2.1 arithmetic: start at 110 and subtract the
 * point value of every requirement that is not implemented.
 *
 * statuses: { "3.1.1": "met" | "not_met" | "partial", ... }. A requirement
 * with no status is treated as not yet answered, and counted separately so a
 * half-finished self-check never reads as a finished score.
 */
import { REQUIREMENTS, PARTIAL, MAX_SCORE, FAMILIES, POAM_PROHIBITED } from "./sprs-data.mjs";

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

  // POA&M eligibility as 32 CFR 170.21(a)(2) describes it for Conditional
  // Level 2 status: only 1-point requirements, except 3.13.11 at its 3-point
  // partial value, and never one of the six listed in (a)(2)(iii).
  for (const g of gaps) g.poam = poamRule(g);
  const blocking = gaps.filter((g) => g.weight !== null && g.poam !== "allowed");
  const conditional = {
    scoreOk: score >= CONDITIONAL_MIN,
    blocking: blocking.map((g) => g.id),
    overWeight: blocking.filter((g) => g.poam === "over_one_point").map((g) => g.id),
    prohibited: blocking.filter((g) => g.poam === "prohibited").map((g) => g.id),
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

/**
 * Whether a gap may sit on a POA&M for Conditional Level 2 status
 * (32 CFR 170.21(a)(2)): "allowed", "prohibited" (one of the six named in
 * (a)(2)(iii)) or "over_one_point" (worth more than 1 point; 3.13.11 partial
 * is the stated exception).
 */
export function poamRule(gap) {
  if (POAM_PROHIBITED[gap.id]) return "prohibited";
  if (gap.deduct === 1 || (gap.id === "3.13.11" && gap.status === "partial")) return "allowed";
  return "over_one_point";
}

export const POAM_RULE_TEXT = {
  allowed: "Yes",
  prohibited: "No: listed in 32 CFR 170.21(a)(2)(iii); must be met",
  over_one_point: "No: worth more than 1 point; must be met",
};

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
  const head = ["Requirement", "Short label", "Points deducted", "Status", "POA&M allowed (32 CFR 170.21)", "Planned action", "Responsible", "Milestone date", "Resources"];
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
    POAM_RULE_TEXT[g.poam ?? poamRule(g)],
    "",
    "",
    "",
    "",
  ]);
  return [head, ...rows].map((r) => r.map(esc).join(",")).join("\n") + "\n";
}
