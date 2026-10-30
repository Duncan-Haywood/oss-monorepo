// Split out of page.test.mjs: node --test runs files in parallel but the tests
// in one file one after another, and each of these rebuilds the sample week
// many times.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

test("time-off page's table is what the engine returns for the sample cafe as weekends are granted one by one", async () => {
  const { parseStaff, parseShifts, buildRoster, sampleStaff, sampleShifts } = await import("./calc.mjs");
  const slots = parseShifts(sampleShifts()).slots;
  const html = page("how-to-handle-time-off-requests.html");
  const who = ["Ana", "Gus", "Dev", "Cleo", "Eli"];
  const rows = [[3, 216, 3622], [3, 216, 3624], [4, 218, 3656], [5, 210, 3522], [7, 192, 3252], [9, 174, 3001]];
  rows.forEach(([open, covered, pay], n) => {
    const text = sampleStaff().split("\n").map((l) => (who.slice(0, n).some((w) => l.startsWith(w + ",")) ? l + ", off: Sat-Sun" : l)).join("\n").replace("min hours, availability", "min hours, availability, off");
    const p = parseStaff(text);
    assert.deepEqual(p.errors, []);
    const r = buildRoster(p.staff, slots, { minRestHours: 10 });
    assert.equal(r.unfilled.length, open, `${n} open`);
    assert.equal(r.hours, covered, `${n} covered`);
    assert.equal(r.cost, pay, `${n} payroll`);
    // Not asserted: that more requests never cover more hours. The default search is a heuristic and sometimes leaves hours the exact
    // search finds (the base week covers 216 here, 220 under exact:true), so a smaller week can cover more than a larger one.
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
  for (const [c, e, open, covered, pay, hrs] of [[0, 0, 3, 216, 3622, 36], ["15", 0, 5, 200, 3382, 18], ["15", "14", 7, 184, 3168, 0], ["15 summer", "14 summer", 3, 216, 3632, 32]]) {
    const p = parseStaff(withAges(c, e));
    assert.deepEqual(p.errors, []);
    const r = buildRoster(p.staff, slots, {});
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
  for (const [line, ot, covered, pay] of [[30, 30, 216, 3890], [35, 13, 216, 3739], [40, 0, 216, 3622]]) {
    const r = buildRoster(staff, slots, { otAfter: line });
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
