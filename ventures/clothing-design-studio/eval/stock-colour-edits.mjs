// Colour edits against a supplier's stock list (2026-11-24).
//
// For every garment colour the example sheet stocks on cotton jersey (16) and
// seven plain edits ("make it darker", "lighter", "tone it down", "more
// vivid", "warmer", "cooler", "brighter"), the edit is run twice: without a
// sheet (the whole 50-name catalogue, as before) and with the example sheet
// (its stock list for the fabric). It counts where each lands: a stocked
// colour, a catalogue colour this sheet would dye to order, a custom colour,
// or no move; and whether the moved dimension went the asked way.
//
// The example sheet's list and its dye figures (120 set-up, 300 m lot) are
// placeholders, not a real mill's; so are the 100 pieces. The count shows
// what the rule does, not what a real factory charges.
//   node eval/stock-colour-edits.mjs [dir]
import { pathToFileURL } from "node:url";
import path from "node:path";

const dir = path.resolve(process.argv[2] || path.join(path.dirname(new URL(import.meta.url).pathname), ".."));
const { parseCommand } = await import(pathToFileURL(path.join(dir, "commands.mjs")));
const { newDesign, applyOp } = await import(pathToFileURL(path.join(dir, "design.mjs")));
const { EXAMPLE_SUPPLIER, stockColours, colourStock } = await import(pathToFileURL(path.join(dir, "suppliers.mjs")));
const { customDye } = await import(pathToFileURL(path.join(dir, "costing.mjs")));
const { labOfHex, DIMS } = await import(pathToFileURL(path.join(dir, "shade.mjs")));

const FABRIC = "cotton-jersey";
const EDITS = [["make it darker", "L", -1], ["make it lighter", "L", 1], ["tone it down", "C", -1], ["make it more vivid", "C", 1], ["make it warmer", "W", 1], ["make it cooler", "W", -1], ["make it brighter", "C", 1]];
const sheet = EXAMPLE_SUPPLIER;
const stock = stockColours(sheet, FABRIC);

export function runAll() {
  const rows = [];
  for (const [name, hex] of Object.entries(stock)) {
    const d = applyOp(applyOp(newDesign(), { op: "fabric", value: FABRIC }), { op: "colour", value: hex, name });
    for (const [text, dim, sign] of EDITS) {
      const row = { from: name, text };
      for (const [key, opts] of [["catalogue", {}], ["stock", { sheet }]]) {
        const r = parseCommand(text, d, null, opts);
        const op = r.steps.flatMap(s => s.ops).find(o => o.op === "colour");
        if (!op) { row[key] = { kind: "none" }; continue; }
        const st = colourStock(sheet, FABRIC, op.value);
        const moved = DIMS[dim](labOfHex(op.value)) - DIMS[dim](labOfHex(hex));
        const dye = customDye({ ...d, colour: op.value }, sheet);
        row[key] = { kind: st.stocked ? "stocked" : "dyed", to: op.name, hex: op.value, right: sign * moved > 0, dye: dye?.perUnit ?? 0 };
      }
      rows.push(row);
    }
  }
  return rows;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const rows = runAll();
  const tally = key => {
    const t = { stocked: 0, dyed: 0, none: 0, wrong: 0, dye: 0 };
    for (const r of rows) { t[r[key].kind]++; if (r[key].kind !== "none" && !r[key].right) t.wrong++; t.dye += r[key].dye || 0; }
    return t;
  };
  console.log(`${rows.length} edits (${Object.keys(stock).length} stock colours x ${EDITS.length} edits), fabric ${FABRIC}, example sheet, 100 pieces`);
  for (const key of ["catalogue", "stock"]) {
    const t = tally(key);
    console.log(`${key.padEnd(9)} stocked ${t.stocked}, dyed to order ${t.dyed}, no move ${t.none}, wrong way ${t.wrong}; dye cost summed over the moved edits ${t.dye.toFixed(2)} per garment`);
  }
  const changed = rows.filter(r => r.catalogue.kind === "dyed" && r.stock.kind === "stocked");
  console.log(`\nDyed-to-order without the sheet, stocked with it (${changed.length}):`);
  for (const r of changed) console.log(`  ${r.from} / ${r.text}: ${r.catalogue.to} -> ${r.stock.to}`);
  const still = rows.filter(r => r.stock.kind === "dyed");
  console.log(`\nStill dyed to order with the sheet (${still.length}): no stocked colour within 20 of the exact move went the asked way`);
  for (const r of still) console.log(`  ${r.from} / ${r.text}: ${r.stock.to} ${r.stock.hex} (+${r.stock.dye})`);
}
