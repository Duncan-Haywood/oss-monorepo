// UK unfair dismissal compensation estimate (England, Scotland and Wales; employment tribunal).
// Pure functions, no I/O. Bad input is rejected with a message, never clamped.
// Written from memory WITHOUT network access in the building session. Modelled: Employment Rights Act 1996 s.119 (basic award, same
// age-banded weeks as statutory redundancy pay, at most 20 years counted, weekly pay capped), s.122(4) (a redundancy payment already
// received is set against the basic award), s.123 (compensatory award: loss of earnings to the hearing, future loss, loss of statutory
// rights, pension loss), s.124 (cap: the lower of a fixed amount and 52 weeks' gross pay; no cap for automatic unfair dismissal such as
// whistleblowing), TULRCA 1992 s.207A (ACAS Code uplift or reduction of up to 25%), and the Polkey and contributory-fault reductions.
// Order applied here: loss -> Polkey reduction -> ACAS adjustment -> contributory fault -> cap. Tribunals decide the order in the case in front of them.
// Figures that change each April (weekly pay cap GBP 751 and the compensatory cap) are used as entered; the GBP 118,223 default is the
// April 2025 figure and the 2026/27 one must be checked on GOV.UK. Eligibility needs 2 years' service for most dismissals today; the
// Employment Rights Act 2025 is expected to shorten it, so check the date it applies to you.
// NOT modelled: injury to feelings (discrimination), wrongful dismissal / notice pay, tax on awards (first GBP 30,000 of termination
// payments is tax-free, the rest is taxed, and awards may be grossed up), recoupment of benefits, Northern Ireland, interest, and
// whether the dismissal was in fact unfair. Every result names its source to verify.

export const VERIFY = "GOV.UK 'Compensation for unfair dismissal'/'Employment tribunals: calculate compensation' and 'Early conciliation'; Employment Rights Act 1996 ss.119-124; TULRCA 1992 s.207A";
export const MAX_YEARS = 20;
export const MIN_SERVICE_YEARS = 2;
export const WEEKLY_CAPS = { 2025: 719, 2026: 751 };
export const COMP_CAP_DEFAULT = 118223;
export const STATUTORY_RIGHTS = 500;

const money = (n) => (n < 0 ? "-" : "") + "GBP " + Number(Math.round(Math.abs(n) * 100) / 100).toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const r2 = (n) => Math.round(n * 100) / 100;
const DAY = 86400000;

function dateParts(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ""));
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return { y, mo, d, t: dt.getTime() };
}
export function wholeYears(from, to) {
  let n = to.y - from.y;
  if (to.mo < from.mo || (to.mo === from.mo && to.d < from.d)) n -= 1;
  return n;
}
export function weeklyCapFor(end) {
  return end.t >= Date.UTC(2026, 3, 6) ? WEEKLY_CAPS[2026] : WEEKLY_CAPS[2025];
}
const iso = (t) => new Date(t).toISOString().slice(0, 10);

// Three months less one day from the effective date of termination (limit to start the ACAS process / claim).
export function claimDeadline(end) {
  const total = end.mo - 1 + 3;
  const y = end.y + Math.floor(total / 12), mo = total % 12;
  const dim = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
  if (end.d > dim) return iso(Date.UTC(y, mo, dim));
  return iso(Date.UTC(y, mo, end.d) - DAY);
}

// Basic award weeks: counting back from the last day, each complete year of service (at most 20) earns
// 0.5 week if aged under 22 in that year, 1 week if 22 to 40, 1.5 weeks if 41 or over.
export function basicWeeks(dob, start, end) {
  const years = Math.min(wholeYears(start, end), MAX_YEARS);
  let weeks = 0;
  const bands = [];
  for (let k = 1; k <= years; k++) {
    const yEnd = { y: end.y - (k - 1), mo: end.mo, d: end.d };
    const age = wholeYears(dob, yEnd);
    const w = age >= 41 ? 1.5 : age >= 22 ? 1 : 0.5;
    weeks += w;
    bands.push(w);
  }
  return { years, weeks, bands };
}

export function parse(input) {
  const i = input || {};
  const errors = [];
  const dob = dateParts(i.dob), start = dateParts(i.start), end = dateParts(i.end);
  if (!dob) errors.push("Enter your date of birth as a date.");
  if (!start) errors.push("Enter the day you started the job as a date.");
  if (!end) errors.push("Enter your last day of employment as a date.");
  if (dob && start && dob.t >= start.t) errors.push("Your date of birth must be before your start date.");
  if (start && end && end.t < start.t) errors.push("Your last day must not be before your start date.");
  const num = (key, label, allowEmpty, max) => {
    const v = i[key];
    if (v === undefined || v === null || String(v).trim() === "") { if (allowEmpty) return 0; errors.push(`Enter ${label}.`); return 0; }
    const n = Number(String(v).replace(/[£,\s]/g, ""));
    if (!Number.isFinite(n) || n < 0) { errors.push(`Enter ${label} as zero or more.`); return 0; }
    if (max !== undefined && n > max) { errors.push(`${label[0].toUpperCase() + label.slice(1)} cannot be more than ${max}.`); return 0; }
    return n;
  };
  const weeklyGross = num("weeklyGross", "your gross pay for a normal week", false);
  const weeklyNet = num("weeklyNet", "your take-home pay for a normal week", false);
  if (weeklyGross && weeklyNet > weeklyGross) errors.push("Take-home pay cannot be more than gross pay.");
  const weeksToHearing = num("weeksToHearing", "weeks from dismissal until the new job starts or the hearing (zero if not applicable)", true, 520);
  const earnedSince = num("earnedSince", "what you earned elsewhere in that period (zero if none)", true);
  const newWeeklyNet = num("newWeeklyNet", "take-home pay in a new job per week (zero if none yet)", true);
  const futureWeeks = num("futureWeeks", "weeks of future loss you will claim (zero if none)", true, 520);
  const pensionLoss = num("pensionLoss", "pension loss (zero if none)", true);
  const expenses = num("expenses", "job-search expenses (zero if none)", true);
  const redundancyPaid = num("redundancyPaid", "any redundancy payment already received (zero if none)", true);
  const polkey = num("polkey", "the percentage chance you would have been dismissed anyway", true, 100);
  const contributory = num("contributory", "the contributory fault percentage", true, 100);
  const acasPct = Number(String(i.acas ?? "0").trim() === "" ? 0 : i.acas);
  if (!Number.isFinite(acasPct) || acasPct < -25 || acasPct > 25) errors.push("The ACAS Code adjustment must be between -25 and 25 percent.");
  const capEntered = String(i.compCap ?? "").trim() === "" ? null : Number(String(i.compCap).replace(/[£,\s]/g, ""));
  if (capEntered !== null && (!Number.isFinite(capEntered) || capEntered <= 0)) errors.push("Enter the compensatory cap as a positive amount, or leave it blank to use the default.");
  const automatic = i.automatic === true || i.automatic === "true" || i.automatic === "1" || i.automatic === 1;
  return { errors, dob, start, end, weeklyGross, weeklyNet, weeksToHearing, earnedSince, newWeeklyNet, futureWeeks, pensionLoss, expenses, redundancyPaid, polkey, contributory, acasPct, capEntered, automatic };
}

export function compute(input) {
  const p = parse(input);
  if (p.errors.length) return { errors: p.errors };
  const { dob, start, end } = p;
  const years = wholeYears(start, end);
  const eligible = years >= MIN_SERVICE_YEARS;
  const weeklyCap = weeklyCapFor(end);
  const weekPay = Math.min(p.weeklyGross, weeklyCap);
  const bw = basicWeeks(dob, start, end);
  const basicGross = r2(bw.weeks * weekPay);
  const basicCapMax = r2(30 * weeklyCap);
  // s.122(4): a redundancy payment received counts against the basic award; contributory fault reduces it too.
  const basicAfterRedundancy = r2(Math.max(0, basicGross - p.redundancyPaid));
  const basic = r2(basicAfterRedundancy * (1 - p.contributory / 100));

  const immediateLoss = r2(Math.max(0, p.weeklyNet * p.weeksToHearing - p.earnedSince));
  const futureLoss = r2(Math.max(0, p.weeklyNet - p.newWeeklyNet) * p.futureWeeks);
  const compRaw = r2(immediateLoss + futureLoss + STATUTORY_RIGHTS + p.pensionLoss + p.expenses);
  const afterPolkey = r2(compRaw * (1 - p.polkey / 100));
  const afterAcas = r2(afterPolkey * (1 + p.acasPct / 100));
  const afterFault = r2(afterAcas * (1 - p.contributory / 100));
  const fixedCap = p.capEntered ?? COMP_CAP_DEFAULT;
  const weeksCap = r2(52 * p.weeklyGross);
  const cap = p.automatic ? null : Math.min(fixedCap, weeksCap);
  const comp = cap === null ? afterFault : r2(Math.min(afterFault, cap));
  const capBites = cap !== null && afterFault > cap;
  const total = eligible || p.automatic ? r2(basic + comp) : 0;
  const deadline = claimDeadline(end);

  const findings = [];
  if (!eligible && !p.automatic) findings.push({ severity: "high", title: `Length of service is ${years} complete year(s), under the ${MIN_SERVICE_YEARS} needed for most unfair dismissal claims, so the estimate is shown as ${money(0)}. Automatic unfair reasons (whistleblowing, asserting a statutory right, and others) need no qualifying service: tick the box if one applies. Check whether the Employment Rights Act 2025 has changed the qualifying period for your date.` });
  else findings.push({ severity: "high", title: `If a tribunal finds the dismissal unfair, this estimate is about ${money(total)}: basic award ${money(basic)} plus compensatory award ${money(comp)}.` });
  findings.push({ severity: "high", title: `Time limit: the claim normally has to be started within three months less a day of the last day of employment, so by ${deadline}. Contact ACAS for early conciliation before that date; it pauses the clock but does not remove it.` });
  if (p.weeklyGross > weeklyCap) findings.push({ severity: "info", title: `Your normal week of ${money(p.weeklyGross)} is capped at ${money(weeklyCap)} for the basic award. The compensatory award uses your real pay.` });
  if (capBites) findings.push({ severity: "medium", title: `The compensatory cap applies: ${money(afterFault)} falls to ${money(cap)} (the lower of ${money(fixedCap)} and 52 weeks' gross pay of ${money(weeksCap)}).` });
  if (p.redundancyPaid > 0) findings.push({ severity: "info", title: `A redundancy payment of ${money(p.redundancyPaid)} was set against the basic award.` });
  if (p.polkey > 0) findings.push({ severity: "info", title: `A ${p.polkey}% chance you would have been dismissed fairly anyway (Polkey) cut the compensatory award.` });
  if (p.acasPct !== 0) findings.push({ severity: "info", title: `An ACAS Code adjustment of ${p.acasPct > 0 ? "+" : ""}${p.acasPct}% was applied to the compensatory award.` });
  if (p.contributory > 0) findings.push({ severity: "info", title: `Contributory fault of ${p.contributory}% reduced both awards.` });
  if (p.automatic) findings.push({ severity: "info", title: "Marked as an automatically unfair dismissal, so the compensatory cap was not applied. Other rules (such as whistleblowing detriment) are for an adviser." });
  findings.push({ severity: "info", title: "Not modelled: injury to feelings, wrongful dismissal and notice pay, tax and grossing-up (the first GBP 30,000 of termination payments is tax-free), benefit recoupment, interest, Northern Ireland, and whether the dismissal was actually unfair. Tribunals decide the real figure, and many cases settle." });
  const obligations = [
    { ref: "Verify", title: "Check the weekly pay cap and compensatory cap on GOV.UK", why: "Both change each April. The page used " + money(weeklyCap) + " a week and " + money(fixedCap) + "; look up the figures for your dismissal date." },
    { ref: "ACAS", title: "Start early conciliation before the deadline", why: "A tribunal claim needs an ACAS early conciliation certificate number first." },
    { ref: "Advice", title: "Talk to ACAS, Citizens Advice, a union or a solicitor", why: "This is an arithmetic estimate, not advice on whether you have a claim." },
  ];
  return { errors: [], years, eligible, weeklyCap, weekPay, bw, basicGross, basicCapMax, basicAfterRedundancy, basic, immediateLoss, futureLoss, compRaw, afterPolkey, afterAcas, afterFault, fixedCap, weeksCap, cap, capBites, comp, total, deadline, automatic: p.automatic, findings, obligations };
}

export const SAMPLE = { dob: "1985-05-20", start: "2018-03-12", end: "2026-07-31", weeklyGross: 900, weeklyNet: 680, weeksToHearing: 30, earnedSince: 6000, newWeeklyNet: 600, futureWeeks: 12, pensionLoss: 1500, expenses: 250, redundancyPaid: 0, polkey: 0, contributory: 0, acas: 0, compCap: "", automatic: false };

export function summaryText(r) {
  const lines = [
    "UK unfair dismissal compensation estimate",
    "",
    `Complete years of service: ${r.years} (${r.eligible ? "meets" : "below"} the ${MIN_SERVICE_YEARS}-year test)`,
    `Basic award: ${r.bw.weeks} weeks x ${money(r.weekPay)} = ${money(r.basicGross)}; after redundancy payment and fault: ${money(r.basic)}`,
    `Loss to hearing ${money(r.immediateLoss)}, future loss ${money(r.futureLoss)}, statutory rights ${money(STATUTORY_RIGHTS)}`,
    `Compensatory award before adjustments: ${money(r.compRaw)}; after Polkey ${money(r.afterPolkey)}, ACAS ${money(r.afterAcas)}, fault ${money(r.afterFault)}`,
    `Compensatory award after cap: ${money(r.comp)}`,
    `Estimated total: ${money(r.total)}`,
    `Claim by: ${r.deadline} (after ACAS early conciliation)`,
    "",
    "Estimate only, not legal advice. Verify caps on " + VERIFY,
  ];
  return lines.join("\n");
}
