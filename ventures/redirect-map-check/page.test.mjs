import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

test("index page carries the disclaimer, privacy line, independence note and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not legal, tax, accounting, compliance, or financial advice/);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /Not affiliated with any platform/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /<script type="application\/ld\+json">/);
});

test("inputs have labels and neither page nor engine can send the file anywhere", () => {
  const html = page("index.html");
  for (const id of ["file", "paste", "newurls", "oldurls", "site", "format", "case", "fixed-out"]) assert.match(html, new RegExp(`<label for="${id}">`));
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource/);
  assert.doesNotMatch(page("calc.mjs"), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket/);
});

test("the module scripts import only local files", () => {
  const html = page("index.html");
  const imports = [...html.matchAll(/from "([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(imports.sort(), ["./calc.mjs", "./usage.mjs"]);
  assert.doesNotMatch(html, /<script[^>]+src=["']https?:/);
});

test("page states what is from memory and what is not checked", () => {
  const html = page("index.html");
  assert.match(html, /Not checked/);
  assert.match(html, /read from memory of public help pages/);
  assert.match(html, /Test a sample of live URLs after you deploy/);
});

test("every output format offered is one the engine renders", async () => {
  const { FORMATS, render } = await import("./calc.mjs");
  const html = page("index.html");
  for (const f of FORMATS) {
    assert.match(html, new RegExp(`<option value="${f}"`));
    assert.ok(render([{ from: "/a", to: "/b", status: 301 }], f).length > 0, f);
  }
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

test("page offers sample-data buttons and a downloadable cleaned map", () => {
  const html = page("index.html");
  for (const id of ["load-example", "load-broken", "download-fixed", "optout"]) assert.match(html, new RegExp(`id="${id}"`));
});
