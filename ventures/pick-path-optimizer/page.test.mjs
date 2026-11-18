import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DEFAULTS } from "./calc.mjs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

test("index page carries the disclaimer, privacy line and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not legal, tax, accounting, compliance, or financial advice/);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /<script type="application\/ld\+json">/);
});

test("every input has a label and nothing can send data anywhere", () => {
  const html = page("index.html");
  for (const id of Object.keys(DEFAULTS)) assert.match(html, new RegExp(`<label for="${id}">`), id);
  for (const id of ["locations", "orders"]) assert.match(html, new RegExp(`<label for="${id}">`));
  for (const f of ["index.html", "calc.mjs", "route.mjs"]) assert.doesNotMatch(page(f), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource/, f);
});

test("the module script imports only local files", () => {
  const imports = [...page("index.html").matchAll(/from "([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(imports.sort(), ["./calc.mjs", "./usage.mjs"]);
  assert.doesNotMatch(page("index.html"), /<script[^>]+src=["']https?:/);
});

test("page states what it does not decide and that the example is a placeholder", () => {
  assert.match(page("index.html"), /Not decided/);
  assert.match(page("index.html"), /placeholders, not/i);
});

test("usage events named on the page are the ones the code records", () => {
  const html = page("index.html");
  const named = [...html.matchAll(/<code>([a-z_]+)<\/code>/g)].map((m) => m[1]).sort();
  const recorded = [...html.matchAll(/record\("([a-z_]+)"\)/g)].map((m) => m[1]);
  assert.deepEqual(named, [...new Set(recorded)].sort());
});

test("robots, sitemap and llms.txt are present, and the slotting tool links here", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
  assert.match(page("llms.txt"), /pick-path-optimizer/);
  assert.ok(readFileSync(new URL("../warehouse-slotting-optimizer/index.html", import.meta.url), "utf8").includes('href="../pick-path-optimizer/"'));
});
