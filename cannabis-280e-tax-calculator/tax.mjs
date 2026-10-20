// Section 280E estimator. Pure functions, no I/O, no network.
// 280E disallows deductions and credits for a trade or business trafficking in
// Schedule I/II substances; cost of goods sold still reduces gross receipts.
// This is an estimator: the flat rates are the visitor's own assumption.

const num = (v, name, { min = 0, max = Infinity } = {}) => {
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`${name} must be a number`);
  if (n < min || n > max) throw new Error(`${name} must be between ${min} and ${max}`);
  return n;
};
const cents = (n) => Math.round((n + Number.EPSILON) * 100) / 100 + 0;

export function estimate(input) {
  const receipts = num(input.receipts, "Gross receipts");
  const cogs = num(input.cogs, "Cost of goods sold");
  const opex = num(input.opex, "Operating expenses");
  const fedRate = num(input.fedRatePct, "Federal rate %", { max: 60 }) / 100;
  const stateRate = num(input.stateRatePct ?? 0, "State rate %", { max: 30 }) / 100;
  const stateConforms = input.stateConforms !== false;
  const applies = input.applies !== false;
  const reclass = Math.min(num(input.reclass ?? 0, "Reclassified to COGS"), opex);
  if (cogs > receipts) throw new Error("Cost of goods sold cannot exceed gross receipts for this estimate");

  const grossProfit = receipts - cogs;
  const trueNet = grossProfit - opex;
  const normalBase = Math.max(0, trueNet);
  const fedBase = applies ? Math.max(0, grossProfit - reclass) : normalBase;
  const stateBase = applies && stateConforms ? fedBase : normalBase;

  const fedTax = fedBase * fedRate;
  const stateTax = stateBase * stateRate;
  const totalTax = fedTax + stateTax;
  const normalTax = normalBase * (fedRate + stateRate);
  const extraTax = totalTax - normalTax;
  const afterTax = trueNet - totalTax;

  const out = {
    grossProfit: cents(grossProfit),
    trueNet: cents(trueNet),
    fedTaxableIncome: cents(fedBase),
    stateTaxableIncome: cents(stateBase),
    fedTax: cents(fedTax),
    stateTax: cents(stateTax),
    totalTax: cents(totalTax),
    taxIfOrdinaryBusiness: cents(normalTax),
    extraTaxFrom280E: cents(extraTax),
    afterTaxCash: cents(afterTax),
    effectiveRateOnRealProfit: trueNet > 0 ? cents((totalTax / trueNet) * 100) : null,
    taxPctOfReceipts: receipts > 0 ? cents((totalTax / receipts) * 100) : null,
    owesTaxWhileLosingMoney: trueNet <= 0 && totalTax > 0,
    // Opex at which after-tax cash is exactly zero (no reclassification).
    maxOpexBeforeCashNegative: cents(grossProfit * (1 - (fedRate + (applies && stateConforms ? stateRate : 0)))),
    savingPer1000Reclassified: applies ? cents(1000 * (fedRate + (stateConforms ? stateRate : 0))) : 0,
  };
  return out;
}

// What the tax bill does as operating expenses vary around the visitor's number.
export function opexSensitivity(input, steps = [0.6, 0.8, 1, 1.2, 1.4]) {
  return steps.map((k) => {
    const opex = cents(Number(input.opex) * k);
    const r = estimate({ ...input, opex });
    return { opex, trueNet: r.trueNet, totalTax: r.totalTax, afterTaxCash: r.afterTaxCash };
  });
}

// Per-line worksheet: share of each expense line that a CPA might argue is an
// inventoriable cost (for example freight-in on purchased product). Returns the
// total amount to feed into `reclass`. The percentages are the visitor's own.
export function reclassFromLines(lines) {
  let total = 0;
  for (const l of lines) {
    const amount = num(l.amount, `${l.label || "line"} amount`);
    const pct = num(l.cogsPct, `${l.label || "line"} %`, { max: 100 });
    total += (amount * pct) / 100;
  }
  return cents(total);
}

export const EXAMPLE = {
  receipts: 2400000, cogs: 1300000, opex: 780000,
  fedRatePct: 21, stateRatePct: 7, stateConforms: true, applies: true, reclass: 0,
};

export function renderText(r) {
  const m = (n) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return [
    `Gross profit ${m(r.grossProfit)}; real net after operating expenses ${m(r.trueNet)}`,
    `Federal taxable income ${m(r.fedTaxableIncome)}, tax ${m(r.fedTax)}; state tax ${m(r.stateTax)}`,
    `Total tax ${m(r.totalTax)} vs ${m(r.taxIfOrdinaryBusiness)} as an ordinary business: ${m(r.extraTaxFrom280E)} extra`,
    `Cash left after tax ${m(r.afterTaxCash)}`,
    r.effectiveRateOnRealProfit == null ? "No real profit: tax is owed on a loss" : `Effective rate on real profit ${r.effectiveRateOnRealProfit}%`,
  ].join("\n");
}
