import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readdirSync } from "node:fs";
import { parseJobs, plan, summarize, money } from "./engine.mjs";

const DOCS = "which-serves-should-a-process-server-take-today.html";
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
  assert.match(idx, /safety-sensitive/);
});

test("every .html file is in the sitemap", async () => {
  const sitemap = await read("sitemap.xml");
  for (const name of readdirSync(new URL("./", import.meta.url)).filter((n) => n.endsWith(".html") && n !== "index.html")) {
    assert.ok(sitemap.includes(name), `${name} missing from sitemap.xml`);
  }
});

test("the page's worked example is the fixture and demonstrates a real gain", async () => {
  const page = await read("index.html");
  const m = /const EXAMPLE_SOURCE = `([\s\S]*?)`;/.exec(page);
  assert.ok(m, "expected EXAMPLE_SOURCE in index.html");
  assert.equal(m[1].trim(), (await read("fixtures/jobs.csv")).trim());
  const inputs = { start: "08:00", end: "17:00", hourly: 35, permile: 0.7, speed: 30, circuity: 1.3 };
  for (const [id, v] of Object.entries(inputs)) assert.match(page, new RegExp(`id="${id}" value="${v}"`));
  const p = plan(parseJobs(m[1]), { shiftStart: "08:00", shiftEnd: "17:00", hourly: 35, perMile: 0.7, speed: 30, circuity: 1.3 });
  assert.ok(p.upliftVsBest > 50);
  assert.ok(p.declined.length >= 1);
  assert.equal(summarize(p).status, "gain");
});

test("the guide's worked queue matches the engine", async () => {
  const p = plan(parseJobs(await read("fixtures/jobs.csv")), {});
  assert.equal(p.accepted, 8);
  assert.equal(money(p.profit), "$390.11");
  assert.equal(money(p.baselines[0].profit), "$147.46");
  assert.equal(p.baselines[0].jobs, 6);
  assert.equal(money(p.baselines[1].profit), "$176.60");
  assert.equal(p.baselines[1].jobs, 3);
  assert.equal(money(p.upliftVsBest), "$213.51");
  assert.equal(p.miles.toFixed(1), "89.6");
  assert.equal(money(p.declined.find((d) => d.name === "Skip-traced address").minPrice), "$120.43");
  assert.equal(money(p.declined.find((d) => d.name === "Rural residence").minPrice), "$108.88");
  const doc = await read(DOCS);
  for (const s of ["$390.11", "$147.46", "$176.60", "$213.51", "89.6 miles", "$120.43", "$108.88", "15:43"]) assert.ok(doc.includes(s), s);
});

test("index links to sibling tools", async () => {
  const idx = await read("index.html");
  for (const s of ["process-server-fee-calculator", "route-stop-optimizer", "court-reporter-transcript-calculator", "mobile-signing-agent-day-picker"]) {
    assert.ok(idx.includes(`href="../${s}/"`), s);
  }
});
