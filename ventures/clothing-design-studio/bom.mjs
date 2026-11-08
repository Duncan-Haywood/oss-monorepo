/**
 * Bill of materials (BOM) for a garment: every material a factory must buy,
 * how much of it one garment uses, what that costs, and what to order for a
 * run once pack sizes and minimum order quantities are respected.
 *
 * A line is { name, unit, perGarment, wastePct, unitCost, packSize, moq }:
 *   unit        "m", "pcs", "g" ... any label; not converted
 *   perGarment  quantity used by one finished garment (net, before waste)
 *   wastePct    extra to buy for cutting loss and rejects, 0 to 100
 *   unitCost    price per unit in the quote currency
 *   packSize    the supplier sells in multiples of this (1 = any amount)
 *   moq         supplier minimum for the whole order, in units (0 = none)
 *
 * Per-garment cost = perGarment x (1 + wastePct/100) x unitCost.
 * Order for a run of N garments = need = N x perGarment x (1 + wastePct/100),
 * raised to moq, then to the next whole pack; the surplus is paid for and left
 * over, and the effective cost per garment includes it. Money is rounded to
 * cents only at the end. Prices are the designer's typed quotes: nothing here
 * is a real supplier's price. Not procurement advice.
 */

const cents = v => Math.round(v * 100) / 100;

export const EXAMPLE_LINES = Object.freeze([
  { name: "Main fabric 180 gsm cotton jersey", unit: "m", perGarment: 1.3, wastePct: 8, unitCost: 5.2, packSize: 1, moq: 100 },
  { name: "Neck rib", unit: "m", perGarment: 0.12, wastePct: 5, unitCost: 4.0, packSize: 1, moq: 20 },
  { name: "Sewing thread", unit: "m", perGarment: 160, wastePct: 10, unitCost: 0.0004, packSize: 5000, moq: 5000 },
  { name: "Woven neck label", unit: "pcs", perGarment: 1, wastePct: 3, unitCost: 0.09, packSize: 100, moq: 500 },
  { name: "Care label", unit: "pcs", perGarment: 1, wastePct: 3, unitCost: 0.04, packSize: 100, moq: 500 },
  { name: "Polybag", unit: "pcs", perGarment: 1, wastePct: 2, unitCost: 0.06, packSize: 100, moq: 0 },
]);

function check(line, i) {
  const where = `line ${i + 1}${line && line.name ? ` (${line.name})` : ""}`;
  if (!line || typeof line !== "object") throw new Error(`${where}: not a line`);
  const num = (k, min, max = Infinity) => {
    const v = line[k];
    if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) throw new Error(`${where}: ${k} must be a number from ${min}${max === Infinity ? " up" : ` to ${max}`}`);
    return v;
  };
  return {
    name: String(line.name || "").trim() || `Item ${i + 1}`,
    unit: String(line.unit || "pcs").trim() || "pcs",
    perGarment: num("perGarment", 0),
    wastePct: num("wastePct", 0, 100),
    unitCost: num("unitCost", 0),
    packSize: Math.max(1, num("packSize", 0)),
    moq: num("moq", 0),
  };
}

/** Per-garment cost of one line, before any order rounding. */
export function lineCost(line) {
  const l = check(line, 0);
  return l.perGarment * (1 + l.wastePct / 100) * l.unitCost;
}

/**
 * Cost of the whole BOM per garment, with a per-line breakdown.
 * `byGroup` lets the caller split fabric from trims: pass a function that
 * maps a line to "fabric" | "trims" | "packaging" (default: unit "m" with
 * perGarment 0.5 to 10, not thread, is fabric, names containing bag/box/carton/hang are
 * packaging, the rest trims).
 */
export function bomCost(lines, byGroup = defaultGroup) {
  const rows = lines.map((raw, i) => {
    const l = check(raw, i);
    const need = l.perGarment * (1 + l.wastePct / 100);
    return { ...l, group: byGroup(l), buyPerGarment: need, cost: need * l.unitCost };
  });
  const total = rows.reduce((s, r) => s + r.cost, 0);
  const groups = {};
  for (const r of rows) groups[r.group] = (groups[r.group] || 0) + r.cost;
  return {
    rows: rows.map(r => ({ ...r, cost: cents(r.cost) })),
    total: cents(total),
    groups: Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, cents(v)])),
  };
}

export function defaultGroup(l) {
  if (/bag|box|carton|hang ?tag|tissue|mailer/i.test(l.name)) return "packaging";
  if (l.unit === "m" && l.perGarment >= 0.5 && l.perGarment <= 10 && !/thread/i.test(l.name)) return "fabric";
  return "trims";
}

/**
 * What to order for `quantity` garments. Returns one row per line with the
 * amount needed, the amount to order after MOQ and pack rounding, the
 * surplus, the order cost, and a note when MOQ or packs forced extra.
 * `effectivePerGarment` is the order total over the garments, so a small run
 * shows what the minimums really cost.
 */
export function orderFor(lines, quantity) {
  if (!Number.isInteger(quantity) || quantity < 1) throw new Error("quantity must be a whole number of garments, 1 or more");
  const rows = lines.map((raw, i) => {
    const l = check(raw, i);
    const need = quantity * l.perGarment * (1 + l.wastePct / 100);
    const floor = Math.max(need, l.moq);
    const order = l.packSize > 1 ? Math.ceil(floor / l.packSize - 1e-9) * l.packSize : floor;
    const surplus = order - need;
    let note = "";
    if (l.moq > need) note = `minimum order ${l.moq} ${l.unit} is more than the ${need.toFixed(1)} needed`;
    else if (order > need + 1e-9 && l.packSize > 1) note = `sold in packs of ${l.packSize}`;
    return {
      name: l.name, unit: l.unit, need, order, surplus,
      orderCost: cents(order * l.unitCost),
      needCost: cents(need * l.unitCost),
      note,
    };
  });
  const orderTotal = rows.reduce((s, r) => s + r.orderCost, 0);
  const needTotal = rows.reduce((s, r) => s + r.needCost, 0);
  return {
    quantity, rows,
    orderTotal: cents(orderTotal),
    needTotal: cents(needTotal),
    effectivePerGarment: cents(orderTotal / quantity),
    surplusCost: cents(orderTotal - needTotal),
  };
}

/** Smallest run at which no line's minimum forces extra stock (null if packs alone always do). */
export function breakEvenQuantity(lines) {
  let q = 1;
  for (const raw of lines) {
    const l = check(raw, 0);
    const per = l.perGarment * (1 + l.wastePct / 100);
    if (per > 0 && l.moq > 0) q = Math.max(q, Math.ceil(l.moq / per - 1e-9));
  }
  return q;
}

const csvCell = v => {
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Purchase list for a factory or supplier, spreadsheet-safe CSV. */
export function orderCsv(order) {
  const head = ["Item", "Unit", "Needed", "Order", "Surplus", "Cost to order", "Note"];
  const body = order.rows.map(r => [r.name, r.unit, r.need.toFixed(2), r.order.toFixed(2), r.surplus.toFixed(2), r.orderCost.toFixed(2), r.note]);
  return [head, ...body, ["Total", "", "", "", "", order.orderTotal.toFixed(2), ""]].map(r => r.map(csvCell).join(",")).join("\n") + "\n";
}

/** Parse the CSV a designer pastes: name,unit,perGarment,wastePct,unitCost,packSize,moq (header optional). */
export function parseLines(text) {
  const out = [];
  const errors = [];
  String(text || "").split(/\r?\n/).forEach((raw, i) => {
    const t = raw.trim();
    if (!t) return;
    const cells = t.split(",").map(c => c.trim());
    if (i === 0 && /per ?garment|name/i.test(cells[0] + cells[2])) return;
    if (cells.length < 5) { errors.push(`row ${i + 1}: needs at least name, unit, per garment, waste %, unit cost`); return; }
    const [name, unit, pg, wp, uc, ps = "1", moq = "0"] = cells;
    const line = { name, unit, perGarment: Number(pg), wastePct: Number(wp), unitCost: Number(uc), packSize: Number(ps), moq: Number(moq) };
    try { check(line, out.length); out.push(line); } catch (e) { errors.push(`row ${i + 1}: ${e.message.replace(/^line \d+ ?(\([^)]*\))?: /, "")}`); }
  });
  return { lines: out, errors };
}
