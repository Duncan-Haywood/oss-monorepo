import test from "node:test";
import assert from "node:assert/strict";
import { parseJobs, plan, summarize, feasible, schedule, optimize, normalizeOptions, netOf, money, MAX_JOBS } from "./engine.mjs";

const mk = (rows) => parseJobs(rows.join("\n"));

// Tiny deterministic PRNG so the random cases are reproducible.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function randomQueue(r, n) {
  const jobs = [];
  for (let i = 0; i < n; i += 1) {
    jobs.push({
      name: `J${i}`,
      fee: Math.round(150 + r() * 1200),
      hours: Math.round((1 + r() * 14) * 2) / 2,
      due: 1 + Math.floor(r() * 8),
      cost: Math.round(r() * 120),
      note: "",
    });
  }
  return jobs;
}

// Reference: try every subset.
function bruteBest(jobs, o) {
  let best = { net: 0, hours: 0 };
  for (let mask = 0; mask < 1 << jobs.length; mask += 1) {
    const set = jobs.map((_, i) => i).filter((i) => mask & (1 << i));
    if (!feasible(set, jobs, o)) continue;
    const net = set.reduce((s, i) => s + netOf(jobs[i]), 0);
    if (net > best.net + 1e-9) best = { net, hours: set.reduce((s, i) => s + jobs[i].hours, 0) };
  }
  return best;
}

test("parseJobs reads rows, skips header/comments, and reports bad rows", () => {
  const r = mk(["name,fee,hours,due_day,direct_cost", "# note", "", "A,500,4.5,2,30,some note, more", "B,$1200,6,3,10"]);
  assert.equal(r.errors.length, 0);
  assert.equal(r.jobs.length, 2);
  assert.deepEqual(r.jobs[0], { name: "A", fee: 500, hours: 4.5, due: 2, cost: 30, note: "some note,more" });
  assert.equal(r.jobs[1].fee, 1200);
  const bad = mk(["A,500,0,2,30", "B,500,3,0,30", "C,500,3,1.5,30", "D,x,3,2,30", "E,500,3"]);
  assert.equal(bad.jobs.length, 0);
  assert.equal(bad.errors.length, 5);
  assert.match(bad.errors[0], /hours must be above zero/);
  assert.match(bad.errors[1], /whole business day/);
});

test("normalizeOptions validates", () => {
  assert.deepEqual(normalizeOptions({}), { hoursPerDay: 7, booked: 0, bookedDue: 1 });
  assert.throws(() => normalizeOptions({ hoursPerDay: 0 }), /hoursPerDay/);
  assert.throws(() => normalizeOptions({ hoursPerDay: 25 }), /hoursPerDay/);
  assert.throws(() => normalizeOptions({ booked: -1 }), /booked/);
  assert.throws(() => normalizeOptions({ bookedDue: 1.5 }), /bookedDue/);
  assert.throws(() => normalizeOptions({ bookedDue: 0 }), /bookedDue/);
});

test("feasible is the cumulative earliest-due-date test", () => {
  const jobs = mk(["A,100,6,1,0", "B,100,6,1,0", "C,100,8,2,0"]).jobs;
  const o = normalizeOptions({ hoursPerDay: 7 });
  assert.equal(feasible([0], jobs, o), true);
  assert.equal(feasible([0, 1], jobs, o), false); // 12h due by day 1, only 7
  assert.equal(feasible([0, 2], jobs, o), true); // 6h by day 1, 14h by day 2
  assert.equal(feasible([1, 2], jobs, o), true);
  assert.equal(feasible([0, 1, 2], jobs, o), false);
  const booked = normalizeOptions({ hoursPerDay: 7, booked: 2, bookedDue: 1 });
  assert.equal(feasible([0], jobs, booked), false); // 8h by day 1
  assert.equal(feasible([2], jobs, booked), true); // 10h by day 2
  const lateBooked = normalizeOptions({ hoursPerDay: 7, booked: 8, bookedDue: 2 });
  assert.equal(feasible([2], jobs, lateBooked), false); // 16h by day 2
  assert.equal(feasible([0], jobs, lateBooked), true); // 6h by 1, 14h by 2
});

test("optimize matches every-subset search on random queues, with and without booked hours", () => {
  const r = rng(20261002);
  for (let trial = 0; trial < 60; trial += 1) {
    const jobs = randomQueue(r, 3 + Math.floor(r() * 8));
    for (const raw of [{ hoursPerDay: 7 }, { hoursPerDay: 5, booked: 4, bookedDue: 2 }, { hoursPerDay: 8, booked: 10, bookedDue: 3 }]) {
      const o = normalizeOptions(raw);
      const got = optimize(jobs, o);
      const want = bruteBest(jobs, o);
      assert.ok(Math.abs(got.best.net - want.net) < 1e-6, `trial ${trial} ${JSON.stringify(raw)}: ${got.best.net} vs ${want.net}`);
      assert.ok(feasible(got.best.set, jobs, o));
      assert.ok(Math.abs(got.best.hours - want.hours) < 1e-6 || got.best.hours <= want.hours + 1e-6);
    }
  }
});

test("a declined file's break-even fee is exact", () => {
  const r = rng(77);
  let checked = 0;
  for (let trial = 0; trial < 40; trial += 1) {
    const jobs = randomQueue(r, 4 + Math.floor(r() * 6));
    const o = { hoursPerDay: 6 };
    const p = plan({ jobs }, o);
    for (const d of p.declined) {
      if (d.minFee === null) continue;
      checked += 1;
      const at = (fee) => plan({ jobs: jobs.map((j, i) => (i === d.index ? { ...j, fee } : j)) }, o);
      const below = at(d.minFee - 0.5);
      const above = at(d.minFee + 0.5);
      // Below the threshold the best total is unchanged and the file stays out (net-wise it adds nothing);
      assert.ok(Math.abs(below.net - p.net) < 1e-6, "below threshold the optimum does not move");
      // above it, the optimum rises by exactly the extra half dollar and the file is in.
      assert.ok(above.order.includes(d.index), `${d.name} should be accepted above its break-even fee`);
      assert.ok(Math.abs(above.net - (p.net + 0.5)) < 1e-6 || above.net > p.net);
    }
  }
  assert.ok(checked > 30, `only checked ${checked}`);
});

test("a file that cannot fit even alone is declined with no break-even fee", () => {
  const p = plan(mk(["Huge,5000,30,2,0", "Small,300,2,1,0"]), { hoursPerDay: 6 });
  assert.deepEqual(p.order, [1]);
  const d = p.declined[0];
  assert.equal(d.name, "Huge");
  assert.equal(d.minFee, null);
  assert.match(d.reason, /cannot be finished by day 2/);
});

test("a file paying less than its direct costs is never accepted and is priced above its cost", () => {
  const p = plan(mk(["Loss,200,2,3,260", "Fine,400,2,3,20"]), { hoursPerDay: 6 });
  assert.deepEqual(p.order, [1]);
  const d = p.declined[0];
  assert.match(d.reason, /less than its direct costs/);
  assert.ok(d.minFee >= 260 - 1e-9);
  assert.equal(money(d.minFee), "$260.00");
});

test("hours already booked displace new files and an overbooked day is reported", () => {
  const rows = ["A,500,6,1,0", "B,300,6,2,0"];
  const free = plan(mk(rows), { hoursPerDay: 6 });
  assert.equal(free.accepted, 2);
  const booked = plan(mk(rows), { hoursPerDay: 6, booked: 6, bookedDue: 1 });
  assert.equal(booked.accepted, 1);
  assert.deepEqual(booked.order, [1]);
  assert.equal(booked.schedule[0].booked, true);
  const over = plan(mk(rows), { hoursPerDay: 6, booked: 20, bookedDue: 1 });
  assert.equal(over.overbooked, true);
  assert.equal(over.accepted, 0);
  assert.match(summarize(over).text, /already booked/);
  assert.ok(over.findings.some((f) => f.rule === "overbooked"));
});

test("biggest-fee-first loses to the exact pair, and the plan is never worse than any rule", () => {
  // Biggest fee first grabs the 12-hour file and then cannot fit the two others.
  const jobs = mk(["Big,1000,12,2,0", "A,700,6,2,0", "B,700,6,2,0"]);
  const p = plan(jobs, { hoursPerDay: 6 });
  assert.equal(p.net, 1400);
  const big = p.baselines.find((b) => b.label === "Biggest fee first");
  assert.equal(big.net, 1000);
  for (const b of p.baselines) assert.ok(p.net >= b.net - 1e-9);
  // First come takes Big first as well; only best-per-hour finds the pair, so the uplift over the best rule is 0 here...
  assert.equal(p.upliftVsBest, 0);
});

test("random queues: the plan is never worse than any baseline and its schedule meets every due date", () => {
  const r = rng(5);
  for (let t = 0; t < 40; t += 1) {
    const jobs = randomQueue(r, 3 + Math.floor(r() * 10));
    const o = { hoursPerDay: 4 + Math.floor(r() * 5), booked: Math.floor(r() * 6), bookedDue: 1 + Math.floor(r() * 3) };
    const p = plan({ jobs }, o);
    for (const b of p.baselines) assert.ok(p.net >= b.net - 1e-9);
    if (!p.overbooked) for (const s of p.schedule) assert.ok(s.spare >= -1e-9, `${s.name} late`);
    for (const s of p.schedule) assert.ok(s.finishDay <= s.due || s.hours === 0, `${s.name} finishes day ${s.finishDay}, due ${s.due}`);
  }
});

test("schedule orders by due date and counts days from cumulative hours", () => {
  const jobs = mk(["Late,100,5,4,0", "Early,100,5,1,0", "Mid,100,6,3,0"]).jobs;
  const s = schedule([0, 1, 2], jobs, normalizeOptions({ hoursPerDay: 6 }));
  assert.deepEqual(s.map((x) => x.name), ["Early", "Mid", "Late"]);
  assert.deepEqual(s.map((x) => x.finishDay), [1, 2, 3]);
  assert.deepEqual(s.map((x) => x.startDay), [1, 1, 2]);
});

test("ties go to the plan that uses fewer hours, and an empty or all-losing queue yields nothing", () => {
  const tie = plan(mk(["A,500,8,1,0", "B,250,4,1,0", "C,250,4,1,0"]), { hoursPerDay: 8 });
  assert.equal(tie.net, 500);
  assert.equal(tie.hours, 8);
  const none = plan(mk(["Loss,100,2,2,300"]), { hoursPerDay: 8 });
  assert.equal(none.accepted, 0);
  assert.equal(summarize(none).status, "none");
  assert.equal(summarize(plan({ jobs: [] }, {})).text, "No assignments entered.");
});

test("spare-hours finding appears when the plan leaves a full day unused", () => {
  const p = plan(mk(["A,500,3,5,0"]), { hoursPerDay: 6 });
  assert.ok(p.findings.some((f) => f.rule === "spare"));
});

test("more than MAX_JOBS assignments is refused", () => {
  const jobs = Array.from({ length: MAX_JOBS + 1 }, (_, i) => ({ name: `J${i}`, fee: 100, hours: 1, due: 5, cost: 0, note: "" }));
  assert.throws(() => plan({ jobs }, {}), /at most 16/);
  const ok = plan({ jobs: jobs.slice(0, MAX_JOBS) }, { hoursPerDay: 24 });
  assert.equal(ok.accepted, MAX_JOBS);
});
