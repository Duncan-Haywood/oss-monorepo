import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readdirSync } from "node:fs";
import { parseJobs, plan, summarize, money } from "./engine.mjs";

const DOCS = "is-a-second-cleaning-crew-worth-it.html";
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
  assert.match(idx, /reputation-sensitive/);
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
  const inputs = { crews: 2, start: "09:00", end: "18:00", hourly: 40, permile: 0.7, speed: 30, circuity: 1.3 };
  for (const [id, v] of Object.entries(inputs)) assert.match(page, new RegExp(`id="${id}" value="${v}"`));
  const p = plan(parseJobs(m[1]), { crews: 2, shiftStart: "09:00", shiftEnd: "18:00", hourly: 40, perMile: 0.7, speed: 30, circuity: 1.3 });
  assert.ok(p.upliftVsBest > 50);
  assert.ok(p.declined.length >= 1);
  assert.equal(summarize(p).status, "gain");
});

test("the guide's worked queue matches the engine", async () => {
  const csv = parseJobs(await read("fixtures/jobs.csv"));
  const one = plan(csv, { crews: 1 });
  const two = plan(csv, {});
  const three = plan(csv, { crews: 3 });
  assert.equal(money(one.profit), "$119.13");
  assert.equal(one.accepted, 3);
  assert.equal(one.miles.toFixed(1), "31.4");
  assert.equal(money(one.baselines[0].profit), "$32.70");
  assert.equal(money(one.baselines[1].profit), "$90.94");
  assert.equal(money(two.profit), "$214.41");
  assert.equal(two.accepted, 6);
  assert.equal(two.miles.toFixed(1), "52.6");
  assert.equal(money(two.profit - one.profit), "$95.29");
  assert.equal(money(two.upliftVsBest), "$138.92");
  assert.equal(money(two.baselines[0].profit), "$75.49");
  assert.equal(money(two.baselines[1].profit), "$62.04");
  assert.equal(money(three.profit), "$245.43");
  assert.equal(three.accepted, 8);
  assert.equal(three.miles.toFixed(1), "107.3");
  assert.equal(money(three.profit - two.profit), "$31.02");
  const fee = (n) => money(two.declined.find((d) => d.name === n).minPrice);
  assert.equal(fee("Pine Cabin"), "$258.89");
  assert.equal(fee("Harbor 3BR"), "$271.03");
  assert.equal(fee("Ski Chalet"), "$336.11");
  assert.equal(fee("Mill Cottage"), "$208.24");
  const doc = await read(DOCS);
  for (const s of ["$119.13", "$32.70", "$90.94", "$214.41", "$95.29", "$138.92", "$75.49", "$62.04", "$245.43", "$31.02", "$258.89", "$271.03", "$336.11", "$208.24", "31.4 miles", "52.6 miles", "107.3 miles"]) assert.ok(doc.includes(s), s);
});

test("index links to sibling tools", async () => {
  const idx = await read("index.html");
  for (const s of ["str-cleaning-fee-pricing-calculator", "house-cleaning-quote-calculator", "route-stop-optimizer", "mobile-tire-van-job-picker"]) {
    assert.ok(idx.includes(`href="../${s}/"`), s);
    assert.ok(readdirSync(new URL(`../${s}/`, import.meta.url)).length > 0, s);
  }
});
