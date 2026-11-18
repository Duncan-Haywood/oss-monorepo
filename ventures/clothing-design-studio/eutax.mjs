/**
 * EU VAT for a small online clothing brand that ships from an EU country to
 * shoppers in other EU countries: has the 10,000 EUR line been crossed, which
 * country's VAT then applies, and what the change does to the money you keep.
 *
 * The rule (Council Directive 2006/112/EC as changed by 2017/2455, applied
 * from 1 July 2021): a seller established in one EU country whose cross-border
 * sales of goods to shoppers in OTHER EU countries stay within 10,000 EUR
 * (net of VAT, all other countries added together, this calendar year and
 * the one before) may charge its own country's VAT on them. Above that line,
 * VAT is due at each shopper's country's rate, and the seller either
 * registers in every one of those countries or files one quarterly return for
 * all of them through the One-Stop Shop (OSS) in its home country. A seller
 * outside the EU has no line: see `nonEuNote`.
 *
 * THE STANDARD RATES BELOW ARE TYPED FROM MEMORY, NOT CHECKED against the
 * European Commission's "VAT rates" table (the build host could not reach
 * it, 2026-11-08). Rates changed in several countries in 2025; every rate can
 * be overridden. Reduced and zero rates for children's clothing exist in some
 * countries (Ireland zero-rates it, for instance) and are NOT applied: use the
 * override. Not tax advice; a tax adviser or the home tax office decides.
 */

export const THRESHOLD_EUR = 10000;

/** code: [name, standard rate %] */
export const COUNTRIES = {
  AT: ["Austria", 20], BE: ["Belgium", 21], BG: ["Bulgaria", 20], HR: ["Croatia", 25],
  CY: ["Cyprus", 19], CZ: ["Czechia", 21], DK: ["Denmark", 25], EE: ["Estonia", 24],
  FI: ["Finland", 25.5], FR: ["France", 20], DE: ["Germany", 19], GR: ["Greece", 24],
  HU: ["Hungary", 27], IE: ["Ireland", 23], IT: ["Italy", 22], LV: ["Latvia", 21],
  LT: ["Lithuania", 21], LU: ["Luxembourg", 17], MT: ["Malta", 18], NL: ["Netherlands", 21],
  PL: ["Poland", 23], PT: ["Portugal", 23], RO: ["Romania", 21], SK: ["Slovakia", 23],
  SI: ["Slovenia", 22], ES: ["Spain", 21], SE: ["Sweden", 25],
};

export const nonEuNote =
  "A seller outside the EU has no 10,000 EUR line. Parcels worth up to 150 EUR can be sold through the Import One-Stop Shop (IOSS): you charge the shopper's country's VAT at checkout and file monthly; dearer parcels pay import VAT and any duty at the border. Goods held in an EU warehouse need VAT registration in that country.";

const num = v => (v === "" || v == null ? 0 : Number(v));
const r2 = n => Math.round(n * 100) / 100;

/**
 * @param {{home:string, rows:{country:string, netSalesEur:number, plannedEur?:number, ratePct?:number}[], thresholdEur?:number, priorYearEur?:number, homeRatePct?:number}} input
 *   netSalesEur is the sales to shoppers in `country` this calendar year, before VAT.
 *   priorYearEur is last year's total sales to other EU countries (the line applies to either year).
 */
export function euVatCheck(input) {
  const { home, rows } = input || {};
  const h = String(home || "").toUpperCase();
  if (!COUNTRIES[h]) return { ok: false, error: `Pick the EU country you ship from. (Sellers outside the EU: ${nonEuNote})` };
  if (!Array.isArray(rows) || rows.length === 0) return { ok: false, error: "Add at least one destination country." };
  const line = input.thresholdEur != null && input.thresholdEur !== "" ? Number(input.thresholdEur) : THRESHOLD_EUR;
  const prior = num(input.priorYearEur);
  if (!(line > 0) || !(prior >= 0)) return { ok: false, error: "The line must be above zero and last year's sales zero or more." };
  const homeRate = input.homeRatePct != null && input.homeRatePct !== "" ? Number(input.homeRatePct) : COUNTRIES[h][1];

  const list = [];
  for (const r of rows) {
    const c = String(r.country || "").toUpperCase();
    if (!COUNTRIES[c]) return { ok: false, error: `Unknown EU country "${r.country}". Pick one from the list.` };
    const sales = num(r.netSalesEur), plan = num(r.plannedEur);
    if (![sales, plan].every(n => Number.isFinite(n) && n >= 0)) return { ok: false, error: "Sales and planned sales must be zero or more." };
    const rate = r.ratePct != null && r.ratePct !== "" ? Number(r.ratePct) : COUNTRIES[c][1];
    if (!(rate >= 0 && rate < 100)) return { ok: false, error: "A VAT rate must be from 0 to under 100." };
    list.push({ country: c, name: COUNTRIES[c][0], sales, plan, rate, domestic: c === h });
  }

  const cross = list.filter(x => !x.domestic);
  const crossSales = cross.reduce((s, x) => s + x.sales, 0);
  const crossPlan = cross.reduce((s, x) => s + x.plan, 0);
  const over = crossSales > line || prior > line;
  const willCross = !over && crossSales + crossPlan > line;
  const status = over ? "over" : willCross ? "will-cross" : crossSales >= 0.8 * line ? "near" : "under";

  // Without order dates, VAT at destination rates is taken on the sales above the line,
  // shared between countries in proportion to their sales; the rest carries home VAT.
  // If last year was already over the line, all cross-border sales are at destination rates.
  const taxableShare = !over ? 0 : prior > line ? 1 : crossSales > 0 ? Math.max(0, crossSales - line) / crossSales : 0;
  let vatDest = 0, vatHome = 0;
  const out = list.map(x => {
    if (x.domestic) {
      const v = r2(x.sales * homeRate / 100);
      return { ...x, destSales: 0, vatEur: v, rateUsed: homeRate, note: "Domestic sale: home VAT, reported on your normal return, not in OSS." };
    }
    const dest = r2(x.sales * taxableShare);
    const homeSide = r2(x.sales - dest);
    const v = r2(dest * x.rate / 100 + homeSide * homeRate / 100);
    vatDest += r2(dest * x.rate / 100); vatHome += r2(homeSide * homeRate / 100);
    // The shopper's price is the same as before if you keep the shelf price incl. home VAT; what you keep falls with a higher rate.
    const keepPerHundred = r2(100 * (1 + homeRate / 100) / (1 + x.rate / 100));
    return { ...x, destSales: dest, vatEur: v, rateUsed: x.rate, rateGapPts: r2(x.rate - homeRate), keepPerHundred,
      note: over ? `Charge ${x.rate}% (${x.name}) on sales past the line; report it in the OSS return.` : `Under the line: ${homeRate}% home VAT may still be charged.` };
  });

  const msg = {
    over: "Over the line: charge each shopper's own country's VAT from the sale that crossed it, and either register for the One-Stop Shop (OSS) in your home country or register in each country.",
    "will-cross": `Your plan crosses ${line.toLocaleString("en-US")} EUR this year. Register for OSS before the crossing sale: the new rate applies from that very sale.`,
    near: `At ${Math.round(100 * crossSales / line)}% of the line: watch it monthly.`,
    under: "Under the line: you may keep charging your home VAT on sales to other EU countries (or opt in to OSS early).",
  }[status];

  return { ok: true, status, message: msg, lineEur: line, crossBorderEur: r2(crossSales), plannedCrossEur: r2(crossPlan), percentOfLine: Math.round(100 * crossSales / line),
    priorYearOver: prior > line, rows: out, summary: { destVatEur: r2(vatDest), homeVatOnCrossEur: r2(vatHome), registerInOss: over, countries: cross.filter(x => x.sales > 0).map(x => x.country) } };
}
