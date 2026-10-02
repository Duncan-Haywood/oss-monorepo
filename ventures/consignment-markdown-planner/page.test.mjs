import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readdirSync } from "node:fs";
import { parseItems, plan, summarize, money } from "./engine.mjs";

const DOCS = "how-should-a-consignment-shop-mark-down.html";
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

test("the page's worked example is the fixture and demonstrates a real gain", async () => {
  const page = await read("index.html");
  const m = /const EXAMPLE_SOURCE = `([\s\S]*?)`;/.exec(page);
  assert.ok(m, "expected EXAMPLE_SOURCE in index.html");
  assert.equal(m[1].trim(), (await read("fixtures/items.csv")).trim());
  const inputs = { weeks: 12, lift: 0.35, handling: 2, slow: 60 };
  for (const [id, v] of Object.entries(inputs)) assert.match(page, new RegExp(`id="${id}" value="${v}"`));
  const p = plan(parseItems(m[1]), { weeks: 12, lift: 0.35, handling: 2, slow: 60, levels: "0,10,25,40,50" });
  assert.ok(p.totals.upliftVsStandard > 1);
  assert.ok(p.declined.length >= 1);
  assert.equal(summarize(p).status, "gain");
});

test("the docs page's worked example matches the engine", async () => {
  const p = plan(parseItems("Designer silk blazer,120,8,40,0.60,12"), {});
  const x = p.items[0];
  assert.equal(money(x.net), "$26.76");
  assert.equal(money(x.standard.net), "$25.45");
  assert.equal(money(x.noMarkdown.net), "$23.61");
  assert.equal(Math.round(x.plan.sold * 100), 81);
  assert.equal(Math.round(x.noMarkdown.sold * 100), 63);
  assert.equal(money(x.plan.consignorPayout), "$49.23");
  const tee = plan(parseItems("Graphic tee,12,10,40,0.60,12"), {}).items[0];
  assert.equal(money(tee.net), "-$1.63");
  assert.equal(money(tee.minPriceToAccept), "$17.93");
  assert.equal((tee.minShareToAccept * 100).toFixed(1), "59.8");
  const doc = await read(DOCS);
  for (const s of ["$26.76", "$25.45", "$23.61", "81%", "63%", "$49.23", "$1.63", "$17.93", "59.8%"]) assert.ok(doc.includes(s), s);
});

test("index links to sibling tools", async () => {
  const idx = await read("index.html");
  for (const s of ["clearance-markdown-planner", "price-elasticity-estimator", "booth-rent-vs-commission"]) {
    assert.ok(idx.includes(`href="../${s}/"`), s);
  }
});
