import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readdirSync } from "node:fs";
import { parseRenewals, plan, summarize, money } from "./engine.mjs";

const DOCS = "when-do-i-need-to-cancel-a-saas-auto-renewal.html";
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
  assert.match(idx, /time-sensitive/);
});

test("every .html file is in the sitemap", async () => {
  const sitemap = await read("sitemap.xml");
  for (const name of readdirSync(new URL("./", import.meta.url)).filter((n) => n.endsWith(".html") && n !== "index.html")) {
    assert.ok(sitemap.includes(name), `${name} missing from sitemap.xml`);
  }
});

test("the page's worked example is the fixture and shows urgent savings", async () => {
  const page = await read("index.html");
  const m = /const EXAMPLE_SOURCE = `([\s\S]*?)`;/.exec(page);
  assert.ok(m, "expected EXAMPLE_SOURCE in index.html");
  assert.equal(m[1].trim(), (await read("fixtures/renewals.csv")).trim());
  const p = plan(parseRenewals(m[1]), { asOf: "2026-10-02", bufferPct: 10, askPct: 10, leadDays: 30 });
  assert.equal(summarize(p).status, "urgent");
  assert.ok(p.totals.floorSavings > 50000);
});

test("the guide's worked list matches the engine", async () => {
  const p = plan(parseRenewals(await read("fixtures/renewals.csv")), { asOf: "2026-10-02" });
  const sf = p.rows.find((r) => r.vendor === "Salesforce");
  const sl = p.rows.find((r) => r.vendor === "Slack");
  const doc = await read(DOCS);
  const expected = [money(p.totals.spend), money(sf.doNothing), money(sf.floorTarget), money(sf.floorSavings), money(sf.stretchSavings), money(sl.floorSavings), money(sl.stretchSavings), money(p.totals.floorSavings), money(p.totals.stretchSavings), sf.noticeDeadline, sl.noticeDeadline];
  for (const s of expected) assert.ok(doc.includes(s), s);
  assert.equal(sf.daysToDeadline, 14);
  assert.equal(sl.daysToDeadline, 29);
});

test("index links to sibling tools", async () => {
  const idx = await read("index.html");
  for (const s of ["saas-seat-true-up", "subscription-price-impact", "saas-annual-plan-discount-calculator"]) {
    assert.ok(idx.includes(`href="../${s}/"`), s);
  }
});
