import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseExampleFile, scanSource, diffEnv, summarize } from "./engine.mjs";

const DOCS_PAGE = "why-env-example-files-drift-from-the-code-that-reads-them.html";

test("index links to the docs page", async () => {
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.match(
    page,
    new RegExp(`href="${DOCS_PAGE.replace(/\./g, "\\.")}"`),
    "index must link the secondary docs page so crawlers can reach it",
  );
});

test("docs page links back to the tool", async () => {
  const page = await readFile(new URL(`./${DOCS_PAGE}`, import.meta.url), "utf8");
  assert.match(page, /href="\.\/"/);
});

test("both pages carry the no-warranty clause", async () => {
  for (const file of ["index.html", DOCS_PAGE]) {
    const page = await readFile(new URL(`./${file}`, import.meta.url), "utf8");
    assert.match(page, /no warranty/i, `${file} is missing the no-warranty clause`);
  }
});

test("index carries the sponsor link", async () => {
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.match(page, /github\.com\/sponsors\/Duncan-Haywood/);
});

test("index states nothing is uploaded (privacy line)", async () => {
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.match(page, /never uploaded|never leaves your device/i);
});

test("index links one hop to the structured-data-drift-check sibling", async () => {
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.match(
    page,
    /href="\.\.\/structured-data-drift-check\/"/,
    'index must link ../structured-data-drift-check/ so crawlers reach a related tool in one hop',
  );
});

// The tool's own worked example (embedded in index.html's <script type="module">)
// must obviously demonstrate real drift when run through this venture's own
// engine (PRODUCT_PLAYBOOK.md SS5e "prove it on a worked example"), not just
// look plausible by eye.
test("index's own worked example demonstrates real drift (dogfooding)", async () => {
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  const envMatch = /const EXAMPLE_ENV = `([\s\S]*?)`;/.exec(page);
  const srcMatch = /const EXAMPLE_SOURCE = `([\s\S]*?)`;/.exec(page);
  assert.ok(envMatch, "expected an EXAMPLE_ENV template literal in index.html");
  assert.ok(srcMatch, "expected an EXAMPLE_SOURCE template literal in index.html");

  const declared = parseExampleFile(envMatch[1]);
  const referenced = scanSource(srcMatch[1], "worked example");
  const report = diffEnv({ declared, referenced });
  const { status } = summarize(report);

  assert.equal(status, "missing", "the worked example should demonstrate at least one missing variable");
  assert.ok(report.missing.some((m) => m.name === "AWS_REGION"));
});
