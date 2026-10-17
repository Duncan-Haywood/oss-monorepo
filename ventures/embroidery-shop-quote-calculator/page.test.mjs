import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readdirSync } from "node:fs";
import { analyze, DEFAULTS, money } from "./engine.mjs";

const DOCS = "how-much-to-charge-for-embroidery.html";
const read = (f) => readFile(new URL(`./${f}`, import.meta.url), "utf8");

test("index and docs link to each other", async () => {
  assert.ok((await read("index.html")).includes(`href="${DOCS}"`));
  assert.match(await read(DOCS), /href="\.\/"/);
});

test("both pages carry no-warranty, FAQ data; index carries sponsor, privacy and opt-out", async () => {
  for (const f of ["index.html", DOCS]) {
    const p = await read(f);
    assert.match(p, /no warranty/i, f);
    assert.match(p, /FAQPage/, f);
  }
  const idx = await read("index.html");
  assert.match(idx, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(idx, /never uploaded|never leaves your device/i);
  assert.match(idx, /id="optout"/);
  assert.match(idx, /record\("quote_run"\)/);
});

test("every .html file is in the sitemap", async () => {
  const sitemap = await read("sitemap.xml");
  for (const name of readdirSync(new URL("./", import.meta.url)).filter((n) => n.endsWith(".html") && n !== "index.html")) {
    assert.ok(sitemap.includes(name), `${name} missing from sitemap.xml`);
  }
});

test("every input is labelled and its default matches the engine's defaults", async () => {
  const page = await read("index.html");
  const fields = JSON.parse(/const FIELDS = (\{.*?\});/.exec(page)[1]);
  assert.ok(Object.keys(fields).length >= 19);
  for (const [id, key] of Object.entries(fields)) {
    assert.match(page, new RegExp(`<label for="${id}">`), `label for ${id}`);
    const m = new RegExp(`id="${id}"(?: value="([^"]*)")?`).exec(page);
    assert.ok(m, `input ${id}`);
    const want = DEFAULTS[key];
    assert.equal(m[1] === undefined ? null : Number(m[1]), want === null ? null : want, `${id} default`);
  }
  assert.match(page, /<label for="breaks">/);
});

test("the page's worked example is the engine's default job and demonstrates the flat rule losing money", async () => {
  const page = await read("index.html");
  const m = /const EXAMPLE = (\{.*?\});/.exec(page);
  assert.ok(m, "expected EXAMPLE in index.html");
  const fields = JSON.parse(/const FIELDS = (\{.*?\});/.exec(page)[1]);
  const ex = Function(`return ${m[1]}`)();
  const input = {};
  for (const [id, key] of Object.entries(fields)) input[key] = ex[id];
  input.breakQtys = ex.breaks;
  const a = analyze(input);
  assert.deepEqual(a, analyze({}));
  assert.ok(a.breaks[0].flat.losesMoney);
  assert.equal(a.verdict.status, "take");
});

test("the docs page's worked example matches the engine", async () => {
  const a = analyze({});
  const doc = await read(DOCS);
  const c = a.quote.cost;
  assert.equal(money(c.total / 100), "$275.21");
  for (const s of ["248.4 clock minutes", "4.14 hours", "$108.00", "$18.00", "$82.81", "$41.40", "$25.00", "$275.21", "$458.69", "$19.12", "$458.88", "$183.67", "$64.36", "$288.00", "$12.79", "4.4%", "$23.09", "$144.00", "$155.86", "$11.86", "from 20 pieces"]) {
    assert.ok(doc.includes(s), s);
  }
  assert.equal(a.flatLosesBelow, 20);
  for (const b of a.breaks) {
    for (const s of [money(b.quote.perPieceCents / 100), money(b.quote.total / 100), money(b.flat.profit / 100)]) assert.ok(doc.includes(s), `${b.qty}: ${s}`);
  }
  assert.ok(Math.abs(a.breaks[1].dropPct - 11.7) < 0.5);
});

test("index links to sibling tools", async () => {
  const idx = await read("index.html");
  for (const s of ["apparel-decoration-price-calculator", "3d-print-price-calculator", "trade-show-roi-calculator"]) {
    assert.ok(idx.includes(`href="../${s}/"`), s);
  }
});
