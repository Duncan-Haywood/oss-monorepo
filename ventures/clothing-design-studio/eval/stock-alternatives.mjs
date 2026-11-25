// The "three alternatives" panel against a supplier's stock list (2026-11-24).
//
// For every catalogue garment colour on every fabric the example sheet
// prices, with one text placement (a halo in the default ink), the first
// alternative (the other-lightness garment colour) is built twice: without a
// sheet (the fixed catalogue pool, as before) and with the example sheet's
// stock list. It counts how often that alternative's colour is stocked for
// the fabric, what dyeing the unstocked ones would add per garment at 100
// pieces (`customDye`, the sheet's placeholder 120 set-up and 300 m lot), and
// the worst ink-on-garment contrast (WCAG ratio) among the alternatives.
// Two made-up sheets exercise the fallbacks: one stocking only dark colours
// and one stocking only white.
//
// The example sheet's list and dye figures are placeholders, not a real
// mill's. The count shows what the rule does, not what a factory charges.
//   node eval/stock-alternatives.mjs [dir]
import { pathToFileURL } from "node:url";
import path from "node:path";

const dir = path.resolve(process.argv[2] || path.join(path.dirname(new URL(import.meta.url).pathname), ".."));
const { newDesign, applyOp, variants } = await import(pathToFileURL(path.join(dir, "design.mjs")));
const { EXAMPLE_SUPPLIER, colourStock } = await import(pathToFileURL(path.join(dir, "suppliers.mjs")));
const { customDye } = await import(pathToFileURL(path.join(dir, "costing.mjs")));
const { COLOURS, luminance } = await import(pathToFileURL(path.join(dir, "catalogue.mjs")));

const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

function base(colour, fabric) {
  let d = newDesign({ quantity: 100 });
  d = applyOp(d, { op: "fabric", value: fabric });
  d = applyOp(d, { op: "colour", value: colour });
  return applyOp(d, { op: "add", kind: "motif", motif: "halo", w: 20 });
}

export function run(sheet, label) {
  const fabrics = Object.keys(sheet.fabrics);
  const rows = { label, cases: 0, oldStocked: 0, newStocked: 0, oldDye: 0, newDye: 0, oldMinContrast: Infinity, newMinContrast: Infinity, examples: [] };
  for (const fabric of fabrics) for (const colour of Object.keys(COLOURS)) {
    const d = base(colour, fabric);
    const [o] = variants(d);
    const [n] = variants(d, { sheet });
    rows.cases++;
    for (const [v, k] of [[o, "old"], [n, "new"]]) {
      const st = colourStock(sheet, fabric, v.design.colour);
      if (st.stocked) rows[k + "Stocked"]++;
      rows[k + "Dye"] += customDye(v.design, sheet)?.perUnit ?? 0;
      const ink = v.design.placements[0].ink;
      rows[k + "MinContrast"] = Math.min(rows[k + "MinContrast"], contrast(ink, v.design.colour));
    }
    if (rows.examples.length < 4 && o.design.colourName !== n.design.colourName && fabric === fabrics[0]) rows.examples.push(`${colour} on ${fabric}: ${o.design.colourName} -> ${n.design.colourName}`);
  }
  return rows;
}

const DARK_ONLY = { ...EXAMPLE_SUPPLIER, name: "dark-only (made up)", fabrics: { "cotton-jersey": 5 }, colours: ["black", "navy", "charcoal"].map(name => ({ name, hex: COLOURS[name], fabrics: null })).concat([{ name: "bottle green", hex: "#1d4a33", fabrics: null }]) };
const WHITE_ONLY = { ...EXAMPLE_SUPPLIER, name: "white-only (made up)", fabrics: { "cotton-jersey": 5 }, colours: [{ name: "white", hex: COLOURS.white, fabrics: null }] };

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  for (const [sheet, label] of [[EXAMPLE_SUPPLIER, "example sheet"], [DARK_ONLY, "dark-only sheet"], [WHITE_ONLY, "white-only sheet"]]) {
    const r = run(sheet, label);
    console.log(`${label}: ${r.cases} cases (catalogue colours x fabrics)`);
    console.log(`  first alternative stocked: before ${r.oldStocked}/${r.cases}, after ${r.newStocked}/${r.cases}`);
    console.log(`  dye-to-order cost per garment at 100 pcs, mean over cases: before ${(r.oldDye / r.cases).toFixed(2)}, after ${(r.newDye / r.cases).toFixed(2)} (${sheet.currency})`);
    console.log(`  worst ink/garment contrast ratio: before ${r.oldMinContrast.toFixed(2)}, after ${r.newMinContrast.toFixed(2)}`);
    for (const e of r.examples) console.log(`  e.g. ${e}`);
  }
}
