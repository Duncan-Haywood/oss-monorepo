// Sole-proprietor retirement contribution limits: SEP-IRA and solo 401(k) (US). The
// self-employed formula is circular on paper (the plan rate applies to earnings after
// the contribution itself), so the rate is 25% / 1.25 = 20% of net earnings, where net
// earnings = Schedule C profit less half of self-employment tax (IRS Pub. 560 rate-table
// worksheet). Solo 401(k): the employee deferral comes first, then 20% as the
// employer share, all under the section 415(c) cap. Dollar amounts are cents.
//
// LIMITS were typed from memory of IRS Notice 2025-67 (2026) and Notice 2024-80 (2025)
// on 2026-10-27, then checked on 2026-11-17 against the text of Notice 2025-67
// (irs.gov/pub/irs-drop/n-25-67.pdf, which states each 2026 figure next to the 2025 one
// it replaces): all ten match. platform/ci/check_plan_limits_2026.py pins them.
// Pass `limits` to override. A worksheet, not tax advice; it ignores other employers'
// plans, which share the employee-deferral limit.
import { selfEmployment } from "./taxforms.mjs";

const D = (n) => n * 100;
export const LIMITS = {
  2025: { deferral: D(23500), catchUp50: D(7500), catchUp6063: D(11250), total415c: D(70000), compLimit: D(350000) },
  2026: { deferral: D(24500), catchUp50: D(8000), catchUp6063: D(11250), total415c: D(72000), compLimit: D(360000) },
};

export function retirementLimits(profitCents, { year = new Date().getFullYear(), age = 40, wages = 0, limits } = {}) {
  const warnings = [];
  const L = limits ?? LIMITS[year];
  if (!L) throw new Error(`No retirement limits on file for ${year}; pass limits.`);
  if (!limits) warnings.push(`The ${year} limits match the IRS text of Notice 2025-67 (checked 2026-11-17); confirm they are still current before contributing.`);
  const se = selfEmployment(profitCents, { year, wages });
  const earned = Math.max(0, Math.min(profitCents - se.deduction, L.compLimit));
  const catchUp = age >= 60 && age <= 63 ? L.catchUp6063 : age >= 50 ? L.catchUp50 : 0;
  const sep = Math.min(Math.round(earned * 0.2), L.total415c);
  const employer = Math.round(earned * 0.2);
  const deferral = Math.min(L.deferral + catchUp, earned);
  const capTotal = L.total415c + catchUp;
  const total = Math.min(deferral + employer, capTotal, earned);
  if (profitCents <= 0) warnings.push("No profit, so nothing can be contributed.");
  if (wages > 0) warnings.push("Wages from another job are counted only for the social security base; a 401(k) deferral there uses up the same employee limit.");
  warnings.push("A SEP-IRA and a solo 401(k) are alternatives, not additions, for the employer share; a plan must be set up (and a solo 401(k) opened) by its own deadline.");
  return {
    year, age, profit: profitCents, seDeduction: se.deduction, earned,
    sep: { max: sep },
    solo401k: { employee: deferral, employer: Math.min(employer, Math.max(0, total - deferral)), total, catchUp },
    warnings,
  };
}
