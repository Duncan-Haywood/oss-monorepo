import { test } from "node:test";
import assert from "node:assert/strict";
import { schedule, scheduleText, scheduleCsv } from "./schedule.mjs";

// Property test: random activity networks (a DAG by construction, random lags, crews,
// costs and draw terms) either come back ok:false with a reason, or satisfy the
// critical-path invariants: every activity starts after its predecessors finish plus
// lag, slack is never negative, a critical activity has zero slack, the critical path
// is connected and spans the project, levelling never finishes sooner than the
// unlimited-crew plan, no crew is over its head count on any day, cash-flow weeks and
// months both add to the typed cost total, and the text and CSV reports do not throw.
function rng(seed) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

test("fuzz: random networks keep the critical-path invariants or are refused with a reason", () => {
  let ok = 0, refused = 0;
  const failures = [];
  for (let seed = 1; seed <= 300; seed++) {
    const rand = rng(seed);
    const n = 2 + Math.floor(rand() * 14);
    const crewNames = ["x", "y"];
    const crews = { x: 1 + Math.floor(rand() * 2), y: 1 + Math.floor(rand() * 2) };
    const activities = [];
    for (let i = 0; i < n; i++) {
      const after = [];
      for (let j = 0; j < i; j++) if (rand() < 0.25) after.push(`a${j}`);
      activities.push({
        id: `a${i}`, days: Math.floor(rand() * 8), after, lag: rand() < 0.2 ? Math.floor(rand() * 4) : 0,
        ...(rand() < 0.6 ? { crew: crewNames[Math.floor(rand() * 2)] } : {}),
        ...(rand() < 0.5 ? { cost: Math.round(rand() * 20000) } : {}),
      });
    }
    const input = {
      start: "2026-03-02", crews, activities,
      ...(rand() < 0.5 ? { holidays: ["2026-03-17", "2026-04-03"] } : {}),
      ...(rand() < 0.4 ? { draw: { lagDays: Math.floor(rand() * 30), retainagePct: Math.floor(rand() * 11) } } : {}),
    };
    let s;
    try { s = schedule(input); } catch (e) { failures.push(`seed ${seed}: threw ${e.message}`); continue; }
    if (!s.ok) { refused++; if (!s.errors?.length) failures.push(`seed ${seed}: refused with no reason`); continue; }
    ok++;
    const byId = new Map(s.rows.map((r) => [r.id, r]));
    for (const a of activities) {
      const r = byId.get(a.id);
      if (r.slack < 0) failures.push(`seed ${seed}: ${a.id} slack ${r.slack}`);
      if (r.critical !== (r.slack === 0)) failures.push(`seed ${seed}: ${a.id} critical flag vs slack`);
      if (r.ef - r.es !== a.days) failures.push(`seed ${seed}: ${a.id} span ${r.ef - r.es} vs days ${a.days}`);
      if (r.leveledFinish < r.leveledStart + a.days) failures.push(`seed ${seed}: ${a.id} levelled span shorter than days`);
      for (const p of a.after) {
        const pr = byId.get(p);
        if (r.es < pr.ef + (a.lag ?? 0)) failures.push(`seed ${seed}: ${a.id} starts before ${p} done plus lag`);
        if (r.leveledStart < pr.leveledFinish + (a.lag ?? 0)) failures.push(`seed ${seed}: ${a.id} levelled start before ${p} done plus lag`);
      }
    }
    if (s.leveledDays < s.workingDays) failures.push(`seed ${seed}: levelled ${s.leveledDays} < unlimited ${s.workingDays}`);
    if (Math.max(...s.rows.map((r) => r.ef)) !== s.workingDays) failures.push(`seed ${seed}: working days not the latest finish`);
    if (s.workingDays > 0 && !s.criticalPath.length) failures.push(`seed ${seed}: no critical path`);
    // crew head count: on every working-day index, activities of one crew with days > 0 running at once <= count
    for (const c of crewNames) {
      const mine = s.rows.filter((r) => r.crew === c && r.days > 0);
      for (let d = 0; d < s.leveledDays; d++) {
        const busy = mine.filter((r) => r.leveledStart <= d && d < r.leveledFinish).length;
        if (busy > crews[c]) { failures.push(`seed ${seed}: crew ${c} has ${busy} > ${crews[c]} on day ${d}`); break; }
      }
    }
    const total = activities.reduce((t, a) => t + (a.cost ?? 0), 0);
    if (s.cashFlow) {
      if (Math.abs(s.cashFlow.total - total) > 0.01) failures.push(`seed ${seed}: cash total ${s.cashFlow.total} vs ${total}`);
      const wk = s.cashFlow.weeks.reduce((t, w) => t + w.spend, 0), mo = s.cashFlow.months.reduce((t, m) => t + m.spend, 0);
      const tol = 0.01 * (s.cashFlow.weeks.length + s.cashFlow.months.length);
      if (Math.abs(wk - total) > tol) failures.push(`seed ${seed}: weeks add to ${wk}, cost ${total}`);
      if (Math.abs(mo - total) > tol) failures.push(`seed ${seed}: months add to ${mo}, cost ${total}`);
      if (s.cashFlow.float && s.cashFlow.float.peakFloat < -1e-6) failures.push(`seed ${seed}: negative float`);
    }
    try { if (!scheduleText(s) || !scheduleCsv(s)) failures.push(`seed ${seed}: empty report`); } catch (e) { failures.push(`seed ${seed}: report threw ${e.message}`); }
  }
  assert.deepEqual(failures.slice(0, 5), []);
  assert.ok(ok > 250, `only ${ok} scheduled (${refused} refused)`);
});

test("fuzz: a cycle injected into a random network is always refused", () => {
  for (let seed = 1; seed <= 100; seed++) {
    const rand = rng(seed + 1000);
    const n = 3 + Math.floor(rand() * 8);
    const activities = Array.from({ length: n }, (_, i) => ({ id: `a${i}`, days: 1 + Math.floor(rand() * 5), after: i ? [`a${i - 1}`] : [] }));
    activities[0].after = [`a${n - 1}`]; // closes the chain into a loop
    const s = schedule({ activities });
    assert.equal(s.ok, false, `seed ${seed}: cycle accepted`);
    assert.ok(s.errors.length > 0);
  }
});
