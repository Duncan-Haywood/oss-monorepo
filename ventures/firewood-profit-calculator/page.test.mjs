import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readdirSync } from "node:fs";
import { computeFirewood, money } from "./engine.mjs";

const DOCS = "how-much-to-charge-for-a-cord-of-firewood.html";
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
  const defaults = { cords: 60, price: 300, wood: 90, processhrs: 4, equipment: 25, other: 10, miles: 20, permile: 0.8, cordsperload: 1.5, deliveryhrs: 1.5, wage: 25, losspct: 5 };
  for (const [id, v] of Object.entries(defaults)) assert.match(idx, new RegExp(`id="${id}" value="${v}"`), id);
});

test("the guide's worked numbers match the engine", async () => {
  const r = computeFirewood();
  const doc = await read(DOCS);
  const strings = [r.costPerCord, r.lines[0].value, r.marginPerCord, r.profitPerHour, r.marginSeason, r.afterWagePerCord, r.afterWageSeason, r.wagePrice, r.faceCordWagePrice, r.breakevenPrice, r.revenuePerCord, r.woodScenarios[2].profitPerHour, r.woodScenarios[2].wagePrice, r.woodScenarios[3].profitPerHour, r.woodScenarios[3].wagePrice, r.mileScenarios[2].profitPerHour, r.mileScenarios[3].wagePrice, r.mileScenarios[2].wagePrice].map(money);
  for (const s of strings) assert.ok(doc.includes(s), s);
  assert.ok(doc.includes(r.hoursPerCord.toFixed(2)));
  assert.ok(doc.includes(money(Math.abs(r.mileScenarios[2].afterWagePerCord))));
  const hard = computeFirewood({ price: 220, wood: 150, miles: 40, deliveryHrs: 3, lossPct: 15 });
  for (const s of [hard.afterWagePerCord, hard.afterWageSeason, hard.wagePrice].map((v) => money(Math.abs(v)))) assert.ok(doc.includes(s), s);
  const idx = await read("index.html");
  assert.ok(idx.includes('$("#price").value = 220; $("#wood").value = 150; $("#miles").value = 40; $("#deliveryhrs").value = 3; $("#losspct").value = 15;'));
});
