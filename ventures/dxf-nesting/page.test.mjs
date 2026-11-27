import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

test("index page carries the disclaimer, privacy line, and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not engineering, fabrication or financial advice/);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
});

test("inputs have labels and the page never sends drawings anywhere", () => {
  const html = page("index.html");
  for (const id of ["files", "skipLayers", "defaultQty", "sheetW", "sheetH", "gap", "margin", "rotations", "res", "maxSheets", "search", "remnantFiles", "stockList", "fullAfter", "machineRate", "cutSpeed", "pierceSeconds", "markSpeed", "sheetPrice", "materialBasis", "handlingMinutes", "setupMinutes", "markupPct", "minimumCharge"]) assert.match(html, new RegExp(`<label for="${id}">`));
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon/);
  for (const f of ["job.mjs", "nest.mjs", "dxf.mjs", "geom.mjs", "quote.mjs"]) assert.doesNotMatch(page(f), /fetch\(|XMLHttpRequest|sendBeacon/);
});

test("page states what is not modelled", () => {
  assert.match(page("index.html"), /Not modelled/);
});

test("every id the script reads exists in the markup", () => {
  const html = page("index.html");
  const script = /<script type="module">([\s\S]*?)<\/script>/.exec(html)[1];
  for (const m of script.matchAll(/\$\("#(\w+)"\)/g)) assert.match(html, new RegExp(`id="${m[1]}"`), m[1]);
});

test("JSON-LD blocks parse, the FAQ matches the visible questions, and the inline module is valid", () => {
  const html = page("index.html");
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((b) => JSON.parse(b[1]));
  assert.equal(blocks.length, 2);
  for (const q of blocks[1].mainEntity) assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
  const m = /<script type="module">([\s\S]*?)<\/script>/.exec(html);
  assert.doesNotThrow(() => new Function(m[1].replace(/^\s*import .*$/gm, "")));
});

test("sibling links resolve to real ventures", () => {
  for (const s of ["laser-cutting-engraving-job-price-calculator", "cnc-machining-quote-calculator", "cut-list-optimizer"]) {
    assert.match(page("index.html"), new RegExp(`href="\\.\\./${s}/"`));
    assert.ok(existsSync(new URL(`../${s}/index.html`, import.meta.url)));
  }
});

test("robots and sitemap let crawlers find the page", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
});

test("the pricing step has no built-in rates: every rate field starts empty", () => {
  const html = page("index.html");
  for (const id of ["machineRate", "cutSpeed", "pierceSeconds", "markSpeed", "sheetPrice", "handlingMinutes", "setupMinutes", "markupPct", "minimumCharge"]) {
    const tag = new RegExp(`<input[^>]*id="${id}"[^>]*>`).exec(html)[0];
    assert.doesNotMatch(tag, /\svalue=/, id);
  }
  assert.match(html, /In development — early access/);
});
