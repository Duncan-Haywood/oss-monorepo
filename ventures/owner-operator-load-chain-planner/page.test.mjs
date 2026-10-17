import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readdirSync } from "node:fs";
import { parseLoads, plan, summarize, money, pct, evaluateChain } from "./engine.mjs";

const DOCS = "how-to-string-truckload-loads-together-and-cut-deadhead.html";
const read = (f) => readFile(new URL(`./${f}`, import.meta.url), "utf8");

test("index and docs link to each other", async () => {
  assert.ok((await read("index.html")).includes(`href="${DOCS}"`));
  assert.match(await read(DOCS), /href="\.\/"/);
});

test("both pages carry no-warranty, FAQ data; index carries sponsor, privacy, opt-out and the estimates warning", async () => {
  for (const f of ["index.html", DOCS]) {
    const p = await read(f);
    assert.match(p, /no warranty/i, f);
    assert.match(p, /FAQPage/, f);
    assert.match(p, /not a market rate/i, f);
    for (const block of p.match(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g)) {
      JSON.parse(block.replace(/<\/?script[^>]*>/g, ""));
    }
  }
  const idx = await read("index.html");
  assert.match(idx, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(idx, /never uploaded|never leave your device/i);
  assert.match(idx, /id="optout"/);
  assert.match(idx, /Not affiliated with/);
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

test("the page's worked example is the fixture and demonstrates a real gain through the engine", async () => {
  const page = await read("index.html");
  const m = /const EXAMPLE_SOURCE = `([\s\S]*?)`;/.exec(page);
  assert.ok(m, "expected EXAMPLE_SOURCE in index.html");
  assert.equal(m[1].trim(), (await read("fixtures/loads.csv")).trim());
  const inputs = { start: "Dallas TX", horizon: 120, mph: 50, mpg: 6.5, fuel: 3.9, permile: 0.25, fixedday: 150, dwell: 2, roadfactor: 1.2, drivehours: 11, resthours: 10 };
  for (const [id, v] of Object.entries(inputs)) assert.match(page, new RegExp(`id="${id}" value="${v}"`));
  assert.match(page, /\$\("#start"\)\.value = "Dallas TX"; \$\("#horizon"\)\.value = 120; \$\("#objective"\)\.value = "total";/);
  assert.match(page, /\$\("#hos"\)\.checked = true;[^\n]*\$\("#returnhome"\)\.checked = false;/);
  const r = plan(parseLoads(m[1]), { start: "Dallas TX", horizon: 120 });
  assert.ok(r.upliftVsBest > 100);
  assert.ok(r.others.length >= 1);
  assert.equal(summarize(r).status, "gain");
});

test("the guide's worked list matches the engine", async () => {
  const parsed = parseLoads(await read("fixtures/loads.csv"));
  assert.equal(parsed.loads.length, 11);
  const base = { start: "Dallas TX", horizon: 120 };
  const r = plan(parsed, base);
  assert.equal(money(r.totals.revenue), "$5,630.00");
  assert.equal(Math.round(r.totals.totalMiles), 2813);
  assert.equal(money(r.totals.profitBeforeFixed), "$3,174.19");
  assert.equal(r.totals.elapsedHours.toFixed(1), "118.3");
  assert.equal(pct(r.totals.emptyShare, 0), "14%");
  assert.equal(r.totals.restBreaks, 5);
  assert.equal(money(r.baselines[0].profit), "$2,719.83");
  assert.equal(money(r.upliftVsBest), "$454.36");
  const mem = r.chain.find((c) => c.name === "Memphis to Chicago");
  assert.equal(money(mem.ratePerLoadedMile), "$2.04");
  assert.equal(money(mem.allInPerMile), "$1.20");
  assert.equal(Math.round(mem.deadheadMiles), 404);
  assert.equal(money(mem.walkAway), "$725.64");
  const atl = r.chain.find((c) => c.name === "Dallas to Atlanta dry van");
  assert.equal(money(atl.walkAway), "$2,264.63");
  assert.equal(money(atl.headroom), "$85.37");
  assert.equal(money(r.others.find((o) => o.name === "Houston to Memphis").costToForce), "$85.37");
  const fuel5 = plan(parsed, { ...base, fuel: 5 });
  assert.equal(money(fuel5.totals.profitBeforeFixed), "$2,698.20");
  const noHos = plan(parsed, { ...base, hos: false });
  assert.equal(noHos.chain.length, 5);
  assert.equal(money(noHos.totals.profitBeforeFixed), "$3,660.79");
  assert.equal(noHos.totals.elapsedHours.toFixed(1), "106.5");
  assert.equal(money(noHos.totals.profitBeforeFixed - r.totals.profitBeforeFixed), "$486.60");
  // the rest-rule-off plan really is infeasible under the rule
  const order = noHos.chain.map((c) => parsed.loads.findIndex((l) => l.name === c.name));
  assert.equal(evaluateChain(parsed.loads, order, base), null);
  const perDay = plan(parsed, { ...base, objective: "perDay" });
  assert.equal(perDay.chain.length, 1);
  assert.equal(money(perDay.totals.perDayBeforeFixed), "$1,221.02");
  const doc = await read(DOCS);
  for (const s of ["$5,630.00", "2,813", "$3,174.19", "118.3 hours", "14 percent", "5 forced rests", "$2,719.83", "$454.36", "$2.04", "$1.20", "404", "$725.64", "$2,350.00", "$2,264.63", "$85.37", "$2,698.20", "$3,660.79", "106.5 hours", "$486.60", "$1,221.02"]) assert.ok(doc.includes(s), s);
});

test("index links to sibling tools", async () => {
  const idx = await read("index.html");
  for (const s of ["owner-operator-cpm-calculator", "freight-broker-load-margin-calculator", "route-stop-optimizer", "ifta-quarterly-fuel-tax-calculator", "freight-accessorial-auditor"]) {
    assert.ok(idx.includes(`href="../${s}/"`), s);
  }
});
