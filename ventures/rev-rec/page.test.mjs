import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

test("index page carries the disclaimer, privacy line, and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not legal, tax, or financial advice/);
  assert.match(html, /Everything on this page runs in your browser/);
  assert.match(html, /no uptime or delivery guarantee/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /<script type="application\/ld\+json">/);
});

test("the page makes no network requests and labels its control", () => {
  const html = page("index.html");
  assert.match(html, /<label for="csv">/);
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon/);
});

test("the page imports modules that exist and never a Node-only one", () => {
  const html = page("index.html");
  const mods = [...html.matchAll(/from "\.\/([a-z]+\.mjs)"/g)].map((m) => m[1]);
  assert.ok(mods.length >= 3);
  for (const m of mods) {
    assert.doesNotThrow(() => page(m), m);
    assert.doesNotMatch(page(m), /from "node:/, `${m} must run in a browser`);
  }
});

test("the in-page FAQ matches the structured data", () => {
  const html = page("index.html");
  const ld = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  const faq = ld.find((x) => x["@type"] === "FAQPage");
  for (const q of faq.mainEntity) assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
});

test("robots and sitemap let crawlers find the page", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
});

test("the Dockerfile copies every module the server imports", () => {
  const docker = page("Dockerfile");
  const need = new Set();
  const walk = (f) => { for (const m of page(f).matchAll(/from "\.\/([a-z]+\.mjs)"/g)) if (!need.has(m[1])) { need.add(m[1]); walk(m[1]); } };
  walk("server.mjs");
  for (const f of need) assert.ok(docker.includes(f), `${f} missing from Dockerfile`);
});


test("the schedule table escapes the month and prints every number", async () => {
  const { scheduleTable, renderDashboard } = await import("./page.mjs");
  const html = scheduleTable([{ month: "<b>x", opening: 0, billed: 120000, recognized: 10000, closing: 110000, future: true }], "usd");
  assert.doesNotMatch(html, /<b>x/);
  assert.match(html, /\$1,200/); assert.match(html, /\$1,100/);
  const page = renderDashboard({ company: "<i>Co", summary: null, rows: [], currency: "usd", lastSyncAt: null, lineCount: 0, skipped: 0 });
  assert.doesNotMatch(page, /<i>Co/); assert.match(page, /No data yet/); assert.match(page, /accounting, tax or audit advice/);
});
