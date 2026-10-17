import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readdirSync } from "node:fs";
import { parseItems, plan, summarize, money, pct } from "./engine.mjs";

const DOCS = "how-much-to-pay-at-a-thrift-store-to-resell.html";
const read = (f) => readFile(new URL(`./${f}`, import.meta.url), "utf8");

test("index and docs link to each other", async () => {
  assert.ok((await read("index.html")).includes(`href="${DOCS}"`));
  assert.match(await read(DOCS), /href="\.\/"/);
});

test("both pages carry no-warranty, FAQ data; index carries sponsor, privacy, opt-out and the estimates warning", async () => {
  for (const f of ["index.html", DOCS]) {
    const p = await read(f);
    assert.match(p, /no warranty/i, f);
    assert.match(p, /FAQPage/, f);
    assert.match(p, /not a price guide/i, f);
  }
  const idx = await read("index.html");
  assert.match(idx, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(idx, /never uploaded|never leave your device/i);
  assert.match(idx, /id="optout"/);
  assert.match(idx, /Not affiliated with/);
});

test("every .html file is in the sitemap", async () => {
  const sitemap = await read("sitemap.xml");
  for (const name of readdirSync(new URL("./", import.meta.url)).filter((n) => n.endsWith(".html") && n !== "index.html")) {
    assert.ok(sitemap.includes(name), `${name} missing from sitemap.xml`);
  }
});

test("the page makes no network call and ships no dependency", async () => {
  const idx = await read("index.html");
  assert.doesNotMatch(idx, /fetch\(|XMLHttpRequest|sendBeacon|<script[^>]+src="https?:/);
  for (const f of ["engine.mjs", "cli.mjs", "usage.mjs"]) assert.doesNotMatch(await read(f), /fetch\(|https?\.request|node:http|node:net/, f);
});

test("the page's worked example is the fixture and demonstrates a real gain under its caps", async () => {
  const page = await read("index.html");
  const m = /const EXAMPLE_SOURCE = `([\s\S]*?)`;/.exec(page);
  assert.ok(m, "expected EXAMPLE_SOURCE in index.html");
  assert.equal(m[1].trim(), (await read("fixtures/haul.csv")).trim());
  const inputs = { fee: 13, fixed: 0.3, ship: 6, supplies: 0.5, minutes: 20, hourly: 15, days: 30, rate: 20, unsold: 30 };
  for (const [id, v] of Object.entries(inputs)) assert.match(page, new RegExp(`id="${id}" value="${v}"`));
  assert.match(page, /\$\("#budget"\)\.value = 80; \$\("#maxitems"\)\.value = ""; \$\("#maxhours"\)\.value = 2;/);
  const p = plan(parseItems(m[1]), { budget: 80, maxHours: 2 });
  assert.ok(p.upliftVsBest > 5);
  assert.ok(p.pass.length >= 1);
  assert.equal(summarize(p).status, "gain");
});

test("the guide's worked list matches the engine", async () => {
  const parsed = parseItems(await read("fixtures/haul.csv"));
  assert.equal(parsed.items.length, 14);
  const free = plan(parsed, {});
  assert.equal(free.buy.length, 10);
  assert.equal(money(free.spend), "$160.00");
  assert.equal(money(free.profit), "$244.16");
  assert.equal(money(free.perHour), "$66.89");
  const gb = free.items.find((e) => e.name.startsWith("Nintendo"));
  assert.equal(money(gb.maxAsk), "$80.12");
  assert.equal(pct(gb.breakEven.p), "3.8%");
  assert.equal(money(gb.worst), "-$2.92");
  const walkman = free.items.find((e) => e.name.startsWith("Sony"));
  assert.equal(money(walkman.profit), "-$0.02");
  assert.equal(money(walkman.maxAsk), "$19.99");
  const cookbook = free.items.find((e) => e.name.startsWith("Hardcover"));
  assert.equal(money(cookbook.profit), "-$13.15");
  assert.equal(money(cookbook.maxAsk), "$2.13");
  const capped = plan(parsed, { budget: 80, maxHours: 2 });
  assert.equal(capped.buy.length, 5);
  assert.equal(money(capped.spend), "$80.00");
  assert.equal(capped.hours.toFixed(2), "1.65");
  assert.equal(money(capped.profit), "$152.01");
  assert.equal(money(capped.baselines[0].profit), "$145.02");
  assert.equal(money(capped.upliftVsBest), "$6.99");
  const doc = await read(DOCS);
  for (const s of ["$160.00", "$244.16", "$66.89", "$80.12", "3.8 percent", "-$2.92", "-$0.02", "$19.99", "$15.00", "$13.15", "$2.13", "$152.01", "$145.02", "$6.99", "1.65 hours"]) assert.ok(doc.includes(s), s);
});

test("index links to sibling tools", async () => {
  const idx = await read("index.html");
  for (const s of ["ebay-fee-calculator", "poshmark-fee-calculator", "mercari-fee-calculator", "lot-split-calculator", "marketplace-fee-compare", "where-to-sell-calculator"]) {
    assert.ok(idx.includes(`href="../${s}/"`), s);
  }
});
