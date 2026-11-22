import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
const PAGES = ["index.html", "find-inconsistent-formulas-in-excel.html"];

test("every page carries the disclaimer, the Microsoft note and the sponsor link", () => {
  for (const p of PAGES) {
    const html = page(p);
    assert.match(html, /No warranty/, p);
    assert.match(html, /not accounting, audit, financial, investment or engineering advice/, p);
    assert.match(html, /a clean result is not a statement that a workbook is correct/, p);
    assert.match(html, /Not affiliated with Microsoft/, p);
    assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/, p);
    assert.match(html, /<script type="application\/ld\+json">/, p);
  }
});

test("the tool page states privacy and cannot send the file anywhere", () => {
  const html = page("index.html");
  assert.match(html, /Everything runs in your browser/);
  for (const f of ["index.html", "audit.mjs", "xlsx.mjs", "formula.mjs", "xlsxwrite.mjs", "example.mjs"]) assert.doesNotMatch(page(f), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource/, f);
  const imports = [...html.matchAll(/from "([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(imports.sort(), ["./audit.mjs", "./example.mjs", "./usage.mjs"]);
  assert.doesNotMatch(html, /<script[^>]+src=["']https?:/);
});

test("usage events named on the page are the ones the code records", () => {
  const html = page("index.html");
  for (const e of ["workbook_audited", "example_loaded", "findings_downloaded"]) {
    assert.match(html, new RegExp(`record\\("${e}"\\)`));
    assert.match(html, new RegExp(`<code>${e}</code>`));
  }
});

test("labels exist for every control and the page says what it does not check", () => {
  const html = page("index.html");
  for (const id of ["file", "f-high", "f-medium", "f-info", "f-sheet", "map-sheet"]) assert.match(html, new RegExp(`<label for="${id}"`), id);
  assert.match(html, /Not checked:/);
  assert.match(html, /Old \.xls and \.ods files are not read/);
});

test("the guide's worked-example table matches what the audit finds", async () => {
  const { auditBytes } = await import("./audit.mjs");
  const { exampleWorkbook } = await import("./example.mjs");
  const r = await auditBytes(exampleWorkbook());
  const html = page("find-inconsistent-formulas-in-excel.html");
  const cells = [...html.matchAll(/<tr><td>(\w+)!(\w+)<\/td>/g)].map((m) => `${m[1]}!${m[2]}`);
  const found = new Set(r.findings.filter((f) => f.severity !== "info").map((f) => `${f.sheet}!${f.cell}`));
  assert.deepEqual([...found].sort(), [...new Set(cells)].sort());
  assert.match(html, new RegExp(`${r.summary.formulas} formulas of which ${r.summary.distinct} are distinct`));
  const nonInfo = r.summary.high + r.summary.medium;
  assert.match(html, new RegExp(`${["zero","one","two","three","four","five","six","seven","eight","nine","ten"][nonInfo] ?? nonInfo} findings at high or medium`, "i"));
});

test("related-tool links point at ventures that exist; robots and sitemap list the pages", () => {
  const links = [...page("index.html").matchAll(/href="\.\.\/([a-z0-9-]+)\/"/g)];
  assert.ok(links.length >= 3);
  for (const m of links) assert.ok(existsSync(new URL(`../${m[1]}/VENTURE.yaml`, import.meta.url)), m[1]);
  assert.match(page("robots.txt"), /Allow: \//);
  for (const p of PAGES) assert.match(page("sitemap.xml"), new RegExp(p.replace(".", "\\.")));
});
