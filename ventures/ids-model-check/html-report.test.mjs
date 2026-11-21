import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { check } from "./node.mjs";
import { htmlReport, failCount, requirementOf, reportStats } from "./html-report.mjs";

const file = (p) => readFileSync(new URL(`./${p}`, import.meta.url), "utf8");
const report = (ids = "samples/coordination-basics.ids.xml", opts) => check(file(ids), file("samples/tiny-house.ifc"), opts);

test("the report is one self-contained file with the verdict, every spec and the disclaimer", () => {
  const r = report();
  const html = htmlReport(r, { modelName: "tiny-house.ifc", idsName: "coordination-basics.ids.xml", generatedAt: "2026-11-21T10:00:00Z" });
  assert.match(html, /^<!doctype html>/);
  assert.doesNotMatch(html, /<link |src="http|@import|url\(/, "nothing loaded from outside");
  assert.match(html, /<span class="tag fail">FAIL<\/span>/);
  assert.match(html, /2026-11-21 10:00:00 UTC/);
  assert.match(html, /Not professional, legal or contractual advice/);
  for (const s of r.specs) assert.ok(html.includes(s.name.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#39;")), s.name);
  // One row per listed failing element in each specification's section.
  const sections = html.split('<details class="spec" id="spec-').slice(1);
  assert.equal(sections.length, r.specs.length);
  r.specs.forEach((s, i) => assert.equal((sections[i].split("</details>")[0].match(/<tr data-el=/g) || []).length, s.failed.length, s.name));
});

test("names from the model and IDS are escaped", () => {
  const r = report();
  r.specs[0].name = `<img src=x onerror=alert(1)>`;
  r.specs[1].failed[0].name = `"><script>bad()</script>`;
  const html = htmlReport(r, { modelName: "<b>m</b>.ifc" });
  assert.doesNotMatch(html, /<img src=x|<script>bad|<b>m<\/b>/);
  assert.match(html, /&lt;img src=x/);
});

test("tallies: requirements, classes and elements failing several specifications", () => {
  const r = report();
  const st = reportStats(r);
  const listed = r.specs.reduce((a, s) => a + s.failed.length, 0);
  assert.equal(st.listed, listed);
  assert.equal(st.total, r.specs.reduce((a, s) => a + failCount(s), 0));
  assert.equal(st.classes.reduce((a, c) => a + c.failures, 0), listed);
  for (const s of r.specs) for (const f of s.failed) for (const x of f.reasons) assert.ok(s.requirements.includes(requirementOf(s, x)) || s.optionality === "prohibited", x);
  // Sorted most first.
  for (let i = 1; i < st.requirements.length; i++) assert.ok(st.requirements[i - 1].count >= st.requirements[i].count);
  assert.ok(st.multi.every((e, i) => i === 0 || st.multi[i - 1].specCount >= e.specCount));
  assert.ok(st.multi.every((e) => e.specCount > 1));
  // Element counts agree with a direct tally.
  const direct = new Map();
  for (const s of r.specs) for (const f of s.failed) direct.set(f.id, (direct.get(f.id) || 0) + 1);
  assert.equal(st.elementCount, direct.size);
  assert.equal(st.multi.length, [...direct.values()].filter((v) => v > 1).length);
  for (const e of st.multi.slice(0, 25)) assert.equal(e.specs.length, e.specCount);
  assert.equal(st.classes.reduce((a, c) => a + c.elements, 0), direct.size);
});

test("requirementOf takes the longest listed requirement that prefixes the reason", () => {
  const s = { requirements: ['required property "P"."A"', 'required property "P"."A" (IFCLABEL)'] };
  assert.equal(requirementOf(s, 'required property "P"."A" (IFCLABEL): missing'), 'required property "P"."A" (IFCLABEL)');
  assert.equal(requirementOf({ requirements: [] }, "x y: z"), "x y");
});

test("a capped report says so and keeps the exact counts", () => {
  const r = report("samples/quantities-and-naming.ids.xml", { maxFailed: 1 });
  const full = report("samples/quantities-and-naming.ids.xml");
  const capped = r.specs.some((s) => s.failedCount !== undefined);
  const html = htmlReport(r);
  for (let i = 0; i < r.specs.length; i++) assert.equal(failCount(r.specs[i]), failCount(full.specs[i]));
  if (capped) assert.match(html, /listed only the first failing elements/);
  assert.ok(capped, "the sample has a spec with more than one failure");
});

test("a failing prohibited specification counts every applicable element", () => {
  assert.equal(failCount({ status: "fail", optionality: "prohibited", applicable: 900, failed: new Array(500) }), 900);
  assert.equal(failCount({ status: "pass", optionality: "required", applicable: 3, failed: [] }), 0);
});

test("maxRows limits the rows and says how many were left out", () => {
  const r = report("samples/quantities-and-naming.ids.xml");
  const s = r.specs.find((x) => x.failed.length >= 2);
  assert.ok(s);
  const html = htmlReport(r, { maxRows: 1 });
  assert.match(html, new RegExp(`Showing 1 of ${s.failed.length} failing elements`));
});

test("cli --html writes the report", () => {
  const dir = mkdtempSync(join(tmpdir(), "idsr-"));
  try {
    const out = join(dir, "r.html");
    const cli = new URL("./cli.mjs", import.meta.url).pathname;
    try { execFileSync(process.execPath, [cli, "samples/tiny-house.ifc", "samples/coordination-basics.ids.xml", "--html", out], { cwd: new URL(".", import.meta.url).pathname, stdio: "pipe" }); } catch (e) { assert.equal(e.status, 1); }
    const html = readFileSync(out, "utf8");
    assert.match(html, /IDS check: tiny-house\.ifc/);
    assert.match(html, /coordination-basics\.ids\.xml/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("the page offers the HTML report download", () => {
  const page = file("index.html");
  assert.match(page, /import \{ htmlReport \} from "\.\/html-report\.mjs"/);
  assert.match(page, /id="dl-html"/);
  assert.match(page, /record\("html_report_downloaded"\)/);
});
