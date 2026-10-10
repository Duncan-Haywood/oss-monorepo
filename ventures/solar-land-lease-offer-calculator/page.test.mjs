import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

test("index page carries the disclaimer, privacy line, and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not legal, tax, or financial advice/);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
});

test("inputs have labels and the page never sends numbers anywhere", () => {
  const html = page("index.html");
  for (const id of ["acres", "rent", "esc", "alt"]) assert.match(html, new RegExp(`<label for="${id}">`));
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon/);
});

test("page states the rules and the limits", () => {
  const html = page("index.html");
  assert.match(html, /Not modelled/);
  assert.match(html, /Break-even rent/);
  assert.match(html, /Break-even escalator/);
});

test("JSON-LD blocks parse and the inline module script is syntactically valid", () => {
  const html = page("index.html");
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)];
  assert.equal(blocks.length, 2);
  for (const b of blocks) JSON.parse(b[1]);
  const m = /<script type="module">([\s\S]*?)<\/script>/.exec(html);
  assert.ok(m);
  assert.doesNotThrow(() => new Function(m[1].replace(/^\s*import .*$/gm, "")));
});

test("sibling links resolve to real ventures", async () => {
  const { existsSync } = await import("node:fs");
  for (const s of ["grazing-lease-rate-calculator", "hunting-lease-income-calculator", "farmland-lease-cash-rent-vs-crop-share-calculator", "commercial-solar-ppa-lease-buy-calculator"]) {
    assert.match(page("index.html"), new RegExp(`href="\\.\\./${s}/"`));
    assert.ok(existsSync(new URL(`../${s}/index.html`, import.meta.url)));
  }
});

test("robots and sitemap let crawlers find the page", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
});
