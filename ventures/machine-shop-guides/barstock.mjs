// Bar stock weight, cost and parts per bar, for the bar-stock-weight-calculator page.
//
// Geometry only: cross-section area x length x the user's density. No material price ships
// here; the density presets are the same typical values the stock-size page offers (SOURCES.md,
// "Density presets"), labelled typical and editable. Every result is hand-checked in
// barstock.test.mjs.

export const IN = 25.4; // mm per inch, exact
export const LB = 0.45359237; // kg per pound, exact

/** Cross-section shapes and the dimensions each needs, in the order the page asks for them. */
export const SHAPES = {
  round: { label: "Round bar", dims: [["d", "Diameter"]] },
  hex: { label: "Hex bar", dims: [["af", "Across flats"]] },
  square: { label: "Square bar", dims: [["a", "Side"]] },
  flat: { label: "Flat bar or plate", dims: [["w", "Width"], ["t", "Thickness"]] },
  tube: { label: "Round tube", dims: [["od", "Outside diameter"], ["wall", "Wall"]] },
  squareTube: { label: "Square tube", dims: [["a", "Outside side"], ["wall", "Wall"]] },
};

/** Typical densities in g/cm³ (the stock-size page's presets; SOURCES.md, "Density presets"). */
export const DENSITIES = [
  ["2.70", "6061 aluminium"],
  ["2.81", "7075 aluminium"],
  ["7.85", "carbon steel (1018, 1045, A36)"],
  ["8.00", "304 / 316 stainless"],
  ["8.50", "C360 brass"],
  ["4.43", "Ti-6Al-4V titanium"],
  ["1.41", "acetal (POM)"],
];

export const PRICE_PER = ["lb", "kg", "ft", "m", "bar"];

const num = (v) => (v === "" || v === null || v === undefined ? null : Number(v));

/** Cross-section area in mm², or an error string. Dimensions in mm. */
export function sectionArea(shape, d) {
  const g = (k) => d[k];
  switch (shape) {
    case "round": return Math.PI / 4 * g("d") ** 2;
    case "hex": return Math.sqrt(3) / 2 * g("af") ** 2;
    case "square": return g("a") ** 2;
    case "flat": return g("w") * g("t");
    case "tube": { const id = g("od") - 2 * g("wall"); return Math.PI / 4 * (g("od") ** 2 - id ** 2); }
    case "squareTube": { const i = g("a") - 2 * g("wall"); return g("a") ** 2 - i ** 2; }
    default: return NaN;
  }
}

/**
 * Work out one bar.
 * input: { shape, units: "in"|"mm", dims: {key: value}, barLength, density (g/cm³),
 *          price, per ("lb"|"kg"|"ft"|"m"|"bar"), partLength, facing, kerf, remnant, quantity }
 * Lengths (dims, barLength, partLength, facing, kerf, remnant) are in the chosen units.
 * Returns { errors, notes, ... } with SI and US figures side by side.
 */
export function barStock(input) {
  const errors = [];
  const notes = [];
  const shape = input.shape;
  const spec = Object.hasOwn(SHAPES, shape) ? SHAPES[shape] : null;
  if (!spec) return { errors: ["Pick a shape."], notes };
  const unit = input.units === "mm" ? 1 : IN;
  const dims = {};
  for (const [k, label] of spec.dims) {
    const v = num(input.dims?.[k]);
    if (v === null || !Number.isFinite(v) || v <= 0) errors.push(`${label} must be a positive number.`);
    else dims[k] = v * unit;
  }
  if (!errors.length && (shape === "tube" || shape === "squareTube")) {
    const outer = shape === "tube" ? dims.od : dims.a;
    if (2 * dims.wall >= outer) errors.push("The wall is too thick: twice the wall must be less than the outside size.");
  }
  const L = num(input.barLength);
  if (L === null || !Number.isFinite(L) || L <= 0) errors.push("Bar length must be a positive number.");
  const density = num(input.density);
  if (density !== null && (!Number.isFinite(density) || density <= 0 || density > 25)) errors.push("Density must be between 0 and 25 g/cm³.");
  const price = num(input.price);
  if (price !== null && (!Number.isFinite(price) || price < 0)) errors.push("Price can't be negative.");
  const per = PRICE_PER.includes(input.per) ? input.per : "lb";
  const lens = {};
  for (const [k, label] of [["partLength", "Part length"], ["facing", "Facing allowance"], ["kerf", "Cut-off width"], ["remnant", "Unusable end"]]) {
    const v = num(input[k]);
    if (v !== null && (!Number.isFinite(v) || v < 0)) errors.push(`${label} can't be negative.`);
    lens[k] = v === null ? null : v * unit;
  }
  if (lens.partLength === 0) errors.push("Part length must be more than zero, or blank.");
  const qty = num(input.quantity);
  if (qty !== null && (!Number.isInteger(qty) || qty < 1)) errors.push("Parts needed must be a whole number of 1 or more.");
  if (errors.length) return { errors, notes };

  const areaMm2 = sectionArea(shape, dims);
  const barMm = L * unit;
  const volMm3 = areaMm2 * barMm;
  const out = {
    errors, notes, shape,
    areaMm2, areaIn2: areaMm2 / IN ** 2,
    barMm, barFt: barMm / 304.8,
    volumeCm3: volMm3 / 1000, volumeIn3: volMm3 / IN ** 3,
    density, per, price,
  };
  if (density) {
    const kgPerMm = areaMm2 * density / 1e6; // 1 mm of bar is areaMm2 mm³ = areaMm2/1000 cm³; x g/cm³, then g → kg
    out.kgPerM = kgPerMm * 1000;
    out.lbPerFt = out.kgPerM / LB * 0.3048;
    out.barKg = kgPerMm * barMm;
    out.barLb = out.barKg / LB;
  } else notes.push("Add a density to get weights (and a cost when the price is per pound or kilogram).");
  if (shape === "squareTube") notes.push("Square tube is worked with sharp corners; real tube has a corner radius, so the true weight is a little lower.");

  // What a bar costs.
  if (price !== null) {
    if ((per === "lb" || per === "kg") && !density) out.barCost = null;
    else if (per === "lb") out.barCost = out.barLb * price;
    else if (per === "kg") out.barCost = out.barKg * price;
    else if (per === "ft") out.barCost = out.barFt * price;
    else if (per === "m") out.barCost = barMm / 1000 * price;
    else out.barCost = price;
  }

  // Parts per bar: each part takes its length, the facing stock and one cut-off width; the
  // unusable end (the chuck or bar-feeder remnant) is never cut into a part.
  if (lens.partLength) {
    const each = lens.partLength + (lens.facing || 0) + (lens.kerf || 0);
    const usable = barMm - (lens.remnant || 0);
    const n = usable > 0 ? Math.floor(usable / each + 1e-9) : 0;
    out.stockPerPartMm = each;
    out.partsPerBar = n;
    if (n === 0) {
      notes.push("Not one part fits in the bar after the unusable end: check the lengths.");
    } else {
      out.dropMm = barMm - n * each; // left over after the last cut-off, remnant included
      out.yieldPct = n * lens.partLength / barMm * 100;
      if (density) out.partKg = out.barKg / n;
      if (out.barCost !== undefined && out.barCost !== null) out.costPerPart = out.barCost / n;
      if (qty) {
        out.quantity = qty;
        out.barsNeeded = Math.ceil(qty / n);
        if (out.barCost !== undefined && out.barCost !== null) out.totalCost = out.barsNeeded * out.barCost;
        if (density) out.totalKg = out.barsNeeded * out.barKg;
      }
    }
  }
  return out;
}

const cell = (v) => {
  let safe = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(safe) && !/^-?\d+(\.\d+)?$/.test(safe)) safe = "'" + safe;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/** The result as a two-column CSV (formula-leading text neutralised, negative numbers kept). */
export function barCsv(r, label = "") {
  const f = (x, d) => (x === undefined || x === null ? "" : x.toFixed(d));
  const rows = [
    ["Item", "Value"],
    ["Shape", label || (Object.hasOwn(SHAPES, r.shape) ? SHAPES[r.shape].label : r.shape)],
    ["Area (in²)", f(r.areaIn2, 4)], ["Area (mm²)", f(r.areaMm2, 1)],
    ["Weight (lb/ft)", f(r.lbPerFt, 3)], ["Weight (kg/m)", f(r.kgPerM, 3)],
    ["Bar length (ft)", f(r.barFt, 3)], ["Bar weight (lb)", f(r.barLb, 3)], ["Bar weight (kg)", f(r.barKg, 3)],
    ["Price", r.price === null || r.price === undefined ? "" : `${r.price} per ${r.per}`],
    ["Bar cost", f(r.barCost, 2)],
    ["Parts per bar", r.partsPerBar ?? ""], ["Yield (%)", f(r.yieldPct, 1)],
    ["Material per part", f(r.costPerPart, 4)], ["Weight per part (kg)", f(r.partKg, 4)],
    ["Parts needed", r.quantity ?? ""], ["Bars needed", r.barsNeeded ?? ""], ["Material for the lot", f(r.totalCost, 2)],
  ];
  return rows.map((row) => row.map(cell).join(",")).join("\n") + "\n";
}

/** An invented example, labelled as such on the page. */
export const EXAMPLE = {
  shape: "round", units: "in", dims: { d: "1.5" }, barLength: "144", density: "2.70",
  price: "4.50", per: "lb", partLength: "2.25", facing: "0.03", kerf: "0.125", remnant: "3", quantity: "250",
};
