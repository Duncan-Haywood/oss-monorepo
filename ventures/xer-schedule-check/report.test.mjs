import { test } from "node:test";
import assert from "node:assert/strict";
import { parseXer } from "./xer.mjs";
import { assess } from "./dcma.mjs";
import { compare } from "./compare.mjs";
import { reviewHtml, reviewItems } from "./report.mjs";
import { EXAMPLE_XER, EXAMPLE_PREV_XER } from "./example.mjs";

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
  assert.match(html, /\+15 working days: progress \+6 working days, revisions \+9 working days/);
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
