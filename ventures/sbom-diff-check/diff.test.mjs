import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseSbom, diffComponents, hasAnyChange, summaryLine, detectFormat } from "./diff.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CYCLONEDX_OLD = {
  bomFormat: "CycloneDX",
  specVersion: "1.5",
  components: [
    { type: "library", name: "lodash", version: "4.17.20", purl: "pkg:npm/lodash@4.17.20" },
    { type: "library", name: "left-pad", version: "1.3.0", purl: "pkg:npm/left-pad@1.3.0" },
    { type: "library", name: "express", version: "4.18.0", purl: "pkg:npm/express@4.18.0" },
  ],
};

const CYCLONEDX_NEW = {
  bomFormat: "CycloneDX",
  specVersion: "1.5",
  components: [
    { type: "library", name: "lodash", version: "4.17.21", purl: "pkg:npm/lodash@4.17.21" },
    { type: "library", name: "express", version: "4.18.0", purl: "pkg:npm/express@4.18.0" },
    { type: "library", name: "chalk", version: "5.3.0", purl: "pkg:npm/chalk@5.3.0" },
  ],
};

const SPDX_DOC = {
  spdxVersion: "SPDX-2.3",
  packages: [
    { name: "requests", versionInfo: "2.31.0", SPDXID: "SPDXRef-Package-requests" },
    { name: "internal-tool", versionInfo: "NOASSERTION", SPDXID: "SPDXRef-Package-internal" },
  ],
};

test("detects CycloneDX by bomFormat and by a bare components array", () => {
  assert.equal(detectFormat(CYCLONEDX_OLD), "CycloneDX");
  assert.equal(detectFormat({ components: [] }), "CycloneDX");
});

test("detects SPDX by spdxVersion and by a bare packages array", () => {
  assert.equal(detectFormat(SPDX_DOC), "SPDX");
  assert.equal(detectFormat({ packages: [] }), "SPDX");
});

test("returns null for an unrecognized document shape", () => {
  assert.equal(detectFormat({ hello: "world" }), null);
  assert.equal(detectFormat(null), null);
});

test("parseSbom extracts CycloneDX components", () => {
  const { format, components } = parseSbom(JSON.stringify(CYCLONEDX_OLD));
  assert.equal(format, "CycloneDX");
  assert.equal(components.length, 3);
  assert.deepEqual(components[0], { name: "lodash", version: "4.17.20", purl: "pkg:npm/lodash@4.17.20" });
});

test("parseSbom treats SPDX NOASSERTION as an unknown version", () => {
  const { format, components } = parseSbom(JSON.stringify(SPDX_DOC));
  assert.equal(format, "SPDX");
  assert.deepEqual(components[0], { name: "requests", version: "2.31.0", purl: null });
  assert.deepEqual(components[1], { name: "internal-tool", version: null, purl: null });
});

test("parseSbom throws a labelled error on invalid JSON", () => {
  assert.throws(() => parseSbom("{not json", "broken.json"), /broken\.json: not valid JSON/);
});

test("parseSbom throws a labelled error on an unrecognized shape", () => {
  assert.throws(() => parseSbom(JSON.stringify({ hello: "world" }), "mystery.json"), /mystery\.json: not a recognized/);
});

test("diffComponents reports added, removed, and version-changed packages", () => {
  const { components: oldComponents } = parseSbom(JSON.stringify(CYCLONEDX_OLD));
  const { components: newComponents } = parseSbom(JSON.stringify(CYCLONEDX_NEW));
  const diff = diffComponents(oldComponents, newComponents);
  assert.deepEqual(diff.added, [{ name: "chalk", version: "5.3.0" }]);
  assert.deepEqual(diff.removed, [{ name: "left-pad", version: "1.3.0" }]);
  assert.deepEqual(diff.versionChanged, [{ name: "lodash", from: ["4.17.20"], to: ["4.17.21"] }]);
  assert.equal(hasAnyChange(diff), true);
});

test("identical documents produce no changes", () => {
  const { components } = parseSbom(JSON.stringify(CYCLONEDX_OLD));
  const diff = diffComponents(components, components);
  assert.equal(hasAnyChange(diff), false);
  assert.deepEqual(diff, { added: [], removed: [], versionChanged: [] });
});

test("a multi-version package reports gained and lost versions, not a crash", () => {
  const oldC = [
    { name: "openssl", version: "1.1.1", purl: null },
    { name: "openssl", version: "3.0.0", purl: null },
  ];
  const newC = [
    { name: "openssl", version: "3.0.0", purl: null },
    { name: "openssl", version: "3.1.0", purl: null },
  ];
  const diff = diffComponents(oldC, newC);
  assert.deepEqual(diff.added, []);
  assert.deepEqual(diff.removed, []);
  assert.equal(diff.versionChanged.length, 1);
  assert.deepEqual(diff.versionChanged[0], { name: "openssl", from: ["1.1.1"], to: ["3.1.0"] });
});

test("summaryLine reports no-change and change cases", () => {
  const { components } = parseSbom(JSON.stringify(CYCLONEDX_OLD));
  const noChange = diffComponents(components, components);
  assert.match(summaryLine(noChange, 3, 3), /No package changes/);

  const { components: newComponents } = parseSbom(JSON.stringify(CYCLONEDX_NEW));
  const changed = diffComponents(components, newComponents);
  assert.match(summaryLine(changed, 3, 3), /1 added, 1 removed, 1 version-changed/);
});

test("parity: the browser port agrees with sbom_diff.py on the same input", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "sbom-diff-parity-"));
  const oldPath = path.join(dir, "old.json");
  const newPath = path.join(dir, "new.json");
  writeFileSync(oldPath, JSON.stringify(CYCLONEDX_OLD));
  writeFileSync(newPath, JSON.stringify(CYCLONEDX_NEW));

  const cliOutput = execFileSync(
    "python3",
    [path.join(__dirname, "sbom_diff.py"), oldPath, newPath, "--format", "json"],
    { encoding: "utf8" },
  );
  const cliDiff = JSON.parse(cliOutput);

  const { components: oldComponents } = parseSbom(JSON.stringify(CYCLONEDX_OLD));
  const { components: newComponents } = parseSbom(JSON.stringify(CYCLONEDX_NEW));
  const jsDiff = diffComponents(oldComponents, newComponents);

  assert.deepEqual(jsDiff.added, cliDiff.added);
  assert.deepEqual(jsDiff.removed, cliDiff.removed);
  assert.deepEqual(
    jsDiff.versionChanged,
    cliDiff.version_changed.map((v) => ({ name: v.name, from: v.from, to: v.to })),
  );
});
