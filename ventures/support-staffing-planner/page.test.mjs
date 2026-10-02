import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readdirSync } from "node:fs";
import { parseDemand, plan, summarize, agentsNeeded, serviceLevel, normalizeOptions } from "./engine.mjs";

const DOCS = "how-many-support-agents-do-i-need.html";
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

test("the page's worked example is the fixture and plans cleanly", async () => {
  const page = await read("index.html");
  const m = /const EXAMPLE_SOURCE = `([\s\S]*?)`;/.exec(page);
  assert.ok(m, "expected EXAMPLE_SOURCE in index.html");
  assert.equal(m[1].trim(), (await read("fixtures/demand.csv")).trim());
  const inputs = { sl: 80, answer: 20, shrink: 30, occ: 85, aht: 300, wage: 22, interval: 30, step: 60, minshift: 3 };
  for (const [id, v] of Object.entries(inputs)) assert.match(page, new RegExp(`id="${id}" value="${v}"`));
  assert.match(page, /id="shifts" value="8,4"/);
  const p = plan(parseDemand(m[1]), { serviceLevel: 80, answerSeconds: 20, shrinkage: 30, maxOccupancy: 85, aht: 300, wage: 22, shifts: "8,4", intervalMinutes: 30, startStepMinutes: 60, minShiftHours: 3 });
  assert.equal(summarize(p).status, "plan");
  assert.ok(p.totals.flatPeak > p.totals.cost);
  assert.ok(p.totals.fullShiftOnly > p.totals.cost);
  assert.ok(p.totals.occupancyRuleMissedIntervals > 0);
});

test("the docs page's worked example matches the engine", async () => {
  const o = normalizeOptions({ maxOccupancy: 0 });
  assert.equal(agentsNeeded(5, 300, o), 8);
  const pc = (n) => Math.round(serviceLevel(n, 5, 300, 20) * 100);
  assert.equal(pc(6), 45);
  assert.equal(pc(7), 72);
  assert.equal(pc(8), 86);
  assert.equal(Math.ceil(8 / 0.7), 12);
  const doc = await read(DOCS);
  for (const s of ["5 erlangs", "about 45%", "about 72%", "about 86%", "17 seconds", "63% occupancy", "12 agents", "83% occupancy"]) assert.ok(doc.includes(s), s);
});

test("index links to sibling tools that exist", async () => {
  const idx = await read("index.html");
  for (const s of ["shift-roster-builder", "shift-cover-optimizer", "employee-cost-calculator"]) {
    assert.ok(idx.includes(`href="../${s}/"`), s);
    assert.ok(readdirSync(new URL("../", import.meta.url)).includes(s), s);
  }
});
