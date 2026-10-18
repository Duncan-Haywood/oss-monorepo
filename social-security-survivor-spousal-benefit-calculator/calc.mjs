// Social Security survivor and spousal benefit arithmetic. Pure functions, no I/O. Bad input is rejected with a
// message, never clamped. Every dollar figure is typed by the reader (from their own my Social Security statement); the page ships example numbers only.
// Ages are handled in whole months. Amounts are in today's dollars: no COLA, no discounting, no taxes.

export const VERIFY = "Your my Social Security account (ssa.gov/myaccount) or an SSA representative (1-800-772-1213), who can see the deceased worker's actual record, and a fee-only planner for the tax side";

export const SURVIVOR_FLOOR = 0.825; // widow(er) limit: 82.5% of the worker's PIA when the worker claimed early
export const SURVIVOR_AT_60 = 0.715; // survivor benefit at age 60 is 71.5% of the base amount

// Retirement full retirement age in months, from the birth year (SSA table).
export function retirementFra(birthYear) {
  if (birthYear <= 1937) return 65 * 12;
  if (birthYear <= 1942) return 65 * 12 + (birthYear - 1937) * 2;
  if (birthYear <= 1954) return 66 * 12;
  if (birthYear <= 1959) return 66 * 12 + (birthYear - 1954) * 2;
  return 67 * 12;
}

// Own retirement benefit as a share of PIA when claimed at `claim` months.
export function ownFactor(claim, fra) {
  if (claim >= fra) return 1 + (Math.min(claim, 840) - fra) * (2 / 3) / 100;
  const early = fra - claim;
  return 1 - (Math.min(early, 36) * 5 / 9 + Math.max(early - 36, 0) * 5 / 12) / 100;
}

// Spousal excess factor: share of the worker's PIA after the early-claim reduction (no delayed credits).
export function spousalFactor(claim, fra) {
  const early = Math.max(fra - claim, 0);
  return 0.5 * (1 - (Math.min(early, 36) * 25 / 36 + Math.max(early - 36, 0) * 5 / 12) / 100);
}

// Survivor benefit as a share of the base amount, claimed at `claim` months, survivor FRA `sfra` months.
export function survivorFactor(claim, sfra) {
  if (claim >= sfra) return 1;
  return SURVIVOR_AT_60 + (1 - SURVIVOR_AT_60) * (claim - 720) / (sfra - 720);
}

// What the deceased worker was (or would have been) paid: the base for the survivor benefit.
export function survivorBase(pia, dFra, dClaim) {
  const own = pia * ownFactor(dClaim, dFra);
  return dClaim < dFra ? Math.max(own, SURVIVOR_FLOOR * pia) : own;
}

export function parse(input) {
  const i = input || {};
  const errors = [];
  const num = (k, label, { min = 0, max = Infinity } = {}) => {
    const raw = Number(i[k]);
    if (i[k] === undefined || i[k] === "" || i[k] === null || !Number.isFinite(raw) || raw < min || raw > max) {
      errors.push(`Enter ${label}${Number.isFinite(max) ? ` (${min} to ${max})` : ` of ${min} or more`}.`);
      return 0;
    }
    return raw;
  };
  const birthYear = num("birthYear", "your birth year", { min: 1925, max: 1990 });
  const ownPia = num("ownPia", "your own primary insurance amount (PIA) per month in dollars, from your my Social Security statement at full retirement age (0 if you have no work record)", { max: 20000 });
  const deceasedPia = num("deceasedPia", "the deceased spouse's PIA per month in dollars", { min: 1, max: 20000 });
  const deceasedBirthYear = num("deceasedBirthYear", "the deceased spouse's birth year", { min: 1900, max: 1990 });
  const deceasedClaimAge = num("deceasedClaimAge", "the age (in years, decimals allowed) the deceased spouse started benefits, or was when they died if they never claimed", { min: 62, max: 70 });
  const survivorFraYears = num("survivorFraYears", "your survivor full retirement age in years (SSA publishes the table; 67 if you were born in 1962 or later)", { min: 60, max: 67 });
  const planAge = num("planAge", "the age to plan to", { min: 70, max: 105 });
  const spousePia = num("spousePia", "a living spouse's PIA per month in dollars for the spousal-benefit check (0 to skip)", { max: 20000 });
  const spousalClaimAge = num("spousalClaimAge", "the age you would claim the spousal benefit", { min: 62, max: 70 });
  return { errors, birthYear, ownPia, deceasedPia, deceasedBirthYear, deceasedClaimAge, survivorFraYears, planAge, spousePia, spousalClaimAge };
}

export const money = (v) => (v < 0 ? "-$" : "$") + Math.abs(Math.round(v)).toLocaleString("en-US");
export const pct = (v, d = 1) => (v * 100).toFixed(d) + "%";
const ageLabel = (m) => `${Math.floor(m / 12)}${m % 12 ? ` and ${m % 12} mo` : ""}`;

export function strategyTotal(ctx) {
  const { sa, oa, survivorAmt, ownAmt, planMonths } = ctx;
  let total = 0;
  const first = Math.min(sa, oa);
  for (let t = first; t < planMonths; t++) {
    const s = t >= sa ? survivorAmt(sa) : 0;
    const o = t >= oa ? ownAmt(oa) : 0;
    total += Math.max(s, o);
  }
  return total;
}

export function compute(input) {
  const p = parse(input);
  if (p.errors.length) return { errors: p.errors };
  const oFra = retirementFra(p.birthYear);
  const dFra = retirementFra(p.deceasedBirthYear);
  const sFra = Math.round(p.survivorFraYears * 12);
  const dClaim = Math.round(p.deceasedClaimAge * 12);
  const planMonths = Math.round(p.planAge * 12);
  const base = survivorBase(p.deceasedPia, dFra, dClaim);
  const survivorAmt = (c) => base * survivorFactor(c, sFra);
  const ownAmt = (c) => p.ownPia * ownFactor(c, oFra);

  const table = [];
  for (let m = 720; m <= 840; m += 12) {
    table.push({ age: m / 12, survivor: m <= 840 ? survivorAmt(m) : null, own: m >= 744 ? ownAmt(m) : null });
  }

  const best = { total: -1 };
  const candidates = [];
  for (let sa = 720; sa <= 840; sa += 6) {
    for (let oa = 744; oa <= 840; oa += 6) {
      const total = strategyTotal({ sa, oa, survivorAmt, ownAmt, planMonths });
      candidates.push({ sa, oa, total });
      if (total > best.total) { best.total = total; best.sa = sa; best.oa = oa; }
    }
  }
  const named = (label, sa, oa) => ({ label, sa, oa, total: strategyTotal({ sa, oa, survivorAmt, ownAmt, planMonths }) });
  const strategies = [
    named("Survivor at 60, own at 70", 720, 840),
    named("Own at 62, survivor at full retirement age", 744, sFra),
    named("Both at full retirement age", Math.max(sFra, 720), Math.max(oFra, 744)),
    named("Survivor at full retirement age, own at 70", sFra, 840),
    named("Both as early as possible (60 / 62)", 720, 744),
  ];
  const bestNamed = { label: "Highest total to age " + p.planAge, sa: best.sa, oa: best.oa, total: best.total };

  const findings = [];
  findings.push({ severity: "high", title: `Survivor benefit is ${money(survivorAmt(sFra))} a month at your survivor full retirement age (${ageLabel(sFra)}) and ${money(survivorAmt(720))} at 60. It is based on ${money(base)}, what the deceased was paid or would have been.` });
  if (p.ownPia > 0) {
    const crossed = ownAmt(840) > survivorAmt(sFra);
    findings.push({ severity: "high", title: `Your own benefit would be ${money(ownAmt(840))} at 70 and ${money(ownAmt(Math.max(oFra, 744)))} at full retirement age. ${crossed ? "Because your own benefit at 70 is larger, a common move is to take the survivor benefit first and switch to your own at 70." : "Your survivor benefit is larger than your own even at 70, so you would normally collect the survivor benefit and let your own add nothing."}` });
  }
  findings.push({ severity: "medium", title: `Highest total to age ${p.planAge} in this model: survivor at ${ageLabel(best.sa)}, own at ${ageLabel(best.oa)} for about ${money(best.total)} (today's dollars, no COLA). A single total hides longevity risk, so read the monthly table too.` });
  if (dClaim < dFra) findings.push({ severity: "info", title: `The deceased claimed before full retirement age, so the survivor benefit is the larger of their reduced benefit and 82.5% of their PIA (${money(SURVIVOR_FLOOR * p.deceasedPia)}). This tool used ${money(base)}.` });
  if (dClaim > dFra) findings.push({ severity: "info", title: `The deceased claimed after full retirement age, so their delayed credits pass to the survivor.` });
  let spousal = null;
  if (p.spousePia > 0) {
    const claim = Math.round(p.spousalClaimAge * 12);
    const excess = Math.max(p.spousePia * spousalFactor(claim, oFra) - p.ownPia, 0);
    spousal = { claim, excess, total: ownAmt(Math.max(claim, 744)) + excess, ownPart: ownAmt(Math.max(claim, 744)) };
    findings.push({ severity: spousal.excess > 0 ? "high" : "info", title: spousal.excess > 0 ? `As a spouse you could add a spousal top-up of about ${money(spousal.excess)} a month on top of your own benefit when claiming at ${ageLabel(claim)}, if your spouse has filed. Total about ${money(spousal.total)}.` : `Your own benefit is large enough that no spousal top-up is payable at ${ageLabel(claim)}.` });
  }
  findings.push({ severity: "info", title: "Not modelled: taxes on benefits, the earnings test before full retirement age, COLAs, remarriage rules, divorced-spouse and child benefits, Medicare premiums. Verify with " + VERIFY + "." });

  return { errors: [], input: p, oFra, dFra, sFra, base, table, strategies: [bestNamed, ...strategies], findings, spousal };
}

export const SAMPLE = {
  birthYear: 1962, ownPia: 2400, deceasedPia: 3200, deceasedBirthYear: 1960, deceasedClaimAge: 67,
  survivorFraYears: 67, planAge: 90, spousePia: 3200, spousalClaimAge: 67,
};

export function summaryText(r) {
  const lines = [
    "Social Security survivor and spousal benefit summary",
    `Survivor base amount: ${money(r.base)} a month; survivor full retirement age ${ageLabel(r.sFra)}`,
    "", "Age | Survivor benefit | Own benefit",
    ...r.table.map((t) => `${t.age} | ${money(t.survivor)} | ${t.own === null ? "n/a" : money(t.own)}`),
    "", "Strategies (monthly benefits summed to the planning age, no COLA):",
    ...r.strategies.map((s) => `${s.label}: survivor at ${ageLabel(s.sa)}, own at ${ageLabel(s.oa)} -> ${money(s.total)}`),
    "", ...r.findings.map((f) => `- ${f.title}`),
  ];
  return lines.join("\n");
}
