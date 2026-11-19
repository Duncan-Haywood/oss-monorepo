import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

test("index page carries the disclaimer and says nothing is uploaded", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not legal, construction, engineering or professional advice/);
  assert.match(html, /never leaves your browser/);
});

test("the page and the modules it loads never send the book anywhere", () => {
  for (const f of ["index.html", "engine.mjs", "worker.mjs", "pdf-text.mjs", "pdf-parser.mjs", "inflate-browser.mjs", "usage.mjs"]) assert.doesNotMatch(page(f), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket/, f);
});

test("every id the script reads exists in the markup", () => {
  const html = page("index.html");
  const script = /<script type="module">([\s\S]*?)<\/script>/.exec(html)[1];
  for (const m of script.matchAll(/\$\("#(\w+)"\)/g)) assert.match(html, new RegExp(`id="${m[1]}"`), m[1]);
});

test("accuracy numbers on the page match the README", () => {
  const html = page("index.html"), readme = page("README.md");
  for (const n of ["99.3%", "12,952", "99.9%", "98.8%"]) { assert.ok(html.includes(n), n); assert.ok(readme.includes(n), n); }
});

test("links its sibling ids-model-check (crawlable pair, platform/pages/siblings.mjs)", () => {
  assert.match(page("index.html"), /href="\.\.\/ids-model-check\/"/);
});
