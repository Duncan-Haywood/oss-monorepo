import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readdirSync } from "node:fs";
import { compare, parseWeeks, history, money, pct } from "./engine.mjs";

const DOCS = "how-to-compare-booth-rent-and-commission-for-a-nail-tech.html";
const read = (f) => readFile(new URL(`./${f}`, import.meta.url), "utf8");

test("index and docs link to each other", async () => {
  assert.ok((await read("index.html")).includes(`href="${DOCS}"`));
  assert.match(await read(DOCS), /href="\.\/"/);
});

test("both pages carry no-warranty, FAQ data and the not-tax-advice warning; index carries sponsor, privacy and opt-out", async () => {
  for (const f of ["index.html", DOCS]) {
    const p = await read(f);
    assert.match(p, /no warranty/i, f);
    assert.match(p, /FAQPage/, f);
    assert.match(p, /not (a )?(market rates?|tax advice)/i, f);
    assert.match(p, /not (financial, )?tax/i, f);
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
  const defaults = { hours: 36, clients: 24, ticket: 60, minutes: 75, unpaid: 4, tips: 18, retail: 5, supplies: 6.5, target: 25, rent: 275, cardfee: 2.9, retailmargin: 40, insurance: 40, otherfixed: 35, boothsupplies: 100, split: 55, retailcommission: 10, commissionsupplies: 20, wage: 15, employeesupplies: 0, setax: 15.3, reserve: 10, fica: 7.65 };
  for (const [id, v] of Object.entries(defaults)) {
    assert.match(idx, new RegExp(`id="${id}" value="${v}"`), id);
    assert.match(idx, new RegExp(`${id}: ${v}[,} ]`), `${id} in EXAMPLE`);
  }
  assert.equal(compare({}).options.rentPerWeek, 275);
});

test("the page's worked history matches the fixture", async () => {
  const page = await read("index.html");
  const m = /const HISTORY_EXAMPLE = `([\s\S]*?)`;/.exec(page);
  assert.ok(m, "expected HISTORY_EXAMPLE in index.html");
  const body = (s) => s.split("\n").filter((l) => l.trim() && !l.startsWith("#") && !/^week,/.test(l)).join("\n");
  assert.equal(body(m[1]), body(await read("fixtures/weeks.csv")));
});

test("the guide's worked numbers match the engine", async () => {
  const c = compare({});
  const by = (id) => c.models.find((x) => x.id === id);
  assert.equal(c.bookedHours, 30);
  assert.equal(c.idleHours, 6);
  assert.equal(money(by("booth").net), "$1,246.14");
  assert.equal(money(by("booth").seTax), "$176.07");
  assert.equal(money(by("booth").incomeReserve), "$115.81");
  assert.equal(money(by("booth").takeHome), "$954.25");
  assert.equal(money(by("booth").perWorkedHour), "$23.86");
  assert.equal(money(by("booth").perBookedHour), "$31.81");
  assert.equal(by("booth").breakEvenClients.toFixed(1), "24.9");
  assert.equal(money(by("commission").net), "$1,014.69");
  assert.equal(money(by("commission").takeHome), "$777.02");
  assert.equal(money(by("commission").perWorkedHour), "$19.43");
  assert.equal(money(by("employee").net), "$811.20");
  assert.equal(money(by("employee").takeHome), "$671.13");
  assert.equal(money(by("employee").perWorkedHour), "$18.64");
  assert.equal(c.crossovers.boothVsCommission.toFixed(1), "13.0");
  assert.equal(c.crossovers.boothVsEmployee.toFixed(1), "18.6");
  const slow = compare({ clientsPerWeek: 12 });
  assert.equal(money(slow.models.find((x) => x.id === "booth").perWorkedHour), "$9.13");
  assert.equal(money(slow.models.find((x) => x.id === "commission").perWorkedHour), "$9.55");
  assert.equal(money(slow.models.find((x) => x.id === "employee").perWorkedHour), "$15.53");
  const h = history(parseWeeks(await read("fixtures/weeks.csv")), {});
  assert.equal(h.weeks.length, 8);
  assert.equal(money(h.takeHome), "$7,139.60");
  assert.equal(h.hours, 317);
  assert.equal(money(h.blendedHourly), "$22.52");
  assert.equal(h.below, 6);
  assert.equal(money(h.shortfall), "$1,019.19");
  const eff = Object.fromEntries(h.byModel.map((g) => [g.model, money(g.perWorkedHour)]));
  assert.deepEqual(eff, { booth: "$24.69", commission: "$21.85", employee: "$18.56" });
  assert.equal(Math.round(h.byModel[0].idleShare * 100), 39);
  assert.equal(money(h.weeks.find((w) => w.name === "2026-07-27").perWorkedHour), "$18.34");
  assert.equal(pct(0.5, 0), "50%");
  const doc = await read(DOCS);
  for (const s of ["30.0 hours", "6.0 idle", "$1,246.14", "$176.07", "$115.81", "$954.25", "$23.86", "$31.81", "24.9 clients", "$1,014.69", "$777.02", "$19.43", "$811.20", "$671.13", "$18.64", "13.0", "18.6", "$9.13", "$9.55", "$15.53", "$7,139.60", "317 hours", "$22.52", "$1,019.19", "$24.69", "39%", "$21.85", "$18.56", "$18.34"]) assert.ok(doc.includes(s), s);
});

test("index links to sibling tools", async () => {
  const idx = await read("index.html");
  for (const s of ["booth-rent-vs-commission", "massage-therapist-profit-calculator", "tattoo-piece-profit-calculator", "bridal-hair-makeup-pricing-calculator"]) {
    assert.ok(idx.includes(`href="../${s}/"`), s);
  }
});

test("the closest sibling links back to this tool", async () => {
  const sibling = await readFile(new URL("../booth-rent-vs-commission/index.html", import.meta.url), "utf8");
  assert.ok(sibling.includes('href="../nail-tech-booth-rent-calculator/"'));
});
