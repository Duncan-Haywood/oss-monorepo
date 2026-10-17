import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readdirSync } from "node:fs";
import { parseUnits, plan, summarize, money } from "./engine.mjs";

const DOCS = "when-should-a-used-car-dealer-wholesale-an-aged-unit.html";
const read = (f) => readFile(new URL(`./${f}`, import.meta.url), "utf8");

test("index and docs link to each other", async () => {
  assert.ok((await read("index.html")).includes(`href="${DOCS}"`));
  assert.match(await read(DOCS), /href="\.\/"/);
});

test("both pages carry no-warranty, FAQ data; index carries sponsor, privacy and opt-out", async () => {
  for (const f of ["index.html", DOCS]) {
    const p = await read(f);
    assert.match(p, /no warranty/i, f);
    assert.match(p, /FAQPage/, f);
    assert.match(p, /not a forecast/i, f);
  }
  const idx = await read("index.html");
  assert.match(idx, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(idx, /never uploaded|never leaves your device/i);
  assert.match(idx, /id="optout"/);
  assert.match(idx, /record\("plan_run"\)/);
  assert.match(idx, /from "\.\/usage\.mjs"/);
});

test("every .html file is in the sitemap", async () => {
  const sitemap = await read("sitemap.xml");
  for (const name of readdirSync(new URL("./", import.meta.url)).filter((n) => n.endsWith(".html") && n !== "index.html")) {
    assert.ok(sitemap.includes(name), `${name} missing from sitemap.xml`);
  }
});

test("the page's worked example is the fixture, its defaults match, and it demonstrates a real gain", async () => {
  const page = await read("index.html");
  const m = /const EXAMPLE_SOURCE = `([\s\S]*?)`;/.exec(page);
  assert.ok(m, "expected EXAMPLE_SOURCE in index.html");
  assert.equal(m[1].trim(), (await read("fixtures/lot.csv")).trim());
  const inputs = { apr: 9, cash: 6, maxage: 180, linevalue: 0, curtail: "90:10,120:10,150:10" };
  for (const [id, v] of Object.entries(inputs)) assert.match(page, new RegExp(`id="${id}" value="${v}"`));
  const p = plan(parseUnits(m[1]), { apr: 9, cashRate: 6, maxAge: 180, lineValue: 0, curtailments: "90:10,120:10,150:10" });
  assert.ok(p.totals.leftByWaiting > 500);
  assert.ok(p.totals.wholesaleNow >= 1);
  assert.equal(summarize(p).status, "gain");
});

test("the guide's worked lot matches the engine", async () => {
  const parsed = parseUnits(await read("fixtures/lot.csv"));
  const p = plan(parsed, {});
  const t = p.totals;
  assert.equal(money(t.carryPerDay), "$118.80");
  assert.equal(money(t.carryToDate), "$6,877.07");
  assert.equal(t.wholesaleNow, 3);
  assert.equal(money(t.lineFreedNow), "$17,130.00");
  assert.equal(money(t.leftByWaiting), "$1,117.35");
  assert.equal(Math.round(t.planLineDays / 1000), 2934);
  assert.equal(Math.round(t.waitLineDays / 1000), 4164);
  assert.equal(Math.round((t.waitLineDays / t.planLineDays - 1) * 100), 42);
  const by = Object.fromEntries(p.rows.map((r) => [r.stock, r]));
  assert.deepEqual(p.rows.filter((r) => r.wholesaleIn === 0).map((r) => r.stock.split(" ")[2]), ["Altima", "Malibu", "Fusion"]);
  assert.equal(by["A105 2011 Wrangler"].wholesaleAge, 115);
  assert.equal(by["A109 2013 Tahoe"].wholesaleAge, 147);
  assert.equal(money(by["A110 2017 Fusion"].carryToDate), "$1,412.27");
  const q = plan(parsed, { lineValue: 2 });
  assert.equal(q.totals.wholesaleNow, 5);
  assert.equal(money(q.totals.lineFreedNow), "$44,380.00");
  assert.equal(money(q.totals.leftByWaiting), "$4,885.68");
  const doc = await read(DOCS);
  for (const s of ["$118.80", "$6,877.07", "$1,412.27", "$17,130.00", "day 115", "day 147", "$1,117.35", "4,164", "2,934", "42%", "$44,380.00", "$4,885.68"]) assert.ok(doc.includes(s), s);
});

test("index links to sibling tools", async () => {
  const idx = await read("index.html");
  for (const s of ["auction-car-flip-calculator", "consignment-markdown-planner", "clearance-markdown-planner"]) {
    assert.ok(idx.includes(`href="../${s}/"`), s);
  }
});
