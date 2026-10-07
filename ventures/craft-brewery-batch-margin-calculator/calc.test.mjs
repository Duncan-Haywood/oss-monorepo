import { test } from "node:test";
import assert from "node:assert/strict";
import * as c from "./calc.mjs";

const CH = "A pints, 248, 6, 0, 0, 0\nB kegs, 2, 150, 5, 0, 0";
const near = (a, b, e = 0.01) => assert.ok(Math.abs(a - b) <= e, `${a} vs ${b}`);

test("federal excise follows the reduced-rate tiers", () => {
  near(c.federalExcisePerBbl(1200), 3.5);
  near(c.federalExcisePerBbl(60000), 3.5);
  near(c.federalExcisePerBbl(120000), (60000 * 3.5 + 60000 * 16) / 120000);
  near(c.federalExcisePerBbl(3_000_000), 16);
  near(c.federalExcisePerBbl(7_000_000), (6_000_000 * 16 + 1_000_000 * 18) / 7_000_000);
  near(c.federalExcisePerBbl(0), 3.5);
});

test("channels parse, comments and header skipped, bad lines reported", () => {
  const r = c.parseChannels("# c\nname,units,price\nTap, 248, 6.5\nBad, x, 3\nTap, 2, 100\nNeg, 2, -5\nPct, 2, 5, 0, 0, 150");
  assert.equal(r.channels.length, 1);
  assert.equal(r.errors.length, 4);
  assert.equal(r.channels[0].pack, 0);
});

test("beers parse the mix and reject unknown channels", () => {
  const ch = c.parseChannels(CH).channels;
  const ok = c.parseBeers("IPA, 15, 14, 1000, A pints:60; B kegs:40", ch);
  assert.equal(ok.beers[0].mix.length, 2);
  assert.equal(ok.beers[0].mixTotal, 100);
  assert.match(c.parseBeers("IPA, 15, 14, 1000, Nowhere:100", ch).errors[0], /not one of your channels/);
  assert.match(c.parseBeers("IPA, 0, 14, 1000, A pints:100", ch).errors[0], /above zero/);
  assert.match(c.parseBeers("IPA, 15, 14, 1000, A pints:x", ch).errors[0], /not a number/);
  assert.match(c.parseBeers("IPA, 15, 14, 1000", ch).errors[0], /need name/);
});

test("a hand-worked batch matches", () => {
  // 10 bbl, 10% loss -> 9 bbl. Cost 500 + 10h*20 + 100 = 800 -> 88.89/bbl. Excise 3.5 + 6 = 9.5. Overhead 0.
  // All pints: 9*248*6 = 13392 revenue. Profit = 13392 - 9*88.889 - 85.5 = 12506.5
  const r = c.analyze("A pints, 248, 6, 0, 0, 0", "IPA, 10, 14, 500, A pints:100", { laborHours: 10, laborRate: 20, otherPerBatch: 100, overheadPerMonth: 0, annualBbl: 1000, stateExcisePerBbl: 6, lossPct: 10 });
  const b = r.beers[0];
  near(b.packaged, 9);
  near(b.revenue, 13392);
  near(b.profit, 13392 - 800 - 85.5);
  near(b.profitPerBblDay, b.profit / 10 / 14);
});

test("channel costs, percent of sales and overhead reduce profit", () => {
  const base = { laborHours: 0, laborRate: 0, otherPerBatch: 0, overheadPerMonth: 0, stateExcisePerBbl: 0, lossPct: 0, annualBbl: 1000 };
  const a = c.analyze("K, 2, 100, 5, 5, 10", "X, 10, 10, 0, K:100", base).beers[0];
  // revenue 10*2*100=2000; channel cost 10*2*10=200 + 10% of 2000 = 200; excise 35
  near(a.profit, 2000 - 400 - 35);
  const b = c.analyze("K, 2, 100, 5, 5, 10", "X, 10, 10, 0, K:100", { ...base, overheadPerMonth: 1000 }).beers[0];
  near(b.profit, a.profit - 10 * (12000 / 1000));
});

test("a losing channel is flagged with its break-even price", () => {
  const r = c.analyze("Cheap, 2, 40, 5, 0, 0", "X, 10, 10, 800, Cheap:100", { overheadPerMonth: 0 });
  const w = r.warnings.find((x) => x.level === "high");
  assert.ok(w);
  assert.match(w.text, /Break-even price per unit/);
  const p = r.beers[0].parts[0];
  assert.ok(p.breakEvenPrice > 40);
  // charging the break-even price earns about zero
  const again = c.analyze(`Cheap, 2, ${p.breakEvenPrice}, 5, 0, 0`, "X, 10, 10, 800, Cheap:100", { overheadPerMonth: 0 });
  near(again.beers[0].profit, 0, 0.5);
});

test("mix not summing to 100 is scaled and warned", () => {
  const r = c.analyze(CH, "X, 10, 10, 500, A pints:30; B kegs:30", {});
  assert.ok(r.warnings.some((w) => /add to 60/.test(w.text)));
  near(r.beers[0].parts[0].share, 50);
  near(r.beers[0].parts.reduce((s, p) => s + p.bbl, 0), r.beers[0].packaged);
});

test("beers are ranked by profit per barrel-day of tank", () => {
  const r = c.analyze(CH, "Fast, 10, 10, 500, A pints:100\nSlow, 10, 60, 500, A pints:100", {});
  assert.equal(r.ranked[0].name, "Fast");
  assert.equal(r.summary.bestPerTankDay, "Fast");
  assert.ok(r.ranked[0].profitPerBblDay > r.ranked[1].profitPerBblDay);
});

test("the example runs clean and kegs earn far less per barrel than the taproom", () => {
  const r = c.analyze(c.DEFAULT_CHANNELS, c.DEFAULT_BEERS, {});
  assert.deepEqual(r.errors, []);
  const ipa = r.beers.find((b) => b.name === "House IPA");
  assert.equal(ipa.best.channel, "Taproom pints");
  assert.equal(ipa.worst.channel, "Self-distributed kegs");
  assert.ok(ipa.shift > 0);
  assert.equal(r.summary.beers, 3);
});

test("empty input is reported, not thrown", () => {
  assert.equal(c.analyze("", "X, 1, 1, 1, A:100", {}).summary, null);
  assert.equal(c.analyze(CH, "", {}).summary, null);
});

test("exports quote their fields and list every beer and channel", () => {
  const r = c.analyze(CH, 'Say "hi", 10, 10, 500, A pints:50; B kegs:50', {});
  const csv = c.resultCsv(r);
  assert.equal(csv.trim().split("\n").length, 3);
  assert.match(csv, /"Say ""hi"""/);
  assert.match(c.summaryText(r), /Not tax or legal advice/);
});

test("high loss and very large volume add warnings", () => {
  const r = c.analyze(CH, "X, 10, 10, 500, A pints:100", { lossPct: 20, annualBbl: 3_000_000 });
  assert.ok(r.warnings.some((w) => /Loss is set at 20/.test(w.text)));
  assert.ok(r.warnings.some((w) => /2 million/.test(w.text)));
});
