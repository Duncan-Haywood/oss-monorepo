import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readdirSync } from "node:fs";
import { parseShows, plan, summarize } from "./engine.mjs";

const DOCS = "is-a-trade-show-booth-worth-it.html";
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
  assert.equal(m[1].trim(), (await read("fixtures/shows.csv")).trim());
  const inputs = { leadqual: 30, close: 20, dealvalue: 12000, margin: 60, cycle: 6, ltv: 1, budget: 40000, maxq: 2, downside: 70 };
  for (const [id, v] of Object.entries(inputs)) assert.match(page, new RegExp(`id="${id}" value="${v}"`));
  const p = plan(parseShows(m[1]), { leadQual: 30, close: 20, dealValue: 12000, margin: 60, cycleMonths: 6, ltv: 1, budget: 40000, maxPerQuarter: 2, downside: 70 });
  assert.ok(p.totals.upliftVsCheapestFirst > 1000);
  assert.ok(p.totals.plan > 0);
  assert.equal(summarize(p).status, "gain");
});

test("the docs page's worked example matches the engine", async () => {
  const p = plan(parseShows("Alpha Expo,2027-03-10,8000,2000,2,3,400,1000,60"), { leadQual: 30, close: 20, dealValue: 10000, margin: 60 });
  const r = p.ranked[0];
  assert.equal(r.cost, 13400);
  assert.equal(Math.ceil(r.breakEven.leads), 38);
  const doc = await read(DOCS);
  for (const s of ["$13,400", "$223.33", "$744.44", "$21,600", "$8,200", "61%", "$360", "38 leads"]) assert.ok(doc.includes(s), s);
});

test("index links to sibling tools", async () => {
  const idx = await read("index.html");
  for (const s of ["market-event-picker", "revenue-target-lead-planner", "breakeven-roas-calculator"]) {
    assert.ok(idx.includes(`href="../${s}/"`), s);
  }
});
