import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { budget, budgetText, budgetCsv } from "./budget.mjs";
import { main } from "./cli.mjs";
import { samplePlan } from "./engine.mjs";
import { sampleFloor } from "./floor.mjs";
import { sampleRoof } from "./roof.mjs";
import { sampleFoundation } from "./foundation.mjs";

const full = (prices) => ({ ...samplePlan(), floor: sampleFloor(), roof: sampleRoof(), foundation: sampleFoundation(), ...(prices ? { prices } : {}) });
const run = (plan, ...flags) => main([ "p.json", ...flags ], () => JSON.stringify(plan));
const bud = (plan) => JSON.parse(run(plan, "--sheathing", "--budget", "--json").out);

test("lumber lines add up to the cutting-stock order's own cost", () => {
  const b = bud(full());
  const order = JSON.parse(run(full(), "--sheathing", "--json").out);
  const lumber = b.sections.find((s) => s.name === "Lumber").subtotal;
  assert.ok(Math.abs(lumber - order.summary.cost) < 0.05, `${lumber} vs ${order.summary.cost}`);
});

test("quantities without a typed price are listed, never guessed", () => {
  const b = bud(full());
  assert.ok(b.unpriced.some((u) => u.startsWith("Rebar")));
  assert.ok(b.lines.filter((l) => l.amount == null).every((l) => l.unitPrice == null));
  const sheets = b.lines.find((l) => l.item === "Subfloor sheets");
  assert.equal(sheets.amount, null);
});

test("typed prices multiply the model's quantities, then tax and contingency stack", () => {
  const b = bud(full({ floorSheet: 30, rebarLb: 1, concreteYd: 150, tax: 0.1, contingency: 0.05 }));
  const fl = b.lines.find((l) => l.item === "Subfloor sheets");
  assert.equal(fl.amount, +(fl.qty * 30).toFixed(2));
  const conc = b.lines.find((l) => l.item === "Concrete");
  assert.equal(conc.amount, +(conc.qty * 150).toFixed(2));
  const tax = +(b.materials * 0.1).toFixed(2);
  assert.equal(b.tax, tax);
  assert.equal(b.contingency, +((b.materials + tax) * 0.05).toFixed(2));
  assert.equal(b.total, +(b.materials + b.tax + b.contingency).toFixed(2));
});

test("a typed wall sheet price replaces the order's own sheet prices", () => {
  const a = bud(full()).lines.find((l) => l.item === "Wall sheathing sheets");
  const b = bud(full({ wallSheet: 50 })).lines.find((l) => l.item === "Wall sheathing sheets");
  assert.equal(b.unitPrice, 50);
  assert.equal(b.qty, a.qty);
});

test("walls-only plan has lumber and no shell sections", () => {
  const b = bud(samplePlan());
  assert.deepEqual(b.sections.map((s) => s.name), ["Lumber", "Sheathing"]);
});

test("the CLI prints a BUDGET section and the labor disclaimer", () => {
  const out = run(full({ roofSheet: 40 }), "--budget").out;
  assert.match(out, /\nBUDGET\n/);
  assert.match(out, /Not in the total, no price typed/);
  assert.match(out, /no labor rate typed/);
});

test("budgetText handles an empty result", () => {
  assert.ok(budgetText(budget({ orders: [] })).length >= 2);
});

test("labor rates multiply takeoff quantities and stay out of tax and contingency", () => {
  const b0 = bud(full({ tax: 0.1, contingency: 0.05 }));
  const b = bud(full({ tax: 0.1, contingency: 0.05, laborWallFoot: 12, laborRoofSquare: 100 }));
  const wf = b.lines.find((l) => l.item === "Wall framing");
  assert.equal(wf.amount, +(wf.qty * 12).toFixed(2));
  assert.equal(b.materials, b0.materials);
  assert.equal(b.tax, b0.tax);
  assert.equal(b.total, +(b.materials + b.tax + b.contingency + b.labor).toFixed(2));
  assert.ok(b.unpriced.some((u) => u.startsWith("Floor framing")));
});

test("budgetCsv has a header, one row per line, and quotes commas", () => {
  const b = bud(full({ laborWallFoot: 10 }));
  const csv = budgetCsv(b).trim().split("\n");
  assert.equal(csv[0], "section,item,qty,unit,unit_price,amount,source");
  assert.equal(csv.length, 1 + b.lines.length + 5);
  assert.match(csv.at(-1), /^,Total,,,,/);
  assert.match(budgetCsv({ lines: [{ section: "A", item: "x, y", qty: 1, unit: "u", unitPrice: null, amount: null, source: 's"q' }], materials: 0, taxRate: 0, tax: 0, contingencyRate: 0, contingency: 0, labor: 0, total: 0 }), /"x, y"/);
});

test("foundation labor rates price the slab area and the net concrete, outside tax", () => {
  const b0 = bud(full({ laborWallFoot: 1 }));
  const b = bud(full({ laborWallFoot: 1, laborFoundationSqFt: 3, laborConcreteYd: 40 }));
  const a = b.lines.find((l) => l.item === "Foundation forming, rebar and finishing");
  const c = b.lines.find((l) => l.item === "Concrete placing");
  assert.ok(a.qty > 0 && c.qty > 0);
  assert.equal(a.amount, +(a.qty * 3).toFixed(2));
  assert.ok(Math.abs(c.amount - c.qty * 40) <= 0.005 * 40); // qty is shown rounded to 2 places
  assert.equal(+(b.labor - b0.labor).toFixed(2), +(a.amount + c.amount).toFixed(2));
  assert.ok(bud(full({ laborWallFoot: 1 })).unpriced.some((u) => u.startsWith("Concrete placing")));
});

test("drywall sheets are budgeted once", () => {
  const b = bud({ ...full({ drywallSheet: 10 }), drywall: { ceiling: [{ width: 480, depth: 336 }] } });
  const lines = b.lines.filter((l) => l.item === "Drywall sheets");
  assert.equal(lines.length, 1);
  assert.equal(lines[0].amount, lines[0].qty * 10);
});

test("anchor bolts are budgeted from the foundation count at the typed price", () => {
  const plan = full({ anchorBolt: 2.5 });
  plan.foundation = { ...plan.foundation, anchorBolts: {} };
  const b = bud(plan);
  const a = b.lines.find((l) => l.item === "Anchor bolts (with nut and washer)");
  assert.equal(a.qty, 30);
  assert.equal(a.amount, 75);
});

test("insulation bags are budgeted: wall, rim and attic lines, typed price over the plan's own", () => {
  const plan = { ...full({ insulationBag: 20 }), insulation: { price: 99, rim: true, attic: { bagCuFt: 40, price: 30 } } };
  const b = bud(plan);
  const ins = JSON.parse(run(plan, "--insulation", "--json").out).insulation;
  const wall = b.lines.find((l) => l.item === "Wall cavity insulation bags");
  assert.equal(wall.qty, ins.bags);
  assert.equal(wall.amount, ins.bags * 20);
  const rim = b.lines.find((l) => l.item === "Rim joist insulation bags");
  assert.equal(rim.amount, ins.rim.bags * 20);
  const attic = b.lines.find((l) => l.item === "Attic loose-fill bags");
  assert.equal(attic.unitPrice, 30);
  assert.equal(b.sections.find((s) => s.name === "Insulation").subtotal, +(wall.amount + rim.amount + attic.amount).toFixed(2));
});

test("insulation with no price anywhere is listed as unpriced; the plan's price is used when none is typed", () => {
  const plain = bud({ ...full(), insulation: {} });
  assert.ok(plain.unpriced.some((u) => u.startsWith("Wall cavity insulation bags")));
  const priced = bud({ ...full(), insulation: { price: 12 } });
  const w = priced.lines.find((l) => l.item === "Wall cavity insulation bags");
  assert.equal(w.unitPrice, 12);
});

test("labor lines for drywall sheets and insulation bags use the typed rates, and need a labor rate to appear", () => {
  const plan = { ...full({ drywallSheet: 10, insulationBag: 20, laborDrywallSheet: 15, laborInsulationBag: 4 }), drywall: { ceiling: [{ width: 480, depth: 336 }] }, insulation: { rim: true, attic: { bagCuFt: 40, price: 30 } } };
  const b = bud(plan);
  const dw = b.lines.find((l) => l.item === "Drywall sheets");
  const ldw = b.lines.find((l) => l.item === "Drywall hanging and finishing");
  assert.equal(ldw.qty, dw.qty);
  assert.equal(ldw.amount, +(dw.qty * 15).toFixed(2));
  const bags = b.lines.filter((l) => l.section === "Insulation").reduce((s, l) => s + l.qty, 0);
  const lin = b.lines.find((l) => l.item === "Insulation installation");
  assert.equal(lin.qty, bags);
  assert.equal(lin.amount, +(bags * 4).toFixed(2));
  assert.equal(b.labor, +(b.sections.find((s) => s.name === "Labor").subtotal).toFixed(2));
  const none = bud({ ...plan, prices: { drywallSheet: 10 } });
  assert.ok(!none.lines.some((l) => l.section === "Labor"));
});

test("labor lines for siding (sq ft) and trim (linear ft) use the typed rates and are not taxed", () => {
  const plan = { ...full({ laborSidingSqFt: 3, laborTrimFoot: 1.5 }), siding: {}, trim: {} };
  const b = bud(plan);
  const ls = b.lines.find((l) => l.item === "Siding and house wrap installation");
  const lt = b.lines.find((l) => l.item === "Trim installation");
  assert.ok(ls && lt, "both labor lines appear");
  assert.ok(Math.abs(ls.amount - ls.qty * 3) <= 0.02);
  assert.ok(Math.abs(lt.amount - lt.qty * 1.5) <= 0.02);
  const none = bud({ ...plan, prices: { laborTrimFoot: 1.5 } });
  assert.ok(!none.lines.some((l) => l.item === "Siding and house wrap installation" && l.amount > 0));
});

test("labor lines for eaves (fascia run) and gutters (run feet) use the typed rates and are not taxed", () => {
  const plan = { ...full({ laborEavesFoot: 2, laborGutterFoot: 4 }), eaves: {}, gutters: {} };
  const b = bud(plan);
  const le = b.lines.find((l) => l.item === "Fascia, soffit and J-channel installation");
  const lg = b.lines.find((l) => l.item === "Gutter and downspout installation");
  assert.ok(le && lg, "both labor lines appear");
  assert.ok(le.qty > 0 && lg.qty > 0);
  assert.ok(Math.abs(le.amount - le.qty * 2) <= 0.02);
  assert.ok(Math.abs(lg.amount - lg.qty * 4) <= 0.02);
  const none = bud({ ...plan, prices: {} });
  assert.ok(!none.lines.some((l) => l.section === "Labor"));
});

test("labor line for hold-downs and plate straps uses the typed rate and is not taxed", () => {
  const b = bud({ ...full({ laborHoldDown: 12 }), fasteners: { holdDowns: { wallEnds: true }, plateStraps: true } });
  const l = b.lines.find((x) => x.item === "Hold-down and plate strap installation");
  assert.ok(l, "hardware labor line appears");
  assert.ok(l.qty > 0);
  assert.ok(Math.abs(l.amount - l.qty * 12) <= 0.02);
});

test("labor line for wall sheathing uses the typed per-sheet rate", () => {
  const b = bud({ ...full({ laborWallSheet: 9 }) });
  const sh = b.lines.find((x) => x.item === "Wall sheathing sheets");
  const l = b.lines.find((x) => x.item === "Wall sheathing installation");
  assert.ok(sh, "fixture has sheathing");
  assert.ok(l, "sheathing labor line appears");
  assert.equal(l.qty, sh.qty);
  assert.ok(Math.abs(l.amount - l.qty * 9) <= 0.02);
  assert.ok(!bud({ ...full({}) }).lines.some((x) => x.item === "Wall sheathing installation"));
});

test("labor line for stairs counts risers, both flights of a landing stair, at the typed rate", () => {
  const plan = { ...full({ laborStairRiser: 85 }), stairs: [{ id: "Main", totalRise: 108, width: 36 }, { id: "Tall", totalRise: 200, width: 36, landing: { width: 36, depth: 36 } }] };
  const out = run(plan, "--sheathing", "--stairs", "--budget", "--json");
  const r = JSON.parse(out.out);
  const l = r.lines.find((x) => x.item === "Stair building and installation");
  assert.ok(l, out.out.slice(0, 300));
  assert.ok(l.qty >= 14 + 26 - 2 && l.qty < 60);
  assert.ok(Math.abs(l.amount - l.qty * 85) <= 0.02);
  assert.ok(!bud({ ...full({}), stairs: plan.stairs }).lines.some((x) => x.item === "Stair building and installation"));
});

test("the page's price-name help lists every price name the engine reads", () => {
  const src = readFileSync(new URL("./budget.mjs", import.meta.url), "utf8");
  const page = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  const names = [...new Set([...src.matchAll(/P\("([A-Za-z]+)"\)/g)].map((m) => m[1]))];
  assert.ok(names.length > 40);
  const missing = names.filter((n) => !page.includes(n));
  assert.deepEqual(missing, []);
});

test("deck lines: lumber order cost, footing bags and screw boxes tie to the deck layout; labor uses the typed per-sq-ft rate", async () => {
  const { sampleDeck, layoutDeck } = await import("./deck.mjs");
  const d = layoutDeck(sampleDeck());
  const plan = { ...full({ deckConcreteBag: 6, deckScrewBox: 40, laborDeckSqFt: 15 }), deck: sampleDeck() };
  const b = bud(plan);
  const lum = b.lines.find((x) => x.section === "Deck" && x.item.startsWith("Deck lumber"));
  const bags = b.lines.find((x) => x.item === "Footing concrete bags");
  const box = b.lines.find((x) => x.item === "Deck screw boxes");
  const lab = b.lines.find((x) => x.item === "Deck framing, decking and rails");
  assert.ok(lum && bags && box && lab, "deck lines appear");
  assert.ok(Math.abs(lum.amount - d.cost) <= 0.05, `${lum.amount} vs ${d.cost}`);
  assert.equal(bags.qty, d.concrete.bags);
  assert.ok(Math.abs(bags.amount - bags.qty * 6) <= 0.02);
  assert.equal(box.qty, d.screwBoxes);
  assert.equal(lab.qty, Math.round(d.area * 100) / 100);
  assert.ok(Math.abs(lab.amount - lab.qty * 15) <= 0.02);
  const none = bud({ ...plan, prices: {} });
  assert.ok(!none.lines.some((x) => x.item === "Deck framing, decking and rails"));
  assert.ok(!bud(full()).lines.some((x) => x.section === "Deck"));
});

test("stair connectors and solid risers are priced; stairs labor is counted once", () => {
  const stairs = [{ totalRise: 108, tread: 10, stringer: "2x12", width: 36, riserBoard: "2x8" }, { totalRise: 60, width: 36 }];
  const plan = { ...full({ stairConnector: 12, stairRiserBoard: 9, laborStairRiser: 40 }), stairs };
  const b = bud(plan);
  const out = JSON.parse(run(plan, "--sheathing", "--json").out);
  const fl = out.stairs.flatMap((x) => x.flights || [x]);
  const conn = b.lines.find((x) => x.item.startsWith("Stringer top connectors"));
  assert.equal(conn.qty, fl.reduce((t, x) => t + x.hardware.topConnectors + x.hardware.footAnchors, 0));
  assert.ok(Math.abs(conn.amount - conn.qty * 12) <= 0.02);
  assert.ok(b.lines.some((x) => x.item === "Solid riser boards" && x.amount > 0));
  assert.equal(b.lines.filter((x) => x.section === "Labor" && x.unit === "risers").length, 1);
});

test("stair balusters, guard posts and handrail brackets are priced from the rail layout", () => {
  const stairs = [{ totalRise: 108, tread: 10, stringer: "2x12", width: 36, rail: { sides: 1 } }];
  const plan = { ...full({ stairBaluster: 4, stairRailPost: 25, handrailBracket: 10 }), stairs };
  const b = bud(plan);
  const out = JSON.parse(run(plan, "--sheathing", "--json").out);
  const fl = out.stairs.flatMap((x) => x.flights || [x]);
  const n = (f) => fl.reduce((t, x) => t + f(x), 0);
  const bal = b.lines.find((x) => x.item === "Stair balusters");
  const post = b.lines.find((x) => x.item === "Stair guard posts");
  const brk = b.lines.find((x) => x.item === "Handrail wall brackets");
  assert.equal(bal.qty, n((x) => x.rail.balusters.count));
  assert.equal(post.qty, n((x) => x.rail.posts.count));
  assert.equal(brk.qty, n((x) => x.rail.handrail.brackets));
  assert.ok(Math.abs(bal.amount - bal.qty * 4) <= 0.02 && bal.qty > 0);
  assert.ok(!bud(full({ stairBaluster: 4 })).lines.some((x) => x.item === "Stair balusters"));
});
