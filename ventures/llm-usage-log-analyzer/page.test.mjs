import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const script = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];

test("the page imports and calls the functions it claims to run", () => {
  for (const name of ["parseUsageLog", "analyze", "modelSwitchSavings", "reportText"]) {
    assert.match(script, new RegExp(name));
  }
  assert.match(script, /countUsage\("analyze_run"\)/);
  assert.match(script, /countUsage\("summary_copied"\)/);
  assert.match(script, /execCommand\("copy"\)/);
});

test("every id the script reads exists in the markup", () => {
  const used = [...script.matchAll(/\$\("([A-Za-z]+)"\)/g)].map((m) => m[1]);
  for (const id of new Set(used)) assert.match(html, new RegExp(`id="${id}"`), `missing #${id}`);
});

test("makes no network calls", () => {
  assert.doesNotMatch(script, /\bfetch\(|XMLHttpRequest|sendBeacon|WebSocket/);
});

test("carries the no-warranty disclaimer, hosting and sponsor paragraphs", () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not financial, procurement, or vendor-pricing advice/i);
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
});

test("states bring-your-own-rates and that the log stays in the browser", () => {
  assert.match(html, /does not fetch or assert any provider's price/);
  assert.match(html, /never uploaded/);
});

test("carries the usage opt-out toggle and states what is counted", () => {
  assert.match(html, /id="usage"/);
  assert.match(html, /Do Not Track and Global Privacy Control disable counting/);
});

test("the sample log parses to priceable records", async () => {
  const { parseUsageLog } = await import("./calc.mjs");
  const sample = script.match(/const SAMPLE = \[([\s\S]*?)\]\.map/)[1];
  const rows = eval(`[${sample}]`);
  assert.ok(rows.length >= 5);
  const log = rows.map(([model, label, input, read, write, out]) => JSON.stringify({ model, label, usage: { input_tokens: input, cache_read_input_tokens: read, cache_creation_input_tokens: write, output_tokens: out } })).join("\n");
  assert.equal(parseUsageLog(log).records.length, rows.length);
});
