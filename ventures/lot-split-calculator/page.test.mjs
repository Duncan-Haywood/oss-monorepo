import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readdirSync } from "node:fs";
import { parseLines, plan, summarize } from "./engine.mjs";

const DOCS = "should-i-sell-a-bulk-lot-whole-or-split-it.html";
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

test("the page's worked example is the fixture and demonstrates the headline claim", async () => {
  const page = await read("index.html");
  const m = /const EXAMPLE_SOURCE = `([\s\S]*?)`;/.exec(page);
  assert.ok(m, "expected EXAMPLE_SOURCE in index.html");
  assert.equal(m[1].trim(), (await read("fixtures/lot.csv")).trim());
  const p = plan(parseLines(m[1]), { lotOffer: 260, lotCost: 150, feePct: 13, remnantPct: 20, hourlyRate: 15, downside: 80 });
  assert.ok(p.gainOverOffer > 0);
  assert.equal(summarize(p).status, "gain");
  for (const [id, v] of [["offer", 260], ["cost", 150], ["fee", 13], ["remnant", 20], ["rate", 15], ["downside", 80]]) {
    assert.match(page, new RegExp(`id="${id}" value="${v}"`));
  }
});

test("the docs page's worked example matches the engine", async () => {
  const p = plan(parseLines("Pyrex bowls,6,28,85,9,12\nMason jars,10,4,95,6,3"), { lotOffer: 60 });
  assert.equal(p.best, "split");
  const doc = await read(DOCS);
  for (const s of ["$65.38", "$33.60", "-$31.04", "$8.00", "$73.38", "$13.38", "$34.34", "$25.66"]) {
    assert.ok(doc.replace(/&minus;/g, "-").includes(s), s);
  }
  assert.ok(Math.abs(p.totals.bestMix - 73.376) < 1e-9 && Math.abs(p.totals.allListed - 34.336) < 1e-9);
});

test("index links to sibling resale tools", async () => {
  const idx = await read("index.html");
  for (const s of ["liquidation-pallet-bid-calculator", "ticket-resale-profit-calculator", "estate-sale-net-proceeds-calculator", "card-grading-submission-picker", "thrift-haul-buy-picker"]) {
    assert.ok(idx.includes(`href="../${s}/"`), s);
  }
});
