import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTable, parseDate, analyze, nnls, sampleText, reportCsv } from "./calc.mjs";

function panelText({ lift = 0, days = 90, start = 60, seed = 3, noise = 0.03 } = {}) {
  let a = seed;
  const rnd = () => { a = (a * 1664525 + 1013904223) % 4294967296; return a / 4294967296; };
  const names = ["A", "B", "C", "D", "E"], scale = [1, 0.7, 0.9, 0.5, 0.8];
  const rows = ["date," + names.join(",")];
  for (let d = 0; d < days; d++) {
    const dt = new Date(Date.UTC(2026, 0, 1) + d * 864e5).toISOString().slice(0, 10);
    const common = 500 * (1 + 0.1 * Math.sin(d / 5)) * (1 + 0.1 * Math.sin((2 * Math.PI * (d % 7)) / 7));
    rows.push(dt + "," + names.map((_, i) => (common * scale[i] * (1 + noise * (rnd() - 0.5) * 2) * (d >= start && i === 0 ? 1 + lift : 1)).toFixed(2)).join(","));
  }
  return rows.join("\n");
}
const run = (text, o = {}) => analyze(parseTable(text), { testUnits: ["A"], start: "2026-03-02", ...o });

test("dates parse in ISO and US form and reject nonsense", () => {
  assert.equal(parseDate("2026-01-02") - parseDate("2026-01-01"), 1);
  assert.equal(parseDate("1/2/2026"), parseDate("2026-01-02"));
  assert.equal(parseDate("2026-02-31"), null);
  assert.equal(parseDate("soon"), null);
});

test("NNLS recovers non-negative weights and clips negatives", () => {
  const X = Array.from({ length: 30 }, (_, i) => [Math.sin(i), Math.cos(i * 1.3), i % 5]);
  const y = X.map((r) => 2 * r[0] + 0.5 * r[2]);
  const w = nnls(X, y);
  assert.ok(Math.abs(w[0] - 2) < 1e-4 && Math.abs(w[2] - 0.5) < 1e-4 && w[1] < 1e-4, JSON.stringify(w));
  assert.ok(nnls(X, y.map((v) => -v - 100)).every((v) => v >= 0));
});

test("wide and long tables give the same panel", () => {
  const wide = "date,A,B\n2026-01-01,1,2\n2026-01-02,3,4\n" + Array.from({ length: 20 }, (_, i) => `2026-01-${String(i + 3).padStart(2, "0")},${i},${i + 1}`).join("\n");
  const long = ["date,geo,sales"];
  for (const l of wide.split("\n").slice(1)) { const [d, a, b] = l.split(","); long.push(`${d},A,${a}`, `${d},B,${b}`); }
  const pw = parseTable(wide), pl = parseTable(long.join("\n"));
  assert.deepEqual(pw.series, pl.series);
  assert.deepEqual(pw.dates, pl.dates);
});

test("no real effect: lift is small, interval covers zero, verdict is not lift", () => {
  const r = run(panelText({ lift: 0 }));
  assert.ok(Math.abs(r.liftRel) < 0.03, String(r.liftRel));
  assert.ok(r.ci90[0] < 0 && r.ci90[1] > 0, JSON.stringify(r.ci90));
  assert.notEqual(r.verdict, "lift");
});

test("a real +10% lift is found, sized and called", () => {
  const r = run(panelText({ lift: 0.1 }));
  assert.ok(Math.abs(r.liftRel - 0.1) < 0.02, String(r.liftRel));
  assert.ok(r.ci90[0] > 0, JSON.stringify(r.ci90));
  assert.equal(r.verdict, "lift");
  assert.ok(r.r2 > 0.9);
  assert.ok(r.mde > 0 && r.mde < 0.1);
});

test("a real drop is called negative", () => {
  const r = run(panelText({ lift: -0.12 }));
  assert.equal(r.verdict, "negative");
});

test("revenue value gives iROAS and profit; orders give cost per incremental order", () => {
  const text = panelText({ lift: 0.1 });
  const rev = run(text, { spend: 3000, marginPct: 40, valueKind: "revenue" });
  assert.ok(Math.abs(rev.money.iroas - rev.lift / 3000) < 1e-9);
  assert.ok(Math.abs(rev.money.profit - (rev.lift * 0.4 - 3000)) < 1e-6);
  assert.equal(rev.money.breakEvenIroas, 2.5);
  const ord = run(text, { spend: 3000, valueKind: "orders" });
  assert.ok(Math.abs(ord.money.costPerIncremental - 3000 / ord.lift) < 1e-9);
});

test("uncorrelated comparison units are flagged unreliable", () => {
  let a = 11;
  const rnd = () => { a = (a * 1664525 + 1013904223) % 4294967296; return a / 4294967296; };
  const rows = ["date,A,B,C"];
  for (let d = 0; d < 80; d++) rows.push(`${new Date(Date.UTC(2026, 0, 1) + d * 864e5).toISOString().slice(0, 10)},${100 + 60 * Math.sin(d / 3) + rnd()},${100 + 50 * rnd()},${100 + 50 * rnd()}`);
  const r = run(rows.join("\n"), { start: "2026-02-20" });
  assert.equal(r.verdict, "unreliable");
});

test("refuses short history, bad names, missing controls and bad dates", () => {
  const t = panelText();
  assert.match(run(t, { start: "2026-01-05" }).error, /before the start date/);
  assert.match(run(t, { start: "2026-03-30" }).error, /periods from the start date/);
  assert.match(run(t, { testUnits: ["Zed"] }).error, /Not found/);
  assert.match(run(t, { testUnits: ["A", "B", "C", "D", "E"] }).error, /nothing is left/);
  assert.match(run(t, { start: "soon" }).error, /YYYY-MM-DD/);
  assert.match(parseTable("date,A\n2026-01-01,1").error, /at least two more columns|header/);
});

test("gaps are dropped with a warning, and case of names does not matter", () => {
  const lines = panelText().split("\n");
  lines[10] = lines[10].split(",").slice(0, 3).join(",") + ",,,";
  const p = parseTable(lines.join("\n"));
  assert.ok(p.warnings.some((w) => /dropped|skipped/.test(w)));
  assert.equal(analyze(p, { testUnits: ["a"], start: "2026-03-02" }).error, undefined);
});

test("the built-in example finds roughly the +8% planted in it", () => {
  const p = parseTable(sampleText());
  const r = analyze(p, { testUnits: ["Austin", "Denver"], start: "2026-03-02", spend: 20000, marginPct: 35 });
  assert.ok(Math.abs(r.liftRel - 0.08) < 0.03, String(r.liftRel));
  assert.equal(r.verdict, "lift");
});

test("report CSV has one row per date plus a header", () => {
  const r = run(panelText({ lift: 0.1 }));
  const rows = reportCsv(r).trim().split("\n");
  assert.equal(rows.length, r.series.length + 1);
  assert.match(rows[0], /^date,period,actual/);
});
