import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readdirSync } from "node:fs";
import { estimateBill, rankLevers } from "./engine.mjs";

const DOCS = "how-to-reduce-your-supabase-bill.html";
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

test("the page's worked example demonstrates the headline lever (dogfooding)", async () => {
  const page = await read("index.html");
  const m = /const EXAMPLE = (\{[\s\S]*?\});/.exec(page);
  assert.ok(m, "expected EXAMPLE in index.html");
  const est = estimateBill(JSON.parse(m[1].replace(/(\w+):/g, '"$1":')));
  assert.ok(est.total > 0);
  const levers = rankLevers(est.usage);
  assert.ok(levers.length >= 5);
  assert.ok(levers.some((l) => l.id === "trim-egress"));
});

test("index links one hop to the vercel-bill-estimator sibling", async () => {
  const idx = await read("index.html");
  assert.match(idx, /href="\.\.\/vercel-bill-estimator\/"/);
  assert.match(idx, /vercel bill estimator/i);
});
