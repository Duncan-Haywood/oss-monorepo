import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readdirSync } from "node:fs";
import { compute } from "./engine.mjs";

const DOCS = "cobra-election-deadlines-explained.html";
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
  assert.match(idx, /never uploaded|never leaves your device|sends nothing/i);
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
  const m = /const EXAMPLE = (\{[^}]*\});/.exec(page);
  assert.ok(m, "expected EXAMPLE in index.html");
  const ex = JSON.parse(m[1].replace(/(\w+):/g, '"$1":'));
  const r = compute(ex);
  assert.equal(r.status, "ok");
  assert.equal(r.breakeven.kind, "at");
  assert.ok(r.dates.electionDeadline);
});

test("every form field id the script reads exists in the markup", async () => {
  const page = await read("index.html");
  const ids = /const IDS = (\{[^}]*\});/.exec(page);
  assert.ok(ids);
  for (const id of Object.values(JSON.parse(ids[1].replace(/(\w+):/g, '"$1":')))) assert.ok(page.includes(`id="${id}"`), id);
});

test("index links one hop to sibling tools", async () => {
  const idx = await read("index.html");
  for (const slug of ["aca-subsidy-cliff-calculator", "insurance-denial-appeal-builder", "severance-package-calculator"]) assert.match(idx, new RegExp(`href="\\.\\./${slug}/"`));
});
