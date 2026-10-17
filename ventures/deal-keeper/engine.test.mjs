import { test } from "node:test";
import assert from "node:assert/strict";
import * as E from "./engine.mjs";

const NOW = Date.UTC(2026, 9, 15, 12);
const D = E.DAY;

test("upsert validates, records stage moves and counts close-date slips", () => {
  const s = E.newState();
  assert.throws(() => E.upsertDeal(s, { id: "bad id" }, NOW), /id is required/);
  assert.throws(() => E.upsertDeal(s, { id: "a", stage: "nonsense" }, NOW), /stage must be one of/);
  assert.throws(() => E.upsertDeal(s, { id: "a", amount: -1 }, NOW), /amount/);
  E.upsertDeal(s, { id: "a", name: "Acme", amount: 1000, createdAt: NOW - 20 * D, closeDate: NOW + 10 * D }, NOW);
  E.upsertDeal(s, { id: "a", stage: "proposal", stageAt: NOW - 5 * D }, NOW);
  assert.deepEqual(s.deals.a.history.map((h) => h[0]), [0, 2]);
  E.upsertDeal(s, { id: "a", closeDate: NOW + 20 * D }, NOW); // later: a slip
  E.upsertDeal(s, { id: "a", closeDate: NOW + 30 * D }, NOW);
  E.upsertDeal(s, { id: "a", closeDate: NOW + 5 * D }, NOW); // earlier: not a slip
  assert.equal(s.deals.a.closeChanges, 2);
  E.upsertDeal(s, { id: "a", status: "won" }, NOW);
  assert.equal(s.deals.a.closedAt, NOW);
  E.upsertDeal(s, { id: "a", status: "open" }, NOW);
  assert.equal(s.deals.a.closedAt, null);
});

test("with no history the stage chances are the defaults and the label says so", () => {
  const s = E.newState(), m = E.train(s, NOW);
  assert.equal(m.mode, "prior"); assert.match(m.note, /generic defaults/);
  assert.deepEqual(m.stages.map((x) => Math.round(x.p * 100)), [10, 32, 53, 75]);
  assert.equal(m.validation, null);
});

test("learned stage chances are shrunk toward the prior and never decrease down the funnel", () => {
  const s = E.newState();
  // 3 deals reach proposal and all win: raw 100%, but shrinkage keeps it well under that.
  for (let i = 0; i < 3; i++) E.upsertDeal(s, { id: `w${i}`, stage: "proposal", status: "won", createdAt: NOW - 90 * D, closedAt: NOW - 30 * D }, NOW);
  const m = E.train(s, NOW), p = m.stages.map((x) => x.p);
  assert.ok(p[2] > 0.53 && p[2] < 0.8, String(p[2]));
  for (let i = 1; i < p.length; i++) assert.ok(p[i] >= p[i - 1]);
  assert.equal(m.mode, "prior");
});

test("open deals never leak into training", () => {
  const s = E.syntheticState(NOW);
  const before = E.train(s, NOW);
  for (const d of Object.values(s.deals)) if (d.status === "open") d.amount = 1e9;
  const open = Object.values(s.deals).filter((d) => d.status === "open");
  for (const d of open) { d.status = "open"; d.history = [[3, NOW - D]]; }
  const after = E.train(s, NOW);
  assert.deepEqual(after.stages.map((x) => x.p), before.stages.map((x) => x.p));
});

test("on data where stage matters the backtest beats the base rate; on pure noise it does not claim to", () => {
  const sig = E.train(E.syntheticState(NOW, { signal: true }), NOW), noise = E.train(E.syntheticState(NOW, { signal: false }), NOW);
  assert.equal(sig.mode, "learned");
  assert.ok(sig.validation.skill > 0.1, `signal skill ${sig.validation.skill}`);
  assert.ok(noise.validation.skill < 0.06, `noise skill ${noise.validation.skill}`);
  assert.ok(sig.validation.testDeals >= 10 && sig.validation.trainDeals >= 20);
});

test("the backtest trains only on deals closed before the cutoff", () => {
  const s = E.syntheticState(NOW), v = E.train(s, NOW).validation;
  const closedBefore = Object.values(s.deals).filter((d) => d.status !== "open" && d.closedAt <= v.cutoff).length;
  assert.equal(v.trainDeals, closedBefore);
});

test("the backtest is skipped without exact stage dates or enough deals", () => {
  const s = E.syntheticState(NOW);
  for (const d of Object.values(s.deals)) d.exact = false;
  assert.equal(E.train(s, NOW).validation, null);
  assert.equal(E.train(E.syntheticState(NOW, { closed: 12, open: 3 }), NOW).validation, null);
});

test("time in stage lowers the chance when long-stalled deals past that point usually lost", () => {
  const s = E.syntheticState(NOW), m = E.train(s, NOW);
  const mk = (id, days) => E.upsertDeal(s, { id, stage: "negotiation", stageAt: NOW - days * D, createdAt: NOW - (days + 5) * D, amount: 1000, nextStep: "x", closeDate: NOW + 5 * D }, NOW);
  const fresh = E.probability(s, m, mk("fresh", 3), NOW), stuck = E.probability(s, m, mk("stuck", 50), NOW);
  assert.ok(stuck.p < fresh.p, `${stuck.p} vs ${fresh.p}`);
  assert.ok(stuck.reasons.some((r) => /50 days in this stage/.test(r)));
});

test("flags catch stale, overdue, slipped, missing next step, missing amount, and say why", () => {
  const s = E.newState(), m = E.train(s, NOW);
  E.upsertDeal(s, { id: "x", stage: "qualified", createdAt: NOW - 60 * D, lastActivityAt: NOW - 40 * D, closeDate: NOW - 3 * D }, NOW);
  s.deals.x.closeChanges = 2;
  const keys = E.flags(s, m, s.deals.x, NOW).map((f) => f.key);
  for (const k of ["stale", "overdue", "slipped", "no-next-step", "no-amount"]) assert.ok(keys.includes(k), k);
  E.upsertDeal(s, { id: "ok", stage: "lead", amount: 10, createdAt: NOW - D, closeDate: NOW + 20 * D }, NOW);
  assert.deepEqual(E.flags(s, m, s.deals.ok, NOW), []);
  E.upsertDeal(s, { id: "ok", status: "lost" }, NOW);
  assert.deepEqual(E.flags(s, m, s.deals.ok, NOW), []);
});

test("the stale threshold comes from your won deals once there are five", () => {
  const m = E.train(E.syntheticState(NOW), NOW);
  assert.equal(m.staleFromData, true); assert.ok(m.staleDays >= 7);
  assert.equal(E.train(E.newState(), NOW).staleDays, 14);
});

test("pipeline puts the biggest flagged value first and forecast adds probability-weighted value", () => {
  const s = E.syntheticState(NOW), m = E.train(s, NOW), rows = E.pipeline(s, m, NOW);
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i - 1].atRisk >= rows[i].atRisk || rows[i].atRisk === 0 || rows[i - 1].atRisk === rows[i].atRisk);
  const f = E.forecast(s, m, NOW, { from: NOW - 10 * D, to: NOW + 120 * D });
  const manual = rows.filter((r) => r.closeDate != null && r.closeDate >= NOW - 11 * D && r.closeDate <= NOW + 120 * D).reduce((a, r) => a + r.weighted, 0);
  assert.ok(Math.abs(f.weighted - manual) < 1e-6);
  assert.ok(f.low <= f.weighted && f.weighted <= f.high && f.low >= 0);
});

test("forecast against a target reports the gap and coverage", () => {
  const s = E.newState(), m = E.train(s, NOW);
  E.upsertDeal(s, { id: "w", amount: 5000, stage: "negotiation", status: "won", createdAt: NOW - 40 * D, closedAt: NOW - 2 * D }, NOW);
  E.upsertDeal(s, { id: "o", amount: 10000, stage: "negotiation", createdAt: NOW - 20 * D, closeDate: NOW + 10 * D, nextStep: "sign" }, NOW);
  const f = E.forecast(s, E.train(s, NOW), NOW, { from: NOW - 30 * D, to: NOW + 30 * D, target: 20000 });
  assert.equal(f.wonSoFar, 5000); assert.equal(f.coverage, 10000 / 15000);
  assert.ok(Math.abs(f.gap - (15000 - f.weighted)) < 1e-6);
});

test("alerts fire once per deal and flag, and re-arm after the flag clears", () => {
  const s = E.newState(); E.upsertDeal(s, { id: "x", stage: "lead", createdAt: NOW - 60 * D, amount: 5 }, NOW);
  const m = E.train(s, NOW), a = E.newAlerts(s, m, NOW);
  assert.ok(a.some((x) => x.type === "deal.stale"));
  for (const x of a) s.alerted[x.key] = NOW;
  assert.deepEqual(E.newAlerts(s, m, NOW), []);
  E.addActivity(s, "x", NOW, NOW);
  assert.deepEqual(E.newAlerts(s, m, NOW), []);
  assert.deepEqual(Object.keys(s.alerted), []);
  assert.ok(E.newAlerts(s, m, NOW + 40 * D).some((x) => x.type === "deal.stale"));
});

test("CSV import: headers, quoted names, bad rows are reported, won deals count as having reached the last stage", () => {
  const csv = [
    "id,name,stage,amount,status,created,closed,close_date,last_activity,next_step,stage_since",
    'a1,"Acme, Inc",proposal,"$12,000",won,2026-06-01,2026-07-10,,,,',
    "a2,Globex,qualified,4000,lost,2026-06-05,2026-06-30,,,,",
    "a3,Initech,qualified,8000,open,2026-09-01,,2026-11-01,2026-10-10,send quote,2026-10-01",
    "bad,,,,,nonsense",
    "",
  ].join("\n");
  const { state, errors } = E.parseCsv(csv);
  assert.equal(errors.length, 1); assert.match(errors[0], /Line 4/);
  assert.equal(state.deals.a1.amount, 12000); assert.equal(state.deals.a1.name, "Acme, Inc");
  const m = E.train(state, NOW);
  assert.equal(m.stages[3].wins, 1); // the won deal went through every stage
  assert.equal(m.stages[1].n, 2); // the lost deal reached qualified
  assert.equal(state.deals.a3.exact, true); // has stage_since
  assert.equal(state.deals.a1.exact, false); // no stage history, so no dwell or backtest
});

test("CSV stage_history marks a deal exact so the dwell features and backtest can use it", () => {
  const { state, errors } = E.parseCsv("id,stage,created,status,closed,stage_history\nz,negotiation,2026-01-01,won,2026-02-20,lead@2026-01-01;qualified@2026-01-10;negotiation@2026-02-01");
  assert.deepEqual(errors, []);
  assert.equal(state.deals.z.exact, true); assert.deepEqual(state.deals.z.history.map((h) => h[0]), [0, 1, 3]);
  assert.match(E.parseCsv("id,stage,created,stage_history\nz,lead,2026-01-01,oops@x").errors[0], /not stage@date/);
});
