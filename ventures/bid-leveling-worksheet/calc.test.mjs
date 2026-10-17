import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, parseMoney, classifyCell, parseBids, level, sampleCsv, toCsv } from "./calc.mjs";

test("parseMoney handles symbols, commas and parentheses", () => {
  assert.equal(parseMoney("$12,400"), 12400);
  assert.equal(parseMoney("(500)"), -500);
  assert.equal(parseMoney(""), null);
  assert.equal(parseMoney("incl"), null);
});

test("cells classify into included, excluded, unknown, priced", () => {
  assert.equal(classifyCell("Incl").kind, "included");
  assert.equal(classifyCell("by others").kind, "excluded");
  assert.equal(classifyCell("NIC").kind, "excluded");
  assert.equal(classifyCell("?").kind, "unknown");
  assert.equal(classifyCell("").kind, "unknown");
  assert.deepEqual(classifyCell("$1,000"), { kind: "priced", amount: 1000 });
  assert.equal(classifyCell("maybe later").kind, "unreadable");
});

test("parseCsv keeps quoted commas", () => {
  assert.deepEqual(parseCsv('a,"b,c",d\n1,2,3'), [["a", "b,c", "d"], ["1", "2", "3"]]);
});

test("the sample re-ranks the low bidder once scope is leveled", () => {
  const r = level(parseBids(sampleCsv()));
  assert.equal(r.summary.lowBase, "Brightline HVAC");
  // Brightline: 368500 + controls 22000 + TAB 9500 + insulation 18500 + crane unknown 14000 = 432500
  const b = r.bidders.find((x) => x.name === "Brightline HVAC");
  assert.equal(b.leveled, 432500);
  // Apex: 412000 + permit 6000 = 418000 ; Cole: 439000 + TAB 9500 + bond priced 12400 = 460900
  assert.equal(r.bidders.find((x) => x.name === "Apex Mechanical").leveled, 418000);
  assert.equal(r.bidders.find((x) => x.name === "Cole & Sons").leveled, 460900);
  assert.equal(r.summary.lowLeveled, "Apex Mechanical");
  assert.equal(r.summary.rankChanged, true);
  assert.deepEqual(r.ranked.map((x) => x.rank), [1, 2, 3]);
  assert.equal(r.ranked[1].vsLowLeveled, 14500);
});

test("unaddressed items can be weighted down", () => {
  const p = parseBids(sampleCsv());
  const half = level(p, { unknownWeight: 0.5 }).bidders.find((x) => x.name === "Brightline HVAC");
  assert.equal(half.leveled, 368500 + 22000 + 9500 + 18500 + 7000);
});

test("a base far below the median is flagged", () => {
  const r = level(parseBids("item,estimate,A,B,C\nBASE,,100,200,210\nx,10,incl,incl,incl"));
  assert.match(r.bidders[0].flags.join(" "), /under the median/);
});

test("missing estimate warns instead of silently adding zero", () => {
  const r = level(parseBids("item,estimate,A,B\nBASE,,100,120\nthing,,excl,incl"));
  assert.match(r.warnings.join(" "), /thing/);
});

test("errors: no BASE row, too few bidders", () => {
  assert.match(parseBids("item,estimate,A,B\nx,1,incl,incl").error, /BASE/);
  assert.match(parseBids("item,estimate,A\nBASE,,1").error, /bidder/);
});

test("item coverage counts reconcile with bidder count", () => {
  const r = level(parseBids(sampleCsv()));
  for (const c of r.itemCoverage) assert.equal(c.included + c.excluded + c.unknown + c.priced, 3);
});

test("csv export lists ranked bidders", () => {
  const out = toCsv(level(parseBids(sampleCsv())));
  assert.match(out, /^rank,bidder/);
  assert.match(out, /1,Apex Mechanical,412000,6000,418000,0/);
});
