// Startup stock option value calculator: what an option grant is worth at
// exit after dilution, liquidation preferences, vesting, exercise cost and
// tax, weighted by the chances the visitor types in. Pure arithmetic on
// numbers the visitor supplies; no network, no valuation data, no tax tables.

export function parseNum(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/[$,\s]/g, "").replace(/%$/, "");
  if (s === "") return null;
  const mult = /[kmb]$/i.test(s) ? { k: 1e3, m: 1e6, b: 1e9 }[s.slice(-1).toLowerCase()] : 1;
  const n = Number(mult === 1 ? s : s.slice(0, -1)) * mult;
  return Number.isFinite(n) ? n : NaN;
}

export function money(n) {
  return Math.round(n).toLocaleString("en-US");
}

// Fraction of the grant vested after `months` of service.
export function vestedFraction(months, cliffMonths, vestMonths) {
  if (months < cliffMonths) return 0;
  return Math.min(1, Math.max(0, months) / vestMonths);
}

// Share of the company one option represents at exit, after `rounds` more
// financings that each dilute existing holders by `dilution` (a fraction).
export function ownershipPerOption(p) {
  return Math.pow(1 - p.dilution, p.rounds) / p.fullyDiluted;
}

// Proceeds available to common holders. Preferences are taken off the top
// (non-participating preferred that would convert at a high exit is treated
// as still taking its preference, so this understates big exits slightly).
export function commonProceeds(exitValue, prefStack) {
  return Math.max(0, exitValue - prefStack);
}

// One option grant at one exit value: value before and after tax and cost.
export function valueAtExit(p, exitValue) {
  const vested = p.options * vestedFraction(p.stayMonths, p.cliffMonths, p.vestMonths);
  const perOption = commonProceeds(exitValue, p.prefStack) * ownershipPerOption(p);
  const spreadPer = Math.max(0, perOption - p.strike);
  const gross = spreadPer * vested;
  const tax = gross * p.taxRate;
  return { vested, perOption, exerciseCost: vested * p.strike, gross, tax, net: gross - tax };
}

// Exit value at which the vested options are worth `target` after tax
// (target 0 = the exit at which they stop being underwater).
export function exitNeeded(p, target) {
  const vestedFrac = vestedFraction(p.stayMonths, p.cliffMonths, p.vestMonths);
  const vested = p.options * vestedFrac;
  if (vested <= 0) return null;
  const own = ownershipPerOption(p);
  const spreadPer = target / ((1 - p.taxRate) * vested);
  return (p.strike + spreadPer) / own + p.prefStack;
}

export function parseInput(raw) {
  const errors = [];
  const num = (k, label, { min = 0, max = Infinity, def = null, int = false } = {}) => {
    let v = parseNum(raw[k]);
    if (v === null) v = def;
    if (v === null || Number.isNaN(v) || v < min || v > max || (int && !Number.isInteger(v))) {
      errors.push(`${label} must be ${int ? "a whole number" : "a number"} between ${min} and ${max === Infinity ? "any size" : max}.`);
      return 0;
    }
    return v;
  };
  const p = {
    options: num("options", "Options granted", { min: 1 }),
    strike: num("strike", "Strike price per share", { def: 0 }),
    fullyDiluted: num("fullyDiluted", "Fully diluted shares", { min: 1 }),
    dilution: num("dilution", "Dilution per future round", { max: 60, def: 15 }) / 100,
    rounds: num("rounds", "Future funding rounds", { max: 10, def: 2, int: true }),
    prefStack: num("prefStack", "Liquidation preferences ahead of common", { def: 0 }),
    cliffMonths: num("cliffMonths", "Cliff months", { max: 60, def: 12, int: true }),
    vestMonths: num("vestMonths", "Vesting months", { min: 1, max: 120, def: 48, int: true }),
    stayMonths: num("stayMonths", "Months you stay", { max: 240, def: 48 }),
    taxRate: num("taxRate", "Tax rate on the gain", { max: 60, def: 25 }) / 100,
    yearsToExit: num("yearsToExit", "Years until exit", { max: 30, def: 6 }),
    discount: num("discount", "Discount rate", { max: 50, def: 0 }) / 100,
    exitSmall: num("exitSmall", "Small exit value", { def: 0 }),
    pSmall: num("pSmall", "Chance of a small exit", { max: 100, def: 0 }) / 100,
    exitGood: num("exitGood", "Good exit value", { def: 0 }),
    pGood: num("pGood", "Chance of a good exit", { max: 100, def: 0 }) / 100,
    exitBig: num("exitBig", "Big exit value", { def: 0 }),
    pBig: num("pBig", "Chance of a big exit", { max: 100, def: 0 }) / 100,
    salaryGap: num("salaryGap", "Yearly pay you give up", { min: -10000000, def: 0 }),
  };
  if (p.cliffMonths > p.vestMonths) errors.push("The cliff cannot be longer than the vesting period.");
  if (p.pSmall + p.pGood + p.pBig > 1.0000001) errors.push("The chances of the three exits add up to more than 100%.");
  return { p, errors };
}

export function analyze(raw) {
  const { p, errors } = parseInput(raw);
  if (errors.length) return { error: errors[0], errors };
  const pNone = Math.max(0, 1 - p.pSmall - p.pGood - p.pBig);
  const scenarios = [
    { label: "Shuts down or sells for less than the preferences", exit: 0, prob: pNone },
    { label: "Small exit", exit: p.exitSmall, prob: p.pSmall },
    { label: "Good exit", exit: p.exitGood, prob: p.pGood },
    { label: "Big exit", exit: p.exitBig, prob: p.pBig },
  ].map((s) => ({ ...s, ...valueAtExit(p, s.exit) }));
  const expected = scenarios.reduce((a, s) => a + s.prob * s.net, 0);
  const pv = expected / Math.pow(1 + p.discount, p.yearsToExit);
  const stayYears = p.stayMonths / 12;
  const paySacrificed = Math.max(0, p.salaryGap) * stayYears;
  const own = ownershipPerOption(p);
  const vestedNow = valueAtExit(p, 0).vested;
  const findings = [];

  const ownPct = own * p.options * 100;
  const ownNoDilution = (p.options / p.fullyDiluted) * 100;
  findings.push({ severity: "info", title: `The full grant is about ${ownPct.toFixed(4).replace(/\.?0+$/, "")}% of the company at exit`, detail: `${money(p.options)} of ${money(p.fullyDiluted)} fully diluted shares is ${ownNoDilution.toFixed(4).replace(/\.?0+$/, "")}% today. After ${p.rounds} more round(s) each diluting ${(p.dilution * 100).toFixed(0)}%, the same options are ${ownPct.toFixed(4).replace(/\.?0+$/, "")}%. Ask the company for the fully diluted count; the grant's share of it is the number that matters.` });

  if (vestedNow === 0) {
    findings.push({ severity: "medium", title: `You would leave before the ${p.cliffMonths}-month cliff and keep nothing`, detail: `Nothing vests until the cliff. With ${p.stayMonths} months of service, the options are worth $0 in every scenario below.` });
  } else if (vestedNow < p.options) {
    findings.push({ severity: "info", title: `${money(vestedNow)} of ${money(p.options)} options vest in ${p.stayMonths} months`, detail: "Unvested options usually return to the pool when you leave. Only the vested share is valued here." });
  }

  const be = exitNeeded(p, 0);
  if (be !== null) findings.push({ severity: "info", title: `The company must sell for more than about $${money(be)} before these options are worth anything`, detail: `That is the preferences ($${money(p.prefStack)}) plus the strike price ($${p.strike} a share) divided by your ${ownPct.toFixed(4).replace(/\.?0+$/, "")}% stake. Below it the options are underwater and you would not exercise.` });

  const ex = vestedNow * p.strike;
  if (ex > 0) findings.push({ severity: p.strike > 0 && ex > 25000 ? "medium" : "info", title: `Exercising the vested options costs $${money(ex)} in cash`, detail: "That is paid to the company, often within 90 days of leaving, before you know whether the shares are ever worth anything. Ask about the post-termination exercise window and whether early exercise is offered. Any tax due on exercise is not included here." });

  if (p.prefStack > 0 && p.exitGood > 0) {
    const g = scenarios[2];
    const noPref = valueAtExit({ ...p, prefStack: 0 }, p.exitGood);
    findings.push({ severity: "info", title: `Preferences cost you about $${money(noPref.net - g.net)} in the good-exit scenario`, detail: `The ${`$${money(p.prefStack)}`} of preferences is paid before common shareholders. Ask the company for the total raised and whether the preferred is participating.` });
  }

  findings.push({ severity: "info", title: `Probability-weighted, the options are worth about $${money(expected)} after tax${p.discount > 0 ? ` ($${money(pv)} in today's money)` : ""}`, detail: `Your chance of no payout is ${(pNone * 100).toFixed(0)}%. Most startup options end up worth nothing, so treat the expected value, not the big-exit number, as what you are being paid. The probabilities are yours to set; the tool does not estimate them.` });

  if (paySacrificed > 0) {
    const need = exitNeeded(p, paySacrificed);
    findings.push({ severity: expected >= paySacrificed ? "info" : "medium", title: `You give up about $${money(paySacrificed)} of pay over ${stayYears.toFixed(1).replace(/\.0$/, "")} years`, detail: `The expected option value is ${expected >= paySacrificed ? "above" : "below"} that. To break even after tax on the pay you forgo, the company would have to sell for about $${money(need)}.` });
  }

  return { p, scenarios, expected, pv, paySacrificed, breakEvenExit: be, findings, error: null };
}

export function sampleInput() {
  return {
    options: "40000", strike: "1.20", fullyDiluted: "20M", dilution: "15", rounds: "2",
    prefStack: "60M", cliffMonths: "12", vestMonths: "48", stayMonths: "48", taxRate: "25",
    yearsToExit: "6", discount: "8", exitSmall: "80M", pSmall: "20", exitGood: "300M", pGood: "10",
    exitBig: "1B", pBig: "3", salaryGap: "30000",
  };
}

export function reportCsv(a) {
  const rows = [["scenario", "exit_value", "probability", "vested_options", "exercise_cost", "net_after_tax"]];
  for (const s of a.scenarios) rows.push([s.label, Math.round(s.exit), s.prob, Math.round(s.vested), Math.round(s.exerciseCost), Math.round(s.net)]);
  rows.push(["Probability-weighted", "", "", "", "", Math.round(a.expected)]);
  return rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n") + "\n";
}
