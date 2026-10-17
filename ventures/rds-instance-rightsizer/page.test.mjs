import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readdirSync } from "node:fs";
import { parseInput, analyze, summarize } from "./engine.mjs";

const DOCS = "how-to-right-size-an-rds-instance.html";
const read = (f) => readFile(new URL(`./${f}`, import.meta.url), "utf8");

test("index and docs link to each other", async () => {
  assert.ok((await read("index.html")).includes(`href="${DOCS}"`));
  assert.match(await read(DOCS), /href="\.\/"/);
});

test("both pages carry no-warranty, not-a-bill, representative-period and FAQ data; index carries sponsor, privacy and opt-out", async () => {
  for (const f of ["index.html", DOCS]) {
    const p = await read(f);
    assert.match(p, /no warranty/i, f);
    assert.match(p, /from metrics, not a bill/i, f);
    assert.match(p, /representative period/i, f);
    assert.match(p, /approximate/i, f);
    assert.match(p, /FAQPage/, f);
  }
  const idx = await read("index.html");
  assert.match(idx, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(idx, /never uploaded|never leaves your device/i);
  assert.match(idx, /id="optout"/);
  assert.match(idx, /record\("analyze_run"\)/);
  assert.match(idx, /restarts the instance/);
});

test("every .html file is in the sitemap", async () => {
  const sitemap = await read("sitemap.xml");
  for (const name of readdirSync(new URL("./", import.meta.url)).filter((n) => n.endsWith(".html") && n !== "index.html")) {
    assert.ok(sitemap.includes(name), `${name} missing from sitemap.xml`);
  }
});

test("the page is wired to the engine's real exports and its controls exist", async () => {
  const page = await read("index.html");
  for (const id of ["input", "analyze", "load-example", "clear", "cput", "memr", "apply", "prices", "copy-commands", "report-card", "inst-rows", "commands"]) {
    assert.match(page, new RegExp(`id="${id}"`), id);
  }
  const engine = await import("./engine.mjs");
  const imported = /import \{([^}]*)\} from "\.\/engine\.mjs"/.exec(page)[1].split(",").map((s) => s.trim());
  for (const name of imported) assert.ok(name in engine, `engine.mjs does not export ${name}`);
});

test("the page's worked example demonstrates the headline rules (dogfooding)", async () => {
  const page = await read("index.html");
  const m = /const EXAMPLE_SOURCE = `([\s\S]*?)`;/.exec(page);
  assert.ok(m, "expected EXAMPLE_SOURCE in index.html");
  const report = analyze(parseInput(m[1]));
  const verdicts = new Set(report.instances.map((i) => i.verdict));
  assert.ok(verdicts.has("over-provisioned") && verdicts.has("under-provisioned") && verdicts.has("right-sized"));
  assert.ok(report.findings.some((f) => f.rule === "graviton-available"));
  assert.ok(report.findings.some((f) => f.rule === "memory-pressure"));
  assert.ok(report.findings.some((f) => f.rule === "multi-az-priced"));
  assert.ok(report.totals.savings > 0);
  assert.equal(summarize(report).status, "error");
});
