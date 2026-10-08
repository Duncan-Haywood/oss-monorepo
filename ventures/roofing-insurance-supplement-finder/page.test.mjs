import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DEFAULTS } from "./calc.mjs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

test("index page carries the disclaimer, privacy line and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not insurance, legal, tax, public-adjuster, engineering, compliance, or financial advice/);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /<script type="application\/ld\+json">/);
});

test("every default has a labelled input (a row label or aria-label in the table) and nothing can send data anywhere", () => {
  const html = page("index.html");
  for (const id of Object.keys(DEFAULTS)) assert.match(html, new RegExp(`<label for="${id}">|id="${id}"[^>]*aria-label="[^"]+"`), id);
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource/);
  assert.doesNotMatch(page("calc.mjs"), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket/);
});

test("the module scripts import only local files", () => {
  const html = page("index.html");
  const imports = [...html.matchAll(/from "([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(imports.sort(), ["./calc.mjs", "./usage.mjs"]);
  assert.doesNotMatch(html, /<script[^>]+src=["']https?:/);
});

test("page states what it does not decide", () => {
  const html = page("index.html");
  assert.match(html, /Not decided/);
  assert.match(html, /What the policy covers/);
});

test("page never asks for homeowner or policy information", () => {
  assert.match(page("index.html"), /no homeowner or policy information is asked for/);
  assert.doesNotMatch(page("index.html"), /type="(text|email|tel|file)"/);
});

test("robots and sitemap let crawlers find the page", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
});

test("usage events named on the page are the ones the code records", () => {
  const html = page("index.html");
  const named = [...html.matchAll(/<code>([a-z_]+)<\/code>/g)].map((m) => m[1]).sort();
  const recorded = [...html.matchAll(/record\("([a-z_]+)"\)/g)].map((m) => m[1]);
  assert.deepEqual(named, [...new Set(recorded)].sort());
});

test("the page links to the sibling tools it points at, and those exist", () => {
  const html = page("index.html");
  for (const m of html.matchAll(/href="\.\.\/([a-z0-9-]+)\/"/g)) {
    assert.doesNotThrow(() => readFileSync(new URL(`../${m[1]}/index.html`, import.meta.url)), m[1]);
  }
});

test("page logic runs end to end against a DOM stub and prints the headline figures", async () => {
  const html = page("index.html");
  const script = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1]
    .replace(/import [^;]+;\n/g, "");
  const els = new Map();
  const el = (id) => els.get(id) ?? (els.set(id, { id, value: "", innerHTML: "", hidden: true, textContent: "", disabled: false, listeners: {}, addEventListener(t, f) { this.listeners[t] = f; } }), els.get(id));
  globalThis.document = { getElementById: el };
  const calc = await import("./calc.mjs");
  const usage = await import("./usage.mjs");
  const fn = new Function("DEFAULTS", "num", "money", "money2", "supplement", "claimPayments", "supplementShare", "sensitivity", "record", "setUsageOptOut", "usageOptedOut", script);
  fn(calc.DEFAULTS, calc.num, calc.money, calc.money2, calc.supplement, calc.claimPayments, calc.supplementShare, calc.sensitivity, usage.record, usage.setUsageOptOut, usage.usageOptedOut);
  els.get("run").listeners.click();
  const out = els.get("result").innerHTML;
  assert.match(out, /Supplement requested: <strong>\$9,010<\/strong>/);
  assert.match(out, /Drip edge/);
  assert.match(out, /Accepted/);
  assert.equal(els.get("out").hidden, false);
  els.get("netSquares").value = "0";
  els.get("run").listeners.click();
  assert.match(els.get("result").innerHTML, /Check inputs/);
  delete globalThis.document;
});
