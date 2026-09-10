import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { checkPage, summarize } from "./engine.mjs";

const DOCS_PAGE = "why-google-requires-structured-data-to-match-visible-text.html";

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

test("index links one hop to the ai-crawler-access-check sibling", async () => {
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.match(
    page,
    /href="\.\.\/ai-crawler-access-check\/"/,
    'index must link ../ai-crawler-access-check/ so crawlers reach a related tool in one hop',
  );
});

// The tool's own page must obviously pass its own check (PRODUCT_PLAYBOOK.md
// SS5e) -- its FAQPage JSON-LD must say, word for word, what the page's
// visible text says, using this venture's own engine to check it rather
// than asserting the HTML looks right by eye.
test("index's own FAQPage JSON-LD matches its own visible text (dogfooding)", async () => {
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  const report = checkPage(page);
  const { status, text } = summarize(report);
  assert.ok(report.results.length > 0, "expected the index page to carry checkable JSON-LD");
  assert.equal(status, "ok", text);
  assert.deepEqual(report.errors, [], "index page's own JSON-LD must parse cleanly");
});

test("index links one hop to the env-example-drift-check sibling", async () => {
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.match(
    page,
    /href="\.\.\/env-example-drift-check\/"/,
    'index must link ../env-example-drift-check/ so crawlers reach a related tool in one hop',
  );
});

test("docs page's own FAQPage JSON-LD matches its own visible text (dogfooding)", async () => {
  const page = await readFile(new URL(`./${DOCS_PAGE}`, import.meta.url), "utf8");
  const report = checkPage(page);
  const { status, text } = summarize(report);
  assert.ok(report.results.length > 0, "expected the docs page to carry checkable JSON-LD");
  assert.equal(status, "ok", text);
  assert.deepEqual(report.errors, [], "docs page's own JSON-LD must parse cleanly");
});

const VS_PAGE = "vs-google-rich-results-test.html";

test("index links to the vs-google-rich-results-test comparison page", async () => {
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.match(
    page,
    new RegExp(`href="${VS_PAGE.replace(/\./g, "\\.")}"`),
    "index must link the comparison page so crawlers can reach it",
  );
});

test("vs-google-rich-results-test page links back to the tool and carries required clauses", async () => {
  const page = await readFile(new URL(`./${VS_PAGE}`, import.meta.url), "utf8");
  assert.match(page, /href="\.\/"/, "must link back to the tool");
  assert.match(page, /no warranty/i, "missing the no-warranty clause");
  assert.match(page, /github\.com\/sponsors\/Duncan-Haywood/, "missing the sponsor link");
  assert.match(page, /not affiliated with, endorsed by, or sponsored by Google/i, "missing the non-affiliation disclaimer");
});

test("vs-google-rich-results-test page's own FAQPage JSON-LD matches its own visible text (dogfooding)", async () => {
  const page = await readFile(new URL(`./${VS_PAGE}`, import.meta.url), "utf8");
  const report = checkPage(page);
  const { status, text } = summarize(report);
  assert.ok(report.results.length > 0, "expected the vs page to carry checkable JSON-LD");
  assert.equal(status, "ok", text);
  assert.deepEqual(report.errors, [], "vs page's own JSON-LD must parse cleanly");
});
