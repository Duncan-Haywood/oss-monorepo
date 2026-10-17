import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

test("index page carries the disclaimer, privacy line, and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not medical, legal, tax, or financial advice/);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /never uploaded/);
  assert.match(html, /health information/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
});

test("JSON-LD blocks parse and describe a free application and a FAQ", () => {
  const blocks = [...page("index.html").matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]));
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0]["@type"], "SoftwareApplication");
  assert.equal(blocks[0].offers.price, "0");
  assert.equal(blocks[1]["@type"], "FAQPage");
  assert.ok(blocks[1].mainEntity.length >= 5);
  // every FAQ question in the markup is the one in the JSON-LD
  const html = page("index.html");
  for (const q of blocks[1].mainEntity) assert.ok(html.includes(`<h3>${q.name.replace(/&/g, "&amp;")}</h3>`), q.name);
});

test("SEO basics: title, description, canonical and Open Graph tags", () => {
  const html = page("index.html");
  assert.match(html, /<title>Medical Bill Error Checker/);
  assert.match(html, /<meta name="description" content="[^"]{80,}/);
  assert.match(html, /<link rel="canonical" href="\.\/index\.html">/);
  assert.match(html, /<meta property="og:title"/);
  assert.match(html, /<meta property="og:description"/);
  assert.match(html, /<h1>/);
  assert.match(html, /<html lang="en">/);
});

test("inputs have labels and the page never sends the file anywhere", () => {
  const html = page("index.html");
  for (const id of ["file", "paste", "patient", "provider", "account", "letter"]) assert.match(html, new RegExp(`<label for="${id}">`));
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|navigator\.sendBeacon|importScripts/);
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
  const used = [...html.matchAll(/\$\("#([\w-]+)"\)|fill\("#([\w-]+)"|getElementById\("([\w-]+)"\)/g)].map((m) => m[1] || m[2] || m[3]);
  assert.ok(used.length > 20);
  for (const id of used) assert.ok(ids.has(id), `#${id} is used by the script but missing from the markup`);
});

test("page documents the model and what it leaves out", () => {
  const html = page("index.html");
  assert.match(html, /Not checked/);
  assert.match(html, /a question, not a finding that a bill is wrong/);
  assert.match(html, /not a refund you are owed/);
  assert.match(html, /short list/);
});

test("page states it is independent and flags the unverified aliases", () => {
  const html = page("index.html");
  assert.match(html, /Not affiliated with any hospital, clinic, insurer/);
  assert.match(html, /CPT is a registered trademark of the American Medical Association/);
  assert.match(html, /unverified against real hospital or clinic exports/);
});

test("the letter never accuses and the page does not claim a bill is wrong", () => {
  const html = page("index.html");
  assert.doesNotMatch(html, /overcharged you|you were defrauded|illegal billing/i);
  assert.match(html, /Does this prove my bill is wrong\?/);
});

test("robots and sitemap let crawlers find the page", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
});

test("usage events named on the page are the ones the code records", () => {
  const html = page("index.html");
  for (const e of ["csv_analyzed", "example_loaded", "report_downloaded"]) {
    assert.match(html, new RegExp(`record\\("${e}"\\)`));
    assert.match(html, new RegExp(`<code>${e}</code>`));
  }
  assert.match(html, /never with any of your data/);
  assert.match(html, /id="optout"/);
});

test("the sample-data button and the CSV download are wired", () => {
  const html = page("index.html");
  assert.match(html, /id="load-example"/);
  assert.match(html, /id="download"/);
  assert.match(html, /reportCsv\(last\)/);
  assert.match(html, /requestLetter\(last/);
});

test("README, LICENSE and VENTURE.yaml exist and carry the disclaimer and the venture name", () => {
  assert.match(page("README.md"), /No warranty/);
  assert.match(page("README.md"), /Nothing is uploaded|nothing is uploaded/);
  assert.match(page("LICENSE"), /MIT License/);
  assert.match(page("VENTURE.yaml"), /^name: medical-bill-error-checker$/m);
});

test("page links to the HSA contribution limit calculator, which links back", () => {
  const html = page("index.html");
  assert.match(html, /href="\.\.\/hsa-contribution-limit-calculator\/"/);
  const theirs = readFileSync(new URL("../hsa-contribution-limit-calculator/index.html", import.meta.url), "utf8");
  assert.match(theirs, /href="\.\.\/medical-bill-error-checker\/"/);
});
