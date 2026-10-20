// UK Inheritance Tax (IHT) estate calculator, rates and thresholds in force for deaths from 6 April 2025 (frozen to April 2030).
// Pure functions, no I/O. Bad input is rejected with a message, never clamped.
// Written from memory WITHOUT network access in the building session. Modelled: nil-rate band GBP 325,000, residence nil-rate band GBP 175,000 (home left to
// children or grandchildren) tapered away by GBP 1 for every GBP 2 the net estate is over GBP 2,000,000, transfer of a late spouse's unused bands (as a percentage),
// the unlimited spouse or civil partner exemption (UK-domiciled), charity gifts exempt, 40% rate and the 36% reduced rate when at least 10% of the baseline amount goes
// to charity. NOT modelled: taper relief on gifts, annual gift exemptions, trusts, business and agricultural relief (changing from April 2026), pensions
// (counted only if you switch on the April 2027 option), foreign-domiciled spouses, quick succession relief, double tax relief, and anything announced for later dates.
// Every result names its source to verify.

export const VERIFY = "GOV.UK 'Inheritance Tax thresholds and interest rates', 'Inheritance Tax: Residence nil-rate band' and 'Reduce the rate of Inheritance Tax on your estate (charity gifts)'; Inheritance Tax Act 1984";
export const NRB = 325000;
export const RNRB = 175000;
export const TAPER_START = 2000000;
export const RATE = 0.4;
export const CHARITY_RATE = 0.36;
export const CHARITY_SHARE = 0.1;

const money = (n) => (n < 0 ? "-" : "") + "GBP " + Number(Math.round(Math.abs(n) * 100) / 100).toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const r2 = (n) => Math.round(n * 100) / 100;
const num = (v) => (v === undefined || v === null || v === "" ? 0 : Number(v));

export function parse(input) {
  const i = input || {};
  const errors = [];
  const assets = Number(i.assets);
  if (i.assets === undefined || i.assets === null || i.assets === "" || !Number.isFinite(assets) || assets <= 0) errors.push("Enter the total value of the estate (property, savings, investments) as more than zero.");
  const gifts = num(i.gifts), pension = num(i.pension);
  if (!Number.isFinite(gifts) || gifts < 0) errors.push("Gifts in the last 7 years must be zero or more.");
  if (!Number.isFinite(pension) || pension < 0) errors.push("Unused pension pots must be zero or more.");
  const pensionIn = i.pensionIn === true || i.pensionIn === "yes" || i.pensionIn === "true";
  const debts = num(i.debts), home = num(i.home), spouse = num(i.spouse), charity = num(i.charity), unusedNrb = num(i.unusedNrb), unusedRnrb = num(i.unusedRnrb);
  for (const [label, v] of [["Debts", debts], ["Home value", home], ["Left to spouse or civil partner", spouse], ["Left to charity", charity]]) {
    if (!Number.isFinite(v) || v < 0) errors.push(`${label} must be zero or more.`);
  }
  for (const [label, v] of [["Unused nil-rate band", unusedNrb], ["Unused residence nil-rate band", unusedRnrb]]) {
    if (!Number.isFinite(v) || v < 0 || v > 100) errors.push(`${label} must be a percentage from 0 to 100.`);
  }
  if (!errors.length) {
    if (debts > assets) errors.push("Debts are more than the estate, so there is nothing to tax.");
    else if (home > assets) errors.push("The home cannot be worth more than the whole estate.");
    else if (spouse + charity > assets - debts) errors.push("Gifts to a spouse and to charity add up to more than the estate after debts.");
  }
  const homeToDescendants = i.homeToDescendants === true || i.homeToDescendants === "yes" || i.homeToDescendants === "true";
  return { errors, assets: assets + (pensionIn && pension > 0 ? pension : 0), baseAssets: assets, gifts, pension, pensionIn, debts, home, spouse, charity, unusedNrb, unusedRnrb, homeToDescendants };
}

// Tax on the estate. `charity` is the amount left to charity. Returns the full working.
export function iht(p, charity) {
  const net = r2(p.assets - p.debts);
  const nrb = Math.max(0, r2(NRB * (1 + p.unusedNrb / 100) - p.gifts));
  const rnrbFull = RNRB * (1 + p.unusedRnrb / 100);
  const taperLoss = Math.min(rnrbFull, Math.max(0, (net - TAPER_START) / 2));
  const rnrbAvail = p.homeToDescendants ? Math.max(0, rnrbFull - taperLoss) : 0;
  const afterExempt = net - p.spouse - charity;
  const rnrb = r2(Math.min(rnrbAvail, p.home, Math.max(0, afterExempt - nrb)));
  const taxable = Math.max(0, r2(afterExempt - nrb - rnrb));
  const baseline = Math.max(0, r2(net - p.spouse - nrb));
  const reduced = charity > 0 && baseline > 0 && charity >= baseline * CHARITY_SHARE;
  const rate = reduced ? CHARITY_RATE : RATE;
  return { net, nrb, rnrbFull, taperLoss: r2(taperLoss), rnrbAvail: r2(rnrbAvail), rnrb, afterExempt: r2(afterExempt), taxable, baseline, reduced, rate, tax: Math.floor(r2(taxable * rate) + 1e-9) };
}

export function compute(input) {
  const p = parse(input);
  if (p.errors.length) return { errors: p.errors };
  const main = iht(p, p.charity);
  const noCharity = iht(p, 0);
  const effective = r2((main.tax / main.net) * 100);
  const findings = [];
  const obligations = [];
  findings.push({ severity: "info", title: `Inheritance Tax on a net estate of ${money(main.net)} comes to ${money(main.tax)}, or ${effective}% of the estate, at ${r2(main.rate * 100)}% on the ${money(main.taxable)} above the tax-free bands.` });
  if (main.tax === 0 && main.net > 0) findings.push({ severity: "info", title: p.gifts > 0 ? "No Inheritance Tax is due on these figures." : "No Inheritance Tax is due on these figures. Large gifts in the last 7 years can still change that; enter them above if there are any." });
  if (p.gifts > 0) findings.push({ severity: "medium", title: `Gifts of ${money(p.gifts)} in the 7 years before death use up nil-rate band first, leaving ${money(main.nrb)} for the estate.${p.gifts > NRB * (1 + p.unusedNrb / 100) ? " Gifts above the band may themselves be taxed in the recipient's hands; that is not computed here." : ""} Taper relief for gifts made 3 to 7 years before death is not modelled.` });
  if (p.pension > 0) {
    const other = iht({ ...p, assets: p.baseAssets + (p.pensionIn ? 0 : p.pension) }, p.charity);
    findings.push({ severity: "high", title: p.pensionIn ? `Unused pension pots of ${money(p.pension)} are counted in the estate (death on or after 6 April 2027). Without them the tax would be ${money(iht({ ...p, assets: p.baseAssets }, p.charity).tax)}.` : `Unused pension pots of ${money(p.pension)} are left out because the death is before 6 April 2027. From that date they are counted: the tax on these figures would be ${money(other.tax)}.` });
  }
  if (p.homeToDescendants && p.home > 0) findings.push({ severity: "medium", title: `The residence nil-rate band gives ${money(main.rnrb)} of extra tax-free allowance, worth up to ${money(main.rnrb * RATE)} of tax.` });
  if (!p.homeToDescendants && p.home > 0) findings.push({ severity: "medium", title: `The home is not left to children or grandchildren, so no residence nil-rate band applies. Leaving it to direct descendants could add up to ${money(Math.min(RNRB * (1 + p.unusedRnrb / 100), p.home))} of allowance before any taper.` });
  if (main.taperLoss > 0) findings.push({ severity: "high", title: `The net estate is ${money(main.net - TAPER_START)} over the ${money(TAPER_START)} taper point, which removes ${money(main.taperLoss)} of the residence nil-rate band (GBP 1 for every GBP 2 over). The effective marginal rate in that range is 60% on the estate.` });
  if (p.unusedNrb > 0 || p.unusedRnrb > 0) findings.push({ severity: "info", title: `Transferred allowances from a late spouse raise the tax-free amount to ${money(main.nrb)} plus up to ${money(main.rnrbFull)} residence band. They must be claimed on form IHT217 by the personal representatives.` });
  if (p.charity > 0) {
    if (main.reduced) findings.push({ severity: "medium", title: `Leaving ${money(p.charity)} to charity is at least 10% of the baseline amount (${money(main.baseline)}), so the rest of the taxable estate is charged at 36% instead of 40%. Without the charity gift the bill would be ${money(noCharity.tax)}; the gift costs the family ${money(p.charity - (noCharity.tax - main.tax))} net.` });
    else findings.push({ severity: "medium", title: `Charity gifts are exempt, which lowers the bill from ${money(noCharity.tax)} to ${money(main.tax)}. At least ${money(r2(main.baseline * CHARITY_SHARE))} (10% of the baseline amount ${money(main.baseline)}) to charity would cut the rate on the rest to 36%.` });
  }
  if (p.spouse > 0) findings.push({ severity: "info", title: `${money(p.spouse)} left to a UK-domiciled spouse or civil partner is exempt. Anything not used of the nil-rate bands can pass to the survivor and be claimed later, so leaving everything to a spouse defers the tax rather than removing it.` });
  findings.push({ severity: "info", title: "Not modelled: taper relief on gifts, annual gift exemptions, trusts, business and agricultural relief, a spouse who is not UK-domiciled, and anything announced after this was written." });

  obligations.push({ ref: "Account", title: "Report the estate and pay the tax", why: "The personal representatives normally send HMRC an IHT400 account and pay any tax within 6 months of the end of the month of death, before probate is granted. Interest runs after that." });
  obligations.push({ ref: "Funds", title: "Plan where the cash comes from", why: "Tax is due before the estate can usually be sold. Banks can often release funds to pay HMRC directly, and tax on property can sometimes be paid in instalments over 10 years." });
  if (p.unusedNrb > 0 || p.unusedRnrb > 0) obligations.push({ ref: "Claim", title: "Claim the transferred bands", why: "Use form IHT217 with the late spouse's death details so the unused percentage of the nil-rate bands is added." });
  return { errors: [], ...main, assets: p.assets, gifts: p.gifts, pension: p.pension, pensionIn: p.pensionIn, debts: p.debts, home: p.home, spouse: p.spouse, charity: p.charity, homeToDescendants: p.homeToDescendants, effective, taxNoCharity: noCharity.tax, findings, obligations };
}

export const SAMPLE = { assets: 900000, debts: 50000, home: 500000, homeToDescendants: "yes", spouse: 0, charity: 0, unusedNrb: 0, unusedRnrb: 0, gifts: 0, pension: 0, pensionIn: "no" };

export function summaryText(r) {
  const L = ["UK Inheritance Tax estimate (deaths from 6 April 2025)", "", `Estate value: ${money(r.assets)}`, `Debts: ${money(r.debts)}`, `Net estate: ${money(r.net)}`];
  if (r.spouse) L.push(`Left to spouse or civil partner (exempt): ${money(r.spouse)}`);
  if (r.charity) L.push(`Left to charity (exempt): ${money(r.charity)}`);
  L.push("", `Nil-rate band: ${money(r.nrb)}`, `Residence nil-rate band used: ${money(r.rnrb)}`, `Taxable amount: ${money(r.taxable)}`, `Rate: ${r2(r.rate * 100)}%`, "", `Inheritance Tax: ${money(r.tax)}`, `Share of estate: ${r.effective}%`);
  L.push("", ...r.findings.map((f) => `- ${f.title}`), "", ...r.obligations.map((o) => `- ${o.title}: ${o.why}`), "", `Verify against: ${VERIFY}`, "Not tax advice. No warranty.");
  return L.join("\n");
}
