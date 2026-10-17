import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readdirSync } from "node:fs";
import { computePlan, money, DEFAULTS } from "./engine.mjs";

const DOCS = "how-many-microgreen-trays-per-week.html";
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
  for (const e of ["plan_run", "example_loaded", "best_mix_applied"]) assert.ok(idx.includes(`record("${e}")`), e);
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
  const ids = [...idx.matchAll(/\$\(`?"?#([A-Za-z0-9${}\\-]+)/g)].map((m) => m[1]).filter((i) => !i.includes("$"));
  for (const id of new Set(ids)) assert.match(idx, new RegExp(`id="${id}"`), id);
  DEFAULTS.crops.forEach((c, i) => {
    for (const [k, v] of [["name", c.name], ["days", c.days], ["oz", c.ozPerTray], ["price", c.pricePerOz], ["seed", c.seedPerTray], ["trays", c.trays], ["max", c.maxTrays]]) {
      assert.match(idx, new RegExp(`id="c${i}-${k}" value="${v}"`), `c${i}-${k}`);
    }
  });
  const scalars = { racktrays: DEFAULTS.rackTrays, losspct: DEFAULTS.lossPct, mediaptray: DEFAULTS.mediaPerTray, packoz: DEFAULTS.packPerOz, mintray: DEFAULTS.minutesPerTray, wage: DEFAULTS.wage, fixedweek: DEFAULTS.fixedWeek };
  for (const [id, v] of Object.entries(scalars)) assert.match(idx, new RegExp(`id="${id}" value="${v}"`), id);
  for (const d of DEFAULTS.harvestDays) assert.match(idx, new RegExp(`id="hd${d}" checked`));
  assert.ok(idx.includes("$(\"#racktrays\").value = 40;"));
});

test("the page's FAQ and the guide's worked numbers match the engine", async () => {
  const r = computePlan();
  const small = computePlan({ rackTrays: 40 });
  const idx = await read("index.html");
  for (const s of [money(r.revenue), String(r.peak), money(r.ranking[0].marginPerTrayDay), money(small.optimised.margin), money(r.margin)]) assert.ok(idx.includes(s), s);
  const doc = await read(DOCS);
  const strings = [money(r.revenue), money(r.variableCost), money(r.margin), money(r.profitPerHour), money(small.optimised.margin), ...r.ranking.map((c) => money(c.marginPerTrayDay)), ...r.ranking.map((c) => money(c.margin))];
  for (const s of strings) assert.ok(doc.includes(s), s);
  for (const n of r.occupancy) assert.ok(doc.includes(`<td>${n}</td>`), String(n));
});

test("footer links to the farmers market booth calculator sibling", async () => {
  assert.match(await read("index.html"), /href="\.\.\/farmers-market-booth-calculator\/"/);
});

test("footer links to the mushroom fruiting room planner sibling", async () => {
  assert.match(await read("index.html"), /href="\.\.\/mushroom-fruiting-room-planner\/"/);
});
