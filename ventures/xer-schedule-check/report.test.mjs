import { test } from "node:test";
import assert from "node:assert/strict";
import { parseXer } from "./xer.mjs";
import { assess } from "./dcma.mjs";
import { compare } from "./compare.mjs";
import { reviewHtml, reviewItems } from "./report.mjs";
import { EXAMPLE_XER, EXAMPLE_PREV_XER } from "./example.mjs";
import { readFileSync } from "node:fs";

const cur = () => parseXer(EXAMPLE_XER);
const prev = () => parseXer(EXAMPLE_PREV_XER);

test("one correction per failing DCMA point and failing extra check, ranked high to low", () => {
  const a = assess(cur());
  const items = reviewItems(a);
  const failing = a.checks.filter((k) => !k.pass && k.value !== null).length + a.extra.filter((e) => !e.pass).length;
  assert.equal(items.length, failing);
  const rank = { high: 0, medium: 1, low: 2 };
  for (let i = 1; i < items.length; i++) assert.ok(rank[items[i - 1].severity] <= rank[items[i].severity]);
  const logic = items.find((x) => x.source === "DCMA 1. Logic");
  assert.equal(logic.severity, "medium");
  assert.deepEqual(logic.items.map((r) => r.code).sort(), ["A1180", "A1190"]);
  // passing points ask for nothing
  assert.ok(!items.some((x) => x.source.startsWith("DCMA 6.")));
});

test("with a previous update, each comparison flag becomes a correction carrying its activities", () => {
  const a = assess(cur());
  const c = compare(prev(), cur());
  const items = reviewItems(a, c);
  const changes = items.filter((x) => x.source === "Change since the previous update");
  assert.equal(changes.length, c.flags.length);
  for (const f of c.flags) {
    const x = changes.find((y) => y.action.toLowerCase().includes(f.text.toLowerCase()));
    assert.ok(x, f.text);
    assert.equal(x.severity, f.severity);
    assert.equal(x.items.length, f.count, f.text);
  }
  const edited = changes.find((x) => /actual dates changed/i.test(x.action));
  assert.equal(edited.severity, "high");
  assert.match(edited.items[0].why, /2026-03-04 15:30 -> 2026-03-05 15:30/);
  assert.equal(items[0].severity, "high");
});

test("the document is self-contained, escapes input and carries the disclaimer", () => {
  const a = assess(cur());
  const c = compare(prev(), cur());
  const html = reviewHtml(a, c, { recipient: "GC <scheduler>", reviewer: "Owner's rep", reference: "SUB-042", notes: "Reply in 7 days", date: "2026-11-19" });
  assert.match(html, /^<!doctype html>/);
  assert.ok(!/<script/i.test(html), "no scripts");
  assert.ok(!/<link /i.test(html) && !/src="http/i.test(html), "no outside files");
  assert.match(html, /To: GC &lt;scheduler&gt;/);
  assert.match(html, /Reference: SUB-042/);
  assert.match(html, /Date: 2026-11-19/);
  assert.match(html, /Reply in 7 days/);
  assert.match(html, /6 of 14 pass/);
  assert.match(html, /\+15 working days: progress \+8 working days, revisions \+7 working days/);
  assert.match(html, /3 high-priority corrections should be made/);
  assert.match(html, /What changed since the previous update/);
  assert.match(html, /not engineering, legal, contractual or scheduling advice/);
  assert.match(html, /Not affiliated with, endorsed by or sponsored by Oracle/);
  assert.match(html, /@media print/);
});

test("long lists are cut at the limit with a pointer to the CSV", () => {
  const a = assess(cur());
  const html = reviewHtml(a, null, { limit: 1 });
  assert.match(html, /3 more not printed; the CSV download from the page lists them all/);
  assert.ok(!/What changed since the previous update/.test(html));
});

test("the page offers the review and loads report.mjs", async () => {
  const { readFileSync } = await import("node:fs");
  const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  assert.match(html, /import \{ reviewHtml, reviewItems, windowsFor \} from "\.\/report\.mjs"/);
  assert.match(html, /id="rev-print"/);
  assert.match(html, /id="rev-download"/);
});

test("a critical path test that could not run (milestone-only path) is asked about, not dropped", () => {
  const a = assess(cur());
  const k = a.checks.find((c) => c.id === 12);
  Object.assign(k, { value: null, pass: false, count: 1, items: [{ code: "M1210", name: "Substantial completion", why: "the driving path holds no open activity with a duration" }] });
  const x = reviewItems(a).find((y) => y.source.startsWith("DCMA 12."));
  assert.equal(x.severity, "medium");
  assert.equal(x.measure, "could not run");
  assert.equal(x.items[0].code, "M1210");
});

// ---- finish date risk in the review
import { riskAnalysis } from "./risk.mjs";
import { riskItems, riskFor, RISK_LIMITS } from "./report.mjs";

const riskRun = (a, extra = {}) => riskAnalysis(cur(), { projId: a.project.id, iterations: 200, range: { min: 0.9, likely: 1, max: 1.5 }, ...extra });

test("a risk run adds its corrections: must-finish, near-critical work, contingency", () => {
  const a = assess(cur());
  const r = riskRun(a);
  const items = reviewItems(a, null, r);
  const risk = items.filter((x) => x.source.startsWith("Finish date risk"));
  assert.equal(risk.length, riskItems(r).length);
  assert.equal(items.length, reviewItems(a).length + risk.length);
  // the example's must-finish (2026-07-31) is rarely met with a 150% tail
  assert.ok(r.pMustFinish < RISK_LIMITS.mustHigh, String(r.pMustFinish));
  const must = risk.find((x) => /must-finish date 2026-07-31/.test(x.action));
  assert.equal(must.severity, "high");
  assert.equal(items[0], must, "a high item sorts first");
  assert.match(must.action, /the forecast meets it, but/);
  const late = riskItems({ ...r, project: { ...r.project, finish: r.project.mustFinish + 600 } })[0];
  assert.match(late.action, /the forecast itself is after it/);
  // near-critical: exactly the activities off the forecast path with criticality >= 25%
  const near = r.activities.filter((x) => !x.deterministicCritical && x.criticality >= RISK_LIMITS.nearCritical).map((x) => x.code);
  const nc = risk.find((x) => /near-critical/.test(x.action));
  if (near.length) assert.deepEqual(nc.items.map((x) => x.code), near);
  else assert.equal(nc, undefined);
  assert.ok(risk.some((x) => x.severity === "low" && /contingency/.test(x.action)));
});

test("a generous must-finish and a narrow range ask for nothing", () => {
  const a = assess(cur());
  const r = riskRun(a, { range: { min: 1, likely: 1, max: 1 } });
  r.pMustFinish = 0.95; // as if the contract date had room
  assert.equal(r.pDeterministic, 1);
  assert.deepEqual(riskItems(r).filter((x) => !/near-critical/.test(x.action)), []);
});

test("the document prints the risk section: assumptions, percentiles, events and drivers", () => {
  const a = assess(cur());
  const r = riskRun(a, { risks: [{ id: "R1 <doors> late", probability: 0.4, min: 5, likely: 10, max: 25, codes: ["A1040"] }] });
  const html = reviewHtml(a, null, { risk: r, date: "2026-11-19" });
  assert.match(html, /<h2>Finish date risk<\/h2>/);
  assert.match(html, /200 runs \(seed 1\) over \d+ open activities/);
  assert.match(html, /90% \/ 100% \/ 150% of each open activity's remaining duration/);
  for (const p of [10, 50, 80, 90]) assert.match(html, new RegExp(`<td>P${p}</td>`));
  assert.match(html, /Finish without the events/);
  assert.match(html, /R1 &lt;doors&gt; late/);
  assert.match(html, /Activities that most often drive the finish/);
  assert.match(html, /<dt>Finish date risk<\/dt><dd>forecast met in \d+% of 200 runs; P80 \d{4}-\d\d-\d\d/);
  assert.match(html, /The ranges are inputs to this analysis, not data from the file/);
  assert.ok(!/<script/i.test(html));
  // without a risk run there is no section
  assert.ok(!/Finish date risk/.test(reviewHtml(a, null, {})));
});

test("a risk run on another project is left out, with a note", () => {
  const a = assess(cur());
  const r = { ...riskRun(a), project: { ...riskRun(a).project, id: "999" } };
  assert.equal(riskFor(a, r), null);
  assert.equal(reviewItems(a, null, r).length, reviewItems(a).length);
  const html = reviewHtml(a, null, { risk: r });
  assert.ok(!/<h2>Finish date risk/.test(html));
  assert.match(html, /run on another project and is left out/);
});

test("the page hands the risk run to the review", () => {
  const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  assert.match(html, /risk: lastRisk/);
  assert.match(html, /reviewItems\(last, lastCmp, lastRisk, win\)/);
});

// ---- windows analysis and the full-list appendix in the review
import { windows } from "./windows.mjs";
import { exampleSeries } from "./example-series.mjs";
import { windowItems, windowsFor, WINDOW_LIMITS } from "./report.mjs";
import { xerText } from "./xer.mjs";

const series = () => exampleSeries();
const winRun = () => windows(series());
const juneAssess = () => assess(series()[3].xer);

test("a windows run adds one correction per window whose revisions moved the finish later", () => {
  const a = juneAssess(), w = winRun();
  assert.equal(windowsFor(a, w), w);
  const items = windowItems(w);
  // the example: window 1 revisions +7 (medium), window 2 +3 (low), window 3 0 (none)
  assert.deepEqual(items.map((x) => [x.source.match(/window (\d)/)[1], x.severity]), [["1", "medium"], ["2", "low"]]);
  assert.match(items[0].action, /moved the forecast finish \+7 working days on their own/);
  assert.match(items[1].measure, /progress 0 working days, revisions \+3 working days/);
  assert.deepEqual(items[1].items.map((x) => x.code), ["A1150"]);
  assert.match(items[1].items[0].why, /original duration 8 to 11 days/);
  const all = reviewItems(a, null, null, w);
  assert.equal(all.length, reviewItems(a).length + 2);
});

test("revisions that take back lost progress ask for the recovery plan", () => {
  const w = winRun();
  const x = { ...w.windows[2], progressEffect: 6, revisionEffect: -4, moved: 2, drivers: { progress: [{ code: "P1", name: "slow", what: "late" }], revisions: [{ code: "R1", name: "", what: "lag 5 to 0 days" }] } };
  const items = windowItems({ ...w, windows: [x] });
  assert.equal(items.length, 1);
  assert.equal(items[0].severity, "medium");
  assert.match(items[0].action, /recovery plan.*took back 4 of them/);
  assert.deepEqual(items[0].items.map((r) => r.code), ["R1", "P1"]);
  // under the offset floor: nothing asked
  const small = { ...x, revisionEffect: -(WINDOW_LIMITS.offsetMin - 1) };
  assert.deepEqual(windowItems({ ...w, windows: [small] }), []);
});

test("the document prints the delay-by-window section; a mismatched run is left out with a note", () => {
  const a = juneAssess(), w = winRun();
  const html = reviewHtml(a, null, { windows: w, date: "2026-11-19" });
  assert.match(html, /<h2>Delay by window<\/h2>/);
  assert.match(html, /moved from 2026-07-06 to 2026-08-05, \+22 working days: \+12 caused by progress and \+10 by revisions/);
  assert.match(html, /<dt>Windows analysis<\/dt><dd>3 windows over 4 updates/);
  assert.match(html, /Window 3: May update to June update/);
  assert.match(html, /not this tool's/);
  assert.ok(!/<script/i.test(html));
  // the April review cannot carry windows that end in June
  const apr = assess(cur());
  assert.equal(windowsFor(apr, w), null);
  const h2 = reviewHtml(apr, null, { windows: w });
  assert.ok(!/<h2>Delay by window/.test(h2));
  assert.match(h2, /windows analysis supplied is of another project or does not end at this update's data date/);
  assert.equal(windowsFor(a, { ...w, project: "OTHER" }), null);
});

test("the appendix lists every activity the body cut, numbered like the corrections", () => {
  const a = assess(cur());
  const plain = reviewHtml(a, null, { limit: 1 });
  assert.ok(!/Appendix A/.test(plain));
  const html = reviewHtml(a, null, { limit: 1, appendix: true });
  const items = reviewItems(a);
  const long = items.map((x, i) => [x, i + 1]).filter(([x]) => x.items.length > 1);
  assert.ok(long.length > 0);
  assert.match(html, /<h2 class="appendix">Appendix A: every activity behind each correction<\/h2>/);
  const app = html.slice(html.indexOf("Appendix A:"));
  for (const [x, n] of long) {
    assert.match(html, new RegExp(`Appendix A, item ${n}, lists all ${x.items.length}`));
    assert.ok(app.includes(`Item ${n}: ${x.source.replace(/&/g, "&amp;")} (${x.items.length})`), x.source);
    for (const r of x.items) assert.ok(app.includes(`<td>${r.code.replace(/>/g, "&gt;")}</td>`), r.code);
  }
  // nothing cut, no appendix
  assert.ok(!/Appendix A/.test(reviewHtml(a, null, { limit: 1e6, appendix: true })));
});

test("xerText round-trips: the written file reads back to the same tables and assessment", () => {
  for (const u of series()) {
    const back = parseXer(xerText(u.xer));
    assert.deepEqual(Object.keys(back.tables), Object.keys(u.xer.tables));
    for (const [k, rows] of Object.entries(u.xer.tables)) assert.equal(back.tables[k].length, rows.length, k);
    const A = assess(u.xer), B = assess(back);
    assert.deepEqual(B.project, A.project);
    assert.deepEqual(B.checks.map((c) => c.value), A.checks.map((c) => c.value));
  }
});

test("the CLI writes a review with windows from a series given in any order", async () => {
  const { mkdtempSync, writeFileSync: wf, readFileSync: rf } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { execFileSync } = await import("node:child_process");
  const dir = mkdtempSync(join(tmpdir(), "xer-win-"));
  const files = series().map((u, i) => { const f = join(dir, `${["mar", "apr", "may", "jun"][i]}.xer`); wf(f, xerText(u.xer)); return f; });
  const out = join(dir, "review.html");
  execFileSync(process.execPath, [new URL("./cli.mjs", import.meta.url).pathname, "--windows", files[2], files[0], files[3], files[1], "--report", out, "--appendix"], { stdio: "pipe" });
  const html = rf(out, "utf8");
  assert.match(html, /data date 2026-06-01/);
  assert.match(html, /<h2>Delay by window<\/h2>/);
  assert.match(html, /Justify the revisions made between mar\.xer and apr\.xer/);
  assert.match(html, /Previous update<\/dt><dd>data date 2026-05-04/);
});

test("the page hands the windows run and the appendix choice to the review", () => {
  const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  assert.match(html, /windows: lastWin, appendix: \$\("#rev-appendix"\)\.checked/);
  assert.match(html, /id="rev-appendix"/);
  assert.match(html, /reviewItems\(last, lastCmp, lastRisk, win\)/);
});

test("xerText quotes a multi-line value (P6 Web's calendar data) so it reads back whole", () => {
  const x = parseXer(EXAMPLE_XER);
  const cal = x.tables.CALENDAR[0];
  const fields = Object.keys(cal);
  // a P6 Web export keeps clndr_data last and spread over lines, with a quote inside
  const k = fields[fields.length - 1];
  cal[k] = '(0||CalendarData()(\n  (0||DaysOfWeek()(\n    (0||1()())))\n  (0||Note "x"()())))';
  const back = parseXer(xerText(x));
  assert.equal(back.tables.CALENDAR[0][k], cal[k]);
  assert.equal(back.tables.CALENDAR.length, x.tables.CALENDAR.length);
});
