import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readdirSync } from "node:fs";
import { analyze, fromDay, SAMPLE, SAMPLE_OPTIONS, LIMITS } from "./engine.mjs";

const DOCS = "physical-presence-test-330-days-how-to-count.html";
const read = (f) => readFile(new URL(`./${f}`, import.meta.url), "utf8");

test("index and docs link to each other", async () => {
  assert.ok((await read("index.html")).includes(`href="${DOCS}"`));
  assert.match(await read(DOCS), /href="\.\/"/);
});

test("both pages carry no-warranty and FAQ data; index carries sponsor, privacy, opt-out and non-affiliation", async () => {
  for (const f of ["index.html", DOCS]) {
    const p = await read(f);
    assert.match(p, /no warranty/i, f);
    assert.match(p, /FAQPage/, f);
    assert.match(p, /Not affiliated with/, f);
  }
  const idx = await read("index.html");
  assert.match(idx, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(idx, /never uploaded/i);
  assert.match(idx, /id="optout"/);
  for (const e of ["count_run", "example_loaded"]) assert.ok(idx.includes(`record("${e}")`), e);
});

test("every .html file is in the sitemap", async () => {
  const sitemap = await read("sitemap.xml");
  for (const name of readdirSync(new URL("./", import.meta.url)).filter((n) => n.endsWith(".html") && n !== "index.html")) {
    assert.ok(sitemap.includes(name), `${name} missing from sitemap.xml`);
  }
});

test("the page makes no network call and ships no dependency", async () => {
  const idx = await read("index.html");
  assert.doesNotMatch(idx, /fetch\(|XMLHttpRequest|sendBeacon|<script[^>]+src="https?:/);
  for (const f of ["engine.mjs", "usage.mjs"]) assert.doesNotMatch(await read(f), /fetch\(|https?\.request|node:http|node:net/, f);
});

test("every element id the page script reads exists", async () => {
  const idx = await read("index.html");
  for (const id of new Set([...idx.matchAll(/\$\("#([a-z-]+)"\)/g)].map((m) => m[1]))) assert.match(idx, new RegExp(`id="${id}"`), id);
});

test("the guide's worked numbers match the engine", async () => {
  const r = analyze({ trips: SAMPLE, ...SAMPLE_OPTIONS });
  const doc = await read(DOCS);
  for (const s of [`<strong>${r.best.days}</strong>`, `<strong>${r.slack}</strong>`, `<strong>${r.maxOutside}</strong>`, `${fromDay(r.best.start)} to ${fromDay(r.best.end)}`, `<strong>${fromDay(r.earliest)}</strong>`, "$95,000.00", "$130,000.00"]) assert.ok(doc.includes(s), s);
  assert.equal(LIMITS[2025], 130000);
  assert.equal(r.excluded, 95000);
  for (const line of SAMPLE.split("\n").map((l) => l.split("#")[0].trim())) {
    const [a, b] = line.split(" to ");
    assert.ok(doc.includes(a), a);
    if (b !== "present") assert.ok(doc.includes(b), b);
  }
});
