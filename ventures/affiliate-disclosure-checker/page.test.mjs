import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { checkDisclosure, summarize } from "./engine.mjs";

const DOCS_PAGE = "what-disclosure-does-amazon-associates-and-the-ftc-require.html";

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

test("both pages carry the not-affiliated trademark disclaimer", async () => {
  for (const file of ["index.html", DOCS_PAGE]) {
    const page = await readFile(new URL(`./${file}`, import.meta.url), "utf8");
    assert.match(page, /not\s+affiliated\s+with/i, `${file} is missing the not-affiliated disclaimer`);
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

test("index never claims a compliance determination", async () => {
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.match(page, /not a (?:legal\s+)?(?:compliance\s+)?determination/i);
});

// The tool's own worked example (embedded in index.html's <script type="module">)
// must obviously demonstrate a real finding when run through this venture's own
// engine (PRODUCT_PLAYBOOK.md SS5e "prove it on a worked example"), not just
// look plausible by eye.
test("index's own worked example demonstrates a real missing-disclosure finding (dogfooding)", async () => {
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  const exampleMatch = /const EXAMPLE_HTML = `([\s\S]*?)`;/.exec(page);
  assert.ok(exampleMatch, "expected an EXAMPLE_HTML template literal in index.html");

  const report = checkDisclosure(exampleMatch[1]);
  const { level } = summarize(report);

  assert.equal(report.status, "missing-disclosure", "the worked example should demonstrate a missing disclosure");
  assert.equal(level, "fail");
  assert.ok(report.hasAmazonLink, "the worked example should use a recognisable Amazon Associates link");
});
