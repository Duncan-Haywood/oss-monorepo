import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { RATES, RATES_AS_OF } from "./calc.mjs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

test("index page carries the disclaimer, privacy line, customer-data note and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not legal, tax, accounting, VAT, compliance, or financial advice/);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /Customer data/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /<script type="application\/ld\+json">/);
});

test("the page says rates change and tells the reader to verify them against the Commission and the authority", () => {
  const html = page("index.html");
  assert.match(html, /rates change/i);
  assert.match(html, /European Commission's VAT rates page/);
  assert.match(html, /your tax authority/);
  assert.match(html, /from memory/);
  assert.ok(html.includes('id="asof"'));
  assert.match(page("calc.mjs"), new RegExp(`RATES_AS_OF = "${RATES_AS_OF}"`));
});

test("the page states it is independent of the Commission and every tax authority", () => {
  const html = page("index.html");
  assert.match(html, /Not affiliated with the European Commission or any tax authority/);
  assert.match(html, /not sponsored, endorsed or connected to the European Commission/);
});

test("it is arithmetic on the user's own data and says what it leaves out", () => {
  const html = page("index.html");
  assert.match(html, /arithmetic on your own data/);
  assert.match(html, /Not modelled/);
  assert.match(html, /IOSS/);
  assert.match(html, /rounded once per country and per rate/);
});

test("the page takes no payment and nothing can send the file anywhere", () => {
  const html = page("index.html");
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|stripe|checkout/i);
  assert.doesNotMatch(page("calc.mjs"), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|import\(|require\(/);
  assert.doesNotMatch(page("calc.mjs"), /^import /m);
});

test("the module scripts import only local files, so nothing is loaded from a network host", () => {
  const html = page("index.html");
  const imports = [...html.matchAll(/from "([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(imports.sort(), ["./calc.mjs", "./usage.mjs"]);
  assert.doesNotMatch(html, /<script[^>]+src=["']https?:/);
  assert.doesNotMatch(html, /<link[^>]+href=["']https?:[^>]*stylesheet/);
});

test("inputs have labels", () => {
  const html = page("index.html");
  for (const id of ["seller", "supply", "ossmode", "prior", "originrate", "file", "paste", "basis", "period", "dateorder", "decimal"]) {
    assert.match(html, new RegExp(`<label for="${id}">`), id);
  }
});

test("the seller select offers every member state in the table and the non-Union option", () => {
  const html = page("index.html");
  for (const r of RATES) assert.ok(html.includes(`<option value="${r.code}">${r.name}</option>`), r.code);
  assert.match(html, /<option value="NONEU">Outside the EU/);
});

test("usage events named on the page are the ones the code records", () => {
  const html = page("index.html");
  for (const e of ["file_analyzed", "example_loaded", "summary_exported"]) {
    assert.match(html, new RegExp(`record\\("${e}"\\)`));
    assert.match(html, new RegExp(`<code>${e}</code>`));
  }
});

test("related-tool links point at ventures that exist", () => {
  const links = [...page("index.html").matchAll(/href="\.\.\/([a-z0-9-]+)\/"/g)];
  assert.ok(links.length >= 2);
  for (const m of links) assert.ok(existsSync(new URL(`../${m[1]}/VENTURE.yaml`, import.meta.url)), m[1]);
});

test("every id the script reads exists on the page", () => {
  const html = page("index.html");
  const ids = new Set([...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]));
  const used = [...html.matchAll(/\$\("#([a-z-]+)"\)|getElementById\("([a-z-]+)"\)/g)].map((m) => m[1] || m[2]);
  assert.ok(used.length > 20);
  for (const id of used) assert.ok(ids.has(id), id);
});

test("the FAQ in the structured data matches the visible questions and answers", () => {
  const html = page("index.html");
  const ld = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  const faq = ld.find((x) => x["@type"] === "FAQPage");
  assert.ok(faq.mainEntity.length >= 8);
  for (const q of faq.mainEntity) assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
});

test("the FAQ answers the registration, threshold, rounding, FX and records questions", () => {
  const html = page("index.html");
  assert.match(html, /Do I need to register for the EU VAT OSS\?/);
  assert.match(html, /EUR 10,000/);
  assert.match(html, /European Central Bank reference rate/);
  assert.match(html, /10 years/);
  assert.match(html, /two non-conflicting pieces/);
});

test("robots and sitemap let crawlers find the page", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
});

test("the page has one main landmark, a language and a viewport", () => {
  const html = page("index.html");
  assert.match(html, /<html lang="en">/);
  assert.match(html, /name="viewport"/);
  assert.equal([...html.matchAll(/<main>/g)].length, 1);
});

test("the venture file keeps an Unverified section and the kill criteria", () => {
  const y = page("VENTURE.yaml");
  assert.match(y, /Unverified/);
  assert.match(y, /kill_criteria:/);
  assert.match(y, /https:\/\/duncan-haywood\.github\.io\/monorepo-projects\/eu-vat-oss-calculator\//);
});
