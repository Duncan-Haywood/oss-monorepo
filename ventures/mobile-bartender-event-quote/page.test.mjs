import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readdirSync } from "node:fs";
import { quote } from "./engine.mjs";

const DOCS = "how-to-price-a-mobile-bar-event.html";
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

test("every input id the page script reads exists in the markup", async () => {
  const page = await read("index.html");
  const used = new Set([...page.matchAll(/\$\("#([a-z-]+)"\)|num\("#([a-z-]+)"\)/g)].map((m) => m[1] || m[2]));
  for (const id of used) assert.ok(page.includes(`id="${id}"`), `#${id} is read but not defined`);
});

test("the page's default inputs produce the engine's default quote", async () => {
  const page = await read("index.html");
  const val = (id) => Number(new RegExp(`id="${id}"[^>]*value="([^"]*)"`).exec(page)[1]);
  const q = quote({ guests: val("guests"), hours: val("hours"), guestsPerBartender: val("gpb"), bartenderRate: val("rate"), minBartenderHours: val("min"), setupHours: val("setup"), miles: val("miles"), insuranceAndPermit: val("ins"), targetMargin: val("margin") / 100 });
  assert.deepEqual(q, quote({}));
});
