import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readdirSync } from "node:fs";
import { parseInput, analyze, summarize } from "./engine.mjs";

const DOCS = "how-to-right-size-aws-rds-instances.html";
const read = (f) => readFile(new URL(`./${f}`, import.meta.url), "utf8");

test("index and docs link to each other", async () => {
  assert.ok((await read("index.html")).includes(`href="${DOCS}"`));
  assert.match(await read(DOCS), /href="\.\/"/);
});

test("both pages carry no-warranty, snapshot-not-a-bill and FAQ data; index carries sponsor, privacy and opt-out", async () => {
  for (const f of ["index.html", DOCS]) {
    const p = await read(f);
    assert.match(p, /no warranty/i, f);
    assert.match(p, /estimate from a snapshot, not a bill/i, f);
    assert.match(p, /representative period/i, f);
    assert.match(p, /FAQPage/, f);
  }
  const idx = await read("index.html");
  assert.match(idx, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(idx, /never uploaded|never leaves your device/i);
  assert.match(idx, /id="optout"/);
  assert.match(idx, /record\("analyze_run"\)/);
});

test("every .html file is in the sitemap", async () => {
  const sitemap = await read("sitemap.xml");
  for (const name of readdirSync(new URL("./", import.meta.url)).filter((n) => n.endsWith(".html") && n !== "index.html")) {
    assert.ok(sitemap.includes(name), `${name} missing from sitemap.xml`);
  }
});

test("both pages carry the restart/failover and non-prod verification warning", async () => {
  for (const f of ["index.html", DOCS]) {
    const p = await read(f);
    assert.match(p, /restart or failover/i, f);
    assert.match(p, /non-prod/i, f);
    assert.match(p, /advice of record/i, f);
  }
});

test("the page's worked example demonstrates the headline rules (dogfooding)", async () => {
  const page = await read("index.html");
  const m = /const EXAMPLE_SOURCE = `([\s\S]*?)`;/.exec(page);
  assert.ok(m, "expected EXAMPLE_SOURCE in index.html");
  const report = analyze(parseInput(m[1]));
  const rules = new Set(report.findings.map((f) => f.rule));
  for (const r of ["over-provisioned", "idle-instance", "under-provisioned-cpu", "graviton-swap", "io1-to-gp3", "gp2-to-gp3", "multi-az-nonprod"]) assert.ok(rules.has(r), r);
  assert.ok(report.totals.savings > 0);
  assert.ok(report.commands.length >= 3);
  assert.equal(summarize(report).status, "error");
});
