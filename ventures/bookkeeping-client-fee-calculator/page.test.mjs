import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readdirSync } from "node:fs";
import { price, parseRoster, roster, money, pct } from "./engine.mjs";

const DOCS = "how-to-price-bookkeeping-services-monthly-retainer.html";
const read = (f) => readFile(new URL(`./${f}`, import.meta.url), "utf8");

test("index and docs link to each other", async () => {
  assert.ok((await read("index.html")).includes(`href="${DOCS}"`));
  assert.match(await read(DOCS), /href="\.\/"/);
});

test("both pages carry no-warranty and FAQ data; index carries sponsor, privacy, opt-out and the not-market-rates warning", async () => {
  for (const f of ["index.html", DOCS]) {
    const p = await read(f);
    assert.match(p, /no warranty/i, f);
    assert.match(p, /FAQPage/, f);
    assert.match(p, /not (a )?market rates?/i, f);
  }
  const idx = await read("index.html");
  assert.match(idx, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(idx, /never uploaded|never sends it anywhere/i);
  assert.match(idx, /id="optout"/);
  assert.match(idx, /Not affiliated with/);
  for (const e of ["price_run", "roster_run", "example_loaded"]) assert.ok(idx.includes(`record("${e}")`), e);
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

test("every input id the page script reads exists, with the engine defaults as values", async () => {
  const idx = await read("index.html");
  for (const id of new Set([...idx.matchAll(/\$\("#([a-z]+)"\)/g)].map((m) => m[1]))) assert.match(idx, new RegExp(`id="${id}"`), id);
  const defaults = { transactions: 300, accounts: 3, payroll: 1, arap: 40, salestax: 1, cleanup: 0, minclean: 0.5, minaverage: 1, minmessy: 2, recon: 20, payrollmin: 25, arapmin: 3, taxmin: 45, review: 30, multiplier: 1.25, software: 40, target: 75, buffer: 20, walkaway: 75 };
  for (const [id, v] of Object.entries(defaults)) assert.match(idx, new RegExp(`id="${id}" value="${v}"`), id);
});

test("the page's worked example is the engine's worked example, and the roster matches the fixture", async () => {
  const page = await read("index.html");
  const m = /const ROSTER_EXAMPLE = `([\s\S]*?)`;/.exec(page);
  assert.ok(m, "expected ROSTER_EXAMPLE in index.html");
  const body = (s) => s.split("\n").filter((l) => l.trim() && !l.startsWith("#") && !/^client,/.test(l)).join("\n");
  assert.equal(body(m[1]), body(await read("fixtures/roster.csv")));
  assert.match(page, /\$\("#cleanup"\)\.value = 3;/);
  assert.match(page, /\$\("#competitor"\)\.value = 600;/);
  const p = price({ cleanupMonths: 3, competitorFee: 600 });
  assert.equal(money(p.minimum), "$765.00");
  assert.equal(p.competitor.status, "below-minimum");
});

test("the guide's worked numbers match the engine", async () => {
  const p = price({ cleanupMonths: 3, competitorFee: 600 });
  assert.equal(p.hours.toFixed(2), "9.67");
  assert.equal(money(p.minimum), "$765.00");
  assert.equal(money(p.recommended), "$918.00");
  assert.equal(money(p.walkAway), "$583.75");
  assert.equal(money(p.byCleanliness.clean.minimum), "$577.50");
  assert.equal(money(p.byCleanliness.messy.minimum), "$1,140.00");
  assert.equal(p.cleanupHours.toFixed(2), "36.25");
  assert.equal(money(p.cleanupQuote), "$3,262.50");
  assert.equal(money(p.competitor.effectiveHourly), "$57.93");
  const r = roster(parseRoster(await read("fixtures/roster.csv")), {});
  assert.equal(r.clients.length, 7);
  assert.equal(money(r.fee), "$3,195.00");
  assert.equal(r.hours, 52.5);
  assert.equal(money(r.blendedHourly), "$56.95");
  assert.equal(money(r.blendedAtTarget), "$80.57");
  assert.equal(r.below, 5);
  assert.equal(money(r.totalRaise), "$1,240.00");
  assert.equal(money(r.clients[0].effective), "$35.71");
  assert.equal(money(r.clients[0].raise), "$275.00");
  assert.equal(pct(r.clients[0].raisePct, 0), "100%");
  assert.equal(money(r.clients[4].raise), "$20.00");
  const doc = await read(DOCS);
  for (const s of ["9.67 hours", "$765.00", "$918.00", "$583.75", "$577.50", "$1,140.00", "36.25 hours", "$3,262.50", "$57.93", "$3,195.00", "52.5 hours", "$56.95", "$1,240.00", "$80.57", "$35.71", "$275.00", "$550.00", "$20.00"]) assert.ok(doc.includes(s), s);
});

test("index links to sibling tools", async () => {
  const idx = await read("index.html");
  for (const s of ["client-profitability-time-analyzer", "freelance-retainer-calculator", "freelance-retainer-vs-hourly-calculator", "1099-vendor-tracker"]) {
    assert.ok(idx.includes(`href="../${s}/"`), s);
  }
});
