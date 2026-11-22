import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

test("index page carries the disclaimer, privacy line and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not engineering, safety or financial advice/);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
});

test("inputs have labels and nothing is sent anywhere", () => {
  const html = page("index.html");
  for (const m of html.matchAll(/<(?:input|select|textarea)[^>]*id="(\w+)"/g)) assert.match(html, new RegExp(`<label for="${m[1]}">`), m[1]);
  for (const f of ["index.html", "schedule.mjs", "reliability.mjs", "parts.mjs", "store.mjs", "report.mjs", "example.mjs"]) assert.doesNotMatch(page(f), /fetch\(|XMLHttpRequest|sendBeacon/, f);
});

test("every id the script reads exists in the markup", () => {
  const html = page("index.html");
  const script = /<script type="module">([\s\S]*?)<\/script>/.exec(html)[1];
  for (const m of script.matchAll(/\$\("#(\w+)"\)/g)) assert.match(html, new RegExp(`id="${m[1]}"`), m[1]);
  for (const m of script.matchAll(/"#(\w+)"/g)) assert.match(html, new RegExp(`id="${m[1]}"`), m[1]);
});

test("JSON-LD parses, the FAQ matches the visible questions, the module parses", () => {
  const html = page("index.html");
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((b) => JSON.parse(b[1]));
  assert.equal(blocks.length, 2);
  for (const q of blocks[1].mainEntity) {
    assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
    assert.ok(html.includes(`<p>${q.acceptedAnswer.text.replace(/'/g, "'")}</p>`), q.name);
  }
  const m = /<script type="module">([\s\S]*?)<\/script>/.exec(html);
  assert.doesNotThrow(() => new Function(m[1].replace(/^\s*import .*$/gm, "")));
});

test("page states what is not modelled", () => {
  assert.match(page("index.html"), /Not modelled/);
});

test("sibling links resolve to real ventures", () => {
  for (const s of ["fleet-repair-or-replace-planner", "spc-control-charts", "survival-analysis"]) {
    assert.match(page("index.html"), new RegExp(`href="\\.\\./${s}/"`));
    assert.ok(existsSync(new URL(`../${s}/index.html`, import.meta.url)), s);
  }
});

test("robots and sitemap let crawlers find the page", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
});
