import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readdirSync } from "node:fs";
import { parseOrders, analyze, summarize } from "./engine.mjs";

const DOCS = "free-shipping-threshold-guide.html";
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
});

test("every .html file is in the sitemap", async () => {
  const sitemap = await read("sitemap.xml");
  for (const name of readdirSync(new URL("./", import.meta.url)).filter((n) => n.endsWith(".html") && n !== "index.html")) {
    assert.ok(sitemap.includes(name), `${name} missing from sitemap.xml`);
  }
});

test("the page's worked example demonstrates the headline finding (dogfooding)", async () => {
  const page = await read("index.html");
  const m = /const EXAMPLE_SOURCE = `([\s\S]*?)`;/.exec(page);
  assert.ok(m, "expected EXAMPLE_SOURCE in index.html");
  assert.equal(m[1].trim(), (await read("fixtures/orders.csv")).trim());
  const s = /const EXAMPLE_SETTINGS = \{ current: (\d+), margin: (\d+), fee: ([\d.]+) \};/.exec(page);
  assert.ok(s, "expected EXAMPLE_SETTINGS in index.html");
  const report = analyze(parseOrders(m[1]), { current: Number(s[1]), margin: Number(s[2]) / 100, fee: Number(s[3]) });
  assert.ok(report.findings.some((f) => f.rule === "better-threshold"));
  assert.equal(summarize(report).status, "warn");
});

test("index links to sibling seller tools", async () => {
  const idx = await read("index.html");
  for (const s of ["bundle-discount-optimizer", "shipping-box-size-optimizer", "shopify-inventory-reorder-planner"]) assert.ok(idx.includes(`href="../${s}/"`), s);
});
