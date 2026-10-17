import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parsePackageJson, extractExportEntries, classifyExportEntries, normalizePath, parseFileList, diffExports, summarize } from "./engine.mjs";

const DOCS_PAGE = "why-package-json-exports-fields-drift-from-what-you-actually-publish.html";

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

test("index links one hop to both sibling drift-check tools", async () => {
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.match(page, /href="\.\.\/env-example-drift-check\/"/);
  assert.match(page, /href="\.\.\/structured-data-drift-check\/"/);
});

// The tool's own worked example (embedded in index.html's <script type="module">)
// must obviously demonstrate real drift when run through this venture's own
// engine (PRODUCT_PLAYBOOK.md SS5e "prove it on a worked example"), not just
// look plausible by eye.
test("index's own worked example demonstrates real drift (dogfooding)", async () => {
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  const pkgMatch = /const EXAMPLE_PKG = JSON\.stringify\(([\s\S]*?)\}, null, 2\);/.exec(page);
  const filesMatch = /const EXAMPLE_FILES = `([\s\S]*?)`;/.exec(page);
  assert.ok(pkgMatch, "expected an EXAMPLE_PKG in index.html");
  assert.ok(filesMatch, "expected an EXAMPLE_FILES template literal in index.html");

  // eslint-disable-next-line no-new-func -- the page embeds a JS object literal, not JSON
  const pkgObjText = pkgMatch[1] + "}";
  const pkg = new Function(`return (${pkgObjText});`)();
  const entries = extractExportEntries(pkg.exports);
  const { literal } = classifyExportEntries(entries);
  const fileSet = parseFileList(filesMatch[1]);
  const report = diffExports({ literal, fileExists: (t) => fileSet.has(normalizePath(t)) });
  const { status } = summarize(report);

  assert.equal(status, "missing", "the worked example should demonstrate at least one missing export target");
  assert.ok(report.missing.some((m) => m.target === "./cjs/feature.js"));
});

test("parsePackageJson round-trips the worked example's literal JSON form too", async () => {
  const pkg = parsePackageJson(JSON.stringify({
    exports: { ".": "./esm/index.js", "./feature": "./cjs/feature.js" },
  }));
  assert.deepEqual(extractExportEntries(pkg.exports).map((e) => e.target).sort(), [
    "./cjs/feature.js",
    "./esm/index.js",
  ]);
});

test("index links to node-version-drift-check so crawlers reach the sibling in one hop", async () => {
  const { readFile } = await import("node:fs/promises");
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.match(page, /href="\.\.\/node-version-drift-check\/"/);
});
