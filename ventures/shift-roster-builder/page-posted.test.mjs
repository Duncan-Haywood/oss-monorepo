// Split out of page.test.mjs: node --test runs files in parallel but the tests
// in one file one after another, and each of these rebuilds the sample week
// many times.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
// The guide pages quote the builder's default build, exact check on since 2026-11-12.
const proven = (r) => assert.ok(["optimal", "improved"].includes(r.optimality?.status), `not proven: ${r.optimality?.status}`);

test("posted-schedule page's table is what eval/callout-churn-bench.mjs returns for the sample cafe", async () => {
  const { run } = await import("./eval/callout-churn-bench.mjs");
  const html = page("schedule-change-after-posting.html");
  const r = run();
  assert.equal(r.postedCost, 3690);
  assert.equal(r.postedOpen, 5);
  assert.deepEqual(r.rows.map((x) => [x.person, x.rebuild.others, x.rebuild.people, x.rebuild.owed, x.rebuild.open]),
    [["Ana", 9, 2, 153, 5], ["Dev", 15, 4, 258, 5], ["Fay", 8, 3, 139, 5], ["Gus", 3, 1, 48, 5]]);
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
  for (const [p, others, owed] of [["Ana", 9, 153], ["Dev", 15, 258], ["Fay", 8, 139], ["Gus", 3, 48]]) {
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
  for (const [h, open, covered, pay] of [[0, 5, 220, 3690], [8, 5, 220, 3690], [10, 5, 220, 3690], [12, 4, 218, 3662], [14, 4, 218, 3662]]) {
    const r = buildRoster(staff, slots, { minRestHours: h });
    proven(r);
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
