import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readdirSync } from "node:fs";
import { priceCall, money, pct, DEFAULTS } from "./engine.mjs";

const GUIDE = "how-to-price-hvac-good-better-best-repairs.html";
const VS = "vs-quoting-one-repair-price.html";
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
    assert.match(p, new RegExp(`<link rel="canonical" href="\\./${f.replace(/\./g, "\\.")}">`), f);
  }
});

test("the comparison page names no vendor or software product", async () => {
  // It compares against a generic quoting method, so it is listed in platform/pages/clauses.mjs
  // COMPARISON_DISCLAIMER_EXEMPT. If it ever names a product it must carry the trademark clause instead.
  const p = await read(VS);
  assert.doesNotMatch(p, /Housecall|ServiceTitan|Jobber|Workiz|FieldEdge|Service Fusion|QuickBooks|Carrier|Trane|Lennox|Goodman|Rheem|Daikin/i);
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
  const ids = {
    wage: "wage", burdenpct: "burdenPct", paidhours: "paidHours", billablehours: "billableHours", truckyear: "truckYear", insuranceyear: "insuranceYear",
    toolsyear: "toolsYear", overheadyear: "overheadYear", travelhours: "travelHours", diaghours: "diagHours", targetmarginpct: "targetMarginPct",
    reservepct: "reservePct", roundto: "roundTo", goodhours: "goodHours", goodparts: "goodParts", betterhours: "betterHours", betterparts: "betterParts",
    besthours: "bestHours", bestparts: "bestParts", mixgood: "mixGood", mixbetter: "mixBetter", mixbest: "mixBest", declinepct: "declinePct",
  };
  assert.equal(Object.keys(ids).length, Object.keys(DEFAULTS).length);
  for (const [id, key] of Object.entries(ids)) {
    assert.match(idx, new RegExp(`id="${id}" value="${DEFAULTS[key]}"`), id);
    assert.ok(idx.includes(`${id}: "${key}"`), `FIELDS maps ${id}`);
  }
  for (const [id, v] of Object.entries({ tier1up: 100, tier1pct: 100, tier2up: 500, tier2pct: 60, tier3up: 2000, tier3pct: 40, tier4pct: 30 })) assert.match(idx, new RegExp(`id="${id}" value="${v}"`), id);
});

test("the example button loads the mostly-Good mix the comparison page works through", async () => {
  const idx = await read("index.html");
  assert.ok(idx.includes('$("#mixgood").value = 70; $("#mixbetter").value = 25; $("#mixbest").value = 5;'));
});

test("the index FAQ and the guide's worked numbers match the engine", async () => {
  const r = priceCall();
  const doc = await read(GUIDE);
  const idx = await read("index.html");
  const t = r.tiers;
  const strings = [
    r.hourly.perHour, r.hourly.labourPerHour, r.hourly.overheadPerHour, r.hourly.loadedWage, r.hourly.labourYear, r.hourly.overheadTotal,
    r.diag.cost, r.diag.cost / (1 - 0.35), r.diag.fee, t.good.netDue,
    priceCall({ billableHours: 2080 }).hourly.perHour, priceCall({ billableHours: 1000 }).hourly.perHour, priceCall({ billableHours: 2080 }).tiers.good.price, priceCall({ billableHours: 1000 }).tiers.good.price,
    t.good.timeCharge, t.good.markup.markup, t.good.partsCharge, t.good.exact, t.good.price, t.good.cost, t.good.reserve, t.good.profit,
    t.better.timeCharge, t.better.markup.markup, t.better.partsCharge, t.better.exact, t.better.price, t.better.profit,
    t.best.timeCharge, t.best.markup.markup, t.best.partsCharge, t.best.exact, t.best.price, t.best.cost, t.best.reserve, t.best.profit,
    r.expected.ticket, r.expected.profit, r.goodOnly.profit, r.goodOnly.ticket, r.liftVsGoodOnly, r.shiftTenToBest,
  ].map(money);
  for (const s of strings) assert.ok(doc.includes(s), `guide: ${s}`);
  for (const s of [pct(t.good.marginPct), pct(t.better.marginPct), pct(t.best.marginPct), String(r.diag.hours)]) assert.ok(doc.includes(s), `guide: ${s}`);
  for (const s of [t.good.price, t.better.price, t.best.price, r.hourly.perHour, r.hourly.labourPerHour, r.hourly.overheadPerHour, r.diag.cost, r.diag.fee, r.expected.profit, r.goodOnly.profit, r.liftVsGoodOnly].map(money)) assert.ok(idx.includes(s), `index: ${s}`);
});

test("the comparison page's figures match the engine", async () => {
  const r = priceCall();
  const poor = priceCall({ mixGood: 70, mixBetter: 25, mixBest: 5 });
  const doc = await read(VS);
  const at = (b) => r.sensitivity.find((x) => x.bestShare === b);
  const strings = [
    t(r).good.price, t(r).better.price, t(r).best.price, r.goodOnly.ticket, r.expected.ticket, r.goodOnly.profit, r.expected.profit, r.liftVsGoodOnly, r.hourly.perHour, r.diag.fee,
    poor.expected.profit, poor.expected.ticket, poor.liftVsGoodOnly, at(0).profit, at(5).profit - at(0).profit,
    r.declineSens[1].profit - r.declineSens[2].profit,
  ].map(money);
  for (const s of strings) assert.ok(doc.includes(s), s);
  assert.ok(doc.includes("50, 35 and 15 percent"));
});
function t(r) { return r.tiers; }
