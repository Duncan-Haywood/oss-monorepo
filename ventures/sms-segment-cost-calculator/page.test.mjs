import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readdirSync } from "node:fs";
import { countSegments, savingsOptions } from "./engine.mjs";

const DOCS = "why-does-my-text-bill-as-multiple-segments.html";
const read = (f) => readFile(new URL(`./${f}`, import.meta.url), "utf8");

test("index and docs link to each other", async () => {
  assert.ok((await read("index.html")).includes(`href="${DOCS}"`));
  assert.match(await read(DOCS), /href="\.\/"/);
});

test("both pages carry no-warranty and FAQ data; index carries sponsor, privacy and opt-out", async () => {
  for (const f of ["index.html", DOCS]) {
    const p = await read(f);
    assert.match(p, /no warranty/i, f);
    assert.match(p, /FAQPage/, f);
  }
  const idx = await read("index.html");
  assert.match(idx, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(idx, /never uploaded/i);
  assert.match(idx, /id="optout"/);
});

test("every .html file is in the sitemap", async () => {
  const sitemap = await read("sitemap.xml");
  for (const name of readdirSync(new URL("./", import.meta.url)).filter((n) => n.endsWith(".html") && n !== "index.html")) {
    assert.ok(sitemap.includes(name), `${name} missing from sitemap.xml`);
  }
});

test("the page's worked example demonstrates the headline fix (dogfooding)", async () => {
  const page = await read("index.html");
  const m = /const EXAMPLE = ("[^"]*");/.exec(page);
  assert.ok(m, "expected EXAMPLE in index.html");
  const text = JSON.parse(m[1]);
  assert.equal(countSegments(text).encoding, "UCS-2");
  const r = savingsOptions(text, { messagesPerMonth: 10000 });
  assert.equal(r.options[0].id, "gsm7");
  assert.ok(r.options[0].saving > 0);
});

test("page element ids used by the script exist", async () => {
  const page = await read("index.html");
  for (const id of ["msg", "vol", "nums", "calc", "load-example", "clear", "report-card", "summary", "stats", "opt-table", "opt-rows", "fixed", "fixed-label", "estimate", "status", "prices-note", "p-perSegment", "p-carrierSurcharge", "p-numberMonthly", "p-campaignMonthly"]) {
    assert.ok(page.includes(`id="${id}"`), id);
  }
});

test("index links one hop to a sibling", async () => {
  assert.match(await read("index.html"), /href="\.\.\/vercel-bill-estimator\/"/);
});
