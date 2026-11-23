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
  "how-to-run-an-as-planned-vs-as-built-schedule-analysis.html",
  "how-to-run-a-time-impact-analysis-on-a-p6-schedule.html",
  "how-to-split-concurrent-delay-between-owner-and-contractor.html",
  "how-to-run-a-monte-carlo-schedule-risk-analysis-on-a-p6-schedule.html",
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
  for (const label of ["Load an example schedule", "Load an example pair of updates", "Download for Microsoft Project (.xml)", "write activity code descriptions too", "Download for Excel (.xlsx)", "Run collapsed as-built", "Compare plan with as-built", "Example delay list", "Example fragnet", "Example with owner and contractor delays", "Run time impact analysis", "Printable exhibit (HTML)", "Impacted schedule (XER)", "without expected finish dates", "Finish date risk (Monte Carlo)", "Run the risk analysis"]) {
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

test("the as-planned vs as-built guide's worked example equals asPlannedVsAsBuilt() on the built-in example", () => {
  const html = page("how-to-run-an-as-planned-vs-as-built-schedule-analysis.html");
  const r = cli(join(dir, "cur.xer"), "--as-planned", join(dir, "prev.xer"));
  assert.equal(r.asBuilt.reproduced, 22);
  assert.equal(r.asBuilt.activities, 22);
  assert.equal(r.plan.finish.slice(0, 10), "2026-07-06");
  assert.equal(r.asBuilt.finish.slice(0, 10), "2026-07-27");
  assert.equal(r.delayDays, 15);
  assert.equal(r.sum, 15);
  assert.equal(r.path.length, 6);
  assert.deepEqual(r.plannedCritical, { onBoth: 5, of: 6 });
  const row = (c) => r.path.find((x) => x.code === c);
  assert.equal(row("A1110").waitDays, 14);
  assert.equal(row("A1110").plannedStart.slice(0, 10), "2026-04-28");
  assert.equal(row("A1110").actualStart.slice(0, 10), "2026-05-18");
  assert.equal(row("A1180").waitDays, 5);
  assert.equal(row("A1150").durationDays, -2);
  assert.equal(r.floatTerm, -2);
  assert.equal(r.late.count, 20);
  assert.ok(r.overruns.some((o) => o.code === "A1040" && o.overDays === 10 && !o.onPath));
  for (const s of ["22 of 22", "2026-07-06", "2026-07-27", "15 working days", "6 activities, 5 of 6", "+14", "+5", "-2", "+15", "Twenty of the 22", "10 days long"]) assert.ok(html.includes(s), s);
});

test("the time impact analysis guide's worked example equals timeImpact() on the built-in example", async () => {
  const html = page("how-to-run-a-time-impact-analysis-on-a-p6-schedule.html");
  const { EXAMPLE_FRAGNET } = await import("./tia.mjs");
  writeFileSync(join(dir, "fragnet.csv"), EXAMPLE_FRAGNET);
  const r = cli(join(dir, "cur.xer"), "--tia", join(dir, "fragnet.csv"));
  assert.equal(r.finish.base.slice(0, 10), "2026-07-27");
  assert.equal(r.finish.impacted.slice(0, 10), "2026-08-07");
  assert.equal(r.finish.delayDays, 9);
  const ev = Object.fromEntries(r.byEvent.map((e) => [e.event, e]));
  assert.equal(ev["CO-03 MEP layout"].delayDays, 3);
  assert.equal(ev["CO-03 MEP layout"].finish.slice(0, 10), "2026-07-30");
  assert.equal(ev["Late hardware approval"].delayDays, 9);
  assert.equal(r.overlapDays, 3);
  const m = r.milestones.find((x) => x.code === "M1210");
  assert.equal(m.delayDays, 15);
  assert.equal(m.base.slice(0, 10), "2026-07-17");
  assert.deepEqual(r.drivingPath, ["A1030", "A1040", "A1170", "A1200", "M1210"]);
  assert.deepEqual(r.summary, { activitiesLessFloat: 14, nowCritical: 6, nowNegative: 7, fragnetActivities: 3, madeLonger: 1 });
  for (const s of ["<td>2026-07-30</td><td>3</td>", "<td>2026-08-07</td><td>9</td>", "add up to 12 working days", "3 days of the change order", "15 working days, from 2026-07-17 to 2026-08-07", "Fourteen activities give up float, six become critical and seven go negative", "12 working days of redesign and 5 of re-approval", "25 working days longer"]) assert.ok(html.includes(s), s);
  assert.match(EXAMPLE_FRAGNET, /F110,Redesign level 2 MEP rough-in,12,/);
  assert.match(EXAMPLE_FRAGNET, /F120,Re-approve level 2 MEP drawings,5,/);
  assert.match(EXAMPLE_FRAGNET, /A1040,,\+25,/);
  assert.match(EXAMPLE_FRAGNET, /2026-04-08/);
});

test("the schedule risk guide's worked example equals the risk run on the built-in example (page defaults: 500 runs, seed 1)", () => {
  const html = page("how-to-run-a-monte-carlo-schedule-risk-analysis-on-a-p6-schedule.html");
  const day = (m) => new Date(m * 60000).toISOString().slice(0, 10);
  const r = cli(join(dir, "cur.xer"), "--risk", "500");
  assert.equal(r.seed, 1);
  assert.deepEqual(r.range, { min: 0.9, likely: 1, max: 1.25 });
  for (const p of r.percentiles) assert.ok(html.includes(`<tr><td>P${p.p}</td><td>${day(p.date)}</td><td>${p.overDeterministic}</td></tr>`), `P${p.p}`);
  assert.equal(Math.round(r.pDeterministic * 100), 2);
  assert.equal(Math.round(r.pMustFinish * 100), 92);
  assert.match(html, /met in only 2% of runs, and the must-finish date in 92%/);
  const a = Object.fromEntries(r.activities.map((x) => [x.code, x]));
  assert.equal(Math.round(a.A1130.criticality * 100), 53);
  assert.equal(a.A1130.deterministicCritical, false);
  assert.equal(Math.round(a.A1120.criticality * 100), 47);
  assert.equal(a.A1120.deterministicCritical, true);
  assert.match(html, /level 2 drives the finish in 53% of runs and level 1 in 47%/);
  const c = cli(join(dir, "cur.xer"), "--risk", "500", "--correlation", "0.5");
  const p = (x, n) => x.percentiles.find((q) => q.p === n);
  assert.equal(p(c, 50).overDeterministic, 2.1);
  assert.equal(day(p(c, 80).date), "2026-08-03");
  assert.equal(p(c, 80).overDeterministic, 4.1);
  assert.equal(Math.round(c.pMustFinish * 100), 79);
  for (const s of ["still 2.1 working days late", "the P80 becomes 2026-08-03, 4.1 working days late", "falls to 79%"]) assert.ok(html.includes(s), s);
});

test("the concurrent delay guide's worked example equals timeImpact() by party on the built-in example", async () => {
  const html = page("how-to-split-concurrent-delay-between-owner-and-contractor.html");
  const { EXAMPLE_PARTY_FRAGNET } = await import("./tia.mjs");
  writeFileSync(join(dir, "party.csv"), EXAMPLE_PARTY_FRAGNET);
  const r = cli(join(dir, "cur.xer"), "--tia", join(dir, "party.csv"));
  assert.equal(r.finish.base.slice(0, 10), "2026-07-27");
  assert.equal(r.finish.impacted.slice(0, 10), "2026-08-06");
  assert.equal(r.finish.delayDays, 8);
  const by = Object.fromEntries(r.byParty.map((x) => [x.party, x]));
  assert.equal(by.Owner.aloneDays, 3); assert.equal(by.Owner.aloneFinish.slice(0, 10), "2026-07-30");
  assert.equal(by.Contractor.aloneDays, 8); assert.equal(by.Contractor.aloneFinish.slice(0, 10), "2026-08-06");
  assert.equal(by.Owner.withoutDays, 8); assert.equal(by.Contractor.withoutDays, 3);
  assert.equal(by.Owner.soleDays, 0); assert.equal(by.Contractor.soleDays, 5);
  assert.equal(r.apportionment.concurrentDays, 3);
  for (const s of ["<td>2026-07-30</td><td>3</td>", "<td>2026-08-06</td><td>8</td>", "owner's sole delay is 0", "contractor's sole delay is 5", "those 3 are concurrent", "0 + 5 + 3 = 8", "17 working days of redesign", "20 working days longer"]) assert.ok(html.includes(s), s);
  assert.match(EXAMPLE_PARTY_FRAGNET, /A1090,,\+20,/);
  assert.match(EXAMPLE_PARTY_FRAGNET, /F110,Redesign level 2 MEP rough-in,12,/);
  assert.match(EXAMPLE_PARTY_FRAGNET, /F120,Re-approve level 2 MEP drawings,5,/);
});
