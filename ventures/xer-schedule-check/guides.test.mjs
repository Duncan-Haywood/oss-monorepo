// The guide pages: linked from the tool page and sitemap, FAQ markup equal to
// the visible questions, the disclaimer present, and every number the worked
// examples quote equal to what the engine computes on the built-in example.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { EXAMPLE_XER, EXAMPLE_PREV_XER } from "./example.mjs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
const GUIDES = [
  "how-to-run-a-dcma-14-point-schedule-assessment.html",
  "how-to-open-an-xer-file-without-primavera-p6.html",
  "how-to-convert-a-p6-xer-file-to-microsoft-project.html",
  "how-to-review-a-contractors-p6-schedule-update.html",
  "how-to-write-a-monthly-construction-schedule-narrative.html",
  "how-to-convert-an-xer-file-to-excel.html",
  "how-to-find-critical-path-drag-in-a-p6-schedule.html",
  "how-to-assess-a-schedule-against-the-gao-schedule-assessment-guide.html",
  "how-to-run-a-collapsed-as-built-delay-analysis.html",
];

test("every guide is linked from the tool page, the sitemap and llms.txt", () => {
  for (const g of GUIDES) {
    assert.ok(page("index.html").includes(`href="./${g}"`), g);
    assert.ok(page("sitemap.xml").includes(`<loc>./${g}</loc>`), g);
    assert.ok(page("llms.txt").includes(`/xer-schedule-check/${g})`), g);
  }
});

test("each guide: canonical, title and description lengths, FAQ markup equals the visible text, disclaimer", () => {
  for (const g of GUIDES) {
    const html = page(g);
    assert.ok(html.includes(`<link rel="canonical" href="./${g}">`), g);
    const title = html.match(/<title>(.*?)<\/title>/)[1];
    assert.ok(title.length <= 70, `${g} title ${title.length}`);
    const desc = html.match(/<meta name="description" content="(.*?)">/)[1];
    assert.ok(desc.length >= 60 && desc.length <= 160, `${g} description ${desc.length}`);
    const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
    assert.equal(ld["@type"], "FAQPage");
    for (const q of ld.mainEntity) {
      assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
      assert.ok(html.includes(`<p>${q.acceptedAnswer.text}</p>`), q.name);
    }
    assert.match(html, /No warranty/);
    assert.match(html, /not engineering, legal, contractual or scheduling advice/);
    assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
    for (const other of GUIDES) if (other !== g) assert.ok(html.includes(`href="./${other}"`), `${g} -> ${other}`);
  }
});

test("the buttons the guides name exist on the tool page", () => {
  const index = page("index.html");
  for (const label of ["Load an example schedule", "Load an example pair of updates", "Download for Microsoft Project (.xml)", "write activity code descriptions too", "Download for Excel (.xlsx)", "Run collapsed as-built", "Example delay list"]) {
    assert.ok(index.includes(label), label);
  }
});

const dir = mkdtempSync(join(tmpdir(), "xer-guides-"));
writeFileSync(join(dir, "cur.xer"), EXAMPLE_XER);
writeFileSync(join(dir, "prev.xer"), EXAMPLE_PREV_XER);
const cli = (...args) => JSON.parse(execFileSync(process.execPath, [new URL("./cli.mjs", import.meta.url).pathname, ...args, "--json"], { encoding: "utf8" }));

test("the DCMA guide's worked example equals the engine on the built-in example", () => {
  const html = page(GUIDES[0]);
  const r = cli(join(dir, "cur.xer"));
  const c = (id) => r.checks.find((x) => x.id === id);
  const r1 = (v) => Math.round(v * 10) / 10;
  assert.equal(r.checks.filter((x) => x.pass).length, 6);
  assert.match(html, /It passes 6 of 14/);
  assert.equal(c(1).count, 2); assert.equal(c(1).total, 19); assert.equal(r1(c(1).value), 10.5);
  assert.match(html, /Fail, 10\.5% \(2 of 19\)/);
  assert.equal(c(2).count, 1);
  assert.equal(c(3).count, 4); assert.equal(c(3).total, 23); assert.equal(r1(c(3).value), 17.4);
  assert.match(html, /Fail, 17\.4% \(4 of 23\)/);
  assert.equal(c(5).count, 1); assert.equal(r1(c(5).value), 5.3);
  assert.equal(c(8).count, 1); assert.equal(c(8).total, 18);
  assert.equal(c(10).count, 2); assert.equal(c(10).total, 18);
  assert.equal(c(11).count, 3); assert.equal(c(11).total, 4); assert.equal(c(14).value, 0.5);
  assert.ok(c(12).pass); assert.equal(c(12).value, 600);
  assert.equal(c(13).value, 1.051);
  assert.match(html, /Pass, 1\.051/);
  for (const id of [4, 6, 7, 9]) assert.ok(c(id).pass, `check ${id}`);
});

test("the update-review guide's worked example equals the comparison engine", () => {
  const html = page(GUIDES[3]);
  const r = cli(join(dir, "cur.xer"), "--previous", join(dir, "prev.xer"));
  assert.equal(r.finish.moved, 15);
  assert.equal(r.finish.progressEffect, 8);
  assert.equal(r.finish.revisionEffect, 7);
  assert.match(html, /\+15 working days: progress \+8, revisions \+7/);
});

test("the narrative guide's worked example equals the draft on the built-in example", () => {
  const html = page("how-to-write-a-monthly-construction-schedule-narrative.html");
  const out = join(dir, "narrative.txt");
  execFileSync(process.execPath, [new URL("./cli.mjs", import.meta.url).pathname, join(dir, "cur.xer"), "--previous", join(dir, "prev.xer"), "--narrative", out], { encoding: "utf8", stdio: ["ignore", "ignore", "ignore"] });
  const text = readFileSync(out, "utf8");
  for (const quote of [
    "The forecast completion is 2026-07-27, 15 working days later than the previous update's 2026-07-06.",
    "That is 4 working days ahead of the contract completion date of 2026-07-31 (the previous update was 19 working days ahead of it).",
    "progress during the period moved the finish 8 working days later, and the changes made to the schedule 7 working days later.",
  ]) { assert.ok(text.includes(quote), quote); assert.ok(html.includes(quote), quote); }
  assert.match(text, /\(20 fill-ins left/);
  assert.match(html, /The draft leaves 20 fill-ins/);
  assert.match(text, /A1020 Shop drawings: partitions and ceilings, 2026-03-20 \(3 working days after the previous forecast\)/);
  assert.equal((text.match(/^- .*Cause: \[FILL IN/gm) || []).length, 6);
  assert.match(html, /six activities that were due/);
  assert.equal((text.match(/^- .*Reason: \[FILL IN: reason(\]| \()/gm) || []).length, 9);
  assert.match(html, /nine changes/);
  const index = page("index.html");
  for (const label of ["Load an example pair of updates", "Download narrative (text)"]) assert.ok(index.includes(label), label);
});

test("the drag guide's worked example equals dragAnalysis on the built-in example", () => {
  const html = page("how-to-find-critical-path-drag-in-a-p6-schedule.html");
  const r = cli(join(dir, "cur.xer"), "--drag", "--drag-cost", "2500");
  assert.equal(r.finish.slice(0, 10), "2026-07-27");
  assert.equal(r.summary.tested, 7);
  assert.equal(r.summary.withDrag, 5);
  assert.match(html, /Seven activities with work left are on the longest path, and five of them hold the finish back/);
  for (const a of r.activities) {
    const row = `<tr><td>${a.code} ${a.name}</td><td>${a.remainingDays}</td><td>${a.drag.days}</td><td>$${a.drag.cost.toLocaleString("en-US")}</td></tr>`;
    assert.ok(html.includes(row), row);
  }
  assert.equal(r.lags.find((l) => l.pred === "A1160" && l.succ === "A1180").drag.days, 6);
  assert.match(html, /80-hour lag between flooring and furniture has 6 days of drag/);
  assert.equal(r.activities[0].drag.calendarDays, 14);
  assert.ok(page("index.html").includes("Find critical path drag"));
});

test("the GAO guide's worked example equals gao() on the built-in example", () => {
  const html = page("how-to-assess-a-schedule-against-the-gao-schedule-assessment-guide.html");
  const r = cli(join(dir, "cur.xer"), "--gao");
  for (const p of r.practices) {
    const row = `<tr><td>${p.n}. ${p.name}</td><td>${p.characteristic}</td><td>${p.total ? `${p.passed} of ${p.total}` : "none"}</td><td>${p.rating}</td></tr>`;
    assert.ok(html.includes(row), row);
  }
  assert.equal(r.overall.weakest, "Comprehensive");
  assert.match(html, /Comprehensive is the weakest characteristic/);
  const b = cli(join(dir, "cur.xer"), "--gao", "--baseline", join(dir, "prev.xer"));
  const t = b.practices.find((p) => p.n === 10).tests;
  assert.equal(t.find((x) => x.id === "missed-baseline").count, 4);
  assert.equal(t.find((x) => x.id === "bei-baseline").value, "0.5");
  assert.ok(page("index.html").includes("Score against the GAO guide"));
});

test("the collapsed as-built guide's worked example equals collapsedAsBuilt() on the built-in example", async () => {
  const html = page("how-to-run-a-collapsed-as-built-delay-analysis.html");
  const { EXAMPLE_DELAYS } = await import("./collapse.mjs");
  writeFileSync(join(dir, "delays.csv"), EXAMPLE_DELAYS);
  const r = cli(join(dir, "cur.xer"), "--collapse", join(dir, "delays.csv"));
  assert.equal(r.asBuilt.reproduced, 22);
  assert.equal(r.asBuilt.activities, 22);
  assert.equal(r.asBuilt.modelFinish.slice(0, 10), "2026-07-27");
  assert.equal(r.asBuilt.gaps.length, 3);
  assert.equal(r.asBuilt.gaps[0].code, "A1110");
  assert.equal(r.asBuilt.gaps[0].days, 9);
  assert.equal(r.all.finish.slice(0, 10), "2026-07-14");
  assert.equal(r.all.earlierDays, 9);
  const by = Object.fromEntries(r.byParty.map((p) => [p.party, p]));
  assert.equal(by.Owner.earlierDays, 9);
  assert.equal(by.Contractor.earlierDays, 0);
  assert.equal(r.concurrentDays, 0);
  for (const s of ["22 of 22", "2026-07-27", "3 as-built gaps", "9 of 9 days of gap", "2026-07-14", "5 of 5 days"]) assert.ok(html.includes(s), s);
});
