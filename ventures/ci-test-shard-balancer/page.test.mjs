import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseJUnit, analyze, matrixOf } from "./engine.mjs";

const read = (name) => readFile(new URL(`./${name}`, import.meta.url), "utf8");
const PAGES = ["index.html", "vs-knapsack-pro.html", "how-to-split-tests-across-ci-shards.html"];

test("index links to the comparison and guide pages and they link back", async () => {
  const index = await read("index.html");
  assert.match(index, /href="vs-knapsack-pro\.html"/);
  assert.match(index, /href="how-to-split-tests-across-ci-shards\.html"/);
  assert.match(await read("vs-knapsack-pro.html"), /href="\.\/"/);
  assert.match(await read("how-to-split-tests-across-ci-shards.html"), /href="\.\/"/);
});

test("every page carries no-warranty and not-advice language, and the sitemap lists every page", async () => {
  const sitemap = await read("sitemap.xml");
  for (const f of PAGES) {
    const page = await read(f);
    assert.match(page, /no warranty/i, f);
    assert.match(page, /not engineering, financial/i, f);
    assert.ok(sitemap.includes(`./${f}`), f);
  }
});

test("the index says plainly that it is a heuristic and timings vary", async () => {
  const page = await read("index.html");
  assert.match(page, /heuristic/i);
  assert.match(page, /vary from run to run/i);
  assert.match(page, /not a guarantee/i);
});

test("the comparison page carries the trademark disclaimer and says where the paid tool wins", async () => {
  const page = await read("vs-knapsack-pro.html");
  assert.match(page, /Not affiliated with, endorsed by, or sponsored by/i);
  assert.match(page, /trademark of its owner/i);
  assert.match(page, /Use Knapsack Pro when/);
  assert.match(page, /adapts during a run/i);
  assert.doesNotMatch(page, /\$\d/, "no price claims about the competitor");
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

test("index wires the engine, the opt-out and the local-only counter, and every id the script reads exists", async () => {
  const page = await read("index.html");
  assert.match(page, /from "\.\/engine\.mjs"/);
  assert.match(page, /from "\.\/usage\.mjs"/);
  assert.match(page, /analyze\(/);
  assert.match(page, /setUsageOptOut\(true\)/);
  const ids = new Set([...page.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
  const used = [...page.matchAll(/\$\("#([\w-]+)"\)/g)].map((m) => m[1]);
  assert.ok(used.length > 15);
  for (const id of used) assert.ok(ids.has(id), `#${id} is read by the script but absent from the markup`);
  assert.match(page, /document\.getElementById\("optout"\)/);
});

test("index links one hop to the flaky-test sibling", async () => {
  assert.match(await read("index.html"), /href="\.\.\/flaky-test-finder\/"/);
});

test("JSON-LD blocks parse; the app is free; FAQ answers exist", async () => {
  for (const f of PAGES) {
    const page = await read(f);
    const blocks = [...page.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
    assert.ok(blocks.length >= 1, f);
    for (const b of blocks.filter((x) => x["@type"] === "FAQPage")) assert.ok(b.mainEntity.length >= 3, f);
  }
  const blocks = [...(await read("index.html")).matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  assert.equal(blocks.find((x) => x["@type"] === "SoftwareApplication").offers.price, "0");
});

test("the worked example on the page is the fixture and balances better than the baseline", async () => {
  const page = await read("index.html");
  const m = /const EXAMPLE_XML = `([\s\S]*?)`;/.exec(page);
  assert.ok(m, "example XML not found");
  const fixture = await read("fixtures/suite-24-files.xml");
  assert.equal(m[1].trim(), fixture.trim());
  const r = analyze([parseJUnit(m[1])], { shards: 4, setupSeconds: 45, targetSeconds: 150 });
  assert.ok(r.balanced.max < r.current.max);
  assert.equal(r.recommendation.basis, "target");
  assert.equal(matrixOf(r).include.length, 4);
});
