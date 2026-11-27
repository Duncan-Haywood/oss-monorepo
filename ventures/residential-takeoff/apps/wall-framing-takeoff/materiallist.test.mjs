import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { samplePlan, takeoff } from "./engine.mjs";
import { sheathe } from "./sheathing.mjs";
import { layoutRoof, roofCuts, sampleRoof } from "./roof.mjs";
import { materialList, materialListCsv, materialListText, csvCell } from "./materiallist.mjs";
import { main } from "./cli.mjs";

const plan = samplePlan();
const roof = layoutRoof(sampleRoof(), plan);
const r = /** @type {any} */ (takeoff(plan, roofCuts(roof)));
r.sheathing = sheathe(plan, r);
r.roof = roof;
const m = materialList(r);
const sum = (rows) => rows.reduce((t, x) => t + x.qty, 0);

test("every board, piece and sheet the modules counted is on the list once", () => {
  assert.equal(m.ok, true);
  const lumber = m.rows.filter((x) => x.section === "Framing lumber");
  assert.equal(sum(lumber), r.summary.boards);
  assert.equal(m.totals.boards, r.summary.boards);
  assert.equal(sum(m.rows.filter((x) => x.section.startsWith("Members"))), r.cuts.reduce((t, c) => t + c.qty, 0));
  assert.equal(sum(m.rows.filter((x) => x.section === "Wall sheathing")), r.sheathing.summary.sheets);
  assert.equal(m.totals.sheets, r.sheathing.summary.sheets + roof.sheets.count);
  // rafters ride in the same order as the walls
  assert.ok(lumber.some((x) => x.size === "2x8" && /rafter/.test(x.note)));
});

test("the roof rows are the roof module's numbers", () => {
  const roofRows = Object.fromEntries(m.rows.filter((x) => x.section === "Roof").map((x) => [x.item, x.qty]));
  const g = roof.roofing;
  assert.equal(roofRows["roof sheathing 4x8"], roof.sheets.count);
  assert.equal(roofRows["roof area"], Math.round(g.squares * 100) / 100);
  assert.equal(roofRows.shingles, g.shingleBundles);
  assert.equal(roofRows["eave length"], Math.round(g.eaveFeet * 100) / 100);
  assert.equal(roofRows["rake length"], Math.round(g.rakeFeet * 100) / 100);
  assert.equal(roofRows["ridge length"], Math.round(g.ridgeFeet * 100) / 100);
  assert.equal(roofRows["hip length"], undefined, "a gable has no hips");
  assert.equal(m.totals.squares, g.squares);
});

test("a hip roof lists ridge and hips apart", () => {
  const p = samplePlan();
  p.stock = [...p.stock, { size: "2x8", length: 288, price: 24 }, { size: "2x10", length: 288, price: 24 }];
  const hip = layoutRoof({ ...sampleRoof(), shape: "hip" }, p);
  assert.equal(hip.ok, true, (hip.errors || []).join());
  const t = /** @type {any} */ (takeoff(p, roofCuts(hip)));
  t.roof = hip;
  const rows = Object.fromEntries(materialList(t).rows.filter((x) => x.section === "Roof").map((x) => [x.item, x.qty]));
  assert.equal(rows["hip length"], Math.round(hip.roofing.hipFeet * 100) / 100);
  assert.equal(rows["ridge length"], Math.round((hip.roofing.ridgeFeet - hip.roofing.hipFeet) * 100) / 100);
});

test("no price is shown unless asked, and then it adds up", () => {
  assert.equal(m.totals.cost, null);
  assert.ok(m.rows.every((x) => x.cost === undefined));
  assert.ok(!materialListCsv(m).split("\n")[0].includes("cost"));
  const pm = materialList(r, { priced: true });
  const lumberCost = pm.rows.filter((x) => x.section === "Framing lumber").reduce((t, x) => t + x.cost, 0);
  assert.ok(Math.abs(lumberCost - r.summary.cost) < 0.01, `${lumberCost} vs ${r.summary.cost}`);
  assert.ok(Math.abs(pm.totals.cost - (r.summary.cost + r.sheathing.summary.cost)) < 0.01);
  assert.ok(materialListCsv(pm).split("\n")[0].endsWith(",cost"));
});

test("CSV: one header, one line per row, cells a spreadsheet would run are defused", () => {
  const csv = materialListCsv(m).trimEnd().split("\n");
  assert.equal(csv[0], "section,item,size,length,qty,unit,note");
  assert.equal(csv.length, m.rows.length + 1);
  assert.equal(csvCell("=HYPERLINK(1)"), "'=HYPERLINK(1)");
  assert.equal(csvCell("+1+1"), "'+1+1");
  assert.equal(csvCell("@SUM(A1)"), "'@SUM(A1)");
  assert.equal(csvCell("-3"), "-3");
  assert.equal(csvCell('8\' 0"'), '"8\' 0"""');
  // a stock label from the plan reaches the CSV defused
  const p2 = samplePlan();
  p2.stock = p2.stock.map((s) => (s.label === "precut stud" ? { ...s, label: "=cmd|' /C calc'!A0" } : s));
  const csv2 = materialListCsv(materialList(takeoff(p2)));
  assert.ok(!/(^|,)"?=cmd/m.test(csv2), csv2.slice(0, 300));
});

test("walls the plan checks refused are flagged at the top, in the CSV too", () => {
  const t = /** @type {any} */ (takeoff(plan));
  t.skippedWalls = ["Wall Ext 9: an opening runs past the end"];
  const ml = materialList(t);
  assert.equal(ml.rows[0].section, "Warning");
  assert.match(ml.notes[0], /^INCOMPLETE: 1 wall was refused/);
  assert.match(materialListCsv(ml).split("\n")[1], /^Warning,1 wall not on this list/);
});

test("a failed takeoff gives no list", () => {
  const bad = materialList({ ok: false, errors: ["x"] });
  assert.equal(bad.ok, false);
  assert.equal(materialListCsv(bad), "");
  assert.deepEqual(materialListText(bad), ["  - x"]);
  assert.equal(materialList(null).ok, false);
});

// --- CLI ------------------------------------------------------------------
const fixture = (n) => readFileSync(new URL(`./fixtures/open-house-plans-${n}.dxf`, import.meta.url), "utf8");

test("CLI: a CC0 drawing with --roof-pitch gives walls, sheathing and roof on one list", () => {
  const out = main(["house.dxf", "--sheathing", "--roof-pitch=6", "--material-list", "--json"], () => fixture(1));
  assert.equal(out.code, 0, out.out.slice(0, 400));
  const j = JSON.parse(out.out);
  const sections = new Set(j.rows.map((x) => x.section));
  for (const s of ["Framing lumber", "Members cut from those boards", "Wall sheathing", "Roof"]) assert.ok(sections.has(s), s);
  // 34 x 26 ft generated house: the outline is read as a rectangle and framed as a gable
  assert.ok(j.rows.some((x) => x.item === "rake length"));
  assert.ok(j.totals.squares > 10 && j.totals.squares < 13, String(j.totals.squares));
});

test("CLI: an outline that does not frame still gives the all-hip squares, with the reason", () => {
  const p = samplePlan();
  p.roof = { outline: [[0, 0], ["30'", 0], ["30'", "10'"], ["20'", "10'"], ["20'", "20'"], ["10'", "20'"], ["10'", "30'"], [0, "30'"]], pitch: 6, overhang: 12 };
  const out = main(["p.json", "--material-list"], () => JSON.stringify(p));
  assert.equal(out.code, 0, out.out.slice(0, 400));
  assert.match(out.out, /roof area \(all-hip, from outline\)/);
  assert.match(out.out, /Not framed from the outline/);
  const bad = main(["p.json", "--material-list"], () => JSON.stringify({ ...p, roof: { outline: [[0, 0], [10, 10], [0, 10], [5, 5]], pitch: 6 } }));
  assert.equal(bad.code, 1);
  assert.match(bad.out, /roof outline has problems/);
});

test("CLI: soffit and fascia under an outline roof the framing model cannot split", () => {
  const p = samplePlan();
  p.roof = { outline: [[0, 0], ["30'", 0], ["30'", "10'"], ["20'", "10'"], ["20'", "20'"], ["10'", "20'"], ["10'", "30'"], [0, "30'"]], pitch: 6, overhang: 12 };
  p.eaves = { waste: 0, panelPrice: 10 };
  const out = main(["p.json", "--material-list", "--priced", "--json"], () => JSON.stringify(p));
  assert.equal(out.code, 0, out.out.slice(0, 400));
  const j = JSON.parse(out.out);
  const row = (/** @type {string} */ item) => j.rows.find((/** @type {any} */ x) => x.section === "Soffit and fascia" && x.item === item);
  assert.equal(row("soffit panels").qty, 12); // eaves.test.mjs: the same Z outline by hand
  assert.equal(row("soffit panels").cost, 120);
  assert.equal(row("fascia length").qty, 128); // 1536 in of eave line, no rakes
  assert.equal(j.rows.find((/** @type {any} */ x) => x.item === "eave length (from outline)").qty, 128);
  assert.ok(j.notes.some((/** @type {string} */ x) => /under the all-hip roof read from the outline/.test(x)));
  const text = main(["p.json"], () => JSON.stringify(p));
  assert.equal(text.code, 0);
  assert.match(text.out, /SOFFIT AND FASCIA[\s\S]*eave on each of its 8 sides, no rakes/);
  // still refused with no roof at all
  const none = samplePlan();
  const n = main(["p.json", "--eaves"], () => JSON.stringify(none));
  assert.equal(n.code, 1);
  assert.match(n.out, /need a roof/);
});

test("CLI: --roof-pitch is refused on a plan JSON and out of range", () => {
  assert.match(main(["p.json", "--roof-pitch=6"], () => JSON.stringify(samplePlan())).out, /only applies when the input is a \.dxf or \.ifc/);
  assert.match(main(["house.dxf", "--roof-pitch=40"], () => fixture(1)).out, /from 1 to 24/);
});

test("CLI: the export is open while dark, locked when lit without a key, open with a Job report key", () => {
  const p = JSON.stringify(samplePlan());
  assert.equal(main(["p.json", "--material-list"], () => p).code, 0);
  const billing = { checkoutUrls: { report: "https://shop.example.com/report" }, validateUrl: "https://shop.example.com/validate", variantPlans: { 1: "report" } };
  const locked = main(["p.json", "--material-list"], () => p, { billing });
  assert.equal(locked.code, 3);
  assert.match(locked.out, /Job report \(\$29, one house\).*--licence=KEY/);
  assert.equal(main(["p.json", "--material-list"], () => p, { billing, licence: { valid: false, plan: null } }).code, 3);
  assert.equal(main(["p.json", "--material-list"], () => p, { billing, licence: { valid: true, plan: "report" } }).code, 0);
  // the free outputs stay free when lit
  assert.equal(main(["p.json", "--csv"], () => p, { billing }).code, 0);
  // and a later call without options is dark again (no state leaks between calls)
  assert.equal(main(["p.json", "--material-list"], () => p).code, 0);
});

test("CLI: --whole-house with --gang gangs before skipping, so open-house-plans-2 keeps its exterior walls", () => {
  const out = main(["house.dxf", "--whole-house", "--gang", "--add-board=2x10:20ft", "--add-board=2x4:20ft", "--material-list", "--json"], () => fixture(2));
  assert.equal(out.code, 0, out.out.slice(0, 400));
  const j = JSON.parse(out.out);
  assert.ok(!j.rows.some((x) => x.section === "Warning"), "no wall skipped");
});

test("siding: the siding module's counts are the Siding rows, priced only when asked", async () => {
  const { layoutSiding } = await import("./siding.mjs");
  const p = samplePlan();
  const sd = layoutSiding({ boardPrice: 12.5, wrapPrice: 160, cornerPrice: 20, openingTrim: true, trimPrice: 9, headFlashing: true, openingTape: true, caulk: true, nails: true, nailBoxPrice: 40, starter: true }, p);
  assert.equal(sd.ok, true, String(sd.errors));
  const rs = { ...r, siding: sd };
  const ml = materialList(rs);
  const rows = Object.fromEntries(ml.rows.filter((x) => x.section === "Siding").map((x) => [x.item, x]));
  assert.equal(rows["siding boards"].qty, sd.boards);
  assert.equal(rows["siding boards"].length, `${sd.stock / 12} ft`);
  assert.equal(rows["house wrap"].qty, sd.wrapRolls);
  assert.equal(rows["corner boards"].qty, sd.cornerBoards);
  assert.equal(rows["opening trim boards"].qty, sd.trim.boards);
  assert.equal(rows["head flashing"].qty, sd.flashing.pieces);
  assert.equal(rows["flashing tape"].qty, sd.tape.rolls);
  assert.equal(rows.caulk.qty, sd.caulk.tubes);
  assert.equal(rows["siding nails"].qty, sd.nails.boxes);
  assert.equal(rows["siding starter strip"].qty, sd.starter.boards);
  assert.equal(rows["siding area"].qty, Math.round(sd.netSqFt * 100) / 100);
  assert.equal(rows.battens, undefined, "lap siding has no battens");
  // unpriced by default: no cost on any siding row, and the totals do not move
  assert.ok(ml.rows.filter((x) => x.section === "Siding").every((x) => x.cost === undefined));
  assert.deepEqual(ml.totals, m.totals);
  // priced: each row is qty x its own typed price; a row with no price (tape, caulk) has no cost
  const pm = materialList(rs, { priced: true });
  const prow = Object.fromEntries(pm.rows.filter((x) => x.section === "Siding").map((x) => [x.item, x]));
  assert.equal(prow["siding boards"].cost, Math.round(sd.boards * 12.5 * 100) / 100);
  assert.equal(prow["house wrap"].cost, sd.wrapRolls * 160);
  assert.equal(prow["siding nails"].cost, sd.nails.boxes * 40);
  assert.equal(prow["flashing tape"].cost, undefined);
  const base = materialList(r, { priced: true });
  const added = sd.boards * 12.5 + sd.wrapRolls * 160 + sd.cornerBoards * 20 + sd.trim.boards * 9 + sd.nails.boxes * 40;
  assert.ok(Math.abs(pm.totals.cost - base.totals.cost - added) < 0.011, `${pm.totals.cost} vs ${base.totals.cost} + ${added}`);
  // the CSV carries them, so the contractor suite's estimate import reads Siding as a bid item
  assert.match(materialListCsv(ml), /\nSiding,siding boards,,\d+(\.\d+)? ft,\d+,pcs,/);
});

test("siding: vertical board and batten lists battens; a failed siding layout adds nothing", async () => {
  const { layoutSiding } = await import("./siding.mjs");
  const sd = layoutSiding({ style: "vertical", battens: true, stock: 240 }, samplePlan());
  assert.equal(sd.ok, true, String(sd.errors));
  const ml = materialList({ ...r, siding: sd });
  const b = ml.rows.find((x) => x.item === "battens");
  assert.equal(b.qty, sd.battens.boards);
  assert.match(ml.rows.find((x) => x.item === "siding boards").note, /^vertical, \d+ columns/);
  const none = materialList({ ...r, siding: { ok: false, errors: ["x"] } });
  assert.equal(none.rows.filter((x) => x.section === "Siding").length, 0);
});

test("CLI: a plan with siding puts it on the material list", () => {
  const p = samplePlan();
  p.siding = { exposure: 6 };
  const out = main(["p.json", "--material-list", "--json"], () => JSON.stringify(p));
  assert.equal(out.code, 0, out.out.slice(0, 400));
  const j = JSON.parse(out.out);
  const boards = j.rows.find((x) => x.section === "Siding" && x.item === "siding boards");
  assert.ok(boards && boards.qty > 0);
  assert.match(boards.note, /6 in exposure/);
  assert.ok(j.notes.some((n) => /Siding is counted course by course/.test(n)));
});

test("soffit and fascia: the eaves module's counts are the rows, priced only when asked", async () => {
  const { layoutEaves } = await import("./eaves.mjs");
  const ev = layoutEaves({ panelPrice: 18, fasciaPrice: 22, channelPrice: 7, frieze: true, friezePrice: 15 }, roof);
  assert.equal(ev.ok, true, String(ev.errors));
  const ml = materialList({ ...r, eaves: ev });
  const rows = Object.fromEntries(ml.rows.filter((x) => x.section === "Soffit and fascia").map((x) => [x.item, x]));
  assert.equal(rows["soffit panels"].qty, ev.panels);
  assert.equal(rows["soffit panels"].length, `${ev.panelStock / 12} ft`);
  assert.equal(rows["fascia boards"].qty, ev.fascia);
  assert.equal(rows["J-channel"].qty, ev.channel);
  assert.equal(rows["frieze boards"].qty, ev.frieze.boards);
  assert.equal(rows["soffit area"].qty, Math.round(ev.soffitSqFt * 100) / 100);
  assert.equal(rows["fascia length"].qty, Math.round((ev.eaveFeet + ev.rakeFeet) * 100) / 100);
  assert.equal(rows["vented soffit panels"], undefined, "no ventilation sizing, no vented split");
  // unpriced by default, and the totals do not move
  assert.ok(ml.rows.filter((x) => x.section === "Soffit and fascia").every((x) => x.cost === undefined));
  assert.equal(ml.totals.cost, null);
  assert.ok(ml.notes.some((n) => /Soffit and fascia are counted from the framed roof/.test(n)));
  const pm = materialList({ ...r, eaves: ev }, { priced: true });
  const base = materialList(r, { priced: true });
  const added = ev.panels * 18 + ev.fascia * 22 + ev.channel * 7 + ev.frieze.boards * 15;
  assert.ok(Math.abs(pm.totals.cost - base.totals.cost - added) < 0.011, `${pm.totals.cost} vs ${base.totals.cost} + ${added}`);
  assert.ok(Math.abs(ev.cost - added) < 1e-9, "the material list prices exactly what eaves.mjs prices");
  // the CSV carries them, so the contractor suite's estimate import reads them as a bid item
  assert.match(materialListCsv(ml), /\nSoffit and fascia,soffit panels,,\d+(\.\d+)? ft,\d+,pcs,/);
});

test("soffit and fascia: vented and solid panels add up to the panels counted; a failed layout adds nothing", async () => {
  const { layoutEaves } = await import("./eaves.mjs");
  const { layoutVentilation } = await import("./ventilation.mjs");
  const vent = layoutVentilation({}, roof);
  assert.equal(vent.ok, true, String(vent.errors));
  const ev = layoutEaves({ ventedPanelNfa: 60 }, roof, vent);
  assert.equal(ev.ok, true, String(ev.errors));
  assert.ok(ev.ventedPanels > 0);
  const ml = materialList({ ...r, eaves: ev });
  const rows = ml.rows.filter((x) => x.section === "Soffit and fascia" && /soffit panels$/.test(x.item));
  assert.deepEqual(rows.map((x) => x.item), ev.solidPanels > 0 ? ["vented soffit panels", "solid soffit panels"] : ["vented soffit panels"]);
  assert.equal(sum(rows), ev.panels);
  const none = materialList({ ...r, eaves: { ok: false, errors: ["x"] } });
  assert.equal(none.rows.filter((x) => x.section === "Soffit and fascia").length, 0);
  // with no eaves the siding note still says soffit and fascia are not counted
  const { layoutSiding } = await import("./siding.mjs");
  const sd = layoutSiding({}, samplePlan());
  assert.ok(materialList({ ...r, siding: sd }).notes.some((n) => /soffit, fascia and paint are not counted/.test(n)));
  assert.ok(materialList({ ...r, siding: sd, eaves: ev }).notes.some((n) => /; paint is not counted/.test(n)));
});

test("CLI: a plan with eaves and a roof puts soffit and fascia on the material list", () => {
  const p = /** @type {any} */ (samplePlan());
  p.roof = sampleRoof();
  p.eaves = { panelWidth: 12 };
  const out = main(["p.json", "--material-list", "--json"], () => JSON.stringify(p));
  assert.equal(out.code, 0, out.out.slice(0, 400));
  const j = JSON.parse(out.out);
  const panels = j.rows.find((x) => x.section === "Soffit and fascia" && x.item === "soffit panels");
  assert.ok(panels && panels.qty > 0);
  assert.ok(j.rows.some((x) => x.section === "Soffit and fascia" && x.item === "fascia boards" && x.qty > 0));
});

test("siding gables from the framed roof reach the material list through the CLI (2026-11-26)", () => {
  // the sample house (40 x 28 ft) under the sample 4:12 gable roof, 28 ft eave to eave: the Right and Left walls are the gable ends
  const p = { ...samplePlan(), roof: sampleRoof() };
  const run = (siding) => JSON.parse(main(["p.json", "--material-list", "--json"], () => JSON.stringify({ ...p, siding })).out);
  const area = (ml) => ml.rows.find((x) => x.item === "siding area").qty;
  const level = run({}), gabled = run({ gables: "roof" });
  // two triangles of 0.5 x 28 ft x (14 ft x 4/12) = 65.33 sq ft each, by hand
  assert.ok(Math.abs(area(gabled) - area(level) - 2 * 0.5 * 28 * (14 * 4 / 12)) < 0.02);
  assert.ok(gabled.notes.some((n) => n.includes("Right (4:12, 4.67 ft rise), Left (4:12, 4.67 ft rise)")));
  assert.ok(!level.notes.some((n) => n.includes("gable ends from the framed roof")));
});

test("the band under the rake reaches the material list through the CLI (rake-band-gable-siding, 2026-11-26)", () => {
  const p = { ...samplePlan(), roof: sampleRoof() };
  const run = (siding) => JSON.parse(main(["p.json", "--material-list", "--json"], () => JSON.stringify({ ...p, siding })).out);
  const area = (ml) => ml.rows.find((x) => x.item === "siding area").qty;
  const gabled = run({ gables: "roof" }), banded = run({ gables: "roof", rakeHeel: 8 });
  // the two 28 ft gable walls get an 8 in band each: 2 x 28 x 8 / 12 = 37.33 sq ft, by hand
  assert.ok(Math.abs(area(banded) - area(gabled) - 2 * 28 * 8 / 12) < 0.02);
  assert.ok(banded.notes.some((n) => n.includes("a band 8 in tall under the rake on each (37.33 sq ft) is in the siding and wrap")));
  assert.ok(gabled.notes.some((n) => n.includes("type the siding's rakeHeel to count it")));
});
