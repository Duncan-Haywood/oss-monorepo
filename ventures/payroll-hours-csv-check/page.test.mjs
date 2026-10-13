import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

test("index page carries the disclaimer, privacy line, independence note and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not legal, tax, accounting, compliance, or financial advice/);
  assert.match(html, /not wage-and-hour or payroll advice/);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /Independent of any payroll or time-tracking vendor/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /<script type="application\/ld\+json">/);
});

test("inputs have labels and neither page nor parser can send the file anywhere", () => {
  const html = page("index.html");
  for (const id of ["file", "paste"]) assert.match(html, new RegExp(`<label for="${id}">`));
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource/);
  assert.doesNotMatch(page("calc.mjs"), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket/);
});

test("the module scripts import only local files", () => {
  const html = page("index.html");
  const imports = [...html.matchAll(/from "([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(imports.sort(), ["./calc.mjs", "./usage.mjs"]);
  assert.doesNotMatch(html, /<script[^>]+src=["']https?:/);
});

test("page says what is not checked and that it never changes pay", () => {
  const html = page("index.html");
  assert.match(html, /Not checked/);
  assert.match(html, /never enters, removes or recalculates anyone's pay/);
  assert.match(html, /never change an hour, a date, a break or a name/);
});

test("robots and sitemap let crawlers find the page", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
});

test("usage events named on the page are the ones the code records", () => {
  const html = page("index.html");
  for (const e of ["file_checked", "example_loaded", "fixes_applied"]) {
    assert.match(html, new RegExp(`record\\("${e}"\\)`));
    assert.match(html, new RegExp(`<code>${e}</code>`));
  }
});

test("related-tool links point at ventures that exist", () => {
  const links = [...page("index.html").matchAll(/href="\.\.\/([a-z0-9-]+)\/"/g)];
  assert.ok(links.length >= 3);
  for (const m of links) assert.ok(existsSync(new URL(`../${m[1]}/VENTURE.yaml`, import.meta.url)), m[1]);
});

test("every column the page lists as checked is a column the code knows", async () => {
  const { COLUMNS } = await import("./calc.mjs");
  const html = page("index.html");
  for (const c of ["Employee", "Date", "Start", "End", "Break Minutes", "Regular Hours", "Overtime Hours"]) {
    assert.ok(COLUMNS.includes(c), c);
    assert.ok(html.includes(c), c);
  }
});

test("footer links to the payroll register to journal converter", () => {
  assert.match(readFileSync(new URL("./index.html", import.meta.url), "utf8"), /href="\.\.\/payroll-register-to-journal\/"/);
});

test("footer links to the employer payroll tax calculator", () => {
  assert.match(readFileSync(new URL("./index.html", import.meta.url), "utf8"), /href="\.\.\/employer-payroll-tax-cost-calculator\/"/);
});
