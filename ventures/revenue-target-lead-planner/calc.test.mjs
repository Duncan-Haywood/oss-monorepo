import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRows, analyze, reportCsv, sampleText, money, pct } from "./calc.mjs";

const rows = (t) => parseRows(t).rows;
const make = (n, leads, p, val = 1000) => {
  const t = ["period,leads,won,revenue"];
  for (let i = 0; i < n; i++) { const w = Math.round(leads * p); t.push(`m${i + 1},${leads},${w},${w * val}`); }
  return t.join("\n");
};

test("parseRows reads headers in any order, quoted money, and skips impossible rows", () => {
  const p = parseRows('won,revenue,leads,month\n3,"$4,500",30,jan\n2,2000,25,feb\n9,100,5,bad\nx,1,1,bad2');
  assert.equal(p.rows.length, 2);
  assert.deepEqual(p.rows[0], { label: "jan", leads: 30, won: 3, revenue: 4500 });
  assert.match(p.warnings[0], /2 rows skipped/);
});

test("parseRows without a header: with and without a label column", () => {
  assert.deepEqual(parseRows("30,3,4500\n25,2,2000").rows[1], { label: "#2", leads: 25, won: 2, revenue: 2000 });
  assert.deepEqual(parseRows("jan,30,3,4500").rows[0], { label: "jan", leads: 30, won: 3, revenue: 4500 });
  assert.deepEqual(parseRows("30,3").rows[0].revenue, null);
  assert.ok(parseRows("").error);
  assert.ok(parseRows("a,b\nfoo,bar").error);
  assert.ok(parseRows("period,notes\njan,x").error);
});

test("refuses thin histories and says why", () => {
  assert.match(analyze(rows(make(4, 50, 0.2)), { target: 5000 }).error, /at least 6 periods/);
  assert.match(analyze(rows(make(8, 5, 0.2)), { target: 5000 }).error, /at least 60 leads/);
  assert.match(analyze(rows(make(8, 10, 0.1)), { target: 5000 }).error, /at least 10 deals/);
  assert.match(analyze(rows(make(8, 50, 0.2)), { target: 5000 }).error, /no variation/);
  assert.match(analyze(rows(parseRows(sampleText()).rows.map(() => "").join("") || sampleText())).error ?? "", /Enter the revenue/);
});

// Independent check: pooled conversion and average deal are plain arithmetic.
test("conversion and average deal are the pooled totals", () => {
  const t = "period,leads,won,revenue\na,50,5,5000\nb,60,9,9000\nc,40,4,4000\nd,55,6,6600\ne,45,7,7000\nf,70,8,8000";
  const r = analyze(rows(t), { target: 9000 });
  assert.equal(r.leads, 320);
  assert.equal(r.wins, 39);
  assert.ok(Math.abs(r.conversion - 39 / 320) < 1e-12);
  assert.ok(Math.abs(r.avgDeal - 39600 / 39) < 1e-9);
  assert.equal(r.plannedLeads, Math.round(320 / 6));
});

test("a steady 20% history: the simulated median matches leads x rate x deal", () => {
  const t = ["period,leads,won,revenue"];
  const leads = [80, 90, 100, 85, 95, 110, 70, 105];
  const won = [16, 19, 19, 17, 20, 21, 14, 22];
  leads.forEach((l, i) => t.push(`m${i},${l},${won[i]},${won[i] * 1000}`));
  const r = analyze(rows(t.join("\n")), { target: 15000, plannedLeads: 100 });
  const p = won.reduce((a, b) => a + b) / leads.reduce((a, b) => a + b);
  assert.ok(Math.abs(r.median - 100 * p * 1000) < 2500, `${r.median} vs ${100 * p * 1000}`);
  assert.ok(r.range80[0] < r.median && r.median < r.range80[1]);
});

test("more leads never lower the chance, and the lead counts are ordered", () => {
  const base = rows(sampleText());
  const a = analyze(base, { target: 12000, plannedLeads: 30 });
  const b = analyze(base, { target: 12000, plannedLeads: 120 });
  assert.ok(b.probHit >= a.probHit);
  assert.ok(a.leadsFor50 <= a.leadsFor80 && a.leadsFor80 <= a.leadsFor90);
  // Asking for that many leads really does reach the stated chance.
  const c = analyze(base, { target: 12000, plannedLeads: a.leadsFor80 });
  assert.ok(c.probHit >= 0.78, `${c.probHit}`);
});

test("a bigger target needs more leads", () => {
  const base = rows(sampleText());
  assert.ok(analyze(base, { target: 30000 }).leadsFor80 > analyze(base, { target: 10000 }).leadsFor80);
});

test("without a revenue column the plan is in deals won", () => {
  const t = ["period,leads,won"];
  [50, 60, 45, 70, 55, 65, 50, 60].forEach((l, i) => t.push(`m${i},${l},${Math.round(l * 0.2)}`));
  const r = analyze(rows(t.join("\n")), { target: 12, plannedLeads: 60 });
  assert.equal(r.metric, "wins");
  assert.equal(r.avgDeal, null);
  assert.ok(r.probHit > 0.3 && r.probHit < 0.9);
});

test("the same history always gives the same answer", () => {
  const base = rows(sampleText());
  assert.deepEqual(analyze(base, { target: 9000 }), analyze(base, { target: 9000 }));
});

test("results that swing a lot widen the plan's range", () => {
  const steady = ["period,leads,won,revenue"], wild = ["period,leads,won,revenue"];
  const sw = [10, 11, 9, 10, 12, 8, 10, 11], wl = [2, 22, 4, 20, 1, 24, 3, 18];
  sw.forEach((w, i) => { steady.push(`m${i},60,${w},${w * 1000}`); });
  wl.forEach((w, i) => { wild.push(`m${i},60,${w},${w * 1000}`); });
  const a = analyze(rows(steady.join("\n")), { target: 10000, plannedLeads: 60 });
  const b = analyze(rows(wild.join("\n")), { target: 10000, plannedLeads: 60 });
  assert.ok(b.dispersion > a.dispersion);
  assert.ok(b.range80[1] - b.range80[0] > a.range80[1] - a.range80[0]);
});

test("back-test rows exist for long histories and report hits", () => {
  const r = analyze(rows(sampleText()), { target: 9000 });
  assert.ok(r.backtest.length >= 2);
  for (const b of r.backtest) assert.ok(b.lo <= b.hi);
  assert.ok(r.backtestHits >= 0 && r.backtestHits <= r.backtest.length);
});

test("reportCsv and formatters", () => {
  const r = analyze(rows(sampleText()), { target: 9000 });
  assert.match(reportCsv(r), /leads_for_80pct,\d+/);
  assert.equal(money(1234.4), "$1,234");
  assert.equal(pct(0.1234, 0), "12%");
});
