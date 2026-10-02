import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readdirSync } from "node:fs";
import { parseLines, plan, summarize } from "./engine.mjs";

const DOCS = "how-to-price-a-csa-share.html";
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

test("the page's worked example is the fixture and its defaults match the engine's", async () => {
  const page = await read("index.html");
  const m = /const EXAMPLE_SOURCE = `([\s\S]*?)`;/.exec(page);
  assert.ok(m, "expected EXAMPLE_SOURCE in index.html");
  assert.equal(m[1].trim(), (await read("fixtures/box.csv")).trim());
  const ids = { weeks: 20, shares: 60, price: 500, fee: 3, packaging: 1.5, delivery: 0.8, packmin: 8, rate: 20, fixed: 6000, capacity: 120, elasticity: 1.2, wage: 20 };
  for (const [id, v] of Object.entries(ids)) assert.match(page, new RegExp(`id="${id}" value="${v}"`), id);
  const p = plan(parseLines(m[1]), {});
  assert.equal(summarize(p).status, "loss");
});

test("the docs page's worked example matches the engine", async () => {
  const p = plan(parseLines("Salad,2,5,0.8,5,10\nTomatoes,3,4,0.6,4,6"), { seasonWeeks: 10, shares: 40, price: 150, packaging: 1, delivery: 0, packMinutes: 5, fixedCosts: 1000, elasticity: 0 });
  const doc = await read(DOCS);
  for (const s of ["$172.00", "1.15", "$26.80", "$10.00", "3.7 hours", "$108.70", "$3,348.00", "148 hours", "$22.62", "$388.00", "$140.00", "29 shares"]) assert.ok(doc.includes(s), s);
  assert.ok(Math.abs(p.now.beforePay - 3348) < 1e-6 && Math.abs(p.now.afterPay - 388) < 1e-6 && Math.abs(p.wagePrice - 140) < 1e-6);
  assert.equal(Math.ceil(p.breakEvenShares), 29);
});

test("index links to sibling tools", async () => {
  const idx = await read("index.html");
  for (const s of ["market-garden-bed-planner", "market-event-picker", "food-truck-event-margin-calculator"]) assert.ok(idx.includes(`href="../${s}/"`), s);
});
