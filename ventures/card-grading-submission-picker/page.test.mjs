import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readdirSync } from "node:fs";
import { parseCards, plan, summarize, money, pct, DEFAULT_TIERS_TEXT } from "./engine.mjs";

const DOCS = "is-it-worth-grading-a-card.html";
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
  assert.match(idx, /example, not a current price list/);
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

test("the page's worked example is the fixture and demonstrates a real gain under its budget", async () => {
  const page = await read("index.html");
  const m = /const EXAMPLE_SOURCE = `([\s\S]*?)`;/.exec(page);
  assert.ok(m, "expected EXAMPLE_SOURCE in index.html");
  assert.equal(m[1].trim(), (await read("fixtures/cards.csv")).trim());
  const inputs = { ship: 8, sellfee: 13, sellfixed: 0.3, rate: 10 };
  for (const [id, v] of Object.entries(inputs)) assert.match(page, new RegExp(`id="${id}" value="${v}"`));
  assert.match(page, /\$\("#budget"\)\.value = 400; \$\("#maxcards"\)\.value = 20;/);
  const p = plan(parseCards(m[1]), { budget: 400, maxCards: 20 });
  assert.ok(p.upliftVsBest > 50);
  assert.ok(p.hold.length >= 1);
  assert.equal(summarize(p).status, "gain");
});

test("the page's fee table is the engine's labelled example", async () => {
  assert.match(DEFAULT_TIERS_TEXT, /EXAMPLE tiers only/);
  assert.match(await read("index.html"), /DEFAULT_TIERS_TEXT/);
});

test("the guide's worked list matches the engine", async () => {
  const parsed = parseCards(await read("fixtures/cards.csv"));
  assert.equal(parsed.cards.length, 13);
  const free = plan(parsed, {});
  assert.equal(free.submit.length, 8);
  assert.equal(money(free.spend), "$1,189.00");
  assert.equal(money(free.uplift), "$2,405.21");
  assert.equal(free.hold.filter((h) => h.gradable).length, 4);
  assert.equal(free.hold.filter((h) => !h.gradable).length, 1);
  const capped = plan(parsed, { budget: 400 });
  assert.equal(capped.submit.length, 3);
  assert.equal(money(capped.spend), "$374.00");
  assert.equal(money(capped.uplift), "$1,512.77");
  assert.equal(money(capped.baselines[0].uplift), "$1,360.88");
  assert.equal(money(capped.upliftVsBest), "$151.89");
  const mantle = free.hold.find((h) => h.name.startsWith("Mantle"));
  assert.equal(pct(mantle.breakEven.p10), "5.4%");
  assert.equal(money(mantle.uplift), "-$2.03");
  const lotus = free.submit.find((c) => c.name.startsWith("Black Lotus"));
  assert.equal(money(lotus.cost), "$608.00");
  assert.ok(!capped.submit.some((c) => c.name.startsWith("Black Lotus")));
  const zard = free.submit.find((c) => c.name.startsWith("Charizard"));
  assert.equal(pct(zard.pLoseVsRaw, 0), "15%");
  assert.equal(money(zard.worst.vsRaw), "-$302.87");
  const doc = await read(DOCS);
  for (const s of ["$1,189.00", "$2,405.21", "5.4 percent", "-$2.03", "$374.00", "$1,512.77", "$1,360.88", "$151.89", "$608.00", "15 percent", "$302.87", "$24,000"]) assert.ok(doc.includes(s), s);
});

test("index links to sibling tools", async () => {
  const idx = await read("index.html");
  for (const s of ["ebay-fee-calculator", "marketplace-fee-compare", "lot-split-calculator", "ticket-resale-profit-calculator"]) {
    assert.ok(idx.includes(`href="../${s}/"`), s);
  }
});
