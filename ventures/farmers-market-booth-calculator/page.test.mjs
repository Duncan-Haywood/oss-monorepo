import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readdirSync } from "node:fs";
import { computeMarkets, money, DEFAULTS } from "./engine.mjs";

const DOCS = "is-a-farmers-market-worth-the-booth-fee.html";
const read = (f) => readFile(new URL(`./${f}`, import.meta.url), "utf8");

test("index and docs link to each other", async () => {
  assert.ok((await read("index.html")).includes(`href="${DOCS}"`));
  assert.match(await read(DOCS), /href="\.\/"/);
});

test("both pages carry no-warranty and FAQ data; index carries sponsor, privacy and opt-out", async () => {
  for (const f of ["index.html", DOCS]) {
    const p = await read(f);
    assert.match(p, /no warranty/i, f);
    assert.match(p, /FAQPage/, f);
    assert.match(p, /Not affiliated with/, f);
  }
  const idx = await read("index.html");
  assert.match(idx, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(idx, /never uploaded/i);
  assert.match(idx, /id="optout"/);
  for (const e of ["calculate_run", "example_loaded"]) assert.ok(idx.includes(`record("${e}")`), e);
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
  for (const f of ["engine.mjs", "usage.mjs"]) assert.doesNotMatch(await read(f), /fetch\(|https?\.request|node:http|node:net/, f);
});

test("every static input id the page script reads exists, with the engine defaults as values", async () => {
  const idx = await read("index.html");
  for (const id of new Set([...idx.matchAll(/\$\("#([a-z-]+)"\)/g)].map((m) => m[1]))) assert.match(idx, new RegExp(`id="${id}"`), id);
  const defaults = { cogs: DEFAULTS.cogsPct, waste: DEFAULTS.wastePct, cardshare: DEFAULTS.cardSharePct, cardfee: DEFAULTS.cardFeePct, mile: DEFAULTS.mileCost, wage: DEFAULTS.targetWage };
  for (const [id, v] of Object.entries(defaults)) assert.match(idx, new RegExp(`id="${id}" value="${v}"`), id);
});

test("the guide's worked numbers match the engine", async () => {
  const r = computeMarkets();
  const doc = await read(DOCS);
  const [a, b, c] = r.rows;
  const strings = [a.profit, a.perHour, b.profit, b.perHour, c.profit, c.perHour, r.totalProfit, r.blendedPerHour, a.breakEven, c.breakEven, c.targetSales, c.down20.profit].map(money);
  strings.push(money((r.totalProfit - c.profit) / (r.totalHours - c.hours)));
  for (const s of strings) assert.ok(doc.includes(s), s);
  const idx = await read("index.html");
  for (const s of [a.profit, a.perHour, c.profit, c.perHour, a.breakEven, c.breakEven, c.targetSales].map(money)) assert.ok(idx.includes(s), s);
});

// Seasonal sellers who price by feel read the same page: one hop keeps the firewood calculator crawlable.
test("index links one hop to the firewood-profit-calculator sibling", async () => {
  assert.match(await read("index.html"), /href="\.\.\/firewood-profit-calculator\/"/);
});

test("footer links to the microgreens tray planner sibling", async () => {
  const { readFile } = await import("node:fs/promises");
  assert.match(await readFile(new URL("./index.html", import.meta.url), "utf8"), /href="\.\.\/microgreens-tray-planner\/"/);
});
