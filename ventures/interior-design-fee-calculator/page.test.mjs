import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readdirSync } from "node:fs";
import { compare, parseProjects, history, money, pct } from "./engine.mjs";

const DOCS = "how-to-choose-an-interior-design-fee-structure.html";
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
  assert.match(idx, /never uploaded|never sends them anywhere/i);
  assert.match(idx, /id="optout"/);
  assert.match(idx, /Not affiliated with/);
  for (const e of ["compare_run", "history_run", "example_loaded"]) assert.ok(idx.includes(`record("${e}")`), e);
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
  for (const id of new Set([...idx.matchAll(/\$\("#([a-z-]+)"\)/g)].map((m) => m[1]))) assert.match(idx, new RegExp(`id="${id}"`), id);
  const defaults = { design: 40, visits: 4, visithours: 2.5, items: 60, itemmin: 25, meetings: 6, meetinghours: 1, overrun: 25, stress: 50, target: 100, walkaway: 75, cost: 40000, spend: 30000, sqft: 1500, hourly: 125, writeoff: 10, flat: 8500, percent: 20, persqft: 6, margin: 25, hybridflat: 3500, hybridmargin: 18 };
  for (const [id, v] of Object.entries(defaults)) assert.match(idx, new RegExp(`id="${id}" value="${v}"`), id);
});

test("the page's worked example is the engine's defaults, and the history matches the fixture", async () => {
  const page = await read("index.html");
  const m = /const HISTORY_EXAMPLE = `([\s\S]*?)`;/.exec(page);
  assert.ok(m, "expected HISTORY_EXAMPLE in index.html");
  const body = (s) => s.split("\n").filter((l) => l.trim() && !l.startsWith("#") && !/^project,/.test(l)).join("\n");
  assert.equal(body(m[1]), body(await read("fixtures/projects.csv")));
  assert.equal(money(compare({}).minimumFee), "$10,125.00");
});

test("the guide's worked numbers match the engine", async () => {
  const c = compare({});
  const by = (id) => c.models.find((x) => x.id === id);
  assert.equal(c.baseline, 81);
  assert.equal(c.expected.toFixed(2), "101.25");
  assert.equal(money(c.minimumFee), "$10,125.00");
  assert.equal(money(c.walkAway), "$7,593.75");
  assert.equal(money(by("hourly").fee), "$11,390.63");
  assert.equal(money(by("hourly").effective), "$112.50");
  assert.equal(money(by("flat").effective), "$83.95");
  assert.equal(money(by("flat").stressEffective), "$69.96");
  assert.equal(by("flat").breakEvenOverrunPct.toFixed(1), "4.9");
  assert.equal(money(by("percent").fee), "$8,000.00");
  assert.equal(money(by("percent").effective), "$79.01");
  assert.equal(money(by("sqft").effective), "$88.89");
  assert.equal(by("sqft").breakEvenOverrunPct.toFixed(1), "11.1");
  assert.equal(money(by("margin").fee), "$7,500.00");
  assert.equal(money(by("margin").effective), "$74.07");
  assert.equal(money(by("hybrid").fee), "$8,900.00");
  assert.equal(money(by("hybrid").effective), "$87.90");
  assert.equal(by("hybrid").breakEvenOverrunPct.toFixed(1), "9.9");
  const h = history(parseProjects(await read("fixtures/projects.csv")), {});
  assert.equal(h.projects.length, 8);
  assert.equal(money(h.fee), "$56,800.00");
  assert.equal(h.hours, 655);
  assert.equal(money(h.blendedHourly), "$86.72");
  assert.equal(h.below, 5);
  assert.equal(money(h.shortfall), "$10,700.00");
  const eff = Object.fromEntries(h.byModel.map((g) => [g.model, money(g.effective)]));
  assert.deepEqual(eff, { hybrid: "$118.18", hourly: "$112.50", sqft: "$102.86", flat: "$79.84", percent: "$79.31", margin: "$59.62" });
  assert.equal(pct(0.5, 0), "50%");
  const doc = await read(DOCS);
  for (const s of ["81 hours", "101.25 hours", "$10,125.00", "$7,593.75", "$11,390.63", "$112.50", "$83.95", "$69.96", "4.9%", "$8,000.00", "$79.01", "$88.89", "11.1%", "$7,500.00", "$74.07", "$8,900.00", "$87.90", "9.9%", "$56,800.00", "655 hours", "$86.72", "$10,700.00", "$118.18", "$102.86", "$79.84", "$79.31", "$59.62"]) assert.ok(doc.includes(s), s);
});

test("index links to sibling tools", async () => {
  const idx = await read("index.html");
  for (const s of ["wedding-florist-proposal-calculator", "photo-addon-pricing-calculator", "freelance-retainer-calculator", "client-profitability-time-analyzer"]) {
    assert.ok(idx.includes(`href="../${s}/"`), s);
  }
});
