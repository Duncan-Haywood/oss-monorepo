import test from "node:test";
import assert from "node:assert/strict";
import {
  extractFileRefs, extractScriptRefs, detectFootguns, parseInstructions,
  diffFileRefs, diffScriptRefs, summarize,
} from "./engine.mjs";

test("extractFileRefs finds a markdown link target with a real extension", () => {
  const refs = extractFileRefs("Read [`AGENTS.md`](AGENTS.md) first.");
  assert.ok(refs.has("AGENTS.md"));
  assert.equal(refs.get("AGENTS.md")[0].line, 1);
});

test("extractFileRefs finds a slash path inside inline code", () => {
  const refs = extractFileRefs("Run `python3 portfolio/ledger/session_gate.py` before anything else.");
  assert.ok(refs.has("portfolio/ledger/session_gate.py"));
});

test("extractFileRefs finds a bare well-known filename inside inline code", () => {
  const refs = extractFileRefs("Read `README.md` and `CLAUDE.md` first.");
  assert.ok(refs.has("README.md"));
  assert.ok(refs.has("CLAUDE.md"));
});

test("extractFileRefs ignores a bare word with no slash and no known filename", () => {
  const refs = extractFileRefs("The config lives in `src` and reads from `env`.");
  assert.equal(refs.size, 0);
});

test("extractFileRefs ignores version-like tokens (extension must be letter-led)", () => {
  const refs = extractFileRefs("Install `playwright@1.56.0` and pin Node to `18.20.4`.");
  assert.equal(refs.size, 0);
});

test("extractFileRefs ignores URLs, mailto, and anchors in markdown links", () => {
  const refs = extractFileRefs("See [docs](https://example.com/guide.md) or [jump](#section) or [mail](mailto:a@b.com).");
  assert.equal(refs.size, 0);
});

test("extractFileRefs strips trailing prose punctuation", () => {
  const refs = extractFileRefs("Read `AGENTS.md`, then `README.md`.");
  assert.ok(refs.has("AGENTS.md"));
  assert.ok(refs.has("README.md"));
});

test("extractFileRefs records multiple occurrences of the same path", () => {
  const refs = extractFileRefs("First read `AGENTS.md`.\nThen re-read `AGENTS.md` again.");
  assert.equal(refs.get("AGENTS.md").length, 2);
  assert.deepEqual(refs.get("AGENTS.md").map((o) => o.line), [1, 2]);
});

test("extractScriptRefs finds npm run <script>", () => {
  const refs = extractScriptRefs("Before pushing, run `npm run lint:fix` and `npm run build`.");
  assert.ok(refs.has("lint:fix"));
  assert.ok(refs.has("build"));
});

test("extractScriptRefs finds implicit npm test / npm start", () => {
  const refs = extractScriptRefs("CI runs `npm test` and locally use `npm start`.");
  assert.ok(refs.has("test"));
  assert.ok(refs.has("start"));
});

test("detectFootguns flags bare pytest in a fenced code block", () => {
  const text = ["```", "pytest tests -q", "```"].join("\n");
  const found = detectFootguns(text);
  assert.equal(found.length, 1);
  assert.equal(found[0].tool, "pytest");
  assert.equal(found[0].line, 2);
});

test("detectFootguns does not flag python3 -m pytest", () => {
  const text = ["```", "python3 -m pytest tests -q", "```"].join("\n");
  assert.equal(detectFootguns(text).length, 0);
});

test("detectFootguns flags bare mypy the same way", () => {
  const text = ["```", "mypy .", "```"].join("\n");
  const found = detectFootguns(text);
  assert.equal(found.length, 1);
  assert.equal(found[0].tool, "mypy");
});

test("detectFootguns ignores prose mentioning pytest outside a fenced block", () => {
  const text = "This project uses pytest for its test suite.";
  assert.equal(detectFootguns(text).length, 0);
});

test("detectFootguns ignores a commented-out line inside a fenced block", () => {
  const text = ["```", "# pytest tests -q  (disabled, see #123)", "```"].join("\n");
  assert.equal(detectFootguns(text).length, 0);
});

test("diffFileRefs splits refs into missing/matched via the supplied exists() check", () => {
  const refs = extractFileRefs("See `docs/real.md` and `docs/ghost.md`.");
  const exists = (p) => p === "docs/real.md";
  const { missing, matched } = diffFileRefs(refs, exists);
  assert.deepEqual(missing.map((m) => m.ref), ["docs/ghost.md"]);
  assert.deepEqual(matched.map((m) => m.ref), ["docs/real.md"]);
});

test("diffScriptRefs is skipped with no package.json (not a failure)", () => {
  const refs = extractScriptRefs("Run `npm run build`.");
  const result = diffScriptRefs(refs, null);
  assert.equal(result.skipped, true);
  assert.equal(result.missing.length, 0);
});

test("diffScriptRefs flags a script name absent from package.json", () => {
  const refs = extractScriptRefs("Run `npm run release` and `npm test`.");
  const result = diffScriptRefs(refs, { test: "node --test" });
  assert.equal(result.skipped, false);
  assert.deepEqual(result.missing.map((m) => m.name), ["release"]);
  assert.deepEqual(result.matched.map((m) => m.name), ["test"]);
});

test("summarize reports ok when nothing is broken", () => {
  const fileDiff = { missing: [], matched: [{ ref: "a.md" }] };
  const scriptDiff = { missing: [], matched: [], skipped: true };
  const { status, text } = summarize({ fileDiff, scriptDiff, footguns: [] });
  assert.equal(status, "ok");
  assert.match(text, /nothing broken/);
});

test("summarize names each kind of drift found", () => {
  const fileDiff = { missing: [{ ref: "ghost.md" }], matched: [] };
  const scriptDiff = { missing: [{ name: "release" }], matched: [], skipped: false };
  const footguns = [{ tool: "pytest" }];
  const { status, text } = summarize({ fileDiff, scriptDiff, footguns });
  assert.equal(status, "drift");
  assert.match(text, /1 file reference/);
  assert.match(text, /1 npm script reference/);
  assert.match(text, /1 known interpreter-mismatch footgun/);
});

// Worked example, demonstrated end to end through parseInstructions (the same
// function the CLI and browser page both call) -- proves the pieces compose,
// not just that each regex works alone.
test("parseInstructions + diffFileRefs + diffScriptRefs together demonstrate real drift on a worked example", () => {
  const text = [
    "# Example instructions",
    "",
    "Read [`AGENTS.md`](AGENTS.md) and `docs/setup.md` before starting.",
    "",
    "```",
    "npm run build",
    "npm run relase",
    "pytest tests -q",
    "```",
  ].join("\n");

  const { fileRefs, scriptRefs, footguns } = parseInstructions(text);
  const exists = (p) => p === "AGENTS.md"; // docs/setup.md does not exist
  const fileDiff = diffFileRefs(fileRefs, exists);
  const realScripts = { build: "tsc" }; // "relase" (a typo for "release") is not a real script
  const scriptDiff = diffScriptRefs(scriptRefs, realScripts);

  assert.deepEqual(fileDiff.missing.map((m) => m.ref), ["docs/setup.md"]);
  assert.deepEqual(scriptDiff.missing.map((m) => m.name), ["relase"]);
  assert.equal(footguns.length, 1);
  assert.equal(footguns[0].tool, "pytest");

  const { status } = summarize({ fileDiff, scriptDiff, footguns });
  assert.equal(status, "drift");
});
