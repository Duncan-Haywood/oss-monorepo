import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
const IDS = ["base", "cf", "threshold", "pureCf", "fixedSalary", "repayPct", "quality", "qualityEarned", "wrvus", "days", "patients", "wpv", "weeks", "fte", "hoursPerWeek", "signing", "clawbackMonths", "clawbackType", "leaveMonth", "retention", "yearsStay", "call", "cme", "tailCost", "tailPayer", "nonCompeteMonths", "structure"];

test("index page carries the disclaimer, privacy line, and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /<script type="application\/ld\+json">/);
});

test("index page says not legal or financial advice and ships no benchmark", () => {
  const html = page("index.html");
  assert.match(html, /not legal, tax, or financial advice/);
  assert.match(html, /Estimate only, not legal or financial advice/);
  assert.match(html, /ships no benchmark or market figure/);
  assert.match(html, /lawyer who reviews physician employment contracts/);
});

test("robots and sitemap let crawlers find the page", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("robots.txt"), /sitemap\.xml/);
  assert.match(page("sitemap.xml"), /index\.html/);
});

test("every input exists for both offers and each has a visible label", () => {
  const html = page("index.html");
  for (const prefix of ["a", "b"]) {
    for (const id of IDS) {
      assert.match(html, new RegExp(`id="${prefix}-${id}"`), `missing input #${prefix}-${id}`);
      assert.match(html, new RegExp(`<label for="${prefix}-${id}">`), `missing label for #${prefix}-${id}`);
    }
  }
});

test("the ids the script collects are the ids the page has", () => {
  const html = page("index.html");
  const list = (name) => html.match(new RegExp(`const ${name} = \\[([^\\]]+)\\]`))[1].match(/"([^"]+)"/g).map((s) => s.slice(1, -1));
  const collected = [...list("NUM"), ...list("SEL")].sort();
  assert.deepEqual(collected, [...IDS].sort());
});

test("usage events are recorded", () => {
  const html = page("index.html");
  assert.match(html, /record\("comp_estimated"\)/);
  assert.match(html, /record\("offers_compared"\)/);
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
  for (const source of [page("calc.mjs"), page("index.html"), page("usage.mjs")]) {
    assert.doesNotMatch(source, /\bfetch\(/);
    assert.doesNotMatch(source, /XMLHttpRequest/);
    assert.doesNotMatch(source, /sendBeacon/);
  }
});

test("no compensation-survey figures are invented on the page", () => {
  const html = page("index.html");
  assert.doesNotMatch(html, /median|\d+(st|th) percentile/i);
});

test("the page imports the functions calc.mjs exports", async () => {
  const calc = await import("./calc.mjs");
  const html = page("index.html");
  const imported = html.match(/import \{([^}]+)\} from "\.\/calc\.mjs"/)[1].split(",").map((s) => s.trim());
  for (const name of imported) assert.ok(name in calc, `calc.mjs has no export ${name}`);
});

test("user-visible strings from calc are escaped before innerHTML", () => {
  assert.match(page("index.html"), /esc\(f\.title\)/);
  assert.match(page("index.html"), /esc\(STRUCTURE_LABELS/);
});

test("footer links the sales commission plan comparison calculator", () => {
  assert.match(readFileSync(new URL("./index.html", import.meta.url), "utf8"), /href="\.\.\/sales-commission-plan-comparison-calculator\/"/);
});
