// Invoice factoring true cost. Pure arithmetic over what the user types in: a factor advances a share of an invoice, charges a fee
// that grows with the days the customer takes to pay, and rebates the rest of the reserve. The quoted "2.5%" is rarely the cost
// that matters, so this turns each offer into cost in dollars, cost as a share of the invoice, an annualised rate (APR-style, simple,
// not compounded) on the cash advanced, and a monthly and yearly figure at the user's invoice volume.

export const MODES = ["stepped", "daily"];
const round2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;
const num = (s) => Number(String(s ?? "").replace(/[$,%\s_]/g, ""));

// One offer per line: name, advance %, fee % per period, period days, flat fee per invoice, mode (stepped|daily)
export function parseOffers(text) {
  const offers = [];
  const errors = [];
  String(text ?? "").split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const p = line.split(",").map((s) => s.trim());
    const [name, adv, fee, period, flat, modeRaw] = p;
    const advance = num(adv), feePct = num(fee), periodDays = num(period), flatFee = p[4] === undefined || p[4] === "" ? 0 : num(flat);
    const mode = (modeRaw || "stepped").toLowerCase();
    if (!name || adv === undefined || fee === undefined || period === undefined) return errors.push(`Offer line ${i + 1}: need "name, advance %, fee % per period, period days, flat fee per invoice, stepped|daily".`);
    if (![advance, feePct, periodDays, flatFee].every(Number.isFinite)) return errors.push(`Offer line ${i + 1}: use plain numbers.`);
    if (advance <= 0 || advance > 100) return errors.push(`Offer line ${i + 1}: advance % must be above 0 and at most 100.`);
    if (feePct < 0 || flatFee < 0) return errors.push(`Offer line ${i + 1}: fees cannot be negative.`);
    if (periodDays <= 0) return errors.push(`Offer line ${i + 1}: the fee period must be at least 1 day.`);
    if (!MODES.includes(mode)) return errors.push(`Offer line ${i + 1}: mode must be stepped or daily.`);
    offers.push({ name, advance, feePct, periodDays, flatFee, mode });
  });
  return { offers, errors };
}

export function costOf(offer, face, days) {
  const periods = offer.mode === "daily" ? days / offer.periodDays : Math.ceil(days / offer.periodDays);
  const advanced = face * offer.advance / 100;
  const factorFee = face * offer.feePct / 100 * periods;
  const cost = factorFee + offer.flatFee;
  const reserve = face - advanced;
  const rebate = reserve - cost;
  return {
    periods, advanced: round2(advanced), factorFee: round2(factorFee), cost: round2(cost),
    reserve: round2(reserve), rebate: round2(rebate), net: round2(face - cost),
    pctOfInvoice: round2(cost / face * 100),
    apr: round2(cost / advanced * 365 / days * 100),
  };
}

export function plan(input) {
  const { offers, errors } = parseOffers(input.offers);
  if (errors.length) return { error: errors[0], errors };
  if (!offers.length) return { error: "Add at least one offer: name, advance %, fee %, period days, flat fee, mode." };
  const face = num(input.invoice), days = num(input.days);
  const perMonth = input.perMonth === undefined || input.perMonth === "" ? 1 : num(input.perMonth);
  const altApr = input.altApr === undefined || input.altApr === "" ? 0 : num(input.altApr);
  if (!(face > 0)) return { error: "Enter an invoice amount above zero." };
  if (!(days >= 1)) return { error: "Enter how many days your customer takes to pay (at least 1)." };
  if (!(perMonth >= 0) || !Number.isFinite(altApr) || altApr < 0) return { error: "Invoices per month and the alternative rate must be zero or more." };

  const rows = offers.map((o) => {
    const c = costOf(o, face, days);
    // The cost of borrowing the same advance on a line of credit for the same days, for comparison.
    const alt = altApr > 0 ? round2(c.advanced * altApr / 100 * days / 365) : null;
    return { ...o, ...c, monthly: round2(c.cost * perMonth), yearly: round2(c.cost * perMonth * 12), alt };
  });
  const ranked = [...rows].sort((a, b) => a.cost - b.cost);
  const best = ranked[0];
  const advice = [`Cheapest on a $${face.toFixed(2)} invoice paid in ${days} days: ${best.name}, $${best.cost.toFixed(2)} (${best.pctOfInvoice}% of the invoice, about ${best.apr}% a year on the cash advanced).`];
  if (ranked.length > 1) {
    const worst = ranked[ranked.length - 1];
    advice.push(`${worst.name} costs $${round2(worst.cost - best.cost).toFixed(2)} more per invoice than ${best.name}${perMonth > 0 ? `, about $${round2((worst.cost - best.cost) * perMonth * 12).toFixed(2)} a year at ${perMonth} invoice${perMonth === 1 ? "" : "s"} a month` : ""}.`);
  }
  for (const r of rows) {
    if (r.rebate < 0) advice.push(`${r.name}: fees exceed the reserve held back, so you would owe $${(-r.rebate).toFixed(2)} on top of the advance when the customer pays.`);
    if (r.mode === "stepped" && r.periodDays > 1 && days % r.periodDays !== 0 && days % r.periodDays <= Math.ceil(r.periodDays / 5)) advice.push(`${r.name}: paid ${days % r.periodDays} day${days % r.periodDays === 1 ? "" : "s"} into a new ${r.periodDays}-day period, you pay a whole extra period's fee; that is $${round2(face * r.feePct / 100).toFixed(2)}.`);
    if (r.alt !== null) advice.push(`${r.name}: borrowing the same $${r.advanced.toFixed(2)} for ${days} days at ${altApr}% a year would cost about $${r.alt.toFixed(2)}, ${r.alt < r.cost ? `$${round2(r.cost - r.alt).toFixed(2)} less than the factor` : `$${round2(r.alt - r.cost).toFixed(2)} more than the factor`}.`);
  }
  advice.push("Quoted rates often leave out ACH or wire fees, monthly minimums, setup or termination fees, and fees on invoices your customer disputes. Add them to the flat fee or ask the factor for a full fee schedule.");
  return { rows, best, advice, face, days, perMonth };
}

export function sampleInput() {
  return {
    invoice: 8000, days: 38, perMonth: 6, altApr: 12,
    offers: ["Quick Funds Factoring, 90, 3, 30, 0, stepped", "Flat Rate Capital, 85, 1.5, 15, 15, stepped", "Daily Accrual Co, 90, 0.1, 1, 10, daily"].join("\n"),
  };
}

export function toCsv(r) {
  const head = "offer,advance,factor_fee,flat_fee,total_cost,pct_of_invoice,apr_pct,rebate,net_cash";
  const lines = r.rows.map((x) => [x.name, x.advanced.toFixed(2), x.factorFee.toFixed(2), x.flatFee.toFixed(2), x.cost.toFixed(2), x.pctOfInvoice, x.apr, x.rebate.toFixed(2), x.net.toFixed(2)].map((c) => (/[",\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : c)).join(","));
  return [head, ...lines].join("\n") + "\n";
}
