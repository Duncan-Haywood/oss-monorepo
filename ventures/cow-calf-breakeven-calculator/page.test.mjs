import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readdirSync } from "node:fs";
import { computeBreakeven, money } from "./engine.mjs";

const DOCS = "cow-calf-breakeven-price-per-cwt.html";
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
  const defaults = { cows: 100, haytons: 2, hayprice: 140, supplement: 60, pasture: 200, health: 35, bull: 45, labor: 90, other: 60, replacepct: 12, replacecost: 1800, cullweight: 1300, cullprice: 100, weanpct: 88, weanweight: 550, calfprice: 250 };
  for (const [id, v] of Object.entries(defaults)) assert.match(idx, new RegExp(`id="${id}" value="${v}"`), id);
});

test("the guide's worked numbers match the engine", async () => {
  const r = computeBreakeven();
  const doc = await read(DOCS);
  const strings = [r.costPerCow, r.lines[0].value, r.revenuePerCow, r.netPerCow, r.netHerd, r.breakevenPrice, r.perPoundOfWeight, r.perPointOfWeaning, r.hayScenarios[3].netPerCow, r.hayScenarios[3].breakevenPrice, r.hayScenarios[4].netPerCow, r.hayScenarios[4].breakevenPrice, r.weanScenarios[2].netPerCow, r.weanScenarios[2].breakevenPrice].map(money);
  strings.push(`${Math.round(r.breakevenWeight)} lb`);
  for (const s of strings) assert.ok(doc.includes(s), s);
  const dry = computeBreakeven({ hayPrice: 220, calfPrice: 200, weanPct: 82 });
  for (const s of [dry.netPerCow, dry.netHerd, dry.breakevenPrice].map((v) => money(Math.abs(v)))) assert.ok(doc.includes(s), s);
  const idx = await read("index.html");
  assert.ok(idx.includes('$("#hayprice").value = 220; $("#calfprice").value = 200; $("#weanpct").value = 82;'));
});

test("links to the stocker margin calculator, the buy-and-sell side of cattle", async () => {
  assert.match(await read("index.html"), /href="\.\.\/stocker-cattle-margin-calculator\/"/);
});
