/**
 * US sales tax: in which states a small online clothing brand has crossed the
 * "economic nexus" line, and roughly what it owes there.
 *
 * Since South Dakota v. Wayfair (2018) a state may require a remote seller to
 * collect its sales tax once the seller's sales into that state pass a
 * threshold, usually USD 100,000 of sales or 200 transactions in a year (some
 * states use sales only, a few raise the sales figure, a few need both tests).
 * Sales through a marketplace that collects the tax for you (Etsy, Amazon) still
 * count towards some states' thresholds, but the marketplace remits the tax;
 * this page is for sales on your own store.
 *
 * Updated 2026-11-09 from web search results (Avalara, Apr 2026; Taxually, Oct 2026): Illinois dropped its 200-order test on 2026-01-01, Kentucky on 2026-08-01 (HB 757), Utah on 2025-07-01 and Alaska's remote-seller commission on 2025-01-01, so those four are sales-only. Maine is listed by one source as dropped and is left as typed pending a check.
 * THE THRESHOLDS, STATE BASE RATES AND CLOTHING RULES BELOW ARE TYPED FROM
 * MEMORY, NOT CHECKED against any state's revenue department site (the build
 * host could not reach them, 2026-11-06). States change them every year, and
 * the transaction test has been dropped in several. Local (city/county) rates,
 * which are often a second tax, are not included: use the override. The page
 * lets you replace every figure. Not tax advice; a tax professional or your
 * cart's tax service (Shopify Tax, TaxJar, Avalara) decides what to register.
 */

/** code: [name, salesThresholdUsd, transactionThreshold|null, rule, baseRatePct, clothing note] */
const RAW = {
  AK: ["Alaska", 100000, null, "sales", 0, "No state sales tax; many boroughs and cities charge their own (Alaska Remote Seller Sales Tax Commission), so use the override."],
  AL: ["Alabama", 250000, null, "sales", 4, ""],
  AZ: ["Arizona", 100000, null, "sales", 5.6, ""],
  AR: ["Arkansas", 100000, null, "sales", 6.5, ""],
  CA: ["California", 500000, null, "sales", 7.25, ""],
  CO: ["Colorado", 100000, null, "sales", 2.9, ""],
  CT: ["Connecticut", 100000, 200, "and", 6.35, "Clothing under 50 USD an item is exempt."],
  FL: ["Florida", 100000, null, "sales", 6, ""],
  GA: ["Georgia", 100000, 200, "or", 4, ""],
  IL: ["Illinois", 100000, null, "sales", 6.25, ""],
  IN: ["Indiana", 100000, null, "sales", 7, ""],
  MA: ["Massachusetts", 100000, null, "sales", 6.25, "Clothing is exempt up to 175 USD an item."],
  MD: ["Maryland", 100000, 200, "or", 6, ""],
  MI: ["Michigan", 100000, 200, "or", 6, ""],
  MN: ["Minnesota", 100000, 200, "or", 6.875, "Clothing is generally exempt."],
  NC: ["North Carolina", 100000, null, "sales", 4.75, ""],
  NJ: ["New Jersey", 100000, 200, "or", 6.625, "Clothing is generally exempt."],
  NY: ["New York", 500000, 100, "and", 4, "Clothing under 110 USD an item is exempt from the state tax; some localities still charge."],
  OH: ["Ohio", 100000, 200, "or", 5.75, ""],
  PA: ["Pennsylvania", 100000, null, "sales", 6, "Ordinary clothing is exempt."],
  TN: ["Tennessee", 100000, null, "sales", 7, ""],
  TX: ["Texas", 500000, null, "sales", 6.25, ""],
  VA: ["Virginia", 100000, 200, "or", 4.3, ""],
  WA: ["Washington", 100000, null, "sales", 6.5, ""],
  WI: ["Wisconsin", 100000, null, "sales", 5, ""],
  DC: ["District of Columbia", 100000, 200, "or", 6, "Clothing is taxable."],
  HI: ["Hawaii", 100000, 200, "or", 4, "General excise tax, not a sales tax; the rate varies by island."],
  IA: ["Iowa", 100000, null, "sales", 6, "Clothing is taxable."],
  ID: ["Idaho", 100000, null, "sales", 6, ""],
  KS: ["Kansas", 100000, null, "sales", 6.5, ""],
  KY: ["Kentucky", 100000, null, "sales", 6, ""],
  LA: ["Louisiana", 100000, null, "sales", 4.45, ""],
  ME: ["Maine", 100000, 200, "or", 5.5, ""],
  MO: ["Missouri", 100000, null, "sales", 4.225, ""],
  MS: ["Mississippi", 250000, null, "sales", 7, ""],
  ND: ["North Dakota", 100000, null, "sales", 5, ""],
  NE: ["Nebraska", 100000, 200, "or", 5.5, ""],
  NM: ["New Mexico", 100000, null, "sales", 4.875, "Gross receipts tax, charged on sales into the state."],
  NV: ["Nevada", 100000, 200, "or", 6.85, ""],
  OK: ["Oklahoma", 100000, null, "sales", 4.5, ""],
  RI: ["Rhode Island", 100000, 200, "or", 7, "Clothing under 250 USD an item is exempt."],
  SC: ["South Carolina", 100000, null, "sales", 6, ""],
  SD: ["South Dakota", 100000, null, "sales", 4.2, ""],
  UT: ["Utah", 100000, null, "sales", 4.85, ""],
  VT: ["Vermont", 100000, 200, "or", 6, "Clothing is exempt."],
  WV: ["West Virginia", 100000, 200, "or", 6, ""],
  WY: ["Wyoming", 100000, null, "sales", 4, ""],
};

export const STATES = Object.freeze(Object.fromEntries(Object.entries(RAW).map(([code, [name, salesUsd, transactions, rule, ratePct, clothing]]) =>
  [code, Object.freeze({ code, name, salesUsd, transactions, rule, ratePct, clothing })])));

/** States with no state sales tax (Oregon, Montana, New Hampshire, Delaware): nothing to register for. */
export const NO_SALES_TAX = Object.freeze(["DE", "MT", "NH", "OR"]);

const num = v => (v === "" || v == null ? 0 : Number(v));

/**
 * @param {{state:string, salesUsd:number, transactions?:number, plannedSalesUsd?:number,
 *          salesThresholdUsd?:number, transactionThreshold?:number|null, ratePct?:number, clothingExempt?:boolean}[]} rows
 *        one per state, this calendar year (or the last 12 months, where the state uses that)
 * @returns {{ok:boolean, error?:string, rows?:object[], summary?:object}}
 */
export function nexusCheck(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return { ok: false, error: "Add at least one state." };
  const out = [];
  for (const r of rows) {
    const st = STATES[String(r.state || "").toUpperCase()];
    const code = String(r.state || "").toUpperCase();
    if (!st && !NO_SALES_TAX.includes(code)) return { ok: false, error: `Unknown state "${r.state}". Pick one from the list.` };
    const sales = num(r.salesUsd), tx = num(r.transactions), extra = num(r.plannedSalesUsd);
    if ([sales, tx, extra].some(n => !Number.isFinite(n) || n < 0)) return { ok: false, error: "Sales, orders and planned sales must be zero or more." };
    if (!st) { out.push({ state: code, name: code, status: "no-tax", message: "No state sales tax: nothing to register for.", owedUsd: 0 }); continue; }
    const salesT = r.salesThresholdUsd != null && r.salesThresholdUsd !== "" ? Number(r.salesThresholdUsd) : st.salesUsd;
    const txT = r.transactionThreshold !== undefined ? (r.transactionThreshold === "" || r.transactionThreshold === null ? null : Number(r.transactionThreshold)) : st.transactions;
    const rate = r.ratePct != null && r.ratePct !== "" ? Number(r.ratePct) : st.ratePct;
    const hitSales = sales >= salesT, hitTx = txT != null && tx >= txT;
    const over = txT == null ? hitSales : st.rule === "and" ? hitSales && hitTx : hitSales || hitTx;
    const projSales = sales + extra;
    const willCross = !over && (txT == null ? projSales >= salesT : st.rule === "and" ? projSales >= salesT && (hitTx || tx >= txT) : projSales >= salesT);
    const a = salesT ? sales / salesT : 0, b = txT ? tx / txT : 0;
    const share = txT == null ? a : st.rule === "and" ? Math.min(a, b) : Math.max(a, b);
    const near = !over && !willCross && share >= 0.8;
    const status = over ? "over" : willCross ? "will-cross" : near ? "near" : "under";
    // Tax collected from the sale that crossed the line onward. Without per-order data, assume a pro-rata share: sales above the threshold line.
    const taxable = over ? Math.max(0, sales - (hitSales && !(st.rule === "and" && !hitTx) ? salesT : 0)) : 0;
    const exempt = r.clothingExempt === true;
    const owed = exempt ? 0 : Math.round(taxable * rate) / 100;
    const owedAll = exempt ? 0 : Math.round(sales * rate) / 100;
    const msg = {
      over: `Over the line: register and collect ${rate}% state tax on later sales${st.clothing ? ". " + st.clothing : ""}.`,
      "will-cross": `Your plan crosses it this year (${Math.round(projSales).toLocaleString("en-US")} USD against ${salesT.toLocaleString("en-US")}). Register before the crossing sale.`,
      near: `At ${Math.round(share * 100)}% of the limit: watch it monthly.`,
      under: "Under the line: no duty to collect here yet.",
    }[status];
    out.push({ state: code, name: st.name, status, message: msg, salesThresholdUsd: salesT, transactionThreshold: txT, rule: st.rule, ratePct: rate, percentOfLimit: Math.round(share * 100), clothingNote: st.clothing, owedUsd: owed, owedIfAllSalesUsd: owedAll, clothingExempt: exempt });
  }
  const over = out.filter(r => r.status === "over"), soon = out.filter(r => r.status === "will-cross" || r.status === "near");
  return { ok: true, rows: out, summary: { overCount: over.length, watchCount: soon.length, registerIn: over.map(r => r.state), watch: soon.map(r => r.state), taxOwedUsd: Math.round(over.reduce((a, r) => a + r.owedUsd, 0) * 100) / 100 } };
}
