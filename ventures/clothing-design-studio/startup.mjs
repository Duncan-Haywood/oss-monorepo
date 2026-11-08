/**
 * Start-up budget for a clothing line: the money that leaves before the first
 * garment is sold, and how many sales it takes to earn it back.
 *
 * The costing sheet prices a garment (cloth, cut and sew, print, freight,
 * duty). A first run also carries one-off costs that are not in any garment's
 * landed cost: pattern and grading, sample rounds and courier, tech pack,
 * photos, label and screen set-up, a shop, a trademark search, insurance.
 * This module adds them to the run, so the designer sees (1) cash needed at
 * order and before the first sale, (2) the one-off cost carried by each
 * garment of this run, and (3) the break-even in sales with the one-offs
 * included. Every amount is the designer's own quote or estimate; the
 * placeholders in `exampleItems` are not prices from anywhere.
 *
 * Selling-side arithmetic (tax, fees, unsold stock) is `sellingSide` from
 * costing.mjs, so this page and the costing sheet agree.
 */
import { sellingSide, DEFAULT_PLAN } from "./costing.mjs";

const round2 = v => Math.round(v * 100) / 100;
const money = (v, name) => {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 1e9) throw new Error(`${name} must be a number from 0 to 1,000,000,000.`);
  return v;
};

/** Placeholder lines to overwrite with real quotes. */
export function exampleItems() {
  return [
    { name: "Pattern making and grading", amount: 400, qty: 1 },
    { name: "Sample round (sample fee plus courier)", amount: 120, qty: 2 },
    { name: "Tech pack", amount: 0, qty: 1 },
    { name: "Label and hangtag set-up", amount: 150, qty: 1 },
    { name: "Product photos", amount: 300, qty: 1 },
    { name: "Shop, domain and mailing", amount: 120, qty: 1 },
    { name: "Trademark search and registration", amount: 350, qty: 1 },
    { name: "Liability insurance (first year)", amount: 250, qty: 1 },
  ];
}

/**
 * items: [{ name, amount, qty = 1 }] one-off lines.
 * landed: cost per garment from the costing sheet (excludes these lines).
 * depositPct: share of the run's cost paid when you order; the rest is due before shipping.
 */
export function launchBudget({ items, landed, quantity, price, depositPct = 30, currency = "EUR" }, plan = DEFAULT_PLAN) {
  if (!Array.isArray(items)) throw new Error("Items must be a list.");
  money(landed, "Landed cost"); money(price, "Price");
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 1e7) throw new Error("Run size must be a whole number from 1 to 10,000,000.");
  if (typeof depositPct !== "number" || !(depositPct >= 0 && depositPct <= 100)) throw new Error("Deposit must be from 0 to 100 percent.");
  const lines = items.map((it, i) => {
    const name = String(it?.name ?? "").trim() || `Line ${i + 1}`;
    const qty = it?.qty == null ? 1 : it.qty;
    if (!Number.isFinite(qty) || qty < 0 || qty > 1e4) throw new Error(`${name}: quantity must be a number from 0 to 10,000.`);
    return { name, amount: money(it?.amount ?? 0, `${name}: amount`), qty, total: round2(money(it?.amount ?? 0, name) * qty) };
  });
  const oneOff = round2(lines.reduce((s, l) => s + l.total, 0));
  const runCost = round2(landed * quantity);
  const marketing = plan.marketingBudget ?? 0;
  const sell = sellingSide({ landed, price, quantity, currency }, { ...DEFAULT_PLAN, ...plan, marketingBudget: marketing + oneOff });
  const share = l => oneOff > 0 ? Math.round((l.total / oneOff) * 1000) / 10 : 0;
  const ranked = lines.map(l => ({ ...l, sharePct: share(l) })).sort((a, b) => b.total - a.total);
  const sellable = sell.sellableUnits;
  const notes = [];
  if (oneOff > 0 && runCost > 0 && oneOff > runCost * 0.5) notes.push(`The one-off lines are ${Math.round((oneOff / runCost) * 100)}% of the run's cost. A larger run spreads them over more garments; a smaller first run may not be worth the set-up.`);
  if (sell.breakEvenUnits == null) notes.push("Each sale loses money after tax and fees: the price is below the landed cost.");
  else if (sell.breakEvenUnits > sellable) notes.push(`Break-even needs ${sell.breakEvenUnits} sales, more than the ${sellable} you expect to sell from this run. The run does not pay back its one-offs; raise the price, cut a line, or plan a second run.`);
  if (ranked[0] && ranked[0].total > 0 && ranked[0].sharePct >= 40 && lines.length > 1) notes.push(`${ranked[0].name} is ${ranked[0].sharePct}% of the one-off total; quote it twice before the others.`);
  return {
    currency, lines: ranked, oneOff, runCost, marketing,
    cashAtOrder: round2(oneOff + runCost * depositPct / 100),
    cashBeforeFirstSale: round2(oneOff + runCost + marketing),
    oneOffPerGarment: round2(oneOff / quantity),
    oneOffPerSellable: sellable > 0 ? round2(oneOff / sellable) : null,
    profitPerSaleBeforeOneOffs: round2(sell.profitPerSale),
    breakEvenUnits: sell.breakEvenUnits, sellableUnits: sellable,
    profitIfSellable: sell.profitIfSellable,
    notes,
  };
}

/** Spreadsheet-safe CSV of the one-off lines. */
export function budgetCsv(b) {
  const safe = s => { const t = String(s ?? ""); return /^[=+\-@\t\r]/.test(t) ? "'" + t : t; };
  const q = s => `"${safe(s).replace(/"/g, '""')}"`;
  const out = ["line,amount,qty,total,share_pct"];
  for (const l of b.lines) out.push([q(l.name), l.amount, l.qty, l.total, l.sharePct].join(","));
  out.push([q("One-off total"), "", "", b.oneOff, 100].join(","));
  return out.join("\n") + "\n";
}
