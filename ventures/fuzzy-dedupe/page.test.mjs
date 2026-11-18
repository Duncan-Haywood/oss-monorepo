import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

test("index page carries the disclaimer, privacy line, citation and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not legal, tax, accounting, compliance, or financial advice/);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /Method and citation/);
  assert.match(html, /@article\{fellegi1969/);
  assert.match(html, /<script type="application\/ld\+json">/);
});

test("every static input has a label and nothing can send data anywhere", () => {
  const html = page("index.html");
  for (const id of ["file", "csv", "matchThreshold", "differentNameGuard"]) assert.match(html, new RegExp(`<label for="${id}">`), id);
  for (const f of ["index.html", "engine.mjs", "example-data.mjs"]) assert.doesNotMatch(page(f), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource/, f);
});

test("the module script imports only local files", () => {
  const imports = [...page("index.html").matchAll(/from "([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(imports.sort(), ["./engine.mjs", "./example-data.mjs", "./usage.mjs"]);
  assert.doesNotMatch(page("index.html"), /<script[^>]+src=["']https?:/);
});

test("page states what it does not decide and that the example is a placeholder", () => {
  assert.match(page("index.html"), /Not decided/);
  assert.match(page("index.html"), /invented placeholder data/i);
});

test("usage events named on the page are the ones the code records", () => {
  const html = page("index.html");
  const footer = html.slice(html.indexOf("<footer>"), html.indexOf("</footer>"));
  const named = [...footer.matchAll(/<code>([a-z_]+)<\/code>/g)].map((m) => m[1]).sort();
  const recorded = [...html.matchAll(/record\("([a-z_]+)"\)/g)].map((m) => m[1]);
  assert.deepEqual(named, [...new Set(recorded)].sort());
});

test("benchmark figures on the page match the eval output", () => {
  const html = page("index.html");
  const ev = page("eval/febrl-2026-11-13.txt");
  for (const [set, recall] of [["Febrl 1 @0.9", "0.998"], ["Febrl 2 @0.9", "0.996"], ["Febrl 3 @0.9", "0.998"]]) {
    const line = ev.split("\n").find((l) => l.startsWith(set));
    assert.ok(line.includes(`1.000 / ${recall}`), set);
    assert.match(html, new RegExp(`${(Number(recall) * 100).toFixed(1).replace(".", "\\.")}%`));
  }
});

test("robots, sitemap and llms.txt are present", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
  assert.match(page("llms.txt"), /fuzzy-dedupe/);
});
