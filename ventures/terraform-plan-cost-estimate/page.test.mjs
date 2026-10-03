import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (name) => readFile(new URL(`./${name}`, import.meta.url), "utf8");
const PAGES = ["index.html", "vs-infracost.html"];

test("index links to the vs-infracost page and it links back", async () => {
  assert.match(await read("index.html"), /href="vs-infracost\.html"/);
  assert.match(await read("vs-infracost.html"), /href="\.\/"/);
});

test("both pages carry the no-warranty and estimate-not-quote language", async () => {
  for (const f of PAGES) {
    const page = await read(f);
    assert.match(page, /no warranty/i, f);
    assert.match(page, /not (a )?quotes?|not quotes/i, f);
  }
});

test("both pages disclaim affiliation; the vs page names Infracost as a trademark", async () => {
  for (const f of PAGES) {
    const page = await read(f);
    assert.match(page, /not\s+affiliated\s+with/i, f);
    assert.match(page, /HashiCorp/, f);
    assert.match(page, /Infracost/, f);
  }
  assert.match(await read("vs-infracost.html"), /trademark of its owner/);
});

test("the vs page is honest about what Infracost does better", async () => {
  const page = await read("vs-infracost.html");
  assert.match(page, /Azure and Google Cloud/);
  assert.match(page, /live (list )?prices/i);
  assert.match(page, /Use Infracost when/);
});

test("index carries the sponsor link and the privacy line", async () => {
  const page = await read("index.html");
  assert.match(page, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(page, /never uploaded|never leaves your device/i);
});

test("no page makes a network request of its own", async () => {
  for (const f of PAGES) {
    const page = await read(f);
    for (const forbidden of [/\bfetch\s*\(/, /XMLHttpRequest/, /sendBeacon/, /new WebSocket/, /<form\b/i]) {
      assert.doesNotMatch(page, forbidden, `${f}: ${forbidden}`);
    }
  }
});

test("index shows the price table date and says unpriced resources are listed", async () => {
  const page = await read("index.html");
  const engine = await read("engine.mjs");
  const date = /PRICE_TABLE_DATE = "([\d-]+)"/.exec(engine)[1];
  assert.ok(page.includes(date), "index must show the date of the bundled price table");
  assert.match(page, /unpriced|could not be priced/i);
});

test("index wires the engine, the opt-out and the local-only counter", async () => {
  const page = await read("index.html");
  assert.match(page, /from "\.\/engine\.mjs"/);
  assert.match(page, /estimatePlan/);
  assert.match(page, /checkBudget/);
  assert.match(page, /id="optout"/);
  assert.match(page, /setUsageOptOut\(true\)/);
  assert.match(page, /from "\.\/usage\.mjs"/);
});

test("index links one hop to the blast-radius sibling", async () => {
  assert.match(await read("index.html"), /href="\.\.\/terraform-plan-blast-radius-check\/"/);
});

test("JSON-LD blocks parse; the app is free; FAQ answers exist", async () => {
  for (const f of PAGES) {
    const page = await read(f);
    const blocks = [...page.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
    assert.ok(blocks.length >= 1, f);
    for (const b of blocks.filter((x) => x["@type"] === "FAQPage")) assert.ok(b.mainEntity.length >= 3);
  }
  const page = await read("index.html");
  const blocks = [...page.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  const app = blocks.find((x) => x["@type"] === "SoftwareApplication");
  assert.ok(app, "index needs a SoftwareApplication block");
  assert.equal(app.offers.price, "0");
});

test("the sitemap lists every page", async () => {
  const sitemap = await read("sitemap.xml");
  for (const f of PAGES) assert.ok(sitemap.includes(`./${f}`), f);
});

test("the worked example on the page prices without error", async () => {
  const page = await read("index.html");
  const m = /const EXAMPLE_PLAN = JSON\.stringify\((\{[\s\S]*?\}), null, 2\);/.exec(page);
  assert.ok(m, "example plan not found");
  const { estimatePlan } = await import("./engine.mjs");
  const plan = eval(`(${m[1]})`);
  const r = estimatePlan(plan);
  assert.ok(r.items.length >= 4);
  assert.ok(r.unpriced.length >= 1, "the example should show an unpriced resource");
  assert.ok(r.usageBased.length >= 1);
});
