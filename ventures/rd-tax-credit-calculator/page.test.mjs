import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
const IDS = ["staff", "supplies", "contractors", "other-payroll", "prior-1", "prior-2", "prior-3", "avg-receipts", "fixed-base", "receipts", "years-since", "entity", "tax-rate"];

test("index page carries the disclaimer, privacy line, and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /<script type="application\/ld\+json">/);
});

test("index page says not tax advice and that a professional must judge qualification", () => {
  const html = page("index.html");
  assert.match(html, /not legal, tax, or financial advice/);
  assert.match(html, /qualified tax professional/);
  assert.match(html, /four-part test/);
});

test("robots and sitemap let crawlers find the page", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("robots.txt"), /sitemap\.xml/);
  assert.match(page("sitemap.xml"), /index\.html/);
});

test("index page names the assumptions it uses", () => {
  const html = page("index.html");
  for (const figure of ["\\$250,000", "\\$5 million", "\\$184,500", "65%", "14%"]) {
    assert.match(html, new RegExp(figure));
  }
});

test("inputs are present and each has a visible label", () => {
  const html = page("index.html");
  for (const id of IDS) {
    assert.match(html, new RegExp(`id="${id}"`), `missing input #${id}`);
    assert.match(html, new RegExp(`<label for="${id}">`), `missing label for #${id}`);
  }
});

test("usage events are recorded", () => {
  const html = page("index.html");
  assert.match(html, /record\("credit_estimated"\)/);
  assert.match(html, /record\("example_loaded"\)/);
});

test("JSON-LD FAQ matches visible copy and the app is free", () => {
  const html = page("index.html");
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  const faq = blocks.find((p) => p["@type"] === "FAQPage");
  assert.ok(faq);
  const visible = html.replace(/<script[\s\S]*?<\/script>/g, "").replace(/&amp;/g, "&");
  for (const qa of faq.mainEntity) {
    assert.ok(visible.includes(qa.name), `visible question missing: ${qa.name}`);
    assert.ok(visible.includes(qa.acceptedAnswer.text), `visible answer missing for: ${qa.name}`);
  }
  assert.equal(blocks.find((p) => p["@type"] === "SoftwareApplication").offers.price, "0");
});

test("nothing in this venture can reach the network", () => {
  for (const source of [page("calc.mjs"), page("index.html")]) {
    assert.doesNotMatch(source, /\bfetch\(/);
    assert.doesNotMatch(source, /XMLHttpRequest/);
  }
});

test("user-typed names are escaped before they reach innerHTML", () => {
  assert.match(page("index.html"), /esc\(p\.name\)/);
});

test("the page imports the functions calc.mjs exports", async () => {
  const calc = await import("./calc.mjs");
  const html = page("index.html");
  const imported = html.match(/import \{([^}]+)\} from "\.\/calc\.mjs"/)[1].split(",").map((s) => s.trim());
  for (const name of imported) assert.ok(name in calc, `calc.mjs has no export ${name}`);
});
