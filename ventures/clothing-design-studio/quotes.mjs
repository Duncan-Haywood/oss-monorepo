/**
 * Quote comparison: the same design costed on several manufacturers' sheets.
 *
 * A designer usually asks three or four factories. Their unit prices are not
 * comparable on their own: one has a low per-shirt price and a high setup, one
 * a high minimum order, one ships late. This runs the one design through each
 * sheet (costing.mjs, nothing new in the arithmetic) and lines up landed cost,
 * cash up front, margin, break-even, minimum order and lead time, then says
 * which sheet wins on each and where the cheapest one changes with the run
 * size. It ships no prices: the sheets are the designer's quotes.
 */
import { unitCost, economics, DEFAULT_PLAN } from "./costing.mjs";

const round2 = v => Math.round(v * 100) / 100;

/** One row per sheet. A sheet that cannot price the design says what is missing instead of guessing. */
export function compareQuotes(design, sheets, plan = DEFAULT_PLAN) {
  const rows = sheets.map((sheet, i) => {
    const base = { index: i, name: sheet.name, currency: sheet.currency, example: !!sheet.example, moq: sheet.moq ?? null, leadTimeDays: sheet.leadTimeDays ?? null };
    try {
      const e = economics(design, sheet, plan);
      return { ...base, ok: true, landed: e.cost.landed, setupTotal: e.cost.setupTotal, cashUpFront: e.cashUpFront, marginPct: e.marginPct,
        breakEvenUnits: e.breakEvenUnits, profitPerSale: e.profitPerSale, profitIfSellable: e.profitIfSellable, belowMoq: !!(sheet.moq && design.quantity < sheet.moq), notes: e.notes };
    } catch (err) {
      return { ...base, ok: false, missing: err.missing ?? [String(err.message)] };
    }
  });
  const currencies = [...new Set(rows.map(r => r.currency))];
  const comparable = currencies.length <= 1;
  const usable = rows.filter(r => r.ok && !r.belowMoq);
  const pick = (key, dir) => usable.length && comparable
    ? usable.reduce((b, r) => (r[key] == null ? b : b == null || (dir === "min" ? r[key] < b[key] : r[key] > b[key]) ? r : b), null)?.index ?? null
    : null;
  const withLead = usable.filter(r => r.leadTimeDays != null);
  const fastest = withLead.length ? withLead.reduce((b, r) => (r.leadTimeDays < b.leadTimeDays ? r : b)).index : null;
  const warnings = [];
  if (!comparable) warnings.push(`The sheets use different currencies (${currencies.join(", ")}); convert them to one before comparing. No winner is picked.`);
  for (const r of rows) {
    if (!r.ok) warnings.push(`${r.name} cannot price this design: it has no ${r.missing.join(", ")}.`);
    else if (r.belowMoq) warnings.push(`${r.name} has a minimum order of ${r.moq}, above your ${design.quantity}.`);
    if (r.example) warnings.push(`${r.name} is the placeholder example, not a quote.`);
  }
  if (rows.length < 2) warnings.push("Add a second sheet to compare.");
  return { quantity: design.quantity, rows, comparable, best: { landed: pick("landed", "min"), cashUpFront: pick("cashUpFront", "min"), profitIfSellable: pick("profitIfSellable", "max"), breakEven: pick("breakEvenUnits", "min"), fastest }, warnings };
}

/** The cheapest landed cost at each run size, so a setup-heavy sheet's break point shows. */
export function cheapestByQuantity(design, sheets, sizes = [25, 50, 100, 250, 500, 1000, 2500]) {
  return sizes.map(q => {
    const costs = sheets.map((s, i) => {
      if (s.moq && q < s.moq) return { index: i, landed: null, belowMoq: true };
      try { return { index: i, landed: unitCost({ ...design, quantity: q }, s).landed }; } catch { return { index: i, landed: null }; }
    });
    const ok = costs.filter(c => c.landed != null);
    const win = ok.length ? ok.reduce((b, c) => (c.landed < b.landed ? c : b)) : null;
    return { quantity: q, costs, cheapest: win ? win.index : null, saving: win && ok.length > 1 ? round2(Math.min(...ok.filter(c => c !== win).map(c => c.landed)) - win.landed) : null };
  });
}

/** Spreadsheet-safe CSV of the comparison. */
export function comparisonCsv(cmp) {
  const cell = v => { const s = v == null ? "" : String(v); const safe = /^[=+\-@]/.test(s) ? `'${s}` : s; return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe; };
  const head = ["supplier", "currency", "landed per garment", "setup total", "cash up front", "margin %", "break-even units", "profit if sellable", "MOQ", "lead time days", "status"];
  const lines = cmp.rows.map(r => [r.name, r.currency, r.landed, r.setupTotal, r.cashUpFront, r.marginPct, r.breakEvenUnits, r.profitIfSellable, r.moq, r.leadTimeDays,
    r.ok ? (r.belowMoq ? "below MOQ" : "ok") : `missing: ${r.missing.join("; ")}`]);
  return [head, ...lines].map(l => l.map(cell).join(",")).join("\n") + "\n";
}
