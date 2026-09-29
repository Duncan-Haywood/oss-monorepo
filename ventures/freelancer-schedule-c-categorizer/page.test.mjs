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

test("JSON-LD blocks parse and describe a free application and a FAQ", () => {
  const blocks = [...page("index.html").matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]));
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0]["@type"], "SoftwareApplication");
  assert.equal(blocks[0].offers.price, "0");
  assert.equal(blocks[1]["@type"], "FAQPage");
  assert.ok(blocks[1].mainEntity.length >= 5);
});

test("inputs have labels and the page never sends the file anywhere", () => {
  const html = page("index.html");
  for (const id of ["file", "paste", "props", "rules", "year", "safe", "invert", "dayfirst", "summary"]) assert.match(html, new RegExp(`<label for="${id}">`));
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource/);
  assert.doesNotMatch(page("calc.mjs"), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket/);
});

test("the module scripts import only local files", () => {
  const html = page("index.html");
  assert.deepEqual([...html.matchAll(/from "([^"]+)"/g)].map((m) => m[1]).sort(), ["./calc.mjs", "./usage.mjs"]);
  assert.doesNotMatch(html, /<script[^>]+src=["']https?:/);
});

test("the inline script parses once its imports are removed", () => {
  const src = page("index.html").match(/<script type="module">([\s\S]*?)<\/script>/)[1];
  assert.doesNotThrow(() => new Function(src.replace(/^\s*import .*$/gm, "")));
});

test("every identifier the page imports from calc.mjs is exported", async () => {
  const names = page("index.html").match(/import \{([^}]+)\} from "\.\/calc\.mjs"/)[1].split(",").map((s) => s.trim());
  const mod = await import("./calc.mjs");
  for (const n of names) assert.ok(n in mod, `${n} is imported by the page but not exported`);
});

test("every element id the script reads exists in the markup", () => {
  const html = page("index.html");
  const ids = new Set([...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]));
  const script = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
  for (const m of script.matchAll(/\$\("#([\w-]+)"\)/g)) assert.ok(ids.has(m[1]), `#${m[1]} is used by the script but missing from the page`);
});

test("page documents the model and what it leaves out", () => {
  const html = page("index.html");
  assert.match(html, /Not modelled/);
  assert.match(html, /Reconciles/);
  assert.match(html, /not tax advice/i);
  assert.match(html, /estimates that depend entirely on the files you provide/);
  assert.match(html, /Held out, on purpose/);
  assert.match(html, /net of fees/);
});

test("page states it is independent of banks and the IRS", () => {
  assert.match(page("index.html"), /Not affiliated with any bank or the IRS/);
  assert.match(page("index.html"), /not sponsored, endorsed or connected to any of them/);
});

test("robots and sitemap let crawlers find the page", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
});

test("usage events named on the page are the ones the code records", () => {
  const html = page("index.html");
  for (const e of ["csv_categorized", "example_loaded"]) {
    assert.match(html, new RegExp(`record\\("${e}"\\)`));
    assert.match(html, new RegExp(`<code>${e}</code>`));
  }
});

test("page says the column aliases are unverified and that it does not decide equipment treatment", () => {
  const html = page("index.html");
  assert.match(html, /unverified against real bank exports/);
  assert.match(html, /It does not decide/);
});

test("page links to the sibling tools it names, and those tools exist", () => {
  const html = page("index.html");
  for (const slug of ["self-employment-tax-calculator", "quarterly-estimated-tax-calendar", "home-office-deduction-calculator", "mileage-deduction-method-calculator", "1099k-reconciliation-worksheet"]) {
    assert.match(html, new RegExp(`href="\\.\\./${slug}/"`));
    assert.ok(readFileSync(new URL(`../${slug}/index.html`, import.meta.url), "utf8").length > 0);
  }
});

test("the sample-data button and the CSV download are wired", () => {
  const html = page("index.html");
  assert.match(html, /id="load-example"/);
  assert.match(html, /id="download"/);
  assert.match(html, /reportCsv\(last\)/);
});
