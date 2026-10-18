// UK Shared Parental Pay (ShPP) planner. Rules written from memory, no live lookup:
//  - Qualifying week = the 15th week before the expected week of childbirth
//    (EWC); weeks run Sunday to Saturday.
//  - Each parent needs 26 weeks' continuous employment to the end of the
//    qualifying week and average weekly earnings (AWE) at least the lower
//    earnings limit (LEL) to get statutory pay from an employer.
//  - The mother's 39 weeks of maternity pay are a shared pool. If she ends her
//    maternity pay early (minimum 2 weeks after birth), the weeks she does not
//    use (39 minus the weeks of SMP she took) can be paid as ShPP to either
//    parent, in blocks of at least one week.
//  - SMP: 90% of AWE for 6 weeks, then the LOWER of the standard weekly rate
//    and 90% of AWE. ShPP: the LOWER of the standard rate and 90% of AWE.
//  - Rates uprate each April and apply to each week of pay on its own date.
// Planner assumption: the partner's shared weeks are scheduled directly after
// the SMP block, followed by the mother's remaining shared weeks. Order does
// not change the amounts except across an April uprating.
// Dates are calendar days (UTC), never timestamps.

export const RATES = [
  { from: Date.UTC(2025, 3, 6) / 86400000, standard: 187.18, lel: 125, label: "2025/26" },
  { from: Date.UTC(2026, 3, 6) / 86400000, standard: 194.32, lel: 129, label: "2026/27" },
];
export const LAST_KNOWN_END = Date.UTC(2027, 3, 6) / 86400000;
export const POOL_WEEKS = 39;
export const HIGH_WEEKS = 6;
export const MIN_SMP_WEEKS = 2;
export const VERIFY = "Verify the rates and eligibility on GOV.UK (Shared Parental Leave and Pay) or with the HMRC Employers' Helpline before you rely on or pay these figures.";

const DAY = 86400000;
const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

export function toDay(iso) {
  const m = ISO.exec(String(iso || "").trim());
  if (!m) return null;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  const d = new Date(t);
  if (d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) return null;
  return t / DAY;
}
export const fromDay = (n) => new Date(n * DAY).toISOString().slice(0, 10);
const weekday = (n) => ((new Date(n * DAY).getUTCDay() + 6) % 7) + 1; // Mon=1..Sun=7
export const sundayOnOrBefore = (n) => n - (weekday(n) % 7);
const money = (n) => "£" + (Math.round(n * 100) / 100).toFixed(2);
const r2 = (n) => Math.round(n * 100) / 100;

export function rateAt(day) {
  let cur = RATES[0];
  for (const r of RATES) if (day >= r.from) cur = r;
  return cur;
}

export const SAMPLE = {
  expectedDate: "2026-11-20",
  motherWeekly: "520",
  motherEmploymentStart: "2024-03-01",
  partnerWeekly: "720",
  partnerEmploymentStart: "2023-06-01",
  smpWeeks: "26",
  partnerWeeks: "13",
};

function num(v) {
  const s = String(v ?? "").replace(/[£,\s]/g, "");
  return s === "" ? NaN : Number(s);
}

function eligibility(awe, emp, qualifyingWeek) {
  const qwRate = rateAt(qualifyingWeek + 6);
  const employedWeeks = Math.floor((qualifyingWeek + 6 - emp + 1) / 7);
  const lengthOk = employedWeeks >= 26;
  const earningsOk = awe >= qwRate.lel;
  return { employedWeeks, lengthOk, earningsOk, eligible: lengthOk && earningsOk, qwRate };
}

// Pay for a plan: the mother takes `smpWeeks` of SMP, then `partnerWeeks` of
// ShPP go to the partner and the rest of the pool to the mother.
function price(ctx, partnerWeeks) {
  const { start, motherAwe, partnerAwe, mother, partner, smpWeeks } = ctx;
  const shared = POOL_WEEKS - smpWeeks;
  const motherShared = shared - partnerWeeks;
  let smpTotal = 0, beyond = false;
  const smpRows = [];
  if (mother.eligible) {
    for (let i = 0; i < smpWeeks; i++) {
      const wk = start + 7 * i;
      if (wk >= LAST_KNOWN_END) beyond = true;
      const high = i < HIGH_WEEKS;
      const amount = r2(high ? 0.9 * motherAwe : Math.min(rateAt(wk).standard, 0.9 * motherAwe));
      const phase = high ? "Mother: SMP at 90% of earnings" : "Mother: SMP at the lower of the standard rate and 90%";
      const last = smpRows[smpRows.length - 1];
      if (last && last.phase === phase && last.weekly === amount) { last.weeks++; last.total = r2(last.total + amount); }
      else smpRows.push({ phase, weekly: amount, weeks: 1, total: amount });
      smpTotal = r2(smpTotal + amount);
    }
  }
  const sharedRows = [];
  let partnerTotal = 0, motherSharedTotal = 0, k = 0;
  const addShared = (who, weeks, awe, elig) => {
    for (let i = 0; i < weeks; i++, k++) {
      const wk = start + 7 * (smpWeeks + k);
      if (wk >= LAST_KNOWN_END) beyond = true;
      const amount = elig ? r2(Math.min(rateAt(wk).standard, 0.9 * awe)) : 0;
      const phase = `${who}: ShPP at the lower of the standard rate and 90%`;
      const last = sharedRows[sharedRows.length - 1];
      if (last && last.phase === phase && last.weekly === amount) { last.weeks++; last.total = r2(last.total + amount); }
      else sharedRows.push({ phase, weekly: amount, weeks: 1, total: amount });
      if (who === "Partner") partnerTotal = r2(partnerTotal + amount); else motherSharedTotal = r2(motherSharedTotal + amount);
    }
  };
  addShared("Partner", partnerWeeks, partnerAwe, partner.eligible);
  addShared("Mother", motherShared, motherAwe, mother.eligible);
  return { partnerWeeks, motherShared, smpTotal, partnerTotal, motherSharedTotal, total: r2(smpTotal + partnerTotal + motherSharedTotal), rows: [...smpRows, ...sharedRows], beyond };
}

export function compute(input) {
  const errors = [];
  const mAwe = num(input.motherWeekly);
  const pAwe = num(input.partnerWeekly);
  if (!(mAwe >= 0)) errors.push("Enter the mother's average weekly earnings as a number (for example 520).");
  if (!(pAwe >= 0)) errors.push("Enter the partner's average weekly earnings as a number (for example 720).");
  const ewc = toDay(input.expectedDate);
  if (ewc === null) errors.push("Enter the expected due date as YYYY-MM-DD.");
  const mEmp = toDay(input.motherEmploymentStart);
  if (mEmp === null) errors.push("Enter the date the mother's continuous employment started as YYYY-MM-DD.");
  const pEmp = toDay(input.partnerEmploymentStart);
  if (pEmp === null) errors.push("Enter the date the partner's continuous employment started as YYYY-MM-DD.");
  const smpWeeks = num(input.smpWeeks);
  if (!Number.isInteger(smpWeeks) || smpWeeks < MIN_SMP_WEEKS || smpWeeks > POOL_WEEKS) errors.push(`Enter how many weeks of maternity pay the mother takes first, a whole number from ${MIN_SMP_WEEKS} to ${POOL_WEEKS}.`);
  const pwRaw = String(input.partnerWeeks ?? "").trim();
  const wanted = pwRaw === "" ? null : num(pwRaw);
  if (wanted !== null && (!Number.isInteger(wanted) || wanted < 0)) errors.push("Enter the partner's shared weeks as a whole number, or leave it blank.");
  if (errors.length) return { errors };

  const ewcWeek = sundayOnOrBefore(ewc);
  const qualifyingWeek = ewcWeek - 15 * 7;
  const mother = eligibility(mAwe, mEmp, qualifyingWeek);
  const partner = eligibility(pAwe, pEmp, qualifyingWeek);
  const shared = POOL_WEEKS - smpWeeks;
  const findings = [];
  const ctx = { start: ewcWeek, motherAwe: mAwe, partnerAwe: pAwe, mother, partner, smpWeeks };

  for (const [who, e, awe] of [["mother", mother, mAwe], ["partner", partner, pAwe]]) {
    if (!e.lengthOk) findings.push({ severity: "high", title: `The ${who}'s continuous employment to the end of the qualifying week (${fromDay(qualifyingWeek + 6)}) is about ${Math.max(0, e.employedWeeks)} weeks; 26 are needed, so no statutory pay is due from their employer on these dates.` });
    if (!e.earningsOk) findings.push({ severity: "high", title: `The ${who}'s average weekly earnings of ${money(awe)} are below the ${money(e.qwRate.lel)} lower earnings limit (${e.qwRate.label}), so no statutory pay is due from their employer.` });
  }
  if (!mother.eligible) findings.push({ severity: "medium", title: "If the mother does not qualify for SMP she may get Maternity Allowance, which can also be shared; this tool models SMP only, so her weeks are shown as £0." });
  if (shared === 0) findings.push({ severity: "medium", title: "Taking all 39 weeks as maternity pay leaves nothing to share. Choose fewer SMP weeks to plan Shared Parental Pay." });

  const plan = wanted === null ? Math.min(shared, 0) : Math.min(wanted, shared);
  if (wanted !== null && wanted > shared) findings.push({ severity: "medium", title: `Only ${shared} shared weeks remain after ${smpWeeks} weeks of SMP; the plan uses ${shared} for the partner instead of ${wanted}.` });

  // Scenario table: every 4 weeks of partner share, plus the ends and the plan.
  const set = new Set([0, shared, plan]);
  for (let p = 4; p < shared; p += 4) set.add(p);
  const scenarios = [...set].sort((a, b) => a - b).map((p) => ({ ...price(ctx, p), isPlan: p === plan }));
  const best = scenarios.reduce((a, b) => (b.total > a.total ? b : a));
  const current = price(ctx, plan);

  if (current.beyond) findings.push({ severity: "medium", title: "Weeks from 6 April 2027 use the 2026/27 standard rate because the next uprating was not available. Check GOV.UK." });
  if (best.total > current.total + 0.005) findings.push({ severity: "info", title: `Giving the partner ${best.partnerWeeks} shared weeks instead of ${plan} would raise household statutory pay by ${money(best.total - current.total)}, to ${money(best.total)}.` });
  else findings.push({ severity: "info", title: "Within the weeks you chose, no other split of the shared weeks pays the household more in statutory pay." });
  const mRate = mother.eligible ? Math.min(rateAt(ewcWeek).standard, 0.9 * mAwe) : 0;
  const pRate = partner.eligible ? Math.min(rateAt(ewcWeek).standard, 0.9 * pAwe) : 0;
  if (mRate === pRate && mother.eligible && partner.eligible) findings.push({ severity: "info", title: `Both parents get the same weekly ShPP (${money(mRate)}), so statutory pay is the same whoever takes the shared weeks. Employer enhanced pay, if any, usually decides the split.` });
  findings.push({ severity: "info", title: "The most SMP weeks you can give up are 37 (the mother must take at least 2 weeks after the birth). Shared leave can be taken in separate blocks of at least one week, and each parent can give up to 3 notices. Check the notice rules." });
  findings.push({ severity: "info", title: "ShPP for the partner also needs the mother to meet the work-and-earnings test (26 weeks of work in the 66 before the due week and earnings over the threshold in 13 of them). This tool does not test it." });
  findings.push({ severity: "info", title: "Employer enhanced maternity or shared parental pay, which can be far higher than statutory pay, is not included." });
  return { errors, ewc, ewcWeek, qualifyingWeek, mother, partner, mAwe, pAwe, smpWeeks, shared, plan, current, scenarios, best, findings };
}

export function summaryText(r) {
  const lines = ["UK Shared Parental Pay plan", ""];
  lines.push(`Expected due date: ${fromDay(r.ewc)} (week starting ${fromDay(r.ewcWeek)}); qualifying week starts ${fromDay(r.qualifyingWeek)}`);
  for (const [who, e, awe] of [["Mother", r.mother, r.mAwe], ["Partner", r.partner, r.pAwe]]) {
    lines.push(`${who}: about ${Math.max(0, e.employedWeeks)} weeks' employment (26 needed), earnings ${money(awe)} vs LEL ${money(e.qwRate.lel)}: ${e.eligible ? "eligible" : "not eligible"}`);
  }
  lines.push(`Mother takes ${r.smpWeeks} weeks of SMP, leaving ${r.shared} shared weeks; partner takes ${r.plan}, mother ${r.current.motherShared}.`);
  for (const x of r.current.rows) lines.push(`  ${x.phase}: ${x.weeks} week(s) x ${money(x.weekly)} = ${money(x.total)}`);
  lines.push(`Household statutory pay: ${money(r.current.total)}`);
  lines.push("", "Other splits of the shared weeks:");
  for (const s of r.scenarios) lines.push(`  partner ${s.partnerWeeks} / mother ${s.motherShared}: ${money(s.total)}${s.isPlan ? "  <- your plan" : ""}`);
  lines.push("");
  for (const f of r.findings) lines.push(`- [${f.severity}] ${f.title}`);
  lines.push("", VERIFY, "Not legal, payroll or employment advice. No warranty.");
  return lines.join("\n");
}
