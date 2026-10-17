import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseCostExport, compareBills, pickSides } from "./engine.mjs";

const read = (name) => readFile(new URL(`./${name}`, import.meta.url), "utf8");
const PAGES = ["index.html", "vs-cost-explorer.html"];

test("index links to the comparison page and it links back", async () => {
  assert.match(await read("index.html"), /href="vs-cost-explorer\.html"/);
  assert.match(await read("vs-cost-explorer.html"), /href="\.\/"/);
});

test("both pages carry no-warranty, not-advice and affiliation language", async () => {
  for (const f of PAGES) {
    const page = await read(f);
    assert.match(page, /no warranty/i, f);
    assert.match(page, /not (financial|a diagnosis)|not financial/i, f);
    assert.match(page, /not\s+affiliated\s+with/i, f);
    assert.match(page, /Amazon Web Services/, f);
  }
});

test("the comparison page is honest about what the console does better", async () => {
  const page = await read("vs-cost-explorer.html");
  assert.match(page, /Live data, budgets, forecasts/);
  assert.match(page, /Use the console when/);
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

test("index wires the engine, the opt-out and the local-only counter", async () => {
  const page = await read("index.html");
  assert.match(page, /from "\.\/engine\.mjs"/);
  assert.match(page, /compareBills/);
  assert.match(page, /id="optout"/);
  assert.match(page, /setUsageOptOut\(true\)/);
  assert.match(page, /from "\.\/usage\.mjs"/);
});

test("index links one hop to the Terraform cost sibling", async () => {
  assert.match(await read("index.html"), /href="\.\.\/terraform-plan-cost-estimate\/"/);
});

test("JSON-LD blocks parse; the app is free; FAQ answers exist", async () => {
  for (const f of PAGES) {
    const page = await read(f);
    const blocks = [...page.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
    assert.ok(blocks.length >= 1, f);
    for (const b of blocks.filter((x) => x["@type"] === "FAQPage")) assert.ok(b.mainEntity.length >= 3);
  }
  const blocks = [...(await read("index.html")).matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  assert.equal(blocks.find((x) => x["@type"] === "SoftwareApplication").offers.price, "0");
});

test("the sitemap lists every page", async () => {
  const sitemap = await read("sitemap.xml");
  for (const f of PAGES) assert.ok(sitemap.includes(`./${f}`), f);
});

test("the worked example on the page is the fixture, parses without a cropped-total warning, and finds the drivers", async () => {
  const page = await read("index.html");
  const m = /const EXAMPLE_CSV = `([\s\S]*?)`;/.exec(page);
  assert.ok(m, "example CSV not found");
  const exp = parseCostExport(m[1]);
  assert.deepEqual(exp.mismatches, []);
  const sides = pickSides(exp, null);
  const r = compareBills(sides.before, sides.after);
  assert.equal(r.lines[0].name, "EC2 - Other");
  assert.ok(r.newLines.length + r.goneLines.length >= 1);
  assert.ok(r.drivers.some((d) => d.hint && d.hint.kind === "commitment"), "the example should show a commitment line");
  const fixture = parseCostExport(await read("fixtures/cost-explorer-monthly.csv"));
  assert.deepEqual(exp.lines, fixture.lines);
});
