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
  assert.ok(mods.length >= 4);
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

test("the chart escapes dynamic text", async () => {
  const { mrrChart } = await import("./chart.mjs");
  const svg = mrrChart([{ month: "<img onerror=1>", mrr: 100, customers: 1 }], "usd");
  assert.doesNotMatch(svg, /<img/);
});

test("the cohort table escapes the month and prints the numbers", async () => {
  const { cohortTable } = await import("./page.mjs");
  assert.equal(cohortTable([]), "");
  const html = cohortTable([{ month: "<b>x", size: 4, mrr: 400, logo: [1, 0.75], revenue: [1, 0.5] }]);
  assert.doesNotMatch(html, /<b>x/);
  assert.match(html, />75%</);
  assert.match(html, /50% of starting MRR/);
});

import { planTable } from "./page.mjs";
test("planTable escapes plan names, shows shares, hides customer ids, warns on concentration", () => {
  const html = planTable({ total: 100, plans: [{ plan: "<b>Pro</b>", mrr: 100, subs: 1, share: 1 }], concentration: { customers: 1, top1: 1, top5: 1, topN: 5 } }, "usd");
  assert.ok(!html.includes("<b>Pro</b>") && html.includes("&lt;b&gt;Pro"));
  assert.match(html, /100\.0%/); assert.match(html, /above 20%/);
  const r = planTable({ total: 1000, atRisk: { mrr: 300, subs: 2, share: 0.3 }, plans: [{ plan: "Pro", mrr: 1000, subs: 3, share: 1 }], concentration: null }, "usd");
  assert.match(r, /30\.0%\) across 2 past-due subscriptions/);
  assert.ok(!planTable({ total: 1, atRisk: { mrr: 0, subs: 0, share: 0 }, plans: [{ plan: "P", mrr: 1, subs: 1, share: 1 }], concentration: null }, "usd").includes("past-due"));
  assert.equal(planTable(null, "usd"), "");
});

import { forecastTable } from "./page.mjs";
test("forecast table prints every scenario and escapes labels", () => {
  assert.equal(forecastTable(null, "usd"), "");
  const h = forecastTable({ basis: ["<b>"], months: ["2027-01"], low: [90000], base: [100000], high: [110000] }, "usd");
  assert.match(h, /\$900/); assert.match(h, /\$1,000/); assert.match(h, /\$1,100/);
  assert.ok(!h.includes("<b>"));
});

import { concentrationCard } from "./page.mjs";
test("concentration card prints shares and escapes nothing dynamic but numbers", () => {
  assert.equal(concentrationCard(null), "");
  const html = concentrationCard({ subscriptions: 4, top1: 0.5, top5: 1, top10: 1, top: [0.5, 0.3], risk: "high" });
  assert.match(html, /50\.0%/);
  assert.match(html, /high<\/span> risk/);
});

test("footer links rev-rec and trial-converter", () => {
  const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  assert.match(html, /href="\.\.\/rev-rec\/"/);
  assert.match(html, /href="\.\.\/trial-converter\/"/);
});
