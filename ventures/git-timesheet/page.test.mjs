import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readdirSync } from "node:fs";
import { parseLog, summarize } from "./engine.mjs";

const DOCS = "how-to-estimate-hours-from-git-commits.html";
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
  const m = /const EXAMPLE = \[([\s\S]*?)\]\.join/.exec(page);
  assert.ok(m, "expected EXAMPLE in index.html");
  const lines = [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]).join("\n");
  const { commits, bad } = parseLog(lines);
  assert.equal(bad.length, 0);
  const s = summarize(commits, { rate: 90 });
  assert.equal(s.days.length, 2);
  assert.ok(s.hours > 0 && s.amount > 0);
});

test("the copy-paste command uses the engine's log format", async () => {
  assert.ok((await read("index.html")).includes("--pretty=format:'%H|%an|%aI|%s'"));
});
