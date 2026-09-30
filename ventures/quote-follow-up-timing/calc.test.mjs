import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRows, parseOutcome, analyze, reportCsv, sampleText, money, pct } from "./calc.mjs";

const rows = (t) => parseRows(t).rows;

test("parseOutcome reads the common spellings", () => {
  assert.equal(parseOutcome("Won"), "won");
  assert.equal(parseOutcome("went elsewhere"), "lost");
  assert.equal(parseOutcome(""), "open");
  assert.equal(parseOutcome("pending"), "open");
  assert.equal(parseOutcome("maybe"), null);
});

test("parseRows handles headers in any order, quoted money and bad rows", () => {
  const p = parseRows('outcome,quote total,days open\nwon,"$1,200",5\nlost,900,12\nopen,,3\nbogus,1,1\nwon,100,-2');
  assert.equal(p.rows.length, 3);
  assert.deepEqual(p.rows[0], { days: 5, outcome: "won", value: 1200 });
  assert.equal(p.rows[2].value, null);
  assert.match(p.warnings[0], /2 rows skipped/);
});

test("parseRows with no header and tab delimiter", () => {
  const p = parseRows("4\twon\n9\tlost");
  assert.equal(p.rows.length, 2);
  assert.ok(parseRows("").error);
  assert.ok(parseRows("x,y\nfoo,bar").error);
});

// Independent exact check: no censoring, so the estimate must equal the plain counts.
test("with no open quotes the eventual win rate is exactly won / decided", () => {
  const t = ["days,outcome"];
  for (let i = 1; i <= 10; i++) t.push(`${i},won`);
  for (let i = 1; i <= 20; i++) t.push(`${i},lost`);
  const r = analyze(rows(t.join("\n")));
  assert.ok(Math.abs(r.winRate - 10 / 30) < 1e-9);
  assert.equal(r.horizon, 10);
  assert.equal(r.day50, 5);
});

test("open quotes are censored, not counted as losses", () => {
  const base = ["days,outcome"];
  for (let i = 1; i <= 15; i++) base.push(`${i},won`);
  for (let i = 1; i <= 15; i++) base.push(`${i},lost`);
  const plain = analyze(rows(base.join("\n")));
  // Open quotes younger than every decision barely matter; counted as lost they would halve the rate.
  const withOpen = analyze(rows([...base, ...Array.from({ length: 10 }, () => "0,open")].join("\n")));
  assert.ok(Math.abs(withOpen.winRate - plain.winRate) < 0.03);
  const asLost = analyze(rows([...base, ...Array.from({ length: 10 }, () => "0,lost")].join("\n")));
  assert.ok(asLost.winRate < plain.winRate - 0.1);
});

test("recovers a simulated win rate and timing", () => {
  const r = analyze(rows(sampleText()));
  assert.ok(Math.abs(r.winRate - 0.35) < 0.08, pct(r.winRate));
  assert.ok(r.winRange80[0] < r.winRate && r.winRate < r.winRange80[1]);
  // true median win time is 6 days
  assert.ok(r.day50 >= 4 && r.day50 <= 8, String(r.day50));
  assert.ok(r.day50 <= r.day80 && r.day80 <= r.day90);
  assert.ok(r.coldDay === null || r.coldDay <= r.horizon);
  assert.equal(r.verdict, "usable");
});

test("the chance an open quote still wins falls with its age and is zero past the last win", () => {
  const r = analyze(rows(sampleText()));
  assert.ok(Math.abs(r.curve[0].stillWins - r.winRate) < 0.05);
  assert.equal(r.curve.at(-1).day >= r.horizon ? r.curve.at(-1).stillWins : 0, 0);
  const old = analyze(rows(sampleText() + "\n400,open,900"));
  const q = old.openQuotes.find((x) => x.days === 400);
  assert.equal(q.chance, 0);
  assert.ok(q.past);
});

test("values rank open quotes by expected value", () => {
  const r = analyze(rows(sampleText() + "\n1,open,100000\n1,open,50"));
  assert.equal(r.hasValue, true);
  assert.equal(r.openQuotes[0].value, 100000);
  assert.ok(r.expectedValue > 0);
  assert.match(reportCsv(r), /^days_open,chance_still_won,value,expected_value,note\n/);
});

test("refuses when the history cannot answer", () => {
  assert.match(analyze(rows("1,won\n2,lost")).error, /at least 25/);
  const few = ["days,outcome"];
  for (let i = 0; i < 30; i++) few.push(`${i},lost`);
  few.push("3,won");
  assert.match(analyze(rows(few.join("\n"))).error, /won quotes/);
  const nolost = ["days,outcome"];
  for (let i = 1; i <= 30; i++) nolost.push(`${i},won`);
  assert.match(analyze(rows(nolost.join("\n"))).error, /recorded as lost/);
  const flat = ["days,outcome"];
  for (let i = 0; i < 15; i++) flat.push("0,won", "5,lost");
  assert.match(analyze(rows(flat.join("\n"))).error, /different decision times/);
});

test("dead quotes left open are flagged, and giveUpDays turns them into losses", () => {
  const t = ["days,outcome"];
  for (let i = 1; i <= 12; i++) t.push(`${i},won`);
  for (let i = 1; i <= 12; i++) t.push(`${i},lost`);
  for (let i = 0; i < 12; i++) t.push(`${60 + i},open`);
  const flagged = analyze(rows(t.join("\n")));
  assert.ok(flagged.warnings.some((w) => /older than any quote you have ever won/.test(w)));
  // Dead quotes inside the range of decision times are what bias the rate; giveUpDays fixes that.
  const inside = [...t.slice(0, 25), ...Array.from({ length: 10 }, (_, i) => `${8 + (i % 4)},open`)].join("\n");
  const kept = analyze(rows(inside));
  const fixed = analyze(rows(inside), { giveUpDays: 8 });
  assert.equal(fixed.gaveUp, 10);
  assert.ok(fixed.winRate < kept.winRate);
  assert.equal(fixed.open, 0);
});

test("results are reproducible and formatting helpers behave", () => {
  assert.deepEqual(analyze(rows(sampleText())).winRange80, analyze(rows(sampleText())).winRange80);
  assert.equal(money(1234.5), "$1,235");
  assert.equal(money(NaN), "n/a");
  assert.equal(pct(0.256, 0), "26%");
});
