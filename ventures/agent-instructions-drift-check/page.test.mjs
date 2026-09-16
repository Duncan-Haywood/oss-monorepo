import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseInstructions, diffFileRefs, diffScriptRefs, summarize } from "./engine.mjs";

const DOCS_PAGE = "why-ai-agent-instruction-files-rot.html";

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
  assert.match(page, /never uploaded|never leaves your device|never sends any of it anywhere/i);
});

test("index links to at least one sibling drift-check venture", async () => {
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.match(
    page,
    /href="\.\.\/env-example-drift-check\/"/,
    'index must link ../env-example-drift-check/ so crawlers reach a related tool in one hop',
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
// must obviously demonstrate real drift when run through this venture's own
// engine (PRODUCT_PLAYBOOK.md §5e "prove it on a worked example"), not just
// look plausible by eye.
test("index's own worked example demonstrates real drift (dogfooding)", async () => {
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  const instructionsMatch = /const EXAMPLE_INSTRUCTIONS = (\[[\s\S]*?\])\.join\("\\n"\);/.exec(page);
  const packageMatch = /const EXAMPLE_PACKAGE = `([\s\S]*?)`;/.exec(page);
  assert.ok(instructionsMatch, "expected an EXAMPLE_INSTRUCTIONS array literal in index.html");
  assert.ok(packageMatch, "expected an EXAMPLE_PACKAGE template literal in index.html");

  // The array literal is plain JSON-compatible string entries (as written in
  // index.html), so parsing it as JSON reproduces exactly what the browser's
  // own `.join("\n")` would run on -- no eval of page source needed.
  const arrayJson = instructionsMatch[1].replace(/,(\s*\])/, "$1"); // JS tolerates a trailing comma; JSON does not
  const exampleInstructions = JSON.parse(arrayJson).join("\n");
  const { fileRefs, scriptRefs, footguns } = parseInstructions(exampleInstructions);
  const exists = (p) => p === "AGENTS.md"; // mirrors the page's own existingFiles = new Set(["AGENTS.md"])
  const fileDiff = diffFileRefs(fileRefs, exists);
  const pkg = JSON.parse(packageMatch[1]);
  const scriptDiff = diffScriptRefs(scriptRefs, pkg.scripts);
  const { status } = summarize({ fileDiff, scriptDiff, footguns });

  assert.equal(status, "drift", "the worked example should demonstrate real drift");
  assert.ok(fileDiff.missing.some((m) => m.ref === "docs/setup.md"));
  assert.ok(scriptDiff.missing.some((m) => m.name === "relase"));
  assert.ok(footguns.some((f) => f.tool === "pytest"));
});
