import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseConfig, analyze } from "./engine.mjs";

const DOCS_PAGE = "why-ai-agent-permission-configs-need-a-linter.html";
const COMPARISON_PAGE = "vs-manual-config-review.html";

test("index links to the docs page", async () => {
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.match(
    page,
    new RegExp(`href="${DOCS_PAGE.replace(/\./g, "\\.")}"`),
    "index must link the secondary docs page so crawlers can reach it",
  );
});

test("index links to the comparison page", async () => {
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.match(page, new RegExp(`href="${COMPARISON_PAGE.replace(/\./g, "\\.")}"`));
});

test("docs page links back to the tool", async () => {
  const page = await readFile(new URL(`./${DOCS_PAGE}`, import.meta.url), "utf8");
  assert.match(page, /href="\.\/"/);
});

test("comparison page links back to the tool", async () => {
  const page = await readFile(new URL(`./${COMPARISON_PAGE}`, import.meta.url), "utf8");
  assert.match(page, /href="\.\/"/);
});

test("every page carries the no-warranty clause", async () => {
  for (const file of ["index.html", DOCS_PAGE, COMPARISON_PAGE]) {
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
  assert.match(page, /never uploaded|never leaves your device|never sends any of it anywhere/i);
});

test("index links to at least one sibling agent-tooling venture", async () => {
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.match(
    page,
    /href="\.\.\/agent-instructions-drift-check\/"/,
    'index must link ../agent-instructions-drift-check/ so crawlers reach a related tool in one hop',
  );
});

test("index has SoftwareApplication and FAQPage JSON-LD", async () => {
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.match(page, /"@type":"SoftwareApplication"/);
  assert.match(page, /"@type":"FAQPage"/);
});

test("index has a usage opt-out control", async () => {
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.match(page, /id="optout"/);
});

// The tool's own worked example (embedded in index.html's <script type="module">)
// must obviously demonstrate real findings when run through this venture's
// own engine (PRODUCT_PLAYBOOK.md §5e "prove it on a worked example"), not
// just look plausible by eye.
test("index's own worked example demonstrates every finding kind (dogfooding)", async () => {
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  const match = /const EXAMPLE_CONFIG = JSON\.stringify\((\{[\s\S]*?\}), null, 2\);/.exec(page);
  assert.ok(match, "expected an EXAMPLE_CONFIG = JSON.stringify({...}) literal in index.html");

  // The object literal is JSON-compatible as written (as index.html's own
  // `JSON.stringify` call proves it must be), so parsing it as JSON
  // reproduces exactly what the browser would run `analyze()` on --
  // no eval of page source needed.
  const exampleObject = JSON.parse(match[1]);
  const parsed = parseConfig(JSON.stringify(exampleObject));
  const { status, findings } = analyze(parsed);

  assert.equal(status, "findings", "the worked example should demonstrate real findings");
  const kinds = findings.map((f) => f.kind);
  assert.ok(kinds.includes("bash-allow-all"), "worked example should trip the allow-all check");
  assert.ok(kinds.includes("unscoped-risky-allow"), "worked example should trip the unscoped-risky-command check");
  assert.ok(kinds.includes("insecure-mcp-url"), "worked example should trip the insecure-url check");
  assert.ok(kinds.includes("hardcoded-secret"), "worked example should trip the hardcoded-secret check");
});
