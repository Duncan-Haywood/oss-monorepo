import test from "node:test";
import assert from "node:assert/strict";
import { EXAMPLE_SUPPLIER, stockColours, colourStock, parseStockColours, setStockList, supplierToCsv, supplierFromCsv } from "./suppliers.mjs";
import { unitCost, customDye } from "./costing.mjs";
import { parseCommand } from "./commands.mjs";
import { newDesign, applyOp } from "./design.mjs";
import { COLOURS } from "./catalogue.mjs";
import { runAll } from "./eval/stock-colour-edits.mjs";

const design = (colour, fabric = "cotton-jersey", quantity = 100) =>
  applyOp(applyOp(applyOp(newDesign(), { op: "fabric", value: fabric }), { op: "colour", value: colour }), { op: "quantity", value: quantity });
const did = (text, d, sheet) => parseCommand(text, d, null, sheet ? { sheet } : {}).steps.map(s => s.did).join(" | ");
const colourOp = (text, d, sheet) => parseCommand(text, d, null, sheet ? { sheet } : {}).steps.flatMap(s => s.ops).find(o => o.op === "colour");

test("stock colours by fabric; no list means nothing is checked", () => {
  assert.equal(Object.keys(stockColours(EXAMPLE_SUPPLIER, "cotton-jersey")).length, 16);
  assert.deepEqual(Object.keys(stockColours(EXAMPLE_SUPPLIER, "linen")).sort(), ["bone", "ecru", "khaki", "navy", "olive", "sand"]);
  assert.equal(colourStock(EXAMPLE_SUPPLIER, "linen", COLOURS.black).stocked, false);
  assert.equal(colourStock(EXAMPLE_SUPPLIER, "cotton-jersey", COLOURS.black).name, "black");
  const bare = { ...EXAMPLE_SUPPLIER, colours: undefined };
  assert.equal(stockColours(bare, "linen"), null);
  assert.deepEqual(colourStock(bare, "linen", "#123456"), { stocked: true, listed: false });
});

test("typed stock list: catalogue names, own names with a hex, and errors", () => {
  const r = parseStockColours("Navy, sage; bottle green #1D4A33\nblorp, navy");
  assert.deepEqual(r.colours, [{ name: "navy", hex: COLOURS.navy }, { name: "sage", hex: COLOURS.sage }, { name: "bottle green", hex: "#1d4a33" }]);
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /blorp/);
});

test("setting one fabric's list leaves the others and round-trips through CSV", () => {
  const s = structuredClone(EXAMPLE_SUPPLIER);
  const before = stockColours(s, "pique");
  setStockList(s, "fleece", parseStockColours("navy, bottle green #1d4a33").colours);
  assert.deepEqual(Object.keys(stockColours(s, "fleece")), ["navy", "bottle green"]);
  assert.deepEqual(stockColours(s, "pique"), before);
  assert.deepEqual(stockColours(s, "linen"), stockColours(EXAMPLE_SUPPLIER, "linen"));
  const back = supplierFromCsv(supplierToCsv(s));
  for (const f of Object.keys(s.fabrics)) assert.deepEqual(stockColours(back, f), stockColours(s, f), f);
  assert.deepEqual(back.customColour, s.customColour);
  assert.throws(() => supplierFromCsv("kind,key,value\ncolour,blorp,|*\n"), /row 2/);
  assert.throws(() => supplierFromCsv("kind,key,value\ndye,colour,3\n"), /row 2/);
});

test("custom dye cost by hand: set-up plus the dye lot's unused metres, over the run", () => {
  const d = design("dusty pink");
  // 100 x 1.2 m x 1.08 = 129.6 m cut; 300 m lot leaves 170.4 m at 5 per metre.
  const dye = customDye(d, EXAMPLE_SUPPLIER);
  assert.equal(dye.runMetres, 129.6);
  assert.equal(dye.spareMetres, 170.4);
  assert.equal(dye.perUnit, Math.round((120 + 170.4 * 5) / 100 * 100) / 100);
  assert.equal(dye.fillsLotAt, 232);
  const stocked = unitCost(design("navy"), EXAMPLE_SUPPLIER);
  const dyed = unitCost(d, EXAMPLE_SUPPLIER);
  assert.ok(Math.abs(dyed.landed - stocked.landed - dye.perUnit) < 0.011);
  assert.ok(dyed.lines.some(l => l.label === "Custom colour dye"));
  assert.ok(!stocked.lines.some(l => l.label === "Custom colour dye"));
  // A run that fills the lot pays the set-up only.
  assert.equal(customDye(design("dusty pink", "cotton-jersey", 300), EXAMPLE_SUPPLIER).perUnit, 0.4);
  assert.equal(customDye(d, { ...EXAMPLE_SUPPLIER, colours: [] }), null);
});

test("colour edits pick a stocked colour, or say what dyeing the exact shade costs", () => {
  const navy = design("navy");
  assert.equal(colourOp("make it lighter", navy).value, COLOURS.indigo, "no sheet: whole catalogue");
  const op = colourOp("make it lighter", navy, EXAMPLE_SUPPLIER);
  assert.equal(op.value, COLOURS["royal blue"]);
  assert.match(did("make it lighter", navy, EXAMPLE_SUPPLIER), /nearest stocked colour that way.*would add about 9\.72 per garment at 100; from 232 pieces/);
  const red = design("red");
  assert.match(did("make it more vivid", red, EXAMPLE_SUPPLIER), /custom colour #[0-9a-f]{6} \(nearest stock colour .*dyeing it to order would add about 9\.72/);
  assert.match(did("make it dusty pink", design("black"), EXAMPLE_SUPPLIER), /not a stock colour for cotton-jersey on the example sheet/);
  assert.doesNotMatch(did("make it navy", design("black"), EXAMPLE_SUPPLIER), /not a stock colour/);
  // The fabric named in the same clause decides: navy is stocked on linen, black is not.
  assert.match(did("make it black linen", design("navy"), EXAMPLE_SUPPLIER), /not a stock colour for linen/);
});

test("eval: with the sheet more edits stay stocked, none goes the wrong way, substitutes keep greys grey", () => {
  const rows = runAll();
  const n = key => rows.filter(r => r[key].kind === "stocked").length;
  assert.equal(rows.length, 112);
  assert.equal(n("catalogue"), 11);
  assert.equal(n("stock"), 46);
  assert.ok(rows.every(r => r.stock.kind === "none" || r.stock.right));
  for (const r of rows.filter(x => ["white", "black", "charcoal"].includes(x.from) && /darker|lighter|muted|tone/.test(x.text) && x.stock.kind === "stocked"))
    assert.ok(["white", "off white", "black", "charcoal", "heather grey"].includes(r.stock.to), `${r.from} / ${r.text} -> ${r.stock.to}`);
});
