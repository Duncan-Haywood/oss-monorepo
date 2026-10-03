import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readdirSync } from "node:fs";
import { compare, parseSites, parseSeasons, audit, money, DEFAULT_SITES_CSV } from "./engine.mjs";

const DOCS = "how-to-price-a-snow-plow-contract-per-push-vs-seasonal.html";
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
    assert.match(p, /Best-effort hosting, no SLA/, f);
  }
  const idx = await read("index.html");
  assert.match(idx, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(idx, /never uploaded|never sends them anywhere/i);
  assert.match(idx, /id="optout"/);
  assert.match(idx, /Not affiliated with/);
  for (const e of ["compare_run", "audit_run", "example_loaded"]) assert.ok(idx.includes(`record("${e}")`), e);
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

test("every literal id the page script reads exists, and the inputs carry the engine defaults", async () => {
  const idx = await read("index.html");
  for (const id of new Set([...idx.matchAll(/\$\("#([a-z-]+)"\)/g)].map((m) => m[1]))) assert.match(idx, new RegExp(`id="${id}"`), id);
  const defaults = {
    "low-light": 6, "low-medium": 3, "low-heavy": 0, "normal-light": 10, "normal-medium": 6, "normal-heavy": 2,
    "high-light": 14, "high-medium": 10, "high-heavy": 5, "light-depth": 2, "medium-depth": 4, "heavy-depth": 8,
    "light-time": 0.8, "medium-time": 1, "heavy-time": 1.5, "prob-low": 25, "prob-normal": 50, "prob-high": 25,
    truck: 55, fuel: 15, blade: 5, deadhead: 12, saltcost: 0.1, target: 35, walkaway: 75,
    tierbreak: 6, tieruplift: 25, cap: 10, hybridbase: 40, hybridpush: 60,
  };
  for (const [id, v] of Object.entries(defaults)) assert.match(idx, new RegExp(`id="${id}" value="${v}"`), id);
  // the dynamic `#${prefix}-light` reads are covered by the ids above
  assert.match(idx, /triple\("low"\)/);
});

test("the page's defaults are the engine's, and the worked examples match the fixtures", async () => {
  const page = await read("index.html");
  const body = (s) => s.split("\n").filter((l) => l.trim() && !l.startsWith("#") && !/^(site|name),/.test(l)).join("\n");
  const textarea = /<textarea id="sites-input"[^>]*>([\s\S]*?)<\/textarea>/.exec(page);
  assert.ok(textarea, "expected the sites textarea");
  assert.equal(body(textarea[1]), body(await read("fixtures/sites.csv")));
  assert.equal(body(DEFAULT_SITES_CSV), body(await read("fixtures/sites.csv")));
  const m = /const SEASONS_EXAMPLE = `([\s\S]*?)`;/.exec(page);
  assert.ok(m, "expected SEASONS_EXAMPLE in index.html");
  assert.equal(body(m[1]), body(await read("fixtures/seasons.csv")));
  const reset = /\$\("#sites-input"\)\.value = `([\s\S]*?)`;/.exec(page);
  assert.equal(body(reset[1]), body(await read("fixtures/sites.csv")));
});

test("the guide's worked numbers match the engine", async () => {
  const c = compare(parseSites(await read("fixtures/sites.csv")).sites, {});
  const by = (id) => c.models.find((x) => x.id === id);
  const three = (f) => ["low", "normal", "high"].map((y) => money(f(y)));
  assert.deepEqual(["low", "normal", "high"].map((y) => c.seasons[y].plows), [21, 44, 73]);
  assert.deepEqual(["low", "normal", "high"].map((y) => c.seasons[y].hours.toFixed(1)), ["30.8", "74.1", "131.7"]);
  assert.deepEqual(three((y) => c.seasons[y].cost), ["$2,585.25", "$6,171.75", "$10,934.63"]);
  assert.equal(money(c.flat.current), "$10,300.00");
  assert.deepEqual(three((y) => by("flat").effective[y]), ["$250.89", "$55.75", "-$4.82"]);
  assert.equal(by("flat").targetStorms.toFixed(1), "21.2");
  assert.equal(by("flat").breakEvenStorms.toFixed(1), "30.2");
  assert.deepEqual(three((y) => c.flat.neededForTarget[y]), ["$3,661.50", "$8,763.50", "$15,543.25"]);
  assert.equal(money(c.flat.walkAway), "$8,115.56");
  assert.deepEqual(three((y) => by("perPush").effective[y]), ["$62.27", "$49.54", "$44.09"]);
  assert.deepEqual(three((y) => by("perInch").effective[y]), ["$29.88", "$51.10", "$60.17"]);
  assert.deepEqual(three((y) => by("cappedFlat").effective[y]), ["$250.89", "$94.64", "$63.07"]);
  assert.deepEqual(three((y) => by("hybrid").effective[y]), ["$137.72", "$52.02", "$24.53"]);
  const a = audit(parseSeasons(await read("fixtures/seasons.csv")), {});
  assert.equal(a.rows.length, 9);
  assert.equal(money(a.revenue), "$39,700.00");
  assert.equal(a.hours, 344);
  assert.equal(money(a.blendedNet), "$40.41");
  assert.equal(a.below, 3);
  assert.equal(money(a.shortfall), "$4,490.00");
  const net = Object.fromEntries(a.byModel.map((g) => [g.model, money(g.net)]));
  assert.deepEqual(net, { "per-push": "$94.88", hybrid: "$48.53", "per-inch": "$40.38", seasonal: "$0.78" });
  const doc = await read(DOCS);
  for (const s of ["$2,585.25", "$6,171.75", "$10,934.63", "$10,300.00", "$250.89", "$55.75", "-$4.82", "21.2 storms", "30.2", "$3,661.50", "$8,763.50", "$15,543.25", "$8,115.56", "$62.27", "$49.54", "$44.09", "$29.88", "$51.10", "$60.17", "$94.64", "$63.07", "$137.72", "$52.02", "$24.53", "$39,700.00", "344 hours", "$40.41", "$4,490.00", "$94.88", "$48.53", "$40.38", "$0.78", "73 plows", "131.7 hours"]) assert.ok(doc.includes(s), s);
});

test("index links to sibling tools", async () => {
  const idx = await read("index.html");
  for (const s of ["snow-removal-bid-calculator", "ice-dam-removal-bid-calculator", "lawn-care-bid-calculator", "route-account-pruner"]) {
    assert.ok(idx.includes(`href="../${s}/"`), s);
  }
});
