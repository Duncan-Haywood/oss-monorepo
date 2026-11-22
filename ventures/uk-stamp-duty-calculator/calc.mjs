// UK Stamp Duty Land Tax (SDLT) calculator for residential purchases in England and Northern Ireland, rates in force from 1 April 2025.
// Pure functions, no I/O. Bad input is rejected with a message, never clamped.
// Written from memory WITHOUT network access in the building session. Modelled: standard residential bands (0% to GBP 125,000; 2% to GBP 250,000; 5% to GBP 925,000;
// 10% to GBP 1,500,000; 12% above), first-time buyer relief (0% to GBP 300,000, 5% to GBP 500,000, no relief if the price is above GBP 500,000), the 5% higher rates
// for additional dwellings (price GBP 40,000 or more) and the 2% surcharge for non-UK resident buyers. Tax is rounded down to whole pounds. NOT modelled: Scotland (LBTT)
// and Wales (LTT), companies and other non-natural buyers, leases and rent, mixed-use or non-residential land, linked transactions, shared ownership, replacing a main
// residence timing rules, and anything announced for later dates. Every result names its source to verify.

export const VERIFY = "GOV.UK 'Stamp Duty Land Tax: residential property rates', 'Stamp Duty Land Tax: buying your first home' and 'Higher rates of SDLT for additional dwellings'; Finance Act 2003 Schedule 4ZA";
export const BANDS = [
  { from: 0, to: 125000, rate: 0 },
  { from: 125000, to: 250000, rate: 0.02 },
  { from: 250000, to: 925000, rate: 0.05 },
  { from: 925000, to: 1500000, rate: 0.1 },
  { from: 1500000, to: Infinity, rate: 0.12 },
];
export const FTB_BANDS = [
  { from: 0, to: 300000, rate: 0 },
  { from: 300000, to: 500000, rate: 0.05 },
];
export const FTB_CAP = 500000;
export const SURCHARGE_ADDITIONAL = 0.05;
export const SURCHARGE_NON_RESIDENT = 0.02;
export const ADDITIONAL_MIN_PRICE = 40000;
export const BUYERS = { main: "Home to live in (only property)", ftb: "First-time buyer", additional: "Additional property (buy-to-let or second home)" };

const money = (n) => ((t) => (n < 0 && /[1-9∞]/.test(t) ? "-" : "") + t)("GBP " + Number(Math.round(Math.abs(n) * 100) / 100).toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).replace(/\.\d$/, (m) => m + "0"));
const r2 = (n) => Math.round(n * 100) / 100;

export function parse(input) {
  const i = input || {};
  const errors = [];
  const price = Number(i.price);
  if (i.price === undefined || i.price === null || i.price === "" || !Number.isFinite(price) || price <= 0) errors.push("Enter the purchase price as more than zero.");
  const buyer = String(i.buyer || "");
  if (!BUYERS[buyer]) errors.push("Pick what kind of buyer you are.");
  const nonResident = i.nonResident === true || i.nonResident === "yes" || i.nonResident === "true";
  return { errors, price, buyer, nonResident };
}

function slice(price, bands, extra) {
  const rows = [];
  let total = 0;
  for (const b of bands) {
    const amount = Math.max(0, Math.min(price, b.to) - b.from);
    if (amount <= 0) continue;
    const rate = r2(b.rate + extra);
    const tax = amount * rate;
    rows.push({ from: b.from, to: Math.min(price, b.to), rate, amount, tax: r2(tax) });
    total += tax;
  }
  return { rows, total: Math.floor(r2(total) + 1e-9) };
}

// Tax for one buyer type at a price. Returns { tax, rows, relief } where relief is false when first-time buyer relief was asked for but is not available.
export function sdlt(price, buyer, nonResident) {
  let extra = nonResident ? SURCHARGE_NON_RESIDENT : 0;
  let bands = BANDS;
  let relief = null;
  if (buyer === "ftb") {
    if (price <= FTB_CAP) { bands = FTB_BANDS; relief = true; } else relief = false;
  } else if (buyer === "additional" && price >= ADDITIONAL_MIN_PRICE) {
    extra += SURCHARGE_ADDITIONAL;
  }
  const s = slice(price, bands, extra);
  return { tax: s.total, rows: s.rows, relief };
}

export function compute(input) {
  const p = parse(input);
  if (p.errors.length) return { errors: p.errors };
  const { price, buyer, nonResident } = p;
  const main = sdlt(price, buyer, nonResident);
  const std = sdlt(price, "main", nonResident);
  const ftbOption = price <= FTB_CAP ? sdlt(price, "ftb", nonResident) : null;
  const addl = sdlt(price, "additional", nonResident);
  const effective = r2((main.tax / price) * 100);
  const marginalStep = sdlt(price + 1000, buyer, nonResident).tax - main.tax;
  const marginal = r2(marginalStep / 10);
  const findings = [];
  const obligations = [];

  findings.push({ severity: "info", title: `Stamp Duty on a ${money(price)} purchase is ${money(main.tax)} (${effective}% of the price) for: ${BUYERS[buyer]}${nonResident ? ", non-UK resident" : ""}.` });
  if (buyer === "ftb" && main.relief === false) findings.push({ severity: "high", title: `First-time buyer relief does not apply above ${money(FTB_CAP)}: the whole price is taxed at standard rates, so there is no relief at all, not a reduced one. At exactly ${money(FTB_CAP)} the tax would be ${money(sdlt(FTB_CAP, "ftb", nonResident).tax)}.` });
  if (buyer === "ftb" && main.relief === true && price > 300000) findings.push({ severity: "medium", title: `First-time buyer relief saves you ${money(std.tax - main.tax)} compared with standard rates on this price. It is lost entirely if the price goes above ${money(FTB_CAP)}.` });
  if (buyer === "additional" && price < ADDITIONAL_MIN_PRICE) findings.push({ severity: "info", title: `The 5% higher rate for additional dwellings only applies to purchases of ${money(ADDITIONAL_MIN_PRICE)} or more, so none is charged here.` });
  if (buyer === "additional" && price >= ADDITIONAL_MIN_PRICE) findings.push({ severity: "high", title: `The 5% additional dwelling surcharge adds ${money(addl.tax - std.tax)} over the same purchase as a main home. It applies to the whole price, starting from the first pound.` });
  if (buyer === "main") findings.push({ severity: "info", title: price >= ADDITIONAL_MIN_PRICE
    ? `If you already own another property that you are not replacing, you may owe the 5% additional dwelling rate instead: ${money(addl.tax)} on this price.`
    : `Even if you already own another property, the 5% additional dwelling rate does not apply below ${money(ADDITIONAL_MIN_PRICE)}, so the tax would be the same.` });
  if (nonResident) findings.push({ severity: "medium", title: `The 2% non-UK resident surcharge adds ${money(main.tax - sdlt(price, buyer, false).tax)} to the bill. Residence is decided by days spent in the UK in the 12 months before purchase; check the test on GOV.UK.` });
  // The next band edge in the table this buyer is actually taxed on: first-time buyers with relief step at 300,000 and lose relief above 500,000.
  const ftbRelief = buyer === "ftb" && main.relief === true;
  const edges = ftbRelief ? FTB_BANDS.map((b) => b.to) : BANDS.map((b) => b.to);
  const nextEdge = edges.filter((e) => Number.isFinite(e) && e > price).sort((a, b) => a - b)[0];
  if (nextEdge && nextEdge - price <= 25000) {
    const atEdge = sdlt(nextEdge, buyer, nonResident).tax;
    const nextRate = r2((sdlt(nextEdge + 1000, buyer, nonResident).tax - atEdge) / 10);
    const loseRelief = ftbRelief && nextEdge === FTB_CAP;
    findings.push({ severity: "info", title: loseRelief
      ? `You are ${money(nextEdge - price)} below ${money(nextEdge)}. Up to that price first-time buyer relief applies (tax there: ${money(atEdge)}); one pound more and relief is lost entirely, so the tax jumps to ${money(sdlt(nextEdge + 1, buyer, nonResident).tax)}.`
      : `You are ${money(nextEdge - price)} below ${money(nextEdge)}. Price above that is taxed at ${nextRate}% instead of ${marginal}%; at exactly ${money(nextEdge)} the tax would be ${money(atEdge)}, ${money(atEdge - main.tax)} more than now.` });
  }
  findings.push({ severity: "info", title: `Your marginal rate at this price is ${marginal}%: each extra GBP 1,000 on the price adds ${money(marginalStep)} of tax.` });
  findings.push({ severity: "info", title: "Not modelled: Scotland (LBTT) and Wales (LTT), companies and trusts as buyers, leasehold rent, mixed-use or commercial land, linked transactions, shared ownership and anything announced after this was written." });

  obligations.push({ ref: "Return", title: "File an SDLT return within 14 days", why: "Your solicitor or conveyancer normally files the return and pays within 14 days of completion. Late filing and late payment carry penalties and interest." });
  obligations.push({ ref: "Budget", title: "Budget for the tax on top of the deposit", why: "Stamp Duty is paid in cash at completion and cannot be added to the mortgage by most lenders. Add legal fees, survey and moving costs." });
  if (buyer === "additional") obligations.push({ ref: "Refund", title: "Replacing a main home?", why: "If you buy a new main home before selling the old one you can pay the higher rate and claim a refund when the old one sells within 3 years. Ask your conveyancer." });
  return { errors: [], price, buyer, buyerLabel: BUYERS[buyer], nonResident, tax: main.tax, rows: main.rows, relief: main.relief, effective, marginal, standardTax: std.tax, ftbTax: ftbOption ? ftbOption.tax : null, additionalTax: addl.tax, findings, obligations };
}

export const SAMPLE = { price: 450000, buyer: "main", nonResident: "no" };

export function summaryText(r) {
  const L = ["UK Stamp Duty Land Tax (England and Northern Ireland, from 1 April 2025)", "", `Purchase price: ${money(r.price)}`, `Buyer: ${r.buyerLabel}${r.nonResident ? ", non-UK resident" : ""}`, "", "Band breakdown:"];
  for (const row of r.rows) L.push(`  ${money(row.from)} to ${money(row.to)} at ${r2(row.rate * 100)}%: ${money(row.tax)}`);
  L.push("", `Stamp Duty to pay: ${money(r.tax)}`, `Effective rate: ${r.effective}%`, `Same price as a main home: ${money(r.standardTax)}`, `Same price as an additional property: ${money(r.additionalTax)}`);
  if (r.ftbTax !== null) L.push(`Same price as a first-time buyer: ${money(r.ftbTax)}`);
  L.push("", ...r.findings.map((f) => `- ${f.title}`), "", ...r.obligations.map((o) => `- ${o.title}: ${o.why}`), "", `Verify against: ${VERIFY}`, "Not tax advice. No warranty.");
  return L.join("\n");
}
