// Price a nest the way laser, plasma and waterjet shops price a sheet job: machine time from cut length, pierces
// and marking at the shop's own speeds, plus sheet handling and setup at the shop's hourly rate, plus material
// from the sheets the nest uses, then markup and a minimum charge. Every rate is the user's own input; nothing
// here is a built-in speed or price. Units are the drawing's: speeds in drawing units per minute, the sheet
// price for one sheet of the size entered.
//
// Per-part prices: each part carries its own cut, pierce and mark time; material is shared by part area (so the
// scrap is paid for by the parts in proportion to their size); setup and sheet handling are shared by machine
// time. The line prices add up to the job total before rounding to cents.

const num = (v) => (v === "" || v === null || v === undefined ? NaN : Number(v));

export const BASES = {
  sheet: "whole sheets used",
  used: "length of sheet used (the offcut goes back to stock)",
  parts: "the parts' own area only",
};

/**
 * @param job     the object runJob() returns ({ result, report, parts })
 * @param items   the item list given to runJob (name, qty, part), in the same order
 * @param r       rates: machineRate ($/h), cutSpeed, markSpeed (units/min), pierceSeconds, sheetPrice ($ per sheet of
 *                sheetW x sheetH), materialBasis ("sheet" | "used" | "parts"), handlingMinutes (per sheet),
 *                setupMinutes (per job), markupPct, minimumCharge ($)
 */
export function quoteNest(job, items, r = {}) {
  const errors = [];
  const machineRate = num(r.machineRate), cutSpeed = num(r.cutSpeed);
  const markSpeed = Number.isFinite(num(r.markSpeed)) && num(r.markSpeed) > 0 ? num(r.markSpeed) : cutSpeed;
  const pierceSeconds = Number.isFinite(num(r.pierceSeconds)) ? num(r.pierceSeconds) : 0;
  const sheetPrice = Number.isFinite(num(r.sheetPrice)) ? num(r.sheetPrice) : 0;
  const handlingMinutes = Number.isFinite(num(r.handlingMinutes)) ? num(r.handlingMinutes) : 0;
  const setupMinutes = Number.isFinite(num(r.setupMinutes)) ? num(r.setupMinutes) : 0;
  const markupPct = Number.isFinite(num(r.markupPct)) ? num(r.markupPct) : 0;
  const minimumCharge = Number.isFinite(num(r.minimumCharge)) ? num(r.minimumCharge) : 0;
  const basis = Object.hasOwn(BASES, r.materialBasis) ? r.materialBasis : "sheet";
  if (!(machineRate >= 0)) errors.push("Enter the machine's hourly rate (0 or more).");
  if (!(cutSpeed > 0)) errors.push("Enter a cutting speed above 0, in drawing units per minute.");
  for (const [v, label] of [[pierceSeconds, "Pierce time"], [sheetPrice, "Sheet price"], [handlingMinutes, "Sheet handling time"], [setupMinutes, "Setup time"], [minimumCharge, "Minimum charge"]]) {
    if (v < 0) errors.push(`${label} cannot be negative.`);
  }
  if (markupPct < 0) errors.push("Markup cannot be negative.");
  if (!job || !job.ok) errors.push("Nest the parts first.");
  if (errors.length) return { ok: false, errors };

  const { result, report, parts } = job;
  const fullArea = result.sheetW * result.sheetH;
  const perArea = fullArea > 0 ? sheetPrice / fullArea : 0;
  const ids = items.filter((x) => x.qty > 0);

  // pieces actually placed, per item id
  const placed = new Map();
  for (const s of result.sheets) for (const pl of s.placements) placed.set(pl.id, (placed.get(pl.id) || 0) + 1);

  // material
  let materialArea = 0;
  report.sheets.forEach((s, i) => {
    const sh = result.sheets[i];
    const H = sh.h ?? result.sheetH;
    materialArea += basis === "sheet" ? s.sheetArea : basis === "used" ? Math.min(s.sheetArea, s.usedLength * H) : s.partArea;
  });
  const material = materialArea * perArea;

  // machine time per piece of each item
  const lines = [];
  let cutMin = 0, pierceMin = 0, markMin = 0;
  for (const [id, count] of placed) {
    const p = parts.get(id);
    const pierces = p.pierces + p.marks.length;
    const unit = { cut: p.cutLength / cutSpeed, pierce: (pierces * pierceSeconds) / 60, mark: p.markLength > 0 ? p.markLength / markSpeed : 0 };
    cutMin += unit.cut * count; pierceMin += unit.pierce * count; markMin += unit.mark * count;
    lines.push({ id, name: ids[id] ? ids[id].name : `part ${id + 1}`, qty: count, area: p.area, cutLength: p.cutLength, pierces, unitMinutes: unit.cut + unit.pierce + unit.mark });
  }
  lines.sort((a, b) => a.id - b.id);
  const directMin = cutMin + pierceMin + markMin;
  const handlingMin = handlingMinutes * report.totalSheets;
  const overheadMin = handlingMin + setupMinutes;
  const machine = ((directMin + overheadMin) / 60) * machineRate;
  const cost = machine + material;
  const markup = cost * (markupPct / 100);
  const beforeMin = cost + markup;
  const minimumApplied = beforeMin < minimumCharge;
  const total = minimumApplied ? minimumCharge : beforeMin;
  const scale = beforeMin > 0 ? total / beforeMin : 0;

  const totalPartArea = lines.reduce((s, l) => s + l.area * l.qty, 0);
  for (const l of lines) {
    const ownMin = l.unitMinutes;
    const shareOverhead = directMin > 0 ? (ownMin / directMin) * overheadMin : overheadMin / Math.max(1, report.totalParts);
    const unitMachine = ((ownMin + shareOverhead) / 60) * machineRate;
    const unitMaterial = totalPartArea > 0 ? (l.area / totalPartArea) * material : 0;
    const unitPrice = (unitMachine + unitMaterial) * (1 + markupPct / 100) * (minimumApplied ? scale : 1);
    Object.assign(l, { unitMachine, unitMaterial, unitPrice, linePrice: unitPrice * l.qty });
  }
  if (minimumCharge > 0 && beforeMin === 0 && lines.length) {
    // nothing costs anything but there is a minimum: share it by piece
    const pieces = lines.reduce((s, l) => s + l.qty, 0);
    for (const l of lines) { l.unitPrice = minimumCharge / pieces; l.linePrice = l.unitPrice * l.qty; }
  }

  const warnings = [];
  const unplaced = result.unplaced.reduce((s, x) => s + x.count, 0);
  if (unplaced) warnings.push(`${unplaced} part${unplaced === 1 ? " was" : "s were"} not placed and ${unplaced === 1 ? "is" : "are"} not priced.`);
  if (result.stock && result.stock.some((x) => x.outline || x.w !== result.sheetW || x.h !== result.sheetH)) {
    warnings.push("Remnants and other sheet sizes are charged at the same price per area as a full sheet.");
  }
  if (minimumApplied) warnings.push(`The minimum charge applies: the job came to ${money(beforeMin)} before it.`);

  return {
    ok: true,
    basis,
    minutes: { cut: cutMin, pierce: pierceMin, mark: markMin, handling: handlingMin, setup: setupMinutes, total: directMin + overheadMin },
    materialArea,
    cost: { machine, material, subtotal: cost, markup, beforeMinimum: beforeMin, minimumApplied, total },
    lines,
    warnings,
  };
}

export const money = (x) => `${x < 0 ? "-" : ""}$${Math.abs(x).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const csvCell = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));

/** The quote as CSV: one row per part, then the job lines. */
export function quoteCsv(q) {
  const rows = [["Part", "Quantity", "Machine minutes each", "Machine cost each", "Material each", "Price each", "Line price"]];
  for (const l of q.lines) rows.push([l.name, l.qty, l.unitMinutes.toFixed(3), l.unitMachine.toFixed(2), l.unitMaterial.toFixed(2), l.unitPrice.toFixed(2), l.linePrice.toFixed(2)]);
  rows.push([]);
  rows.push(["Cutting minutes", q.minutes.cut.toFixed(2)]);
  rows.push(["Pierce minutes", q.minutes.pierce.toFixed(2)]);
  rows.push(["Marking minutes", q.minutes.mark.toFixed(2)]);
  rows.push(["Sheet handling minutes", q.minutes.handling.toFixed(2)]);
  rows.push(["Setup minutes", q.minutes.setup.toFixed(2)]);
  rows.push(["Machine cost", q.cost.machine.toFixed(2)]);
  rows.push([`Material (${Object.hasOwn(BASES, q.basis) ? BASES[q.basis] : q.basis})`, q.cost.material.toFixed(2)]);
  rows.push(["Markup", q.cost.markup.toFixed(2)]);
  rows.push(["Job total", q.cost.total.toFixed(2)]);
  return rows.map((r) => r.map(csvCell).join(",")).join("\n") + "\n";
}
