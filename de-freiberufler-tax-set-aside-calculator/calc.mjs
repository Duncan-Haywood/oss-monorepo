// Germany freelancer / sole proprietor tax set-aside: income tax per the
// 2026 section 32a EStG Grundtarif, Solidaritaetszuschlag with its
// Freigrenze and Milderungszone, optional Kirchensteuer, and Gewerbesteuer
// with the section 35 credit for commercial (gewerblich) businesses.
// Freiberufler pay no Gewerbesteuer. Figures are the 2026 values in the
// statute text and secondary summaries, written without a live
// Bundesfinanzministerium lookup; the Finanzamt decides. Pure functions.

export const YEARS = {
  "2026": {
    grundfreibetrag: 12348,
    zone2End: 17799,
    zone3End: 69878,
    zone4End: 277826,
    soliFreigrenze: 20350,
    soliRate: 0.055,
    soliMilderung: 0.119,
    gewFreibetrag: 24500,
    messzahl: 0.035,
    paragraph35Factor: 4,
    sonderausgabenMin: 36,
    kleinunternehmerPrior: 25000,
    kleinunternehmerCurrent: 100000,
  },
};

export const SAMPLE = { year: "2026", revenue: "90000", expenses: "20000", kind: "freiberufler", church: "none", hebesatz: "400", insurance: "9000" };

const num = (v) => {
  const s = String(v ?? "").trim().replace(/[€\s]/g, "").replace(/,/g, "");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
};
const r2 = (n) => Math.round(n * 100) / 100;

// Section 32a EStG, single assessment. The statute rounds the taxable
// income down to whole euros and the result down to whole euros.
export function incomeTax(zve, y) {
  const Y = YEARS[y];
  const x = Math.floor(Math.max(0, zve));
  let t;
  if (x <= Y.grundfreibetrag) t = 0;
  else if (x <= Y.zone2End) {
    const a = (x - Y.grundfreibetrag) / 10000;
    t = (914.51 * a + 1400) * a;
  } else if (x <= Y.zone3End) {
    const z = (x - Y.zone2End) / 10000;
    t = (173.1 * z + 2397) * z + 1034.87;
  } else if (x <= Y.zone4End) t = 0.42 * x - 11135.63;
  else t = 0.45 * x - 19470.38;
  return Math.floor(t);
}

// Soli is 5.5% of income tax, but only above the Freigrenze, and in the
// Milderungszone never more than 11.9% of the excess.
export function soli(tax, y) {
  const Y = YEARS[y];
  if (tax <= Y.soliFreigrenze) return 0;
  return r2(Math.min(tax * Y.soliRate, (tax - Y.soliFreigrenze) * Y.soliMilderung));
}

// Gewerbesteuer for a sole proprietor: Gewerbeertrag less the 24,500
// Freibetrag, rounded down to 100, times 3.5% Messzahl, times Hebesatz.
export function gewerbesteuer(profit, hebesatzPct, y) {
  const Y = YEARS[y];
  const base = Math.floor(Math.max(0, profit - Y.gewFreibetrag) / 100) * 100;
  const messbetrag = Math.floor(base * Y.messzahl);
  return { messbetrag, tax: r2(messbetrag * (hebesatzPct / 100)) };
}

export function compute(input) {
  const errors = [];
  const year = Object.hasOwn(YEARS, input.year) ? String(input.year) : "2026";
  const Y = YEARS[year];
  const revenue = num(input.revenue);
  const expenses = num(input.expenses) ?? 0;
  const insurance = num(input.insurance) ?? 0;
  const hebesatz = num(input.hebesatz) ?? 400;
  if (revenue === null || Number.isNaN(revenue) || revenue < 0) errors.push("Enter your business income for the year, excluding Umsatzsteuer (0 or more).");
  if (Number.isNaN(expenses) || expenses < 0) errors.push("Expenses must be 0 or more.");
  if (Number.isNaN(insurance) || insurance < 0) errors.push("Insurance contributions must be 0 or more.");
  if (Number.isNaN(hebesatz) || hebesatz < 200 || hebesatz > 1000) errors.push("The Hebesatz is a percentage, normally between 200 and 600.");
  if (errors.length) return { errors };

  const kind = input.kind === "gewerbe" ? "gewerbe" : "freiberufler";
  const church = input.church === "8" ? 0.08 : input.church === "9" ? 0.09 : 0;
  const profit = r2(Math.max(0, revenue - expenses));
  const sonder = Math.max(insurance, Y.sonderausgabenMin);
  const zve = Math.floor(Math.max(0, profit - sonder));
  const tax = incomeTax(zve, year);

  // Section 35 credit: 4x the Gewerbesteuer-Messbetrag, capped at the
  // Gewerbesteuer paid and at the income tax attributable to the business.
  let gew = { messbetrag: 0, tax: 0 };
  let credit = 0;
  if (kind === "gewerbe") {
    gew = gewerbesteuer(profit, hebesatz, year);
    credit = r2(Math.min(gew.messbetrag * Y.paragraph35Factor, gew.tax, tax));
  }
  const taxAfterCredit = r2(Math.max(0, tax - credit));
  const soliAmt = soli(taxAfterCredit, year);
  const churchAmt = r2(taxAfterCredit * church);
  const total = r2(taxAfterCredit + soliAmt + churchAmt + gew.tax);
  const setAsidePct = revenue > 0 ? r2((total / revenue) * 100) : 0;
  const setAsideOfProfit = profit > 0 ? r2((total / profit) * 100) : 0;
  const findings = [];
  const out = { errors: [], year, kind, revenue, expenses, profit, insurance: sonder, zve, incomeTax: tax, credit35: credit, taxAfterCredit, soli: soliAmt, church: churchAmt, gewerbesteuer: gew.tax, total, setAsidePct, setAsideOfProfit, afterTax: r2(profit - total), monthly: r2(total / 12), quarterly: r2(total / 4), perThousand: r2((total / Math.max(revenue, 1)) * 1000), findings };

  findings.push({ severity: "high", title: `Set aside about €${total.toFixed(2)} (${setAsidePct}% of turnover, ${setAsideOfProfit}% of profit). That is roughly €${out.perThousand.toFixed(0)} from every €1,000 you invoice, before Umsatzsteuer.` });
  findings.push({ severity: "medium", title: "The Finanzamt sets quarterly Vorauszahlungen (10 March, 10 June, 10 September, 10 December) from your last assessment. In your first years it estimates them, so a larger back-payment after the first Steuerbescheid is common. Put the set-aside amount aside every month." });
  if (revenue > Y.kleinunternehmerCurrent) findings.push({ severity: "medium", title: `Turnover above €${Y.kleinunternehmerCurrent.toLocaleString("en-US")} ends the Kleinunternehmer scheme (section 19 UStG) immediately. Umsatzsteuer you collect belongs to the Finanzamt and is not in the figure above.` });
  else if (revenue > Y.kleinunternehmerPrior) findings.push({ severity: "info", title: `Turnover above €${Y.kleinunternehmerPrior.toLocaleString("en-US")} means you usually cannot use the Kleinunternehmer scheme next year (section 19 UStG), and must then charge Umsatzsteuer.` });
  if (kind === "gewerbe") findings.push({ severity: "info", title: `Gewerbesteuer is €${gew.tax.toFixed(2)} at a Hebesatz of ${hebesatz}%. Section 35 EStG credits €${credit.toFixed(2)} of it against your income tax, so the net extra cost is €${r2(gew.tax - credit).toFixed(2)}. Find your municipality's Hebesatz in its Haushaltssatzung.` });
  else findings.push({ severity: "info", title: "As a Freiberufler (section 18 EStG: for example consultants, designers, translators, many software developers) you pay no Gewerbesteuer. Whether you qualify is for the Finanzamt to decide; if it classes you as gewerblich, switch the field above." });
  if (soliAmt > 0) findings.push({ severity: "info", title: `The Solidaritaetszuschlag applies because your income tax is above €${Y.soliFreigrenze.toLocaleString("en-US")}.` });
  findings.push({ severity: "info", title: "Health and long-term-care insurance are not tax, but they are your biggest other fixed cost. The premiums you enter above are deducted from taxable income as a simplified Sonderausgabe; the real rules (Vorsorgepauschale, Hoechstbetraege, pension split) are more detailed." });
  findings.push({ severity: "info", title: "Not modelled: other income, married couples (Splittingtarif), children, Investitionsabzugsbetrag, Gewinnermittlung differences, Verlustvortrag, foreign income, Kirchensteuer caps, or Gewerbesteuer for partnerships and GmbHs. Single assessment, resident, one business." });
  return out;
}

export function summaryText(r) {
  const L = [];
  L.push(`Germany freelancer tax set-aside, ${r.year} tax year (${r.kind === "gewerbe" ? "Gewerbebetrieb" : "Freiberufler"})`);
  L.push(`Turnover €${r.revenue.toFixed(2)}, expenses €${r.expenses.toFixed(2)}, profit €${r.profit.toFixed(2)}`);
  L.push(`Taxable income (zu versteuerndes Einkommen): €${r.zve.toFixed(2)}`);
  L.push(`Income tax: €${r.incomeTax.toFixed(2)}, section 35 credit €${r.credit35.toFixed(2)}`);
  L.push(`Soli €${r.soli.toFixed(2)}, Kirchensteuer €${r.church.toFixed(2)}, Gewerbesteuer €${r.gewerbesteuer.toFixed(2)}`);
  L.push(`Set aside: €${r.total.toFixed(2)} (${r.setAsidePct}% of turnover, €${r.monthly.toFixed(2)} a month, €${r.quarterly.toFixed(2)} a quarter)`);
  L.push("Verify figures with the Finanzamt or a Steuerberater. Not tax advice.");
  return L.join("\n");
}
