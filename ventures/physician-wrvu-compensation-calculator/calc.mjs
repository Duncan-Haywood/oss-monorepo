// Physician / APP compensation model for an employment offer built on wRVU
// productivity. No network calls. NOT legal or financial advice: contract
// language (what "wRVU", "threshold", "shortfall" and "clawback" mean in
// YOUR agreement) decides the real numbers. Every rate here is typed in by the
// visitor; this file ships no benchmark, no MGMA/AMGA/SullivanCotter figure and
// no "market" conversion factor, so nothing in it can go stale or be invented.
//
// Three pay structures are evaluated at the same annual wRVUs (W):
//   base-plus-productivity  base + CF x max(0, W - threshold)
//                           - repayPct x max(0, base - CF x W)   (shortfall)
//   pure-productivity       pureCF x W        (pureCF defaults to CF)
//   fixed-salary            fixed salary      (defaults to base)
// The quality/bonus share multiplies clinical pay: clinical x (1 + q x earned).
// Call pay and CME are added as typed. One-time items (signing bonus,
// retention bonus, malpractice tail you pay) are spread over the years you
// expect to stay, and are also shown unspread.

export const STRUCTURES = ["base-plus-productivity", "pure-productivity", "fixed-salary"];
export const STRUCTURE_LABELS = {
  "base-plus-productivity": "Base guaranteed, then productivity above threshold",
  "pure-productivity": "Pure productivity",
  "fixed-salary": "Fixed salary",
};

export const ASSUMPTIONS = {
  sensitivitySteps: [0.8, 0.9, 1.0, 1.1, 1.2],
  defaultWeeks: 46,
  defaultHoursPerWeek: 40,
  defaultYearsStay: 3,
  defaultQualityEarnedPct: 100,
  clawbackCheckMonths: [6, 12, 24],
};

export function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function opt(v, dflt) {
  if (v === "" || v === null || v === undefined) return dflt;
  const n = Number(v);
  return Number.isFinite(n) ? n : dflt;
}

export function money(n) {
  const value = Math.round(Number(n) || 0);
  const text = `$${Math.abs(value).toLocaleString("en-US")}`;
  return value < 0 ? `-${text}` : text;
}

export function money2(n) {
  const value = Math.round((Number(n) || 0) * 100) / 100;
  const text = `$${Math.abs(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return value < 0 ? `-${text}` : text;
}

export function normalize(input = {}) {
  const fte = opt(input.fte, 1) > 0 ? opt(input.fte, 1) : 1;
  const weeks = opt(input.weeks, ASSUMPTIONS.defaultWeeks);
  const hoursPerWeek = opt(input.hoursPerWeek, 0) > 0 ? num(input.hoursPerWeek) : ASSUMPTIONS.defaultHoursPerWeek * fte;
  const base = Math.max(0, num(input.base));
  const cf = Math.max(0, num(input.cf));
  return {
    base,
    cf,
    threshold: Math.max(0, num(input.threshold)),
    wrvus: Math.max(0, num(input.wrvus)),
    days: Math.max(0, num(input.days)),
    patients: Math.max(0, num(input.patients)),
    wpv: Math.max(0, num(input.wpv)),
    weeks: Math.max(0, weeks),
    fte,
    hoursPerWeek,
    qualityPct: Math.max(0, num(input.quality)) / 100,
    qualityEarned: Math.min(1, Math.max(0, opt(input.qualityEarned, ASSUMPTIONS.defaultQualityEarnedPct) / 100)),
    signing: Math.max(0, num(input.signing)),
    clawbackMonths: Math.max(0, num(input.clawbackMonths)),
    clawbackType: input.clawbackType === "cliff" ? "cliff" : "pro-rata",
    leaveMonth: Math.max(0, num(input.leaveMonth)),
    retention: Math.max(0, num(input.retention)),
    yearsStay: Math.max(1, opt(input.yearsStay, ASSUMPTIONS.defaultYearsStay)),
    call: Math.max(0, num(input.call)),
    cme: Math.max(0, num(input.cme)),
    tailCost: Math.max(0, num(input.tailCost)),
    tailPayer: ["employer", "you", "split"].includes(input.tailPayer) ? input.tailPayer : "employer",
    nonCompeteMonths: Math.max(0, num(input.nonCompeteMonths)),
    pureCf: Math.max(0, opt(input.pureCf, cf)),
    fixedSalary: Math.max(0, opt(input.fixedSalary, base)),
    repayPct: Math.min(1, Math.max(0, num(input.repayPct) / 100)),
    structure: STRUCTURES.includes(input.structure) ? input.structure : "base-plus-productivity",
  };
}

/** Expected annual wRVUs: typed directly, else clinic days x weeks x patients x wRVU per visit. */
export function expectedWrvus(n) {
  if (n.wrvus > 0) return { wrvus: n.wrvus, source: "typed" };
  const derived = n.days * n.weeks * n.patients * n.wpv;
  if (derived > 0) return { wrvus: derived, source: "clinic" };
  return { wrvus: 0, source: "none" };
}

/** Shortfall the guaranteed base carries at W: base paid beyond what W earns at the conversion factor. */
export function shortfall(n, W) {
  return Math.max(0, n.base - n.cf * W);
}

/** Clinical pay before the quality bonus, for one structure at annual wRVUs W. */
export function baseClinical(structure, W, n) {
  if (structure === "pure-productivity") return n.pureCf * W;
  if (structure === "fixed-salary") return n.fixedSalary;
  return n.base + n.cf * Math.max(0, W - n.threshold) - n.repayPct * shortfall(n, W);
}

export function clinicalPay(structure, W, n) {
  return baseClinical(structure, W, n) * (1 + n.qualityPct * n.qualityEarned);
}

export function oneTimeItems(n) {
  const tailShare = n.tailPayer === "you" ? 1 : n.tailPayer === "split" ? 0.5 : 0;
  const tailYouPay = n.tailCost * tailShare;
  return {
    signing: n.signing,
    retention: n.retention,
    tailYouPay,
    signingAnnual: n.signing / n.yearsStay,
    retentionAnnual: n.retention / n.yearsStay,
    tailAnnual: tailYouPay / n.yearsStay,
  };
}

export function clawbackExposure(n, months) {
  if (n.signing <= 0 || n.clawbackMonths <= 0) return 0;
  if (months >= n.clawbackMonths) return 0;
  if (n.clawbackType === "cliff") return n.signing;
  return n.signing * (1 - months / n.clawbackMonths);
}

/** Everything for one structure at wRVUs W. */
export function structureResult(structure, W, n) {
  const clinical = clinicalPay(structure, W, n);
  const one = oneTimeItems(n);
  const recurring = clinical + n.call + n.cme;
  const totalAnnual = recurring + one.signingAnnual + one.retentionAnnual - one.tailAnnual;
  const hours = n.hoursPerWeek * n.weeks;
  const def = structure === "base-plus-productivity" ? shortfall(n, W) : 0;
  return {
    structure,
    label: STRUCTURE_LABELS[structure],
    wrvus: W,
    clinical,
    recurring,
    totalAnnual,
    yearOneCash: recurring + one.signing,
    hours,
    perHour: hours > 0 ? totalAnnual / hours : 0,
    perWrvu: W > 0 ? clinical / W : 0,
    incentive: structure === "base-plus-productivity" ? n.cf * Math.max(0, W - n.threshold) : 0,
    shortfall: def,
    repayment: structure === "base-plus-productivity" ? n.repayPct * def : 0,
  };
}

// Both pay curves are piecewise linear in W, so each segment between two
// breakpoints is solved exactly by interpolation rather than searched for.
export function crossings(f, g, points) {
  const xs = [...new Set(points.filter((p) => Number.isFinite(p) && p >= 0))].sort((a, b) => a - b);
  const out = [];
  let lastSign = 0, lastX = null, zeroX = null;
  for (const x of xs) {
    const d = f(x) - g(x);
    const s = Math.abs(d) < 1e-7 ? 0 : Math.sign(d);
    if (s === 0) { if (zeroX === null) zeroX = x; continue; }
    if (lastSign !== 0 && s !== lastSign) {
      if (zeroX !== null) out.push(zeroX);
      else {
        const d0 = f(lastX) - g(lastX);
        out.push(lastX + ((x - lastX) * d0) / (d0 - d));
      }
    }
    lastSign = s; lastX = x; zeroX = null;
  }
  return out;
}

function breakpoints(n, W) {
  const a = [0, n.threshold, W];
  if (n.cf > 0) a.push(n.base / n.cf, n.threshold + (n.fixedSalary - n.base) / n.cf);
  if (n.pureCf > 0) a.push(n.base / n.pureCf, n.fixedSalary / n.pureCf);
  const top = Math.max(3 * W, 2 * n.threshold, n.cf > 0 ? 2 * n.base / n.cf : 0, n.pureCf > 0 ? 2 * n.fixedSalary / n.pureCf : 0, 1000);
  a.push(top);
  return a;
}

export function breakEvens(n, W) {
  const pts = breakpoints(n, W);
  const A = (x) => clinicalPay("base-plus-productivity", x, n);
  const P = (x) => clinicalPay("pure-productivity", x, n);
  const F = (x) => clinicalPay("fixed-salary", x, n);
  const pureVsBase = crossings(P, A, pts);
  const pureVsFixed = crossings(P, F, pts);
  const baseVsFixed = crossings(A, F, pts);
  const impliedThreshold = n.cf > 0 ? n.base / n.cf : null;
  return {
    incentiveStart: n.threshold,
    impliedThreshold,
    pureOvertakesBase: pureVsBase.length ? pureVsBase[0] : null,
    pureVsBase,
    pureOvertakesFixed: pureVsFixed.length ? pureVsFixed[0] : null,
    baseOvertakesFixed: baseVsFixed.length ? baseVsFixed[0] : null,
    marginOverThreshold: W > 0 ? (W - n.threshold) / W : null,
    marginOverPureBreakEven: W > 0 && pureVsBase.length ? (W - pureVsBase[0]) / W : null,
  };
}

export function sensitivity(n, W) {
  return ASSUMPTIONS.sensitivitySteps.map((step) => {
    const w = W * step;
    const rows = Object.fromEntries(STRUCTURES.map((s) => [s, structureResult(s, w, n)]));
    return { step, wrvus: w, rows, shortfall: rows["base-plus-productivity"].shortfall, repayment: rows["base-plus-productivity"].repayment };
  });
}

export function physicianComp(input = {}) {
  const n = normalize(input);
  const { wrvus: W, source } = expectedWrvus(n);
  const results = Object.fromEntries(STRUCTURES.map((s) => [s, structureResult(s, W, n)]));
  const one = oneTimeItems(n);
  const clawback = ASSUMPTIONS.clawbackCheckMonths.map((m) => ({ months: m, exposure: clawbackExposure(n, m) }));
  const monthlyRecurring = results[n.structure].recurring / 12;
  const result = {
    inputs: n,
    wrvus: W,
    wrvuSource: source,
    wrvusPerFte: W / n.fte,
    results,
    selected: results[n.structure],
    breakEvens: breakEvens(n, W),
    sensitivity: sensitivity(n, W),
    oneTime: one,
    clawback,
    clawbackAtLeave: n.leaveMonth > 0 ? clawbackExposure(n, n.leaveMonth) : null,
    nonCompeteAtStake: monthlyRecurring * n.nonCompeteMonths,
    worstCaseShortfall: shortfall(n, W * ASSUMPTIONS.sensitivitySteps[0]),
  };
  result.findings = findings(result);
  return result;
}

function findings(r) {
  const n = r.inputs, out = [];
  const be = r.breakEvens;
  const fmt = (x) => Math.round(x).toLocaleString("en-US");
  if (!(r.wrvus > 0)) {
    out.push({ severity: "high", title: "No expected wRVUs entered", detail: "Enter your expected annual wRVUs, or clinic days, weeks, patients per day and wRVUs per visit. Every productivity figure needs it." });
    return out;
  }
  if (!(n.cf > 0)) out.push({ severity: "high", title: "No conversion factor entered", detail: "The dollars-per-wRVU rate in your offer drives the incentive. Type it in from the contract; this tool ships no benchmark rate." });
  if (n.cf > 0 && n.threshold > 0 && r.wrvus < n.threshold) {
    out.push({ severity: "medium", title: `Expected ${fmt(r.wrvus)} wRVUs is below the ${fmt(n.threshold)} threshold`, detail: "At your expected volume the incentive never starts; you are paid the base. Ask what happens to the gap: nothing, carried forward, or repaid." });
  }
  if (be.impliedThreshold !== null && n.threshold > 0 && Math.abs(be.impliedThreshold - n.threshold) > 0.02 * n.threshold) {
    const lower = n.threshold < be.impliedThreshold;
    out.push({ severity: "info", title: `Base implies ${fmt(be.impliedThreshold)} wRVUs, threshold is ${fmt(n.threshold)}`, detail: lower ? "The threshold is lower than the volume your base is worth at the conversion factor, so the base is not fully earned before the incentive starts: you can be paid an incentive while still carrying a shortfall against the base." : "The threshold is higher than the volume your base is worth at the conversion factor, so there is a band of wRVUs where you earn more than the base in productivity value but are paid only the base." });
  }
  if (r.worstCaseShortfall > 0 && n.repayPct > 0) {
    out.push({ severity: "high", title: `${money(r.worstCaseShortfall * n.repayPct)} could be repaid at 80% of your expected wRVUs`, detail: `The base exceeds what 80% of your wRVUs earn at the conversion factor by ${money(r.worstCaseShortfall)}, and your contract repays ${(n.repayPct * 100).toFixed(0)}% of that. Confirm whether repayment is cash at year end or carried into next year, and what happens if you leave.` });
  } else if (r.worstCaseShortfall > 0) {
    out.push({ severity: "medium", title: `A ${money(r.worstCaseShortfall)} shortfall exposure at 80% of expected wRVUs`, detail: "You entered no repayment share, so this is treated as guaranteed. Many contracts recoup a shortfall from future incentive or on exit; read yours before assuming the base is a floor." });
  }
  if (n.signing > 0 && n.clawbackMonths > 0) {
    out.push({ severity: "medium", title: `Signing bonus clawback: ${money(clawbackExposure(n, 12))} if you leave at month 12`, detail: `Modelled as ${n.clawbackType} over ${n.clawbackMonths} months. Repayment is often the gross amount, not what reached your account after tax; check the wording.` });
  } else if (n.signing > 0) {
    out.push({ severity: "info", title: "Signing bonus with no clawback entered", detail: "If your contract has a repayment period, enter its length to see the exposure." });
  }
  if (n.tailPayer === "you" && n.tailCost > 0) out.push({ severity: "medium", title: `${money(n.tailCost)} tail coverage is yours`, detail: "Counted against comp, spread over the years you expect to stay. Ask whether the employer buys tail if it ends the contract without cause." });
  if (n.tailPayer === "split" && n.tailCost > 0) out.push({ severity: "info", title: `Half of ${money(n.tailCost)} tail coverage is yours`, detail: "Counted against comp, spread over the years you expect to stay." });
  if (n.nonCompeteMonths > 0) out.push({ severity: "medium", title: `Non-compete: about ${money(r.nonCompeteAtStake)} of income at stake`, detail: `${n.nonCompeteMonths} months of your recurring pay under this structure, if you had to leave the area or stop practising nearby. Enforceability varies by state and is a question for a lawyer, not this tool.` });
  if (r.wrvuSource === "clinic") out.push({ severity: "info", title: `Expected wRVUs derived from clinic volume: ${fmt(r.wrvus)}`, detail: "Clinic days x weeks x patients per day x wRVUs per visit. Real wRVUs also depend on coding, no-shows and procedures; use your own recent figure if you have one." });
  return out;
}

/** Compare two offers, each with the structure it selects. */
export function compareOffers(inputA, inputB) {
  const a = physicianComp(inputA), b = physicianComp(inputB);
  const sa = a.selected, sb = b.selected;
  const winner = sa.totalAnnual === sb.totalAnnual ? "tie" : sa.totalAnnual > sb.totalAnnual ? "A" : "B";
  const total = (r, scale) => structureResult(r.inputs.structure, r.wrvus * scale, r.inputs).totalAnnual;
  let crossoverScale = null;
  if (a.wrvus > 0 && b.wrvus > 0) {
    const step = 0.005;
    let prev = null, prevD = null;
    for (let s = 0; s <= 3 + 1e-9; s += step) {
      const d = total(a, s) - total(b, s);
      if (prevD !== null && Math.sign(prevD) !== 0 && Math.sign(d) !== 0 && Math.sign(prevD) !== Math.sign(d)) {
        let lo = prev, hi = s, dl = prevD;
        for (let i = 0; i < 50; i++) {
          const mid = (lo + hi) / 2, dm = total(a, mid) - total(b, mid);
          if (Math.sign(dm) === Math.sign(dl)) { lo = mid; dl = dm; } else hi = mid;
        }
        crossoverScale = (lo + hi) / 2;
        break;
      }
      prev = s; prevD = d;
    }
  }
  return {
    a, b, winner,
    diffTotal: sa.totalAnnual - sb.totalAnnual,
    diffPerHour: sa.perHour - sb.perHour,
    diffPerWrvu: sa.perWrvu - sb.perWrvu,
    diffYearOne: sa.yearOneCash - sb.yearOneCash,
    crossoverScale,
    crossoverWrvus: crossoverScale === null ? null : { a: a.wrvus * crossoverScale, b: b.wrvus * crossoverScale },
  };
}
