import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readdirSync } from "node:fs";
import { parseEvents, plan, summarize } from "./engine.mjs";

const DOCS = "which-markets-and-festivals-to-work.html";
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
  }
  const idx = await read("index.html");
  assert.match(idx, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(idx, /never uploaded|never leaves your device/i);
  assert.match(idx, /id="optout"/);
});

test("every .html file is in the sitemap", async () => {
  const sitemap = await read("sitemap.xml");
  for (const name of readdirSync(new URL("./", import.meta.url)).filter((n) => n.endsWith(".html") && n !== "index.html")) {
    assert.ok(sitemap.includes(name), `${name} missing from sitemap.xml`);
  }
});

test("the page's worked example is the fixture and demonstrates the headline claim", async () => {
  const page = await read("index.html");
  const m = /const EXAMPLE_SOURCE = `([\s\S]*?)`;/.exec(page);
  assert.ok(m, "expected EXAMPLE_SOURCE in index.html");
  assert.equal(m[1].trim(), (await read("fixtures/events.csv")).trim());
  const p = plan(parseEvents(m[1]), { cogsPct: 35, crewRate: 15, setupHours: 1, teardownHours: 0.5, maxPerWeek: 2, downside: 70 });
  assert.ok(p.totals.upliftVsFirstListed > 0);
  assert.equal(summarize(p).status, "gain");
  for (const [id, v] of [["cogs", 35], ["crew", 15], ["setup", 1], ["teardown", 0.5], ["maxweek", 2], ["downside", 70]]) {
    assert.match(page, new RegExp(`id="${id}" value="${v}"`));
  }
});

test("the docs page's worked example matches the engine", async () => {
  const p = plan(
    parseEvents("A Big Fair,2026-09-12,09:00,19:00,4000,500,0,60\nB Morning Market,2026-09-12,08:00,12:00,1800,50,0,0\nC Evening Rally,2026-09-12,14:30,21:00,2500,100,0,0"),
    { cogsPct: 35, crewRate: 15, setupHours: 1, teardownHours: 0.5 },
  );
  assert.equal(p.totals.upliftVsBiggestSales, 575);
  const doc = await read(DOCS);
  for (const s of ["$575", "$1,867.50", "$1,037.50", "$1,405.00", "$2,442.50"]) assert.ok(doc.includes(s), s);
});

test("index links to sibling event tools", async () => {
  const idx = await read("index.html");
  for (const s of ["food-truck-event-margin-calculator", "craft-fair-booth-calculator", "dj-gig-profit-calculator"]) {
    assert.ok(idx.includes(`href="../${s}/"`), s);
  }
});
