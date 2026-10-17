import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readdirSync } from "node:fs";
import { computeHoney, money } from "./engine.mjs";

const DOCS = "how-much-to-charge-for-a-pound-of-honey.html";
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
  const defaults = { hives: 10, yieldlbs: 50, price: 10, losspct: 10, jarcost: 1.1, treatcost: 25, equipyear: 400, otheryear: 150, winterlosspct: 25, nuccost: 180, hoursperhive: 20, wage: 20 };
  for (const [id, v] of Object.entries(defaults)) assert.match(idx, new RegExp(`id="${id}" value="${v}"`), id);
});

test("the guide's worked numbers match the engine", async () => {
  const r = computeHoney();
  const doc = await read(DOCS);
  const strings = [r.costYear, r.costPerLb, r.revenueYear, r.marginYear, r.profitPerHour, r.wagePrice, r.breakevenPrice, ...r.lines.map((l) => l.value), r.yieldScenarios[0].costPerLb, r.yieldScenarios[0].profitPerHour, r.yieldScenarios[0].wagePrice, r.yieldScenarios[1].costPerLb, r.winterScenarios[2].costPerLb, r.winterScenarios[3].costPerLb, r.winterScenarios[3].wagePrice, computeHoney({ price: 20 }).profitPerHour].map(money);
  for (const s of strings) assert.ok(doc.includes(s), s);
  assert.ok(doc.includes(money(Math.abs(r.afterWageYear))));
  const hard = computeHoney({ price: 8, yieldLbs: 25, winterLossPct: 50, lossPct: 15 });
  for (const s of [hard.costPerLb, Math.abs(hard.afterWageYear)].map(money)) assert.ok(doc.includes(s), s);
  const idx = await read("index.html");
  assert.ok(idx.includes('$("#price").value = 8; $("#yieldlbs").value = 25; $("#winterlosspct").value = 50; $("#losspct").value = 15;'));
});

test('links to the maple syrup sugarbush profit calculator', async () => {
  const { readFileSync } = await import('node:fs');
  assert.match(readFileSync(new URL('./index.html', import.meta.url), 'utf8'), /href="\.\.\/maple-syrup-sugarbush-profit-calculator\/"/);
});
