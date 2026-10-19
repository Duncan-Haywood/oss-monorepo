import { test } from "node:test";
import assert from "node:assert/strict";
import { priceJob } from "./calc.mjs";
import { closeoutJob, trackRecord } from "./closeout.mjs";

const inputs = {
  labor: [{ hours: 40, rate: 30 }], burdenPct: 25, materials: [{ cost: 1000 }], wastePct: 10,
  subs: 0, equipment: 100, travelMiles: 0, mileRate: 0.7, contingencyPct: 5, overheadPct: 15, marginPct: 20,
};
const bid = { ...priceJob(inputs), burdenPct: 25, overheadPct: 15 };

test("a job that lands exactly on the bid (no contingency spent) beats target by the contingency", () => {
  const c = closeoutJob(bid, { hours: 40, materials: bid.materialCost, subs: 0, equipment: 100 });
  assert.equal(c.laborHoursOverPct, 0);
  assert.equal(c.directOverPct, 0);
  assert.ok(c.marginPct > bid.marginPct);
  assert.equal(c.coveredCash, true);
});

test("labor overrun cuts the margin and shows the hours over", () => {
  const c = closeoutJob(bid, { hours: 60, materials: 1100, subs: 0, equipment: 100 });
  assert.equal(c.laborHoursOverPct, 50);
  assert.ok(c.marginPct < bid.marginPct);
  assert.ok(c.profitVsBid < 0);
  assert.equal(c.profitPerLaborHour, round(c.profit / 60));
});

test("revenue can differ from the bid (a discount or a change order)", () => {
  const same = closeoutJob(bid, { hours: 40, materials: 1100, subs: 0, equipment: 100 });
  const disc = closeoutJob(bid, { hours: 40, materials: 1100, subs: 0, equipment: 100, revenue: bid.price - 500 });
  assert.equal(round(same.profit - disc.profit), 500);
});

test("rejects bad input", () => {
  assert.throws(() => closeoutJob(bid, { hours: -1, materials: 0, subs: 0, equipment: 0 }), /zero or more/);
  assert.throws(() => closeoutJob(bid, { hours: 1, materials: 0, subs: 0, equipment: 0, revenue: 0 }), /above zero/);
  assert.throws(() => closeoutJob({ hours: 0 }, { hours: 1 }), /labor hours/);
});

function job(overHours, overDirect) {
  const c = closeoutJob(bid, { hours: 40 * (1 + overHours), materials: 1100, subs: 0, equipment: 100 * (1 + overDirect), });
  return {
    bidDirect: bid.direct, bidContingencyPct: 5, bidLaborHours: 40, actualHours: 40 * (1 + overHours), actualDirect: c.direct,
    marginPct: c.marginPct, targetMarginPct: 20, profit: c.profit, revenue: c.revenue,
  };
}

test("track record needs three jobs before it advises", () => {
  assert.equal(trackRecord([job(0.2, 0)]).ready, false);
  assert.equal(trackRecord([]).jobs, 0);
  const t = trackRecord([job(0.2, 0), job(0.3, 0), job(0.1, 0)]);
  assert.equal(t.ready, true);
  assert.equal(t.jobs, 3);
  assert.equal(t.laborOverPct, 20);
});

test("suggests contingency that covers the typical overrun and reports the gap", () => {
  const t = trackRecord([job(0.4, 0), job(0.5, 0), job(0.3, 0)]);
  assert.ok(t.directOverPct > 0);
  assert.equal(t.suggestedContingencyPct, Math.ceil(t.directOverPct * 2) / 2);
  assert.equal(t.contingencyShortfallPts, round(Math.max(0, t.suggestedContingencyPct - 5)));
  assert.ok(t.realizedMarginPct < t.targetMarginPct);
  assert.ok(t.underTarget >= 1);
});

test("a run of jobs that came in under budget suggests no extra contingency", () => {
  const t = trackRecord([job(-0.2, 0), job(-0.1, 0), job(-0.3, 0)]);
  assert.equal(t.suggestedContingencyPct, 0);
  assert.equal(t.contingencyShortfallPts, 0);
});

function round(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }
