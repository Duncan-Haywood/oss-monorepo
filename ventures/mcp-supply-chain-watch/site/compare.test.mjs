import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  EXAMPLE_AFTER,
  EXAMPLE_BEFORE,
  compare,
  formatChange,
  parseManifest,
  renderMarkdown,
} from "./compare.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const beforePath = join(root, "examples/before.json");
const afterPath = join(root, "examples/after.json");
const python = join(root, "src/mcp_watch.py");

function pythonReport(before, after) {
  const stdout = execFileSync("python3", [python, before, after, "--format", "json"], {
    encoding: "utf8",
  });
  return JSON.parse(stdout);
}

test("example fixtures match the CLI examples on disk", () => {
  assert.deepEqual(EXAMPLE_BEFORE, JSON.parse(readFileSync(beforePath, "utf8")));
  assert.deepEqual(EXAMPLE_AFTER, JSON.parse(readFileSync(afterPath, "utf8")));
});

test("detects an added tool and an instruction-bearing description change on the shipped fixtures", () => {
  const report = compare(parseManifest(JSON.stringify(EXAMPLE_BEFORE)), parseManifest(JSON.stringify(EXAMPLE_AFTER)));
  const kinds = report.changes.map((change) => change.kind);
  assert.deepEqual(kinds, ["description_changed", "tool_added"]);
  assert.equal(report.changes[0].bucket, "instruction-bearing");
  assert.equal(report.changes[0].severity, "alert");
  assert.equal(report.changes[1].tool, "delete_inventory");
  assert.equal(report.changes[1].severity, "review");
});

test("JS compare() matches the Python CLI on the shipped fixtures", () => {
  const jsReport = compare(parseManifest(JSON.stringify(EXAMPLE_BEFORE)), parseManifest(JSON.stringify(EXAMPLE_AFTER)));
  const pyReport = pythonReport(beforePath, afterPath);
  assert.deepEqual(
    jsReport.changes.map(({ kind, severity, tool, bucket }) => ({ kind, severity, tool, bucket })),
    pyReport.changes.map(({ kind, severity, tool, bucket }) => ({ kind, severity, tool, bucket })),
  );
  assert.equal(jsReport.server, pyReport.server);
});

test("a removed tool is an alert", () => {
  const before = parseManifest(JSON.stringify({
    tools: [
      { name: "search_inventory", description: "Search" },
      { name: "delete_inventory", description: "Delete" },
    ],
  }));
  const after = parseManifest(JSON.stringify({
    tools: [{ name: "search_inventory", description: "Search" }],
  }));
  const report = compare(before, after);
  assert.equal(report.changes[0].kind, "tool_removed");
  assert.equal(report.changes[0].severity, "alert");
});

test("a metadata-only change is not reported as a description change", () => {
  // Same description, same inputSchema -- only an annotations field differs.
  // Mirrors the Python CLI's regression test for the same bug class.
  const before = parseManifest(JSON.stringify({
    tools: [{
      name: "search_inventory",
      description: "Search available inventory",
      inputSchema: { type: "object" },
      annotations: { readOnlyHint: true },
    }],
  }));
  const after = parseManifest(JSON.stringify({
    tools: [{
      name: "search_inventory",
      description: "Search available inventory",
      inputSchema: { type: "object" },
      annotations: { readOnlyHint: false },
    }],
  }));
  const report = compare(before, after);
  assert.equal(report.changes.length, 1);
  assert.equal(report.changes[0].bucket, "metadata-change");
  assert.match(report.changes[0].reason, /annotations/);
});

test("an ordinary description change without instruction language is a review, not an alert", () => {
  const before = parseManifest(JSON.stringify({ tools: [{ name: "t", description: "Old copy" }] }));
  const after = parseManifest(JSON.stringify({ tools: [{ name: "t", description: "New, clearer copy" }] }));
  const report = compare(before, after);
  assert.equal(report.changes[0].bucket, "description-change");
  assert.equal(report.changes[0].severity, "review");
});

test("an inputSchema change is its own bucket even when the description is unchanged", () => {
  const before = parseManifest(JSON.stringify({
    tools: [{ name: "t", description: "Same", inputSchema: { type: "object" } }],
  }));
  const after = parseManifest(JSON.stringify({
    tools: [{ name: "t", description: "Same", inputSchema: { type: "object", properties: { q: { type: "string" } } } }],
  }));
  const report = compare(before, after);
  assert.equal(report.changes[0].bucket, "schema-change");
});

test("duplicate tool names are rejected", () => {
  assert.throws(
    () => parseManifest(JSON.stringify({ tools: [{ name: "x" }, { name: "x" }] })),
    /duplicate/,
  );
});

test("a manifest without a tools list is rejected", () => {
  assert.throws(() => parseManifest(JSON.stringify({})), /tools list/);
});

test("unparseable JSON is rejected with a readable message", () => {
  assert.throws(() => parseManifest("{not json"), /cannot read manifest/);
});

test("identical manifests report no changes", () => {
  const manifest = parseManifest(JSON.stringify(EXAMPLE_BEFORE));
  const report = compare(manifest, parseManifest(JSON.stringify(EXAMPLE_BEFORE)));
  assert.deepEqual(report.changes, []);
});

test("formatChange and renderMarkdown never leak into an unhandled default", () => {
  const change = { kind: "tool_added", severity: "review", tool: "x" };
  assert.equal(formatChange(change), "REVIEW tool_added: x");
  const md = renderMarkdown(compare(parseManifest(JSON.stringify(EXAMPLE_BEFORE)), parseManifest(JSON.stringify(EXAMPLE_AFTER))));
  assert.match(md, /# MCP supply-chain watch/);
  assert.match(md, /not a safety certification/);
});

const { cases: CASES } = JSON.parse(readFileSync(join(root, "tests/cases.json"), "utf8"));

for (const testCase of CASES) {
  test(`shared case: ${testCase.name}`, () => {
    const report = compare(parseManifest(JSON.stringify(testCase.before)), parseManifest(JSON.stringify(testCase.after)));
    assert.equal(report.changes.length, testCase.expected.length);
    testCase.expected.forEach((want, index) => {
      const got = report.changes[index];
      assert.deepEqual(
        { kind: got.kind, severity: got.severity, tool: got.tool, bucket: got.bucket ?? null },
        { kind: want.kind, severity: want.severity, tool: want.tool, bucket: want.bucket },
      );
      if (want.reason === null) assert.equal(got.reason, undefined);
      else assert.ok(got.reason.includes(want.reason), `${got.reason} should include ${want.reason}`);
    });
  });
}

test("JS and Python give the same changes and reasons on every shared case", async () => {
  const { mkdtempSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const folder = mkdtempSync(join(tmpdir(), "mcp-watch-"));
  for (const [index, testCase] of CASES.entries()) {
    const before = join(folder, `${index}-before.json`);
    const after = join(folder, `${index}-after.json`);
    writeFileSync(before, JSON.stringify(testCase.before));
    writeFileSync(after, JSON.stringify(testCase.after));
    const js = compare(parseManifest(JSON.stringify(testCase.before)), parseManifest(JSON.stringify(testCase.after)));
    const py = pythonReport(before, after);
    const pick = ({ kind, severity, tool, bucket, reason }) => ({ kind, severity, tool, bucket, reason });
    assert.deepEqual(js.changes.map(pick), py.changes.map(pick), testCase.name);
  }
});
