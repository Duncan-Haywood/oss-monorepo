import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

test("index page carries the disclaimer, privacy line, and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not legal, tax, or financial advice/);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /never uploaded/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /Keep paying the amount your servicer bills while you ask/);
});

test("JSON-LD blocks parse and describe a free application and a FAQ", () => {
  const blocks = [...page("index.html").matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]));
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0]["@type"], "SoftwareApplication");
  assert.equal(blocks[0].offers.price, "0");
  assert.equal(blocks[1]["@type"], "FAQPage");
  assert.ok(blocks[1].mainEntity.length >= 6);
  const html = page("index.html");
  for (const q of blocks[1].mainEntity) assert.ok(html.includes(`<h3>${q.name.replace(/&/g, "&amp;")}</h3>`), q.name);
});

test("SEO basics: title, description, canonical and Open Graph tags", () => {
  const html = page("index.html");
  assert.match(html, /<title>Mortgage Escrow Analysis Checker/);
  assert.match(html, /<meta name="description" content="[^"]{80,}/);
  assert.match(html, /<link rel="canonical" href="\.\/index\.html">/);
  assert.match(html, /<meta property="og:title"/);
  assert.match(html, /<meta property="og:description"/);
  assert.match(html, /<h1>/);
  assert.match(html, /<html lang="en">/);
});

test("every input has a label or an aria-label and nothing is sent anywhere", () => {
  const html = page("index.html");
  const inputs = [...html.matchAll(/<(input|select|textarea)\b[^>]*>/g)].map((m) => m[0]);
  assert.ok(inputs.length > 25);
  for (const tag of inputs) {
    const id = tag.match(/\sid="([^"]+)"/)?.[1];
    assert.ok(/aria-label=/.test(tag) || (id && html.includes(`<label for="${id}">`)), `unlabelled: ${tag}`);
  }
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|importScripts/);
  assert.doesNotMatch(page("calc.mjs"), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|import\(/);
  assert.doesNotMatch(page("usage.mjs"), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket/);
  assert.doesNotMatch(html, /<form[^>]+action=/i);
});

test("the module scripts import only local files", () => {
  const html = page("index.html");
  assert.deepEqual([...html.matchAll(/from "([^"]+)"/g)].map((m) => m[1]).sort(), ["./calc.mjs", "./usage.mjs"]);
  assert.doesNotMatch(html, /<script[^>]+src=["']https?:/);
  assert.doesNotMatch(page("calc.mjs"), /^\s*import\s/m);
});

test("the inline script parses once its imports are removed", () => {
  const src = page("index.html").match(/<script type="module">([\s\S]*?)<\/script>/)[1];
  assert.doesNotThrow(() => new Function(src.replace(/^\s*import .*$/gm, "")));
});

test("every name the inline script imports is exported by calc.mjs", async () => {
  const src = page("index.html").match(/import \{([^}]+)\} from "\.\/calc\.mjs"/)[1].split(",").map((s) => s.trim());
  const calc = await import("./calc.mjs");
  for (const name of src) assert.equal(typeof calc[name], "function", name);
});

test("every element the script looks up exists on the page", () => {
  const html = page("index.html");
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  const used = [...html.matchAll(/\$\("#([\w-]+)"\)|getElementById\("([\w-]+)"\)/g)].map((m) => m[1] || m[2]);
  assert.ok(used.length > 20);
  for (const id of used) assert.ok(ids.has(id), `#${id} is used by the script but missing from the markup`);
  for (const i of [1, 2, 3, 4, 5]) for (const p of ["name", "amt", "mon"]) assert.ok(ids.has(p + i), p + i);
});

test("page documents the model, cites the rule and says what it leaves out", () => {
  const html = page("index.html");
  assert.match(html, /Not checked/);
  assert.match(html, /12 CFR 1024\.17\(c\)\(5\)/);
  assert.match(html, /12 CFR 1024\.17\(f\)\(3\)/);
  assert.match(html, /a question, not a finding that a servicer is wrong/);
  assert.match(html, /not a refund you are owed/);
  assert.match(html, /Unverified/);
});

test("page states it is independent", () => {
  assert.match(page("index.html"), /Not affiliated with any mortgage lender, servicer/);
});

test("the letter never accuses and the page does not claim a servicer erred", () => {
  const html = page("index.html");
  assert.doesNotMatch(html, /overcharg|you were defrauded|illegal escrow|violates/i);
  assert.match(html, /Does this prove my servicer made a mistake\?/);
});

test("robots and sitemap let crawlers find the page", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
});

test("usage events named on the page are the ones the code records", () => {
  const html = page("index.html");
  for (const e of ["escrow_analyzed", "example_loaded", "report_downloaded"]) {
    assert.match(html, new RegExp(`record\\("${e}"\\)`));
    assert.match(html, new RegExp(`<code>${e}</code>`));
  }
  assert.match(html, /never with any of your data/);
  assert.match(html, /id="optout"/);
});

test("the sample, what-if, letter and CSV download are wired", () => {
  const html = page("index.html");
  for (const id of ["load-example", "wi-run", "download", "copy"]) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /whatIf\(lastInput/);
  assert.match(html, /reportCsv\(last\)/);
  assert.match(html, /requestLetter\(last/);
});

test("README, LICENSE and VENTURE.yaml exist and carry the disclaimer and the venture name", () => {
  assert.match(page("README.md"), /No warranty/);
  assert.match(page("LICENSE"), /MIT License/);
  assert.match(page("VENTURE.yaml"), /^name: mortgage-escrow-analysis-checker$/m);
});

test("page links to the property tax appeal calculator, which links back", () => {
  assert.match(page("index.html"), /href="\.\.\/property-tax-appeal-calculator\/"/);
  const theirs = readFileSync(new URL("../property-tax-appeal-calculator/index.html", import.meta.url), "utf8");
  assert.match(theirs, /href="\.\.\/mortgage-escrow-analysis-checker\/"/);
});
