// Split out of page.test.mjs: node --test runs files in parallel but the tests
// in one file one after another, and each of these rebuilds the sample week
// many times.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
// The guide pages quote the builder's default build, exact check on since 2026-11-12.
const proven = (r) => assert.ok(["optimal", "improved"].includes(r.optimality?.status), `not proven: ${r.optimality?.status}`);

test("time-off page's table is what the engine returns for the sample cafe as weekends are granted one by one", async () => {
  const { parseStaff, parseShifts, buildRoster, sampleStaff, sampleShifts } = await import("./calc.mjs");
  const slots = parseShifts(sampleShifts()).slots;
  const html = page("how-to-handle-time-off-requests.html");
  const who = ["Ana", "Gus", "Dev", "Cleo", "Eli"];
  const rows = [[5, 220, 3690], [5, 220, 3690], [5, 220, 3690], [6, 212, 3554], [8, 194, 3284], [10, 176, 3032]];
  rows.forEach(([open, covered, pay], n) => {
    const text = sampleStaff().split("\n").map((l) => (who.slice(0, n).some((w) => l.startsWith(w + ",")) ? l + ", off: Sat-Sun" : l)).join("\n").replace("min hours, availability", "min hours, availability, off");
    const p = parseStaff(text);
    assert.deepEqual(p.errors, []);
    const r = buildRoster(p.staff, slots, { minRestHours: 10 });
    proven(r);
    assert.equal(r.unfilled.length, open, `${n} open`);
    assert.equal(r.hours, covered, `${n} covered`);
    assert.equal(r.cost, pay, `${n} payroll`);
    // Each row is proven, so a granted request can never cover more hours than the row before it.
    if (n) assert.ok(r.hours <= rows[n - 1][1], `${n} covers more than ${n - 1}`);
    assert.ok(html.includes("$" + pay.toLocaleString("en-US")), `${pay} on page`);
  });
  assert.match(page("sitemap.xml"), /how-to-handle-time-off-requests\.html/);
  assert.match(page("index.html"), /how-to-handle-time-off-requests\.html/);
  assert.ok(html.includes("No warranty"));
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  for (const q of ld.mainEntity) assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
});

test("14-15 year old page's table is what the engine returns for the sample cafe", async () => {
  const { parseStaff, parseShifts, buildRoster, sampleStaff, sampleShifts } = await import("./calc.mjs");
  const slots = parseShifts(sampleShifts()).slots;
  const html = page("scheduling-14-and-15-year-olds.html");
  const cleo = "Cleo, 15, 30, 12, Mon-Fri 15-23; Sat-Sun 8-23", eli = "Eli, 14, 24, 8, Mon/Wed/Fri 16-23; Sat-Sun 8-23";
  const withAges = (c, e) => sampleStaff().replace(cleo, cleo + (c ? `, age: ${c}` : "")).replace(eli, eli + (e ? `, age: ${e}` : ""));
  for (const [c, e, open, covered, pay, hrs] of [[0, 0, 5, 220, 3690, 36], ["15", 0, 6, 202, 3420, 18], ["15", "14", 7, 184, 3168, 0], ["15 summer", "14 summer", 3, 216, 3632, 32]]) {
    const p = parseStaff(withAges(c, e));
    assert.deepEqual(p.errors, []);
    const r = buildRoster(p.staff, slots, {});
    proven(r);
    assert.equal(r.unfilled.length, open, "open");
    assert.equal(r.hours, covered, "covered");
    assert.equal(r.cost, pay, "payroll");
    assert.equal(r.people.filter((x) => x.name === "Cleo" || x.name === "Eli").reduce((a, x) => a + x.hours, 0), hrs, "teen hours");
    assert.ok(html.includes("$" + pay.toLocaleString("en-US")), `${pay} on page`);
  }
  assert.match(page("sitemap.xml"), /scheduling-14-and-15-year-olds\.html/);
  assert.match(page("index.html"), /scheduling-14-and-15-year-olds\.html/);
  assert.ok(html.includes("No warranty"));
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  for (const q of ld.mainEntity) assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
});

test("overtime page's table is what the engine returns for the sample cafe", async () => {
  const { parseStaff, parseShifts, buildRoster, sampleStaff, sampleShifts } = await import("./calc.mjs");
  const staff = parseStaff(sampleStaff()).staff, slots = parseShifts(sampleShifts()).slots;
  const html = page("how-to-reduce-overtime-in-a-schedule.html");
  for (const [line, ot, covered, pay] of [[30, 34, 220, 3992], [35, 15, 220, 3825], [40, 0, 220, 3690]]) {
    const r = buildRoster(staff, slots, { otAfter: line });
    proven(r);
    assert.equal(r.otHours, ot, `${line}h overtime hours`);
    assert.equal(r.hours, covered, `${line}h covered`);
    assert.equal(Math.round(r.cost), pay, `${line}h payroll`);
    assert.ok(html.includes("$" + pay.toLocaleString("en-US")), `${line}h row on page`);
  }
  assert.match(page("sitemap.xml"), /how-to-reduce-overtime-in-a-schedule\.html/);
  assert.match(page("index.html"), /how-to-reduce-overtime-in-a-schedule\.html/);
  assert.ok(html.includes("No warranty"));
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  for (const q of ld.mainEntity) assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
});
