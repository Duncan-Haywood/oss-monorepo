import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
const IDS = ["history", "runs-per-month", "list-price", "slots", "days-out", "sold-now", "floor-pct", "fill-chance", "pkg-discount", "pkg-discount-6"];

test("index page carries the disclaimer, privacy line, and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /not legal, tax, or financial advice/);
  assert.match(html, /<script type="application\/ld\+json">/);
});

test("robots and sitemap let crawlers find the page", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("robots.txt"), /sitemap\.xml/);
  assert.match(page("sitemap.xml"), /index\.html/);
});

test("every input has an id and a visible label", () => {
  const html = page("index.html");
  for (const id of IDS) {
    assert.match(html, new RegExp(`id="${id}"`), `missing input #${id}`);
    assert.match(html, new RegExp(`<label for="${id}">`), `missing label for #${id}`);
  }
});

test("usage events are recorded", () => {
  const html = page("index.html");
  assert.match(html, /record\("plan_run"\)/);
  assert.match(html, /record\("example_loaded"\)/);
});

test("JSON-LD FAQ matches visible copy and the app is free", () => {
  const html = page("index.html");
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  const faq = blocks.find((p) => p["@type"] === "FAQPage");
  assert.ok(faq);
  for (const qa of faq.mainEntity) {
    assert.ok(html.includes(qa.name), `visible question missing: ${qa.name}`);
    assert.ok(html.includes(qa.acceptedAnswer.text), `visible answer missing for: ${qa.name}`);
  }
  assert.equal(blocks.find((p) => p["@type"] === "SoftwareApplication").offers.price, "0");
});

test("user-supplied labels are escaped before they reach innerHTML", () => {
  const html = page("index.html");
  assert.match(html, /const esc = /);
  assert.match(html, /\$\{esc\(r\.label\)\}/);
  assert.match(html, /errors\.map\(esc\)/);
});

test("nothing in this venture can reach the network", () => {
  for (const source of [page("calc.mjs"), page("index.html")]) {
    assert.doesNotMatch(source, /\bfetch\(/);
    assert.doesNotMatch(source, /XMLHttpRequest/);
    assert.doesNotMatch(source, /sendBeacon/);
  }
});

test("the page imports the functions calc.mjs exports", async () => {
  const calc = await import("./calc.mjs");
  const html = page("index.html");
  const imported = html.match(/import \{([^}]+)\} from "\.\/calc\.mjs"/)[1].split(",").map((s) => s.trim());
  for (const name of imported) assert.ok(name in calc, `calc.mjs has no export ${name}`);
});
