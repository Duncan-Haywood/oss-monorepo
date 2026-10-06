// Federal tax on Social Security benefits worksheet (IRS Publication 915). Pure functions, no network, no DOM.
// Rule (IRC section 86): provisional income = other income (AGI before benefits, plus tax-exempt interest) + half of
// the year's benefits. Up to 50% of benefits are taxable above the first base and up to 85% above the second. The bases
// are fixed in statute and are NOT indexed for inflation: single / head of household $25,000 and $34,000; married filing
// jointly $32,000 and $44,000; married filing separately and living with the spouse: $0, so up to 85% is taxable at once.
// The bases are inputs anyway, so a law change cannot make the page silently wrong.

export const BASES = {
  single: { label: "Single, head of household or qualifying surviving spouse", b1: 25000, b2: 34000 },
  mfj: { label: "Married filing jointly", b1: 32000, b2: 44000 },
  mfs: { label: "Married filing separately, lived with spouse", b1: 0, b2: 0 },
};

export const SAMPLE = { status: "single", benefits: 30000, other: 28000, bracket: 22, b1: "", b2: "" };

export const dollars = (n) => (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");

const num = (v) => {
  if (v === "" || v === null || v === undefined) return NaN;
  return Number(String(v).replace(/[$,\s]/g, ""));
};

// Taxable benefits for one set of figures (Pub. 915 worksheet).
export function taxableBenefits({ benefits, other, b1, b2 }) {
  const pi = other + benefits / 2;
  if (pi <= b1) return { pi, taxable: 0, tier: "none" };
  const firstTier = Math.min(benefits / 2, 0.5 * Math.min(pi - b1, b2 - b1));
  const secondTier = 0.85 * Math.max(0, pi - b2);
  const cap = 0.85 * benefits;
  const taxable = Math.min(cap, firstTier + secondTier);
  const tier = taxable >= cap - 1e-9 ? "capped" : pi > b2 ? "eighty-five" : "fifty";
  return { pi, taxable, tier };
}

export function parse(raw) {
  const errors = [];
  const preset = BASES[raw.status];
  if (!preset) errors.push("Choose a filing status.");
  const benefits = num(raw.benefits);
  if (!(benefits > 0)) errors.push("Enter the year's total Social Security benefits (box 5 of Form SSA-1099), more than zero.");
  const other = num(raw.other);
  if (!Number.isFinite(other)) errors.push("Enter your other income: wages, pensions, IRA withdrawals, interest, dividends, gains and tax-exempt interest (can be negative).");
  const bracket = raw.bracket === "" || raw.bracket == null ? 0 : num(raw.bracket);
  if (!(bracket >= 0 && bracket <= 60)) errors.push("The marginal tax rate must be a percentage from 0 to 60.");
  const b1 = raw.b1 === "" || raw.b1 == null ? preset?.b1 : num(raw.b1);
  const b2 = raw.b2 === "" || raw.b2 == null ? preset?.b2 : num(raw.b2);
  if (preset && !(b1 >= 0 && b2 >= b1)) errors.push("The two base amounts must be zero or more, with the second at least the first.");
  return { errors, input: { status: raw.status, benefits, other, bracket, b1, b2 } };
}

export function compute(raw) {
  const { errors, input } = parse(raw);
  if (errors.length) return { errors };
  const { benefits, other, bracket, b1, b2 } = input;
  const base = taxableBenefits({ benefits, other, b1, b2 });
  const pctTaxable = base.taxable / benefits;
  const tax = (base.taxable * bracket) / 100;

  // Marginal effect of the next $1,000 of other income (IRA withdrawal, Roth conversion, gain).
  const step = 1000;
  const more = taxableBenefits({ benefits, other: other + step, b1, b2 });
  const extraTaxable = more.taxable - base.taxable;
  const multiplier = 1 + extraTaxable / step;
  const effectiveMarginal = bracket * multiplier;

  // Headroom: other income at which the 85% cap is reached, and the nearest tier edge above the current position.
  // Other income at which taxable benefits reach 85% of benefits (solve firstTier + 0.85*(pi-b2) = 0.85*benefits).
  const capIncome = b2 + (0.85 * benefits - Math.min(benefits / 2, 0.5 * (b2 - b1))) / 0.85 - benefits / 2;
  const edges = [b1 - benefits / 2, b2 - benefits / 2, capIncome].filter((x) => x > other + 1e-9).sort((a, b) => a - b);
  const nextEdge = edges.length ? edges[0] : null;

  // Sweep of other income, from 0 to above the cap.
  const top = Math.max(capIncome * 1.4, other * 1.3, b2 + 20000);
  const stepSize = Math.max(1000, Math.round(top / 12 / 1000) * 1000);
  const sweep = [];
  for (let o = 0; o <= top; o += stepSize) {
    const r = taxableBenefits({ benefits, other: o, b1, b2 });
    sweep.push({ other: o, pi: r.pi, taxable: r.taxable, pct: r.taxable / benefits, tax: (r.taxable * bracket) / 100 });
  }

  const findings = [];
  if (base.tier === "none") findings.push({ severity: "info", title: `Provisional income ${dollars(base.pi)} is at or under the first base ${dollars(b1)}: none of your benefits are taxable.` });
  if (base.tier === "fifty" || base.tier === "eighty-five") {
    findings.push({ severity: "medium", title: `${dollars(base.taxable)} of benefits (${(pctTaxable * 100).toFixed(1)}%) are taxable, adding about ${dollars(tax)} of federal tax at ${bracket}%.` });
  }
  if (base.tier === "capped") findings.push({ severity: "info", title: `Already at the 85% ceiling: ${dollars(base.taxable)} taxable. More income no longer taxes more benefits.` });
  if (extraTaxable > 0 && base.tier !== "capped") {
    findings.push({
      severity: multiplier > 1.5 ? "high" : "medium",
      title: `In this zone each extra $1,000 of income makes $${Math.round(extraTaxable)} more of your benefits taxable, so it is taxed as about $${Math.round(multiplier * 1000)}: an effective rate near ${effectiveMarginal.toFixed(1)}% instead of ${bracket}%.`,
    });
  }
  if (nextEdge != null && nextEdge - other > 0) findings.push({ severity: "info", title: `The next change in rate is ${dollars(nextEdge - other)} of extra income away (other income ${dollars(nextEdge)}).` });
  if (b1 === 0 && b2 === 0) findings.push({ severity: "info", title: "Married filing separately and living together: the bases are zero, so up to 85% is taxable from the first dollar." });

  return { errors: [], input, base, pctTaxable, tax, extraTaxable, multiplier, effectiveMarginal, capIncome, nextEdge, sweep, findings };
}

export function summaryText(r) {
  return [
    "Federal tax on Social Security benefits (worksheet, not advice)",
    `Benefits ${dollars(r.input.benefits)}, other income ${dollars(r.input.other)}, bases ${dollars(r.input.b1)} / ${dollars(r.input.b2)}`,
    `Provisional income: ${dollars(r.base.pi)}`,
    `Taxable benefits: ${dollars(r.base.taxable)} (${(r.pctTaxable * 100).toFixed(1)}% of benefits)`,
    `Tax on them at ${r.input.bracket}%: ${dollars(r.tax)}`,
    `Effective rate on the next dollar of income: ${r.effectiveMarginal.toFixed(1)}%`,
    "Check Publication 915 or a tax professional before relying on it.",
  ].join("\n");
}

export function sweepCsv(r) {
  return ["other_income,provisional_income,taxable_benefits,percent_taxable,tax_on_benefits",
    ...r.sweep.map((x) => [x.other, Math.round(x.pi), Math.round(x.taxable), (x.pct * 100).toFixed(1), Math.round(x.tax)].join(","))].join("\n");
}
