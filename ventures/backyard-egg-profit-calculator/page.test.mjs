import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readdirSync } from "node:fs";
import { computeEggs, money } from "./engine.mjs";

const DOCS = "how-much-to-charge-for-a-dozen-eggs.html";
const read = (f) => readFile(new URL(`./${f}`, import.meta.url), "utf8");

test("index and docs link to each other", async () => {
  assert.ok((await read("index.html")).includes(`href="${DOCS}"`));
  assert.match(await read(DOCS), /href="\.\/"/);
});

test("both pages carry no-warranty and FAQ data; index carries sponsor, privacy, opt-out and non-affiliation", async () => {
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

test("every input id the page script reads exists, with the engine defaults as values", async () => {
  const idx = await read("index.html");
  for (const id of new Set([...idx.matchAll(/\$\("#([a-z-]+)"\)/g)].map((m) => m[1]))) assert.match(idx, new RegExp(`id="${id}"`), id);
  const defaults = { hens: 20, laypct: 70, price: 5, feedlbs: 0.25, feedperlb: 0.45, othermonth: 30, pulletcost: 8, layyears: 2, cartoncost: 0.35, hoursweek: 4, wage: 15, losspct: 8 };
  for (const [id, v] of Object.entries(defaults)) assert.match(idx, new RegExp(`id="${id}" value="${v}"`), id);
});

test("the guide's worked numbers match the engine", async () => {
  const r = computeEggs();
  const doc = await read(DOCS);
  const strings = [r.costYear, r.costPerDozen, r.revenueYear, r.marginYear, r.profitPerHour, r.wagePrice, r.breakevenPrice, ...r.lines.map((l) => l.value), r.feedScenarios[1].profitPerHour, r.feedScenarios[3].profitPerHour, r.feedScenarios[3].wagePrice, r.layScenarios[0].costPerDozen, r.layScenarios[0].wagePrice, r.priceScenarios[4].profitPerHour].map(money);
  for (const s of strings) assert.ok(doc.includes(s), s);
  assert.ok(doc.includes(money(Math.abs(r.afterWageYear))));
  const hard = computeEggs({ price: 4, feedPerLb: 0.6, layPct: 45, lossPct: 15 });
  for (const s of [hard.costPerDozen, Math.abs(hard.afterWageYear)].map(money)) assert.ok(doc.includes(s), s);
  const idx = await read("index.html");
  assert.ok(idx.includes('$("#price").value = 4; $("#feedperlb").value = 0.6; $("#laypct").value = 45; $("#losspct").value = 15;'));
});
