// Split out of page.test.mjs: node --test runs files in parallel but the tests
// in one file one after another, and each of these rebuilds the sample week
// many times.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

test("posted-schedule page's table is what eval/callout-churn-bench.mjs returns for the sample cafe", async () => {
  const { run } = await import("./eval/callout-churn-bench.mjs");
  const html = page("schedule-change-after-posting.html");
  const r = run();
  assert.equal(r.postedCost, 3622);
  assert.equal(r.postedOpen, 3);
  assert.deepEqual(r.rows.map((x) => [x.person, x.rebuild.others, x.rebuild.people, x.rebuild.owed, x.rebuild.open]),
    [["Ana", 4, 2, 73, 4], ["Ben", 5, 2, 93, 4], ["Dev", 10, 4, 174, 4], ["Fay", 7, 3, 118, 3], ["Gus", 4, 2, 68, 3]]);
  for (const x of r.rows) { assert.equal(x.patch.others, 0); assert.ok(html.includes(`<td>${x.person}</td><td class="n">${x.rebuild.others}</td><td class="n">${x.rebuild.people}</td><td class="n">$${x.rebuild.owed}</td><td class="n">${x.rebuild.open}</td>`), x.person); }
  assert.match(page("sitemap.xml"), /schedule-change-after-posting\.html/);
  assert.match(page("index.html"), /schedule-change-after-posting\.html/);
  assert.ok(html.includes("No warranty"));
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  for (const q of ld.mainEntity) assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
});

test("14-day notice page: 3-days-out column repeats the posted-schedule table, FAQ matches, linked", () => {
  const html = page("predictive-scheduling-14-day-notice.html");
  const posted = page("schedule-change-after-posting.html");
  for (const [p, others, owed] of [["Ana", 4, 73], ["Ben", 5, 93], ["Dev", 10, 174], ["Fay", 7, 118], ["Gus", 4, 68]]) {
    assert.ok(posted.includes(`<td>${p}</td><td class="n">${others}</td>`));
    assert.match(html, new RegExp(`<td>${p}</td><td class="n">${others}</td><td class="n">\\$0</td><td class="n">\\$\\d+</td><td class="n">\\$${owed}</td>`));
  }
  assert.match(page("sitemap.xml"), /predictive-scheduling-14-day-notice\.html/);
  assert.match(page("index.html"), /predictive-scheduling-14-day-notice\.html/);
  assert.ok(html.includes("No warranty"));
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  for (const q of ld.mainEntity) assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
});

test("clopening page's rest-gap table is what the engine returns for the sample cafe", async () => {
  const { parseStaff, parseShifts, buildRoster, sampleStaff, sampleShifts } = await import("./calc.mjs");
  const staff = parseStaff(sampleStaff()).staff, slots = parseShifts(sampleShifts()).slots;
  const html = page("how-to-avoid-clopening.html");
  for (const [h, open, covered, pay] of [[0, 2, 219, 3671], [8, 3, 216, 3620], [10, 3, 216, 3622], [12, 3, 216, 3630], [14, 4, 218, 3662]]) {
    const r = buildRoster(staff, slots, { minRestHours: h });
    assert.equal(r.unfilled.length, open, `${h}h open`);
    assert.equal(r.hours, covered, `${h}h covered`);
    assert.equal(r.cost, pay, `${h}h payroll`);
    assert.ok(html.includes("$" + pay.toLocaleString("en-US")), `${h}h row on page`);
  }
  assert.match(page("sitemap.xml"), /how-to-avoid-clopening\.html/);
  assert.match(page("index.html"), /how-to-avoid-clopening\.html/);
  assert.ok(html.includes("No warranty"));
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  for (const q of ld.mainEntity) assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
});
