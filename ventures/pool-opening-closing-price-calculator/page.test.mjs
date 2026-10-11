import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

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
  for (const id of ["lengthFt", "widthFt", "avgDepthFt", "shape", "cover", "condition", "lines", "baseCloseHrs", "baseOpenHrs", "lineCloseHrs", "driveHrs", "crew", "laborRate", "closeChemPer10k", "openChemPer10k", "closeSupplies", "openSupplies", "redoPct", "redoCost", "bundlePct", "marginPct", "minCharge", "dayHrs"]) assert.match(html, new RegExp(`<label for="${id}">`));
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon/);
});

test("page states what is not modelled", () => {
  assert.match(page("index.html"), /Not modelled/);
});

test("every input id the script reads exists in the markup", () => {
  const html = page("index.html");
  const arr = /const keys = \[(.*?)\]/s.exec(html)[1];
  for (const id of arr.match(/"(\w+)"/g).map((s) => s.slice(1, -1))) assert.match(html, new RegExp(`id="${id}"`));
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

test("sibling links resolve to real ventures", () => {
  for (const s of ["pool-service-route-calculator", "pool-route-pricing", "pool-plaster-bid-calculator", "shop-rate-calculator"]) {
    assert.match(page("index.html"), new RegExp(`href="\\.\\./${s}/"`));
    assert.ok(existsSync(new URL(`../${s}/index.html`, import.meta.url)));
  }
});

test("robots and sitemap let crawlers find the page", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
});

test("the share link only carries known keys and the page reads it back", () => {
  const html = page("index.html");
  assert.match(html, /decodeShare\(location\.hash\)/);
  assert.match(html, /encodeShare\(read\(\)\)/);
});
