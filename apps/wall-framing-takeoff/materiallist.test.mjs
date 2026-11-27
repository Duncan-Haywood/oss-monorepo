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
