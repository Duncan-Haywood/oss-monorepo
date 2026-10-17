import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readdirSync } from "node:fs";
import { parseSales, analyzeSales, summarizeSales } from "./engine.mjs";

const DOCS = "ticket-resale-guide.html";
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

test("the page's worked example is the fixture and shows a losing sale (dogfooding)", async () => {
  const page = await read("index.html");
  const m = /const EXAMPLE_SOURCE = `([\s\S]*?)`;/.exec(page);
  assert.ok(m, "expected EXAMPLE_SOURCE in index.html");
  assert.equal(m[1].trim(), (await read("fixtures/sales.csv")).trim());
  const report = analyzeSales(parseSales(m[1]));
  assert.ok(report.losers.length > 0);
  assert.equal(summarizeSales(report).status, "ok");
});

test("usage events named on the page are the ones the code records", async () => {
  const idx = await read("index.html");
  for (const ev of ["price_run", "analyze_run", "example_loaded"]) {
    assert.ok(idx.includes(`record("${ev}")`), ev);
    assert.ok(idx.includes(`<code>${ev}</code>`), ev);
  }
});

test("index links to sibling tools", async () => {
  const idx = await read("index.html");
  for (const s of ["stockx-seller-payout-calculator", "where-to-sell-calculator", "ebay-fee-calculator", "depop-fee-calculator"]) assert.ok(idx.includes(`href="../${s}/"`), s);
});
