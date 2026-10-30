// Split out of page.test.mjs: node --test runs files in parallel but the tests
// in one file one after another, and each of these rebuilds the sample week
// many times.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

test("limits page's tables are what the engine returns for the sample cafe, FAQ matches, linked", async () => {
  const { parseStaff, parseShifts, buildRoster, sampleStaff, sampleShifts } = await import("./calc.mjs");
  const staff = parseStaff(sampleStaff()).staff, slots = parseShifts(sampleShifts()).slots;
  const html = page("days-in-a-row-and-daily-hour-limits.html");
  const cases = [[{}, 3, 216, 3622], [{ maxDailyHours: 12 }, 3, 216, 3622], [{ maxDailyHours: 10 }, 3, 216, 3622], [{ maxDailyHours: 9 }, 4, 209, 3505],
    [{ maxDailyHours: 8 }, 4, 209, 3505], [{ maxDailyHours: 6 }, 27, 15, 261], [{ maxConsecDays: 5 }, 4, 218, 3658], [{ maxConsecDays: 4 }, 5, 220, 3690], [{ maxConsecDays: 3 }, 7, 204, 3402]];
  for (const [o, open, covered, pay] of cases) {
    const r = buildRoster(staff, slots, o);
    assert.equal(r.unfilled.length, open, JSON.stringify(o));
    assert.equal(r.hours, covered, JSON.stringify(o));
    assert.equal(r.cost, pay, JSON.stringify(o));
    assert.match(html, new RegExp(`<td class="n">${open}</td><td class="n">${covered}</td><td class="n">\\$${pay.toLocaleString("en-US")}</td>`));
  }
  assert.match(page("sitemap.xml"), /days-in-a-row-and-daily-hour-limits\.html/);
  assert.match(page("index.html"), /days-in-a-row-and-daily-hour-limits\.html/);
  assert.match(page("llms.txt"), /days-in-a-row-and-daily-hour-limits\.html/);
  assert.ok(html.includes("No warranty"));
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  for (const q of ld.mainEntity) assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
});

test("rotation page's eight-week table is what the engine returns for six identical staff", async () => {
  const { sampleShifts, planWeeks, planFairness } = await import("./calc.mjs");
  const staff = ["name, wage, max hours, min hours, availability", ..."Ana Ben Cleo Dev Eli Fay".split(" ").map((n) => `${n}, 15, 40, 0, any`)].join("\n");
  const html = page("how-to-rotate-closing-and-weekend-shifts-fairly.html");
  for (const [t, most, least, gap] of [[0, 37, 34, 3], [10, 37, 35, 2], [30, 37, 35, 2]]) {
    const p = planWeeks(staff, sampleShifts(), { weeks: 8, weekStart: "2026-11-02", toughBalance: t });
    const f = planFairness(p);
    assert.equal(f.rows[0].tough, most, `${t} most`);
    assert.equal(f.rows[f.rows.length - 1].tough, least, `${t} least`);
    assert.equal(f.spread, gap, `${t} gap`);
    assert.equal(p.totalCost, 28200, `${t} payroll`);
    assert.equal(p.totalOpenHours, 0, `${t} open hours`);
  }
  assert.ok(html.includes("$28,200"));
  assert.match(page("sitemap.xml"), /how-to-rotate-closing-and-weekend-shifts-fairly\.html/);
  assert.match(page("index.html"), /how-to-rotate-closing-and-weekend-shifts-fairly\.html/);
  assert.ok(html.includes("No warranty"));
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  for (const q of ld.mainEntity) assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
});

test("salon page numbers come from the builder", async () => {
  const { parseStaff, parseShifts, buildRoster } = await import("./calc.mjs");
  const staff = parseStaff("Mia, 22, 32, 16, Tue-Sat 9-19\nJo, 20, 40, 24, Mon-Fri 9-18; Sat off\nPriya, 24, 30, 0, Wed-Sun 10-20\nLeo, 18, 20, 0, Thu-Sat 12-20; Sun 10-16").staff;
  const slots = parseShifts("Tue-Fri, 9, 14, 1, Morning chair\nTue-Fri, 14, 19, 2, Afternoon chairs\nSat, 9, 18, 3, Saturday full\nSun, 10, 16, 1, Sunday").slots;
  const r = buildRoster(staff, slots, {});
  const html = page("salon-staff-schedule.html");
  assert.equal(r.cost, 1466);
  assert.ok(html.includes("13 of 16 chair-shifts are covered for $1,466"));
  assert.match(page("sitemap.xml"), /salon-staff-schedule\.html/);
  assert.match(page("index.html"), /salon-staff-schedule\.html/);
  assert.ok(html.includes("No warranty"));
});

test("daycare page numbers come from the builder", async () => {
  const { parseStaff, parseShifts, buildRoster } = await import("./calc.mjs");
  const staff = parseStaff("Dana, 19, 40, 30, Mon-Fri 7-18\nEli, 17, 35, 20, Mon-Fri 7-18\nFran, 18, 30, 0, Mon-Thu 7-18\nGabe, 16, 25, 0, Mon-Fri 12-18\nHana, 17, 20, 0, Tue-Fri 7-13").staff;
  const slots = parseShifts("Mon-Fri, 7, 9, 1, Early open\nMon-Fri, 9, 15, 3, Core hours\nMon-Fri, 15, 18, 2, Close and pickup").slots;
  const html = page("daycare-staff-schedule.html");
  const r = buildRoster(staff, slots, {});
  assert.equal(r.cost, 1888);
  assert.ok(html.includes("23 of 30 adult-shifts are covered for $1,888"));
  const r0 = buildRoster(staff, slots, { minRestHours: 0 });
  assert.equal(r0.cost, 2195);
  assert.ok(html.includes("covers 29 of 30 for $2,195"));
  assert.match(page("sitemap.xml"), /daycare-staff-schedule\.html/);
  assert.match(page("index.html"), /daycare-staff-schedule\.html/);
  assert.ok(html.includes("No warranty"));
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  for (const q of ld.mainEntity) assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
});
