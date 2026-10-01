import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readdirSync } from "node:fs";
import { scanSource, summarize } from "./engine.mjs";

const DOCS = "how-regex-denial-of-service-works-and-how-to-find-it-before-an-attacker-does.html";
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

test("the page's worked example demonstrates every headline rule in both languages (dogfooding)", async () => {
  const page = await read("index.html");
  const m = /const EXAMPLE_SOURCE = `([\s\S]*?)`;/.exec(page);
  assert.ok(m, "expected EXAMPLE_SOURCE in index.html");
  const source = new Function(`return \`${m[1]}\`;`)();
  const scan = scanSource(source, "pasted source");
  const rules = new Set(scan.findings.map((f) => f.rule));
  for (const r of ["nested-quantifier", "overlapping-alternation", "adjacent-overlap", "quadratic-end-anchor"]) assert.ok(rules.has(r), `example should trigger ${r}`);
  assert.ok(scan.findings.some((f) => f.lang === "py"), "example should flag a Python pattern");
  assert.equal(summarize(scan).status, "error");
  assert.ok(!scan.findings.some((f) => /a-z0-9_-/.test(f.pattern)), "the safe pattern in the example stays clean");
});
