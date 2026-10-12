import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readdirSync } from "node:fs";
import { computeProceeds, money } from "./engine.mjs";

const DOCS = "app-store-30-vs-15-percent-subscription-value.html";
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
  const defaults = { price: 9.99, tax: 0, fee1: 30, fee2: 15, refund: 3, churn: 8, cac: 25, webpct: 2.9, webfixed: 0.3, horizon: 36 };
  for (const [id, v] of Object.entries(defaults)) assert.match(idx, new RegExp(`id="${id}" value="${v}"`), id);
});

test("the guide's worked numbers match the engine", async () => {
  const r = computeProceeds();
  const doc = await read(DOCS);
  const strings = [r.netYear1, r.netYear2, r.ltv, r.maxCacTwelveMonthPayback, r.webNet, r.webLtv, r.webGain, r.feeScenarios[1].ltv, r.feeScenarios[1].ltv - r.ltv, r.churnScenarios[0].ltv, r.churnScenarios[2].ltv].map(money);
  strings.push(`${Math.round(r.ltvToCac * 100) / 100}x`, `month ${r.payback}`);
  for (const s of strings) assert.ok(doc.includes(s), s);
  const loss = computeProceeds({ churnPct: 20, cac: 40 });
  assert.equal(loss.payback, null);
  for (const s of [money(loss.ltv), `${Math.round(loss.ltvToCac * 100) / 100}x`]) assert.ok(doc.includes(s), s);
  const idx = await read("index.html");
  assert.ok(idx.includes('$("#churn").value = 20; $("#cac").value = 40; $("#fee1").value = 30;'));
});

test("footer links to the app review insights tool", async () => {
  assert.match(await read("index.html"), /href="\.\.\/app-review-insights\/"/);
});
