// UK VAT Flat Rate Scheme: compare the flat-rate VAT bill with standard VAT
// accounting for the same year, apply the 1% first-year discount and the 16.5%
// limited cost trader test. Browser-only. Not tax advice.

// Verify every figure on GOV.UK ("VAT Flat Rate Scheme") before relying on it.
export const FRS = {
  vatRate: 0.2,
  joinLimit: 150000, // expected taxable turnover excl. VAT
  leaveLimit: 230000, // turnover incl. VAT-exempt/zero-rated, excl. VAT
  firstYearDiscount: 1,
  limitedCostRate: 16.5,
  limitedCostPct: 0.02, // of VAT-inclusive turnover
  limitedCostFloor: 1000, // per year
  capitalThreshold: 2000, // VAT-inclusive single asset
};

// Sector rates (before the 1% first-year discount). A representative subset.
export const SECTORS = {
  it: { label: "Computer and IT consultancy or data processing", rate: 14.5 },
  mgmt: { label: "Management consultancy", rate: 14 },
  labour: { label: "Building or construction services: labour only", rate: 14.5 },
  materials: { label: "Building or construction services: including materials", rate: 9.5 },
  accountancy: { label: "Accountancy or bookkeeping", rate: 14.5 },
  legal: { label: "Lawyer or legal services", rate: 14.5 },
  advertising: { label: "Advertising", rate: 11 },
  architect: { label: "Architect, civil and structural engineer or surveyor", rate: 14.5 },
  entertainer: { label: "Entertainment or journalism", rate: 12.5 },
  hair: { label: "Hairdressing or other beauty treatment services", rate: 13 },
  repair: { label: "Repairing personal or household goods", rate: 10 },
  transport: { label: "Transport or storage, including couriers, freight, removals and taxis", rate: 10 },
  retailOther: { label: "Retailing that is not mainly food, confectionery, tobacco, newspapers or children's clothing", rate: 7.5 },
  business: { label: "Business services not listed elsewhere", rate: 12 },
  other: { label: "Other activity not listed elsewhere", rate: 12 },
};

export const SAMPLE = { sales: "80000", sector: "it", firstYear: "no", goods: "1500", otherCosts: "9000", capital: "0" };

const round2 = (n) => Math.round(n * 100) / 100;
const money = (n) => "£" + round2(n).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = (v) => (v === "" || v == null ? 0 : Number(v));

export function limitedCostTrader(grossTurnover, goods) {
  const pct = grossTurnover * FRS.limitedCostPct;
  return goods < pct || (goods >= pct && goods < FRS.limitedCostFloor);
}

export function compute(input) {
  const errors = [];
  const sector = SECTORS[input.sector];
  const sales = num(input.sales);
  const goods = num(input.goods);
  const other = num(input.otherCosts);
  const capital = num(input.capital);
  if (!sector) errors.push("Choose the business category that fits you best.");
  if (!(sales > 0)) errors.push("Enter your expected annual sales excluding VAT.");
  for (const [n, v] of [["goods", goods], ["other costs", other], ["capital purchases", capital]]) {
    if (!(v >= 0)) errors.push(`Enter ${n} as zero or more.`);
  }
  if (errors.length) return { errors };

  const firstYear = input.firstYear === "yes";
  const gross = sales * (1 + FRS.vatRate);
  const goodsGross = goods * (1 + FRS.vatRate);
  const lct = limitedCostTrader(gross, goodsGross);
  const baseRate = lct ? FRS.limitedCostRate : sector.rate;
  const rate = Math.max(0, baseRate - (firstYear ? FRS.firstYearDiscount : 0));
  const capitalReclaim = capital * (1 + FRS.vatRate) > FRS.capitalThreshold ? capital * FRS.vatRate : 0;
  const frsVat = gross * (rate / 100) - capitalReclaim;
  const outputVat = sales * FRS.vatRate;
  const inputVat = (goods + other + capital) * FRS.vatRate;
  const standardVat = outputVat - inputVat;
  const difference = standardVat - frsVat; // positive: flat rate cheaper
  // The cheapest rate you would have had without the limited cost test.
  const sectorRate = Math.max(0, sector.rate - (firstYear ? FRS.firstYearDiscount : 0));
  const lctCost = lct ? gross * ((rate - sectorRate) / 100) : 0;
  const breakEvenCosts = (outputVat - gross * (rate / 100) + capitalReclaim) / FRS.vatRate;

  const findings = [];
  if (sales > FRS.joinLimit) findings.push({ severity: "high", title: `Expected sales above £${FRS.joinLimit.toLocaleString("en-GB")} excluding VAT: you cannot join the Flat Rate Scheme.` });
  else if (sales > 120000) findings.push({ severity: "medium", title: "Close to the join limit: check your forecast, you must leave the scheme once turnover exceeds £230,000." });
  if (lct) findings.push({ severity: "high", title: `Limited cost trader: your spend on goods is under 2% of VAT-inclusive turnover (or under £${FRS.limitedCostFloor.toLocaleString("en-GB")} a year), so the rate is ${FRS.limitedCostRate}% instead of ${sectorRate}%. That costs about ${money(lctCost)} a year.` });
  if (firstYear) findings.push({ severity: "info", title: `First-year discount applied: ${FRS.firstYearDiscount} percentage point off for the first year of VAT registration.` });
  if (capitalReclaim > 0) findings.push({ severity: "info", title: `A single asset costing over £${FRS.capitalThreshold.toLocaleString("en-GB")} including VAT is the one purchase you may still reclaim VAT on (${money(capitalReclaim)}).` });
  if (difference < 0) findings.push({ severity: "high", title: `Standard VAT accounting would cost ${money(-difference)} less than the flat rate on these numbers.` });
  else findings.push({ severity: "info", title: `The Flat Rate Scheme costs ${money(difference)} less than standard accounting on these numbers.` });

  const obligations = [
    { title: "Apply", why: "Join with form VAT600FRS or online; you can start from your registration date or later." },
    { title: "Invoices", why: "Still charge 20% VAT to customers and show it on invoices; the flat rate is only what you pay HMRC." },
    { title: "Keep records", why: "You keep sales records but cannot reclaim VAT on purchases, except one capital asset over £2,000 including VAT." },
    { title: "Review yearly", why: "Re-run this with real figures each year; leave if standard accounting becomes cheaper or you pass the £230,000 limit." },
  ];

  return { errors, sales, gross, rate, sectorRate, lct, lctCost, frsVat: round2(frsVat), standardVat: round2(standardVat), difference: round2(difference), better: difference >= 0 ? "flat" : "standard", capitalReclaim: round2(capitalReclaim), breakEvenCosts: round2(Math.max(0, breakEvenCosts)), findings, obligations };
}

export function summaryText(r) {
  return [
    "UK VAT Flat Rate Scheme comparison (2026/27)",
    `Sales ex VAT: ${money(r.sales)}  |  VAT-inclusive turnover: ${money(r.gross)}`,
    `Flat rate used: ${r.rate}%${r.lct ? " (limited cost trader)" : ""}`,
    `VAT to pay, flat rate: ${money(r.frsVat)}`,
    `VAT to pay, standard accounting: ${money(r.standardVat)}`,
    `Cheaper route: ${r.better === "flat" ? "Flat Rate Scheme" : "standard accounting"} by ${money(Math.abs(r.difference))}`,
    "Not tax advice. Check GOV.UK before you register.",
  ].join("\n");
}
