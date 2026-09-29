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
  assert.match(html, /<title>Appointment No-Show Analyzer/);
  assert.match(html, /<meta name="description" content="[^"]{80,}/);
  assert.match(html, /<link rel="canonical" href="\.\/index\.html">/);
  assert.match(html, /<meta property="og:title"/);
  assert.match(html, /<meta property="og:description"/);
  assert.match(html, /<h1>/);
  assert.match(html, /<html lang="en">/);
});

test("inputs have labels and the page never sends the file anywhere", () => {
  const html = page("index.html");
  for (const id of ["file", "paste", "notice", "price", "minns", "dateorder", "fee", "prevent", "collect", "summary"]) assert.match(html, new RegExp(`<label for="${id}">`));
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
  assert.match(html, /Not modelled/);
  assert.match(html, /Reconciles/);
  assert.match(html, /estimates that depend entirely on the files you provide/);
  assert.match(html, /default price you type, which is a placeholder, not a measurement/);
  assert.match(html, /your assumptions, not a forecast/);
  assert.match(html, /few bookings|small sample/);
});

test("page states it is independent of the scheduling vendors it names", () => {
  const html = page("index.html");
  assert.match(html, /Not affiliated with Square, Acuity, Calendly, Vagaro, Fresha or Booksy/);
  assert.match(html, /not sponsored, endorsed or connected to any of them/);
});

test("page says the column aliases are unverified and the default price is a placeholder", () => {
  const html = page("index.html");
  assert.match(html, /unverified against real Square Appointments, Acuity, Calendly, Vagaro, Fresha or Booksy exports/);
  assert.match(html, /placeholder/);
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

test("page links reciprocally to the no-show fee and appointment deposit calculators, which link back", () => {
  const html = page("index.html");
  for (const other of ["no-show-fee-calculator", "appointment-deposit-calculator"]) {
    assert.match(html, new RegExp(`href="\\.\\./${other}/"`));
    const theirs = readFileSync(new URL(`../${other}/index.html`, import.meta.url), "utf8");
    assert.match(theirs, /href="\.\.\/appointment-no-show-analyzer\/"/);
  }
});

test("the sample-data button and the CSV download are wired", () => {
  const html = page("index.html");
  assert.match(html, /id="load-example"/);
  assert.match(html, /id="download"/);
  assert.match(html, /reportCsv\(last\)/);
});

test("README, LICENSE and VENTURE.yaml exist and carry the disclaimer and the venture name", () => {
  assert.match(page("README.md"), /No warranty/);
  assert.match(page("README.md"), /Nothing is uploaded|nothing is uploaded/);
  assert.match(page("LICENSE"), /MIT License/);
  assert.match(page("VENTURE.yaml"), /^name: appointment-no-show-analyzer$/m);
});
