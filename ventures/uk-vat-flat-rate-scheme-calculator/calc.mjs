// UK VAT Flat Rate Scheme (FRS) vs standard VAT accounting.
// Browser-only, no network. Not tax advice.
// Source to verify: GOV.UK "VAT Flat Rate Scheme" and VAT Notice 733.

export const VAT_RATE = 0.2;
export const LCT_RATE = 16.5;          // limited cost trader flat rate, %
export const LCT_PCT_OF_TURNOVER = 0.02; // goods under 2% of VAT-inclusive turnover
export const LCT_MIN_GOODS = 1000;       // ...or under GBP 1,000 a year
export const JOIN_LIMIT = 150000;        // expected taxable turnover (ex VAT) to join
export const LEAVE_LIMIT = 230000;       // total income (inc VAT) above which you must leave
export const CAPITAL_RECLAIM_MIN = 2000; // single capital asset, VAT-inclusive

export const SECTORS = [
  ["Accountancy or book-keeping", 14.5], ["Advertising", 11], ["Agricultural services", 11],
  ["Architect, civil and structural engineer or surveyor", 14.5], ["Boarding or care of animals", 12],
  ["Business services not listed elsewhere", 12], ["Computer and IT consultancy or data processing", 14.5],
  ["Computer repair services", 10.5], ["Entertainment or journalism", 12.5], ["Estate agency or property management", 12],
  ["Farming or agriculture not listed elsewhere", 6.5], ["Film, radio, television or video production", 13],
  ["Financial services", 13.5], ["Forestry or fishing", 10.5], ["General building or construction services", 9.5],
  ["Hairdressing or other beauty treatment", 13], ["Hiring or renting goods", 9.5], ["Hotel or accommodation", 10.5],
  ["Investigation or security", 12], ["Labour-only building or construction services", 14.5], ["Laundry or dry-cleaning", 12],
  ["Lawyer or legal services", 14.5], ["Library, archive, museum or cultural activity", 9.5], ["Management consultancy", 14],
  ["Manufacturing fabricated metal products", 10.5], ["Manufacturing food", 9], ["Manufacturing not listed elsewhere", 9.5],
  ["Manufacturing yarn, textiles or clothing", 9], ["Membership organisation", 8], ["Mining or quarrying", 10],
  ["Packaging", 9], ["Photography", 11], ["Post offices", 5], ["Printing", 8.5], ["Publishing", 11],
  ["Pubs", 6.5], ["Real estate activity not listed elsewhere", 14], ["Repairing personal or household goods", 10],
  ["Repairing vehicles", 8.5], ["Retailing food, confectionery, tobacco, newspapers or children's clothing", 4],
  ["Retailing pharmaceuticals, medical goods, cosmetics or toiletries", 8], ["Retailing vehicles or fuel", 6.5],
  ["Retailing not listed elsewhere", 7.5], ["Secretarial services", 13], ["Social work", 11],
  ["Sport or recreation", 8.5], ["Transport or storage, including couriers, freight and removals", 10],
  ["Travel agency", 10.5], ["Veterinary medicine", 11], ["Wholesaling agricultural products", 8],
  ["Wholesaling food", 7.5], ["Wholesaling not listed elsewhere", 8.5],
].map(([label, rate], i) => ({ id: String(i), label, rate }));

export const SAMPLE = {
  sector: "6", // Computer and IT consultancy
  turnover: "60000", goodsSpend: "300", otherPurchases: "4000", capitalSpend: "0", firstYear: "no",
};

const round2 = (n) => Math.round(n * 100) / 100;
const num = (v) => (v === "" || v == null ? 0 : Number(v));
const money = (n) => "£" + round2(n).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function compute(raw) {
  const errors = [];
  const f = {};
  for (const k of ["turnover", "goodsSpend", "otherPurchases", "capitalSpend"]) {
    const v = num(raw[k]);
    if (!Number.isFinite(v) || v < 0) errors.push(`"${k}" must be a number that is zero or more.`);
    f[k] = v;
  }
  const sector = SECTORS.find((s) => s.id === String(raw.sector));
  if (!sector) errors.push("Choose the sector that best describes your business.");
  if (!(f.turnover > 0)) errors.push("Enter your annual turnover excluding VAT.");
  if (errors.length) return { errors };
  const firstYear = raw.firstYear === "yes";

  // All turnover figures are entered excluding VAT and assumed standard-rated (20%).
  const grossTurnover = round2(f.turnover * (1 + VAT_RATE));
  const goodsInc = round2(f.goodsSpend * (1 + VAT_RATE));

  // Limited cost trader test: VAT-inclusive goods under 2% of VAT-inclusive turnover, or under £1,000 a year.
  const lctLimit = Math.max(LCT_PCT_OF_TURNOVER * grossTurnover, 0);
  const isLct = goodsInc < lctLimit || goodsInc < LCT_MIN_GOODS;
  const sectorRate = sector.rate;
  const frsRate = isLct ? LCT_RATE : round2(sectorRate - (firstYear ? 1 : 0));

  const frsPayable = round2(grossTurnover * frsRate / 100);
  // Under the FRS you can still reclaim VAT on a single capital asset costing £2,000 or more inc VAT.
  const capitalIncVat = round2(f.capitalSpend * (1 + VAT_RATE));
  const capitalReclaim = capitalIncVat >= CAPITAL_RECLAIM_MIN ? round2(f.capitalSpend * VAT_RATE) : 0;
  const frsNet = round2(frsPayable - capitalReclaim);

  const outputVat = round2(f.turnover * VAT_RATE);
  const inputVat = round2((f.goodsSpend + f.otherPurchases + f.capitalSpend) * VAT_RATE);
  const stdNet = round2(outputVat - inputVat);

  const saving = round2(stdNet - frsNet);
  const better = saving > 0 ? "frs" : saving < 0 ? "standard" : "same";

  const findings = [];
  if (isLct) {
    findings.push({ severity: "high", title: `Limited cost trader: your goods spend of ${money(goodsInc)} (VAT-inclusive) is under 2% of your ${money(grossTurnover)} turnover or under £1,000, so you pay ${LCT_RATE}% rather than the ${sectorRate}% sector rate.` });
    findings.push({ severity: "info", title: `At ${LCT_RATE}% the scheme costs ${money(grossTurnover * LCT_RATE / 100)} a year before any reclaim. This is why service businesses with few costs often do worse on the scheme.` });
  } else {
    findings.push({ severity: "info", title: `Your goods spend is ${((goodsInc / grossTurnover) * 100).toFixed(1)}% of turnover, above the 2% limited cost trader line, so the ${sectorRate}% sector rate${firstYear ? " less the 1% first-year discount" : ""} applies.` });
  }
  if (better === "frs") findings.push({ severity: "high", title: `Flat Rate Scheme leaves ${money(saving)} a year more in your pocket than standard accounting.` });
  else if (better === "standard") findings.push({ severity: "high", title: `Standard VAT accounting leaves ${money(-saving)} a year more in your pocket than the Flat Rate Scheme.` });
  else findings.push({ severity: "info", title: "The two methods come out the same on these figures." });
  if (f.turnover > JOIN_LIMIT) findings.push({ severity: "high", title: `Expected taxable turnover over ${money(JOIN_LIMIT)} (excluding VAT) means you cannot join the Flat Rate Scheme, and an existing member must leave once total income including VAT passes ${money(LEAVE_LIMIT)}.` });
  if (firstYear && isLct) findings.push({ severity: "medium", title: "Assumption to verify: this tool does not apply the 1% first-year discount to the 16.5% limited cost trader rate. Check GOV.UK VAT Notice 733." });
  if (f.capitalSpend > 0 && capitalReclaim === 0) findings.push({ severity: "info", title: `Capital spend under ${money(CAPITAL_RECLAIM_MIN)} including VAT cannot be reclaimed under the Flat Rate Scheme.` });
  if (stdNet < 0) findings.push({ severity: "medium", title: "Standard accounting gives you a VAT refund on these figures, which the Flat Rate Scheme cannot (you always pay a positive amount)." });

  const obligations = [
    { title: "You still charge 20%", why: "You invoice customers VAT at the normal rate and show it on invoices. The flat rate only changes how much of the VAT-inclusive total you pay over to HMRC." },
    { title: "Rate applies to VAT-inclusive turnover", why: "The percentage is taken from your gross takings including VAT, which is why 14.5% of sales is not 14.5% of the net." },
    { title: "Limited cost trader test every period", why: "HMRC expects you to test each VAT return. Relevant goods exclude capital items, vehicles, food and drink for you or staff, and fuel unless you are a transport business." },
    { title: "Leaving and rejoining", why: "You can leave at any time, but if you leave you generally cannot rejoin for 12 months. Check GOV.UK before deciding." },
    { title: "Zero-rated and exempt sales", why: "This tool assumes every sale is standard-rated. Mixed supplies change the answer; speak to an accountant." },
  ];

  return { errors: [], sector, firstYear, isLct, frsRate, grossTurnover, goodsInc, frsPayable, capitalReclaim, frsNet, outputVat, inputVat, stdNet, saving, better, findings, obligations };
}

export function summaryText(r) {
  const lines = ["UK VAT Flat Rate Scheme vs standard VAT accounting"];
  lines.push(`Sector: ${r.sector.label} (${r.sector.rate}%); rate used ${r.frsRate}%${r.isLct ? " (limited cost trader)" : ""}`);
  lines.push(`Flat Rate Scheme: pay HMRC ${money(r.frsNet)} (${money(r.frsPayable)} less ${money(r.capitalReclaim)} capital reclaim)`);
  lines.push(`Standard: output VAT ${money(r.outputVat)} less input VAT ${money(r.inputVat)} = ${money(r.stdNet)}`);
  lines.push(r.better === "frs" ? `Flat Rate Scheme is better by ${money(r.saving)} a year` : r.better === "standard" ? `Standard accounting is better by ${money(-r.saving)} a year` : "Same result");
  lines.push("Verify the rates and rules on GOV.UK before relying on this. Not tax advice.");
  return lines.join("\n");
}
