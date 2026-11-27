import { test } from "node:test";
import assert from "node:assert/strict";
import { schedule, sampleSchedule } from "./schedule.mjs";
import { procurement, procurementText, procurementCsv } from "./procurement.mjs";

// Property test on the invented sample schedule: random order lists (some
// hostile: fractional or huge lead times, odd types, formula text) are
// refused with a reason or dated consistently.
function rng(seed) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (rand, xs) => xs[Math.floor(rand() * xs.length)];
const s = schedule(sampleSchedule());
const ids = s.rows.map((r) => r.id);
const day = (d) => Date.parse(d + "T00:00:00Z") / 86400000;
const iso = (n) => new Date(n * 86400000).toISOString().slice(0, 10);

test("fuzz: random order lists are dated consistently or refused with a reason", () => {
  const failures = [];
  let ok = 0, refused = 0;
  for (let seed = 1; seed <= 400; seed++) {
    const rand = rng(seed);
    const orders = [];
    const n = 1 + Math.floor(rand() * 5);
    for (let i = 0; i < n; i++) {
      const o = { item: pick(rand, ["Trusses", "=SUM(A1)", "a,\"b\"", 7, undefined]), for: rand() < 0.04 ? pick(rand, ["nope", undefined, "__proto__"]) : pick(rand, ids), leadDays: rand() < 0.05 ? pick(rand, [-1, NaN, "9", 4000, null]) : pick(rand, [0, 1, 6.5, 14, 42, 90]) };
      if (rand() < 0.5) o.bufferDays = rand() < 0.05 ? pick(rand, [-2, 400, "x"]) : pick(rand, [0, 2.2, 5, 10]);
      if (rand() < 0.4) o.cost = pick(rand, [0, 100, 9000.5]);
      if (rand() < 0.3) o.supplier = pick(rand, ["Acme", "", 5]);
      orders.push(o);
    }
    const today = rand() < 0.7 ? iso(day(s.rows[4].startDate) + Math.floor(rand() * 120) - 100) : undefined;
    let p;
    try { p = procurement(s, orders, today); } catch (e) { failures.push(`seed ${seed}: threw ${e.message}`); continue; }
    if (!p.ok) { refused++; if (!p.errors?.length) failures.push(`seed ${seed}: refused with no reason`); continue; }
    ok++;
    const bad = [];
    if (p.rows.length !== orders.length) bad.push("row count");
    for (let i = 0; i < p.rows.length; i++) {
      const r = p.rows[i];
      const gap = day(r.needDate) - day(r.orderBy);
      const want = Math.ceil(r.leadDays) + Math.ceil(r.bufferDays);
      if (gap < want || gap > want + 2) bad.push(`${r.item}: gap ${gap} vs ${want}`);
      const w = new Date(r.orderBy + "T00:00:00Z").getUTCDay();
      if (w === 0 || w === 6) bad.push(`${r.item}: order-by on a weekend`);
      if (i && p.rows[i - 1].orderBy > r.orderBy) bad.push("not sorted");
      if (today) {
        const late = day(r.orderBy) < day(today);
        if ((r.status === "late") !== late) bad.push(`${r.item}: status`);
        if (late && r.earliestStart !== iso(day(today) + Math.ceil(r.leadDays))) bad.push(`${r.item}: earliestStart`);
        if (r.daysLate < 0) bad.push("negative daysLate");
      } else if (r.status !== "open" || r.daysLate !== 0) bad.push("judged late without today");
    }
    if (p.lateCount !== p.rows.filter((r) => r.status === "late").length) bad.push("lateCount");
    if (p.totalCost != null && !Number.isFinite(p.totalCost)) bad.push("totalCost");
    try {
      const txt = procurementText(p).join("\n"), csv = procurementCsv(p);
      if (/NaN|undefined/.test(txt)) bad.push("NaN/undefined in text");
      if (csv.split("\n").length < p.rows.length + 1) bad.push("csv rows");
    } catch (e) { bad.push(`render threw ${e.message}`); }
    if (bad.length) failures.push(`seed ${seed}: ${bad.slice(0, 3).join("; ")}`);
  }
  assert.deepEqual(failures.slice(0, 5), []);
  assert.ok(ok > 100 && refused > 5, `ok ${ok}, refused ${refused}`);
});
