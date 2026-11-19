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
  assert.match(html, /import \{ reviewHtml, reviewItems \} from "\.\/report\.mjs"/);
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
  assert.match(html, /reviewItems\(last, lastCmp, lastRisk\)/);
});
