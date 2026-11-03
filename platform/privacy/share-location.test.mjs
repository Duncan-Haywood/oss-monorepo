// Tests for the checker first, the fleet second.
//
// The house rule in `browser-signals.test.mjs` applies with extra force here:
// a guard that cannot fail is worse than no guard, because it reports coverage
// over ground it never examined. Most of what follows feeds `checkSource`
// share links that genuinely leak and asserts it says so — including the exact
// six shapes found on the fleet on 2026-09-06, so a regression to any one of
// them is caught by name rather than by a general rule that might not reach.

import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";

import { checkSource, checkVentures, findShareSources } from "./share-location.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const VENTURES = path.join(HERE, "..", "..", "ventures");

// ---------------------------------------------------------------------------
// It must fail on the shapes that actually shipped.
// ---------------------------------------------------------------------------

test("catches searchParams.set, the most direct spelling", () => {
  const findings = checkSource(`
    const url = new URL(location.href);
    url.searchParams.set("c", encodeComparison(bookingInput(), state));
  `);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].id, "searchParams.set");
});

test("catches searchParams.append", () => {
  assert.equal(checkSource('url.searchParams.append("price", value);').length, 1);
});

test("catches a non-empty query-string assignment", () => {
  const findings = checkSource('url.search = `?c=${encodeComparison(readShared(), channels)}`;');
  assert.equal(findings.length, 1);
  assert.equal(findings[0].id, "search-assignment");
});

test("catches a link template built with ?${...}", () => {
  const findings = checkSource('return `${window.location.href.split("?")[0]}?${params}`;');
  assert.equal(findings.length, 1);
  assert.equal(findings[0].id, "question-mark-template");
});

test("catches a replaceState that writes the payload to the query string", () => {
  const findings = checkSource("history.replaceState(null, '', `${location.pathname}?${params.toString()}`);");
  assert.equal(findings.length, 1);
});

test("catches string concatenation onto a literal ?", () => {
  assert.equal(checkSource('const url = base + "?" + params.toString();').length, 1);
});

test("reports the line number and the offending source", () => {
  const findings = checkSource(["const a = 1;", "const b = 2;", 'url.searchParams.set("x", y);'].join("\n"));
  assert.equal(findings[0].line, 3);
  assert.match(findings[0].source, /searchParams\.set/);
  assert.match(findings[0].why, /server/);
});

// ---------------------------------------------------------------------------
// It must not fail on the shapes that are correct.
// ---------------------------------------------------------------------------

test("passes a fragment-based share link", () => {
  assert.deepEqual(
    checkSource("url.hash = new URLSearchParams({ c: encodeComparison(a, b) }).toString();"),
    [],
  );
});

test("passes `url.search = ''`, the documented way to clear a query string", () => {
  // This is the idiom every venture fixed on 2026-09-06 uses immediately
  // before assigning the fragment. Flagging it would make the fix unwritable.
  assert.deepEqual(checkSource('url.search = "";'), []);
  assert.deepEqual(checkSource("url.search = '';"), []);
  assert.deepEqual(checkSource("url.search = ``;"), []);
});

test("passes reads of the query string, which stay for legacy links", () => {
  // The whole point: links copied before the fix must keep opening, so the
  // read side is deliberately outside this rule.
  assert.deepEqual(checkSource('const v = new URLSearchParams(location.search).get("c");'), []);
  assert.deepEqual(checkSource("const params = new URL(s).searchParams;"), []);
  assert.deepEqual(checkSource('if (params.has(id)) el(id).value = params.get(id);'), []);
});

test("passes splitting a ? off a URL to get the base", () => {
  assert.deepEqual(checkSource('const base = window.location.href.split("?")[0];'), []);
});

test("does not flag a comment that discusses the rule", () => {
  // This checker's own header, and the comments added to the six fixed
  // ventures, all name `searchParams` and `?` while explaining why not to use
  // them. A guard that fires on its own rationale would be unusable.
  assert.deepEqual(checkSource('// never url.searchParams.set(...) — the server sees it'), []);
  assert.deepEqual(checkSource("     * a `?` is sent to the server, so use `#`"), []);
  assert.deepEqual(checkSource("<!-- ?${payload} would leak -->"), []);
});

test("does not flag a literal query string with no interpolation", () => {
  // A hard-coded documentation or search URL carries no visitor data.
  assert.deepEqual(checkSource('const docs = "https://example.test/help?topic=fees";'), []);
});

// ---------------------------------------------------------------------------
// The fleet itself.
// ---------------------------------------------------------------------------

test("the checker actually reaches the ventures", async () => {
  // Guards against the failure this suite exists to prevent elsewhere: a clean
  // run over an empty file list. 175-odd entry pages plus their modules.
  const files = await findShareSources(VENTURES);
  assert.ok(files.length > 200, `expected to scan the fleet, scanned ${files.length}`);
  assert.ok(files.some((f) => f.endsWith(path.join("no-show-fee-calculator", "calc.mjs"))));
});

test("it skips test files, which build ?-links as fixtures on purpose", async () => {
  const files = await findShareSources(VENTURES);
  assert.equal(files.filter((f) => /\.test\.(mjs|js)$/.test(f)).length, 0);
  // `no-show-fee-calculator` keeps its suite in a `test/` directory rather
  // than beside the source, and it asserts a legacy `?` link still opens.
  assert.equal(files.filter((f) => f.split(path.sep).includes("test")).length, 0);
});

// Regression, 2026-09-16. Building `ventures/vendor-watch` -- the step its own
// CI runs -- leaves a `.next/` tree, and one minified Next.js server chunk in
// it assigns to `.search`. The checker read that as a share leak in a venture
// with no share link, naming a file nobody wrote and git does not track. A red
// that fires because you built the project is one a session learns to wave
// through, so it is worth a test of its own rather than a quiet skip-list edit.
test("it skips generated build output, which is not source anyone wrote", async () => {
  const generated = path.join(VENTURES, ".share-location-fixture");
  const buildDir = path.join(generated, ".next");
  await mkdir(buildDir, { recursive: true });
  await writeFile(path.join(buildDir, "chunk.js"), 'e.search=`?${t}`;\n', "utf8");
  await writeFile(path.join(generated, "real.mjs"), "export const ok = 1;\n", "utf8");

  try {
    const files = await findShareSources(VENTURES);
    assert.ok(
      files.some((f) => f.endsWith(path.join(".share-location-fixture", "real.mjs"))),
      "the fixture's own source must still be scanned, or this test proves nothing",
    );
    assert.equal(
      files.filter((f) => f.split(path.sep).includes(".next")).length,
      0,
      "a .next/ build tree must not be scanned",
    );
    const { findings } = await checkVentures(VENTURES);
    assert.equal(findings.filter((f) => f.file.includes(".next")).length, 0);
  } finally {
    await rm(generated, { recursive: true, force: true });
  }
});

test("no venture writes share state to the query string", async () => {
  const { checked, findings } = await checkVentures(VENTURES);
  assert.ok(checked > 0);
  const report = findings
    .map((f) => `  ${path.relative(VENTURES, f.file)}:${f.line}  ${f.id} — ${f.source}`)
    .join("\n");
  assert.equal(
    findings.length,
    0,
    `share payloads must ride in the URL fragment, never the query string:\n${report}\n\n` +
      "A query string is sent to the server on every load and attached to the\n" +
      "Referer header of any outbound click. Assign `url.hash` instead, and keep\n" +
      "reading `location.search` so links shared earlier still open.",
  );
});

test("it skips a bare test.mjs or test.js but still scans other .mjs files", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "share-location-"));
  try {
    for (const name of ["test.mjs", "test.js", "calc.mjs"]) {
      await writeFile(path.join(root, name), "export const ok = 1;\n", "utf8");
    }
    const names = (await findShareSources(root)).map((f) => path.basename(f));
    assert.deepEqual(names, ["calc.mjs"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
