import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { RULES, CHART_TYPES } from "./engine.mjs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

test("index page carries the disclaimer, privacy line, sponsor link and JSON-LD", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not legal, tax, accounting, compliance, or financial advice/);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.equal([...html.matchAll(/<script type="application\/ld\+json">/g)].length, 2);
});

test("every control has a label, every chart type is offered, rule labels match the engine", () => {
  const html = page("index.html");
  for (const id of ["data", "type", "npn", "lsl", "usl", "exclude", "revise"]) assert.match(html, new RegExp(`<label for="${id}">`), id);
  for (const t of CHART_TYPES) assert.match(html, new RegExp(`<option value="${t}">`), t);
  for (const r of RULES) assert.ok(html.includes(`<label for="r${r.id}">${r.id}. ${r.text}</label>`), `rule ${r.id}`);
});

test("nothing can send data anywhere and the module imports only local files", () => {
  for (const f of ["index.html", "engine.mjs", "example-data.mjs"]) assert.doesNotMatch(page(f), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource/, f);
  const imports = [...page("index.html").matchAll(/from "([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(imports.sort(), ["./engine.mjs", "./example-data.mjs", "./usage.mjs"]);
  assert.doesNotMatch(page("index.html"), /<script[^>]+src=["']https?:/);
});

test("page cites the papers and the data source, and says what it does not decide", () => {
  const html = page("index.html");
  for (const k of ["shewhart1931", "nelson1984", "tippett1925", "bissell1990", "rigdon1994", "LITHOGRA.DAT", "Not decided"]) assert.ok(html.includes(k), k);
});

test("usage events named on the page are the ones the code records", () => {
  const html = page("index.html");
  const named = [...html.matchAll(/<code>([a-z_]+)<\/code>/g)].map((m) => m[1]).sort();
  const recorded = [...html.matchAll(/record\("([a-z_]+)"\)/g)].map((m) => m[1]);
  assert.deepEqual(named, [...new Set(recorded)].sort());
});

test("figures quoted on the page match the engine and the bench file", async () => {
  const html = page("index.html");
  const { analyze } = await import("./engine.mjs");
  const { EXAMPLE_TEXT } = await import("./example-data.mjs");
  const xr = analyze({ text: EXAMPLE_TEXT });
  const out = new Set(xr.signals.filter((s) => s.rule === 1 && s.chart === "Averages").map((s) => s.i)).size;
  assert.ok(html.includes(`${out} of the 90 wafers`));
  assert.ok(html.includes(`about ${xr.betweenRatio.toFixed(1)} times`));
  const bench = JSON.parse(page("bench/false-alarms.json"));
  const pct = (c, k) => Math.round(100 * bench.cases[c].anySignal[k].either.p);
  assert.ok(html.includes(`${pct(0, "rule 1 only")}% of the time with rule 1 alone and ${pct(0, "all eight Nelson rules")}% with all eight`));
  assert.ok(html.includes(`${pct(2, "rule 1 only")}% and ${pct(2, "all eight Nelson rules")}% of the time`));
});

test("robots, sitemap and llms.txt are present", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
  assert.match(page("llms.txt"), /spc-control-charts/);
});
