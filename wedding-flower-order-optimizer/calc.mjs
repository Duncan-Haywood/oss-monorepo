// Wedding flower order optimizer: the cheapest wholesale order that covers every stem an event needs.
// Exact: for each flower, every count of the larger pack is tried and the smaller pack fills the rest.

export const MAX_FLOWERS = 15;

export const SHARED_DEFAULTS = { lossPct: "10", budget: "" };
export const FLOWER_DEFAULTS = { name: "", stems: "", sizeA: "", priceA: "", sizeB: "", priceB: "" };

export const EXAMPLE_SHARED = { lossPct: "10", budget: "2400" };
export const EXAMPLE_FLOWERS = [
  { name: "Garden roses", stems: "96", sizeA: "10", priceA: "38", sizeB: "25", priceB: "85" },
  { name: "Ranunculus", stems: "60", sizeA: "10", priceA: "24", sizeB: "", priceB: "" },
  { name: "Eucalyptus (bunch)", stems: "40", sizeA: "5", priceA: "11", sizeB: "20", priceB: "36" },
  { name: "Spray roses", stems: "72", sizeA: "10", priceA: "19", sizeB: "40", priceB: "64" },
  { name: "Peonies", stems: "33", sizeA: "5", priceA: "29", sizeB: "", priceB: "" },
];

export const money = (n) => (n < 0 ? "-" : "") + "$" + (Math.round(Math.abs(n) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const num = (v) => {
  if (v === "" || v == null) return null;
  const n = Number(String(v).replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : NaN;
};

// Cheapest (a, b) with a*sizeA + b*sizeB >= need; ties go to fewer leftover stems.
export function bestOrder(need, packs) {
  const [A, B] = packs;
  let best = null;
  const consider = (a, b) => {
    const stems = a * A.size + (B ? b * B.size : 0);
    const cost = a * A.price + (B ? b * B.price : 0);
    if (stems < need) return;
    if (!best || cost < best.cost - 1e-9 || (Math.abs(cost - best.cost) <= 1e-9 && stems < best.stems)) best = { a, b, stems, cost };
  };
  const maxB = B ? Math.ceil(need / B.size) : 0;
  for (let b = 0; b <= maxB; b++) {
    const rest = need - (B ? b * B.size : 0);
    consider(Math.max(0, Math.ceil(rest / A.size)), b);
  }
  return best;
}

export function analyze(flowers, shared = SHARED_DEFAULTS) {
  const warnings = [];
  const loss = num(shared.lossPct) ?? 0;
  const budget = num(shared.budget);
  if (!(loss >= 0 && loss <= 100)) warnings.push("Extra stems for damage must be between 0 and 100 percent.");
  const lines = [];
  flowers.slice(0, MAX_FLOWERS).forEach((f, i) => {
    const label = String(f.name || "").trim() || "Flower " + (i + 1);
    const stems = num(f.stems);
    if (stems == null && num(f.sizeA) == null && num(f.priceA) == null) return;
    const sizeA = num(f.sizeA), priceA = num(f.priceA), sizeB = num(f.sizeB), priceB = num(f.priceB);
    if (!(stems > 0) || !(sizeA > 0) || !(priceA != null && priceA >= 0)) { warnings.push(label + ": needs stems, a pack size and a pack price."); return; }
    const hasB = sizeB != null || priceB != null;
    if (hasB && !(sizeB > 0 && priceB != null && priceB >= 0)) { warnings.push(label + ": the second pack needs both a size and a price."); return; }
    const need = Math.ceil(stems * (1 + loss / 100) - 1e-9);
    const packs = [{ size: sizeA, price: priceA }];
    if (hasB) packs.push({ size: sizeB, price: priceB });
    const o = bestOrder(need, packs);
    const naive = Math.ceil(stems / sizeA - 1e-9) * priceA; // no allowance for damage, smaller pack only
    const onlyA = Math.ceil(need / sizeA - 1e-9) * priceA;
    const unit = o.stems > 0 ? o.cost / o.stems : 0;
    lines.push({ name: label, stemsWanted: stems, stemsToCover: need, packA: o.a, sizeA, packB: hasB ? o.b : 0, sizeB: hasB ? sizeB : 0,
      stemsOrdered: o.stems, spare: o.stems - need, cost: o.cost, costOnlyA: onlyA, naive, spareValue: (o.stems - need) * unit });
  });
  if (!lines.length) { warnings.push("Enter at least one flower with the stems you need, a pack size and a pack price."); return { ok: false, warnings, lines }; }
  const total = lines.reduce((s, l) => s + l.cost, 0);
  const totalOnlyA = lines.reduce((s, l) => s + l.costOnlyA, 0);
  const spareValue = lines.reduce((s, l) => s + l.spareValue, 0);
  const out = { ok: true, warnings, lines, total, totalOnlyA, saving: totalOnlyA - total, spareValue,
    spareStems: lines.reduce((s, l) => s + l.spare, 0), lossPct: loss };
  if (budget > 0) { out.budget = budget; out.flowerCostPct = total / budget; }
  return out;
}

export function toCsv(a) {
  const q = (v) => '"' + String(v).replace(/"/g, '""') + '"';
  const rows = [["Flower", "Stems wanted", "Stems to cover", "Pack A", "Pack B", "Stems ordered", "Spare stems", "Cost"]];
  for (const l of a.lines) rows.push([l.name, l.stemsWanted, l.stemsToCover, l.packA + " x " + l.sizeA, l.packB ? l.packB + " x " + l.sizeB : "", l.stemsOrdered, l.spare, l.cost.toFixed(2)]);
  rows.push(["Total", "", "", "", "", "", a.spareStems, a.total.toFixed(2)]);
  return rows.map((r) => r.map(q).join(",")).join("\n");
}
