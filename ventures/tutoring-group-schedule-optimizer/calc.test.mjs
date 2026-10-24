import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSlots, parseStudents, analyze, search, reportCsv, sampleText, money, EXACT_LIMIT } from "./calc.mjs";

const sample = () => {
  const t = sampleText();
  return { slots: parseSlots(t.slots).slots, students: parseStudents(t.students).students };
};

function rng(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Independent oracle: try every way of putting each student in one of their
// slots or nowhere, keep only plans where every used slot meets its minimum
// and capacity, and take the most profitable.
function brute(slots, students) {
  const idx = new Map(slots.map((s, i) => [s.name.toLowerCase(), i]));
  const opts = students.map((s) => [-1, ...s.avail.map((a) => idx.get(a.toLowerCase()))]);
  let best = 0;
  const load = slots.map(() => 0);
  (function go(i, rev) {
    if (i === students.length) {
      let cost = 0;
      for (let k = 0; k < slots.length; k++) {
        if (load[k] > 0) { if (load[k] < slots[k].min) return; cost += slots[k].cost; }
      }
      best = Math.max(best, rev - cost);
      return;
    }
    for (const o of opts[i]) {
      if (o >= 0 && load[o] >= slots[o].capacity) continue;
      if (o >= 0) load[o]++;
      go(i + 1, rev + (o >= 0 ? students[i].price : 0));
      if (o >= 0) load[o]--;
    }
  })(0, 0);
  return best;
}

function randomInstance(seed, nSlots, nStu) {
  const r = rng(seed);
  const slots = Array.from({ length: nSlots }, (_, i) => {
    const capacity = 1 + Math.floor(r() * 4);
    return { name: `S${i}`, capacity, min: 1 + Math.floor(r() * capacity), cost: 10 + Math.floor(r() * 40) };
  });
  const students = Array.from({ length: nStu }, (_, i) => {
    const avail = slots.filter(() => r() < 0.5).map((s) => s.name);
    return { name: `P${i}`, price: 8 + Math.floor(r() * 30), avail: avail.length ? avail : [slots[0].name] };
  });
  return { slots, students };
}

test("matches an exhaustive oracle on 60 random small instances", () => {
  for (let seed = 1; seed <= 60; seed++) {
    const { slots, students } = randomInstance(seed, 2 + (seed % 3), 4 + (seed % 5));
    const r = analyze(slots, students);
    assert.ok(Math.abs(r.profit - brute(slots, students)) < 1e-6, `seed ${seed}: ${r.profit} vs ${brute(slots, students)}`);
  }
});

test("the plan it reports is a valid seating that adds up to its profit", () => {
  for (let seed = 100; seed < 130; seed++) {
    const { slots, students } = randomInstance(seed, 5, 14);
    const r = analyze(slots, students);
    const used = new Map();
    let rev = 0;
    for (const a of r.assignments) {
      if (!a.slot) continue;
      const st = students.find((s) => s.name === a.name);
      assert.ok(st.avail.includes(a.slot), "student seated in a slot they cannot attend");
      used.set(a.slot, (used.get(a.slot) || 0) + 1);
      rev += a.price;
    }
    let cost = 0;
    for (const s of slots) {
      const n = used.get(s.name) || 0;
      assert.ok(n <= s.capacity);
      if (n) { assert.ok(n >= s.min, "open slot under its minimum"); cost += s.cost; }
    }
    assert.ok(Math.abs(rev - cost - r.profit) < 1e-6);
  }
});

test("seeded local search stays within 2% of the exact answer on 12-slot instances", () => {
  for (let seed = 200; seed < 206; seed++) {
    const { slots, students } = randomInstance(seed, 12, 40);
    const exact = search(slots, students, { exactLimit: 12 });
    const local = search(slots, students, { exactLimit: 0 });
    const e = exact.evalMask(exact.best).profit, l = local.evalMask(local.best).profit;
    assert.ok(l <= e + 1e-6);
    assert.ok(l >= e - 0.02 * Math.abs(e) - 1e-6, `seed ${seed}: local ${l} exact ${e}`);
  }
});

test("a slot nobody can fill to its minimum is closed", () => {
  const slots = [{ name: "A", capacity: 5, min: 3, cost: 20 }, { name: "B", capacity: 5, min: 3, cost: 20 }];
  const students = ["a", "b", "c"].map((n) => ({ name: n, price: 20, avail: ["A", "B"] })).concat([{ name: "d", price: 20, avail: ["B"] }]);
  const r = analyze(slots, students);
  assert.equal(r.opened, 1);
  assert.equal(r.placed, 4);
  assert.equal(r.profit, 80 - 20);
});

test("a student is moved so a minimum can be met", () => {
  // x fits A or B, y only A, z only B (min 2 each). Both run only if x is split... 3 students cannot fill two slots of 2.
  const slots = [{ name: "A", capacity: 2, min: 2, cost: 5 }, { name: "B", capacity: 2, min: 2, cost: 5 }];
  const students = [{ name: "x", price: 10, avail: ["A", "B"] }, { name: "y", price: 10, avail: ["A"] }, { name: "z", price: 10, avail: ["B"] }, { name: "w", price: 10, avail: ["B"] }];
  const r = analyze(slots, students);
  assert.equal(r.opened, 2);
  assert.equal(r.placed, 4);
  assert.equal(r.assignments.find((a) => a.name === "x").slot, "A");
});

test("unplaced students get a reason", () => {
  const { slots, students } = sample();
  const r = analyze(slots, students);
  for (const u of r.unplaced) assert.ok(u.reason.length > 5);
  assert.equal(r.placed + r.unplaced.length, r.studentsTotal);
});

test("the sample is exact, deterministic, and beats running every slot", () => {
  const { slots, students } = sample();
  assert.ok(slots.length <= EXACT_LIMIT);
  const a = analyze(slots, students), b = analyze(slots, students);
  assert.equal(a.exact, true);
  assert.deepEqual(a.rows, b.rows);
  assert.ok(a.gainVsAll > 0);
});

test("more than the exact limit warns that the plan is not proven best", () => {
  const { slots, students } = randomInstance(9, EXACT_LIMIT + 2, 30);
  const r = analyze(slots, students);
  assert.equal(r.exact, false);
  assert.ok(r.warnings.some((w) => /not proven best/.test(w)));
});

test("parsers: headers, tabs, repeated columns for slots, and bad rows", () => {
  const s = parseSlots("session\tseats\tmin\tcost\nMon 4pm\t6\t3\t40\nMon 4pm\t6\t3\t40\nBad,0,1,5");
  assert.equal(s.slots.length, 1);
  assert.match(s.warnings[0], /2 slot row/);
  const p = parseStudents("name,price,slots\nAnn,25,Mon 4pm,Tue 4pm\nBob,x,Mon 4pm\nCy,30,Wed 4pm | Thu 4pm");
  assert.deepEqual(p.students[0].avail, ["Mon 4pm", "Tue 4pm"]);
  assert.deepEqual(p.students[1].avail, ["Wed 4pm", "Thu 4pm"]);
  assert.match(p.warnings[0], /1 student row/);
  assert.ok(parseSlots("").error);
  assert.ok(parseStudents("").error);
});

test("default minimum applies when the column is missing; unknown availability is reported", () => {
  const s = parseSlots("slot,capacity,cost\nA,4,10", { min: 2 });
  assert.equal(s.slots[0].min, 2);
  const students = [1, 2, 3, 4].map((i) => ({ name: `s${i}`, price: 10, avail: ["A", "Zed"] }));
  const r = analyze(s.slots, students);
  assert.ok(r.warnings.some((w) => /Zed/.test(w)));
});

test("refuses fewer than 4 students; says so when nothing is profitable", () => {
  assert.ok(analyze([{ name: "A", capacity: 3, min: 1, cost: 5 }], [{ name: "a", price: 5, avail: ["A"] }]).error);
  const r = analyze([{ name: "A", capacity: 5, min: 1, cost: 500 }], [1, 2, 3, 4].map((i) => ({ name: `s${i}`, price: 10, avail: ["A"] })));
  assert.equal(r.profit, 0);
  assert.ok(r.warnings.some((w) => /No schedule earns a profit/.test(w)));
});

test("csv export lists slots and seats, escaping commas", () => {
  const { slots, students } = sample();
  const csv = reportCsv(analyze(slots, students));
  assert.match(csv, /^slot,decision,students/);
  assert.match(csv, /student,price,slot/);
  assert.equal(money(-1234.4), "-$1,234");
});
