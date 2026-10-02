import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readdirSync } from "node:fs";
import { parseRequests, plan, quotePrice, summarize } from "./engine.mjs";

const DOCS = "how-much-to-charge-for-dog-grooming.html";
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

test("the page's worked example is the fixture and demonstrates a real gain", async () => {
  const page = await read("index.html");
  const m = /const EXAMPLE_SOURCE = `([\s\S]*?)`;/.exec(page);
  assert.ok(m, "expected EXAMPLE_SOURCE in index.html");
  assert.equal(m[1].trim(), (await read("fixtures/requests.csv")).trim());
  const inputs = { capacity: 480, turnover: 10, target: 45, maxdogs: 0, maxlarge: 2, noshow: 10 };
  for (const [id, v] of Object.entries(inputs)) assert.match(page, new RegExp(`id="${id}" value="${v}"`));
  const p = plan(parseRequests(m[1]), { capacity: 480, turnover: 10, targetHourly: 45, maxDogs: 0, maxLarge: 2, noShow: 10 });
  assert.ok(p.totals.upliftVsFirstCome > 10);
  assert.equal(summarize(p).status, "gain");
});

test("the quote card's defaults match the guide's worked example", async () => {
  const idx = await read("index.html");
  for (const [id, v] of Object.entries({ "q-minutes": 80, "q-supplies": 6, "q-round": 1 })) assert.match(idx, new RegExp(`id="${id}" value="${v}"`));
  const q = quotePrice({ minutes: 80, supplies: 6, turnover: 10, targetHourly: 45 });
  assert.equal(q.exact, 73.5);
  const r = plan(parseRequests("Rocco,medium,150,85,10"), { targetHourly: 45, turnover: 10 }).ranked[0];
  assert.equal(r.priceForTarget, 130);
  const doc = await read(DOCS);
  for (const s of ["$73.50", "$74", "$28.13", "$130", "160 minutes"]) assert.ok(doc.includes(s), s);
});

test("index links to sibling tools", async () => {
  const idx = await read("index.html");
  for (const s of ["dog-grooming-profit-calculator", "pet-grooming-bid-calculator", "dog-walking-route-pricing", "dog-boarding-daycare-pricing", "appointment-deposit-calculator", "service-hourly-yield-analyzer"]) {
    assert.ok(idx.includes(`href="../${s}/"`), s);
  }
});
