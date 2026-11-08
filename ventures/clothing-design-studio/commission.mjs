/**
 * Partner-brand commission: the money side of a multi-brand shop (R-0005: other
 * brands on the same site for a commission). Pure arithmetic, nothing stored
 * and no money moves here. A shop owner sets a commission, sees what a partner
 * brand is paid per sale, and gets a settlement statement per period.
 *
 * Conventions (all editable, none a ruling on tax):
 * - The commission is a share of the sale price net of VAT, because VAT is
 *   owed to the tax office and is not revenue to split.
 * - Card fees are charged on the gross price. `feeBearer` says who carries
 *   them: "shop" (default), "brand", or "split" (half each).
 * - A refund reverses its commission with the net amount; the card fee on the
 *   refunded sale is not returned by most processors, and stays with whoever
 *   carried it.
 * - Who is the seller of record, and so who owes VAT, depends on the
 *   contract and the country. This file assumes the shop sells and remits
 *   VAT; check with an accountant before relying on that.
 */

const round2 = v => Math.round((v + Number.EPSILON) * 100) / 100;
const BEARERS = ["shop", "brand", "split"];

export const DEFAULT_TERMS = Object.freeze({
  commissionPct: 20, vatPct: 0, paymentFeePct: 3, paymentFixed: 0.3, feeBearer: "shop",
});

export function checkTerms(t) {
  const x = { ...DEFAULT_TERMS, ...t };
  const errors = [];
  if (!(x.commissionPct >= 0 && x.commissionPct <= 60)) errors.push("Commission must be 0 to 60 percent.");
  if (!(x.vatPct >= 0 && x.vatPct <= 40)) errors.push("VAT must be 0 to 40 percent.");
  if (!(x.paymentFeePct >= 0 && x.paymentFeePct <= 10)) errors.push("Card fee must be 0 to 10 percent.");
  if (!(x.paymentFixed >= 0 && x.paymentFixed <= 2)) errors.push("Fixed card fee must be 0 to 2 per order.");
  if (!BEARERS.includes(x.feeBearer)) errors.push(`feeBearer must be one of ${BEARERS.join(", ")}.`);
  return { terms: x, errors };
}

function shares(x, fee) {
  return x.feeBearer === "brand" ? { shop: 0, brand: fee } : x.feeBearer === "split" ? { shop: fee / 2, brand: fee / 2 } : { shop: fee, brand: 0 };
}

/** What one sale at a gross (shopper-pays) price means for shop and brand. */
export function splitSale(gross, terms = {}) {
  const { terms: x, errors } = checkTerms(terms);
  if (errors.length) return { error: errors.join(" ") };
  if (!(gross > 0)) return { error: "Price must be above zero." };
  const net = gross / (1 + x.vatPct / 100);
  const commission = net * x.commissionPct / 100;
  const fee = gross * x.paymentFeePct / 100 + x.paymentFixed;
  const s = shares(x, fee);
  const brandPayout = net - commission - s.brand;
  const shopKeeps = commission - s.shop;
  return {
    gross: round2(gross), vat: round2(gross - net), net: round2(net), commission: round2(commission),
    cardFee: round2(fee), brandPayout: round2(brandPayout), shopKeeps: round2(shopKeeps),
    warnings: [
      ...(brandPayout <= 0 ? ["The brand would be paid nothing or less at this price."] : []),
      ...(shopKeeps <= 0 ? ["The shop would lose money on this sale: raise the commission or the price."] : []),
    ],
  };
}

/** The shelf price at which a partner brand is paid exactly `payout` per sale. */
export function priceForPayout(payout, terms = {}) {
  const { terms: x, errors } = checkTerms(terms);
  if (errors.length) return { error: errors.join(" ") };
  if (!(payout > 0)) return { error: "Payout must be above zero." };
  // payout = g*k - fixedB, with k = (1 - c)/(1+v) - feePctB, fixedB the brand's fixed fee share.
  const b = x.feeBearer === "brand" ? 1 : x.feeBearer === "split" ? 0.5 : 0;
  const k = (1 - x.commissionPct / 100) / (1 + x.vatPct / 100) - b * x.paymentFeePct / 100;
  if (!(k > 0)) return { error: "Commission and fees leave nothing to pay the brand." };
  const gross = (payout + b * x.paymentFixed) / k;
  return { gross: round2(gross), ...splitSale(round2(gross), x) };
}

/**
 * A settlement statement. `sales` rows: { partner, sku, qty, gross, refunded }.
 * `gross` is the total paid for that row (all units), `refunded` the part of it
 * given back. Orders count once per row for the fixed card fee.
 */
export function settle(sales, terms = {}, perPartnerTerms = {}) {
  const lines = [];
  const problems = [];
  (Array.isArray(sales) ? sales : []).forEach((s, i) => {
    const partner = String(s.partner ?? "").trim();
    const gross = Number(s.gross), refunded = Number(s.refunded ?? 0), qty = Number(s.qty ?? 1);
    if (!partner) return problems.push(`Row ${i + 1}: no partner.`);
    if (!(gross > 0)) return problems.push(`Row ${i + 1}: gross must be above zero.`);
    if (!(refunded >= 0 && refunded <= gross)) return problems.push(`Row ${i + 1}: refunded must be between 0 and gross.`);
    if (!(Number.isInteger(qty) && qty >= 1)) return problems.push(`Row ${i + 1}: qty must be a whole number from 1.`);
    const { terms: x, errors } = checkTerms({ ...terms, ...(perPartnerTerms[partner] || {}) });
    if (errors.length) return problems.push(`Row ${i + 1} (${partner}): ${errors.join(" ")}`);
    const keptGross = gross - refunded;
    const net = keptGross / (1 + x.vatPct / 100);
    const commission = net * x.commissionPct / 100;
    const fee = gross * x.paymentFeePct / 100 + x.paymentFixed;
    const sh = shares(x, fee);
    lines.push({
      partner, sku: String(s.sku ?? ""), qty, gross: round2(gross), refunded: round2(refunded),
      net: round2(net), commission: round2(commission), cardFee: round2(fee),
      brandOwed: round2(net - commission - sh.brand), shopKeeps: round2(commission - sh.shop),
    });
  });
  const by = new Map();
  for (const l of lines) {
    const p = by.get(l.partner) || { partner: l.partner, units: 0, gross: 0, refunded: 0, net: 0, commission: 0, cardFees: 0, brandOwed: 0, shopKeeps: 0 };
    p.units += l.qty; p.gross += l.gross; p.refunded += l.refunded; p.net += l.net;
    p.commission += l.commission; p.cardFees += l.cardFee; p.brandOwed += l.brandOwed; p.shopKeeps += l.shopKeeps;
    by.set(l.partner, p);
  }
  const partners = [...by.values()].map(p => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, typeof v === "number" ? round2(v) : v])));
  const totals = partners.reduce((t, p) => ({
    gross: round2(t.gross + p.gross), brandOwed: round2(t.brandOwed + p.brandOwed), shopKeeps: round2(t.shopKeeps + p.shopKeeps),
  }), { gross: 0, brandOwed: 0, shopKeeps: 0 });
  const notes = partners.filter(p => p.brandOwed < 0).map(p => `${p.partner} is owed less than nothing this period (${p.brandOwed}); carry it forward, do not claw it back unless the contract says so.`);
  return { lines, partners, totals, problems, notes };
}

const csvCell = v => { let s = String(v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

export function statementCsv(result) {
  const head = ["partner", "units", "gross", "refunded", "net_of_vat", "commission", "card_fees", "brand_owed", "shop_keeps"];
  const rows = result.partners.map(p => [p.partner, p.units, p.gross, p.refunded, p.net, p.commission, p.cardFees, p.brandOwed, p.shopKeeps]);
  return [head, ...rows].map(r => r.map(csvCell).join(",")).join("\n") + "\n";
}
