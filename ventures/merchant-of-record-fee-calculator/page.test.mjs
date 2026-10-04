import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readdirSync } from "node:fs";
import { compare, project } from "./engine.mjs";

const DOCS = "stripe-vs-merchant-of-record-for-indie-saas.html";
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

test("the page's worked example runs through the engine (dogfooding)", async () => {
  const page = await read("index.html");
  const m = /const EXAMPLE = \{ revenue: (\d+), growth: (\d+) \};/.exec(page);
  assert.ok(m, "expected EXAMPLE in index.html");
  const input = { revenue: Number(m[1]), avgPrice: 29, intlShare: 50, selfTaxMonthly: 100 };
  const rows = compare(input);
  assert.ok(rows.length >= 5);
  assert.ok(rows.at(-1).total > rows[0].total);
  assert.ok(project(input, Number(m[2])).endRevenue > input.revenue);
});

test("index links one hop to the sibling money tools", async () => {
  const idx = await read("index.html");
  for (const slug of ["app-store-commission-calculator", "gumroad-sales-fee-analyzer", "patreon-fee-calculator", "saas-annual-plan-discount-calculator", "usage-based-pricing-simulator", "stripe-failed-payment-recovery-analyzer", "stripe-churn-cohort-analyzer"]) assert.match(idx, new RegExp(`href="\\.\\./${slug}/"`));
});
