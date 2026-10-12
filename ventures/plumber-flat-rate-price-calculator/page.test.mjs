import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readdirSync } from "node:fs";
import { priceJob, money, pct, DEFAULTS } from "./engine.mjs";

const GUIDE = "how-to-build-a-plumbing-flat-rate-price-book.html";
const VS = "vs-time-and-materials.html";
const PAGES = ["index.html", GUIDE, VS];
const read = (f) => readFile(new URL(`./${f}`, import.meta.url), "utf8");

test("index links to the guide and the comparison, and each links back", async () => {
  const idx = await read("index.html");
  assert.ok(idx.includes(`href="${GUIDE}"`));
  assert.ok(idx.includes(`href="${VS}"`));
  for (const f of [GUIDE, VS]) assert.match(await read(f), /href="\.\/"/);
});

test("every page carries no-warranty, non-affiliation and valid FAQ data whose answers are on the page", async () => {
  for (const f of PAGES) {
    const p = await read(f);
    assert.match(p, /no warranty/i, f);
    assert.match(p, /Not affiliated with/, f);
    const m = p.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
    assert.ok(m, `${f}: no FAQPage`);
    for (const q of JSON.parse(m[1]).mainEntity) {
      assert.ok(p.includes(`<h3>${q.name}</h3>`), `${f}: ${q.name}`);
      assert.ok(p.includes(q.acceptedAnswer.text), `${f}: answer for ${q.name}`);
    }
    assert.match(p, new RegExp(`<link rel="canonical" href="\\./${f === "index.html" ? "index\\.html" : f.replace(/\./g, "\\.")}">`), f);
  }
});

test("the comparison page names no vendor or software product", async () => {
  // It compares against a generic billing method, so it is listed in platform/pages/clauses.mjs
  // COMPARISON_DISCLAIMER_EXEMPT. If it ever names a product it must carry the trademark clause instead.
  const p = await read(VS);
  assert.doesNotMatch(p, /Housecall|ServiceTitan|Jobber|Workiz|FieldEdge|Service Fusion|QuickBooks/i);
});

test("index carries sponsor, privacy, opt-out and every counted event", async () => {
  const idx = await read("index.html");
  assert.match(idx, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(idx, /never uploaded/i);
  assert.match(idx, /id="optout"/);
  for (const e of ["calculate_run", "example_loaded", "pricebook_exported", "share_link_copied"]) assert.ok(idx.includes(`record("${e}")`), e);
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
  for (const id of new Set([...idx.matchAll(/\$\("#([a-z0-9-]+)"\)/g)].map((m) => m[1]))) {
    if (["patterns-rows", "book-rows"].includes(id) || idx.includes(`id="${id}"`)) continue;
    assert.fail(`script reads #${id} but the page has no such id`);
  }
  const ids = { wage: "wage", burdenpct: "burdenPct", paidhours: "paidHours", billablehours: "billableHours", truckyear: "truckYear", insuranceyear: "insuranceYear", toolsyear: "toolsYear", overheadyear: "overheadYear", onsitehours: "onsiteHours", travelhours: "travelHours", partscost: "partsCost", targetmarginpct: "targetMarginPct", roundto: "roundTo", minonsitehours: "minOnsiteHours", tmrate: "tmRate" };
  assert.equal(Object.keys(ids).length, Object.keys(DEFAULTS).length);
  for (const [id, key] of Object.entries(ids)) {
    assert.match(idx, new RegExp(`id="${id}" value="${DEFAULTS[key]}"`), id);
    assert.ok(idx.includes(`${id}: "${key}"`), `FIELDS maps ${id}`);
  }
  for (const [id, v] of Object.entries({ tier1up: 25, tier1pct: 100, tier2up: 100, tier2pct: 60, tier3up: 500, tier3pct: 40, tier4pct: 25 })) assert.match(idx, new RegExp(`id="${id}" value="${v}"`), id);
});

test("the example button loads the big job the guide works through", async () => {
  const idx = await read("index.html");
  assert.ok(idx.includes('$("#onsitehours").value = 3.5; $("#travelhours").value = 1; $("#partscost").value = 900;'));
});

test("the index FAQ and the guide's worked numbers match the engine", async () => {
  const r = priceJob();
  const big = priceJob({ onsiteHours: 3.5, travelHours: 1, partsCost: 900 });
  const doc = await read(GUIDE);
  const idx = await read("index.html");
  const strings = [
    r.hourly.perHour, r.hourly.labourPerHour, r.hourly.overheadPerHour, r.hourly.loadedWage, r.hourly.labourYear, r.timeCost, r.timeCharge,
    r.markup.markup, r.partsCharge, r.exact, r.price, r.totalCost, r.profit, r.effectiveRate, r.minCallout, r.overrun[2].profit, Math.abs(r.overrun[3].profit),
    priceJob({ billableHours: 2080 }).hourly.perHour, priceJob({ billableHours: 1000 }).hourly.perHour, priceJob({ billableHours: 2080 }).price, priceJob({ billableHours: 1000 }).price,
    big.timeCost, big.timeCharge, big.markup.markup, big.partsCharge, big.price, big.totalCost, big.profit, big.effectiveRate,
  ].map(money);
  for (const s of strings) assert.ok(doc.includes(s), `guide: ${s}`);
  for (const s of [pct(r.marginPct), pct(big.marginPct), pct(r.markup.effectivePct), pct(big.markup.effectivePct), String(r.breakEvenHours), String(r.hours)]) assert.ok(doc.includes(s), `guide: ${s}`);
  for (const s of [r.price, r.hourly.perHour, r.profit, r.minCallout, r.overrun[2].profit, Math.abs(r.overrun[3].profit), r.hourly.labourPerHour, r.hourly.overheadPerHour].map(money)) assert.ok(idx.includes(s), `index: ${s}`);
  assert.ok(idx.includes(pct(r.marginPct)));
});

test("the comparison page's figures match the engine", async () => {
  const r = priceJob();
  const doc = await read(VS);
  const row = (k) => r.tm.rows.find((x) => x.factor === k);
  const strings = [r.price, r.partsCharge, r.tm.rate, r.tm.crossHours === 0 ? 0 : row(1).tmBill, row(0.6).tmBill, row(0.6).tmProfit, row(0.6).flatProfit, row(1).tmProfit, row(1).flatProfit, row(1.5).tmBill, row(1.5).tmProfit, row(1.5).flatProfit, row(2).tmBill, row(2).tmProfit, Math.abs(row(2).flatProfit), r.hourly.perHour].map(money);
  for (const s of strings) assert.ok(doc.includes(s), s);
  assert.ok(doc.includes(String(Math.round(r.tm.crossHours * 100) / 100)));
  assert.ok(doc.includes(`${Math.round(row(0.6).hours * 100) / 100} (60%)`));
  assert.equal(r.tm.tmCoversCost && priceJob({ tmRate: 90 }).tm.tmCoversCost, false);
});
