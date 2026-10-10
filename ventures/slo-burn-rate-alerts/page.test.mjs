import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readdirSync } from "node:fs";
import { lint, generateRules } from "./engine.mjs";

const DOCS = "how-to-set-multi-window-burn-rate-alerts-for-an-slo.html";
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

test("the page's default inputs produce a clean, valid rule file (dogfooding)", async () => {
  const page = await read("index.html");
  const val = (id) => new RegExp(`id="${id}"[^>]*>([^<]*)<`).exec(page) || new RegExp(`id="${id}"[^>]*value="([^"]*)"`).exec(page);
  const errors = /id="errors"[^>]*>([^<]*)</.exec(page)[1].replace(/&quot;/g, '"');
  const total = /id="total"[^>]*>([^<]*)</.exec(page)[1].replace(/&quot;/g, '"');
  assert.deepEqual(lint(99.9, 30), []);
  assert.match(generateRules({ name: "api", slo: 99.9, errors, total }), /- alert:/);
  assert.ok(val("slo"));
});

test("the 90% example the page loads really is flagged unreachable", () => {
  assert.ok(lint(90, 30).some((f) => f.rule === "unreachable-threshold"));
});

test('links to the on-call load analyzer', async () => {
  assert.match(await readFile(new URL('./index.html', import.meta.url), 'utf8'), /href="\.\.\/oncall-load-analyzer\/"/);
});
