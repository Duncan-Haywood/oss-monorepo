import test from "node:test";
import assert from "node:assert/strict";
import { classifyLicenseFamily, parseSnapshot, diffSnapshots, summarizeDiff, KNOWN_RELICENSE_EVENTS } from "./engine.mjs";

test("classifyLicenseFamily: permissive", () => {
  assert.equal(classifyLicenseFamily("MIT"), "permissive");
  assert.equal(classifyLicenseFamily("BSD-3-Clause"), "permissive");
  assert.equal(classifyLicenseFamily("Apache-2.0"), "permissive");
  assert.equal(classifyLicenseFamily("(MIT OR Apache-2.0)"), "permissive");
});

test("classifyLicenseFamily: copyleft", () => {
  assert.equal(classifyLicenseFamily("GPL-3.0"), "copyleft");
  assert.equal(classifyLicenseFamily("AGPL-3.0-or-later"), "copyleft");
  assert.equal(classifyLicenseFamily("LGPL-2.1"), "copyleft");
});

test("classifyLicenseFamily: source-available", () => {
  assert.equal(classifyLicenseFamily("SSPL-1.0"), "source-available");
  assert.equal(classifyLicenseFamily("Business Source License 1.1"), "source-available");
  assert.equal(classifyLicenseFamily("BUSL-1.1"), "source-available");
  assert.equal(classifyLicenseFamily("Elastic License 2.0"), "source-available");
});

test("classifyLicenseFamily: unclear and unknown", () => {
  assert.equal(classifyLicenseFamily(""), "unclear");
  assert.equal(classifyLicenseFamily(null), "unclear");
  assert.equal(classifyLicenseFamily("UNLICENSED"), "unclear");
  assert.equal(classifyLicenseFamily("SEE LICENSE IN LICENSE.txt"), "unclear");
  assert.equal(classifyLicenseFamily("Some Totally Made Up License"), "unknown");
});

// The disambiguation this whole tool exists to get right: Boost Software
// License (SPDX BSL-1.0, fully permissive) versus the colloquial "BSL" that
// means Business Source License (BUSL-1.1 / "BSL-1.1", source-available).
test("classifyLicenseFamily: BSL-1.0 (Boost) is not BUSL-1.1 (Business Source License)", () => {
  assert.equal(classifyLicenseFamily("BSL-1.0"), "permissive");
  assert.equal(classifyLicenseFamily("Boost Software License 1.0"), "permissive");
  assert.equal(classifyLicenseFamily("BUSL-1.1"), "source-available");
  assert.equal(classifyLicenseFamily("BSL-1.1"), "source-available");
});

test("KNOWN_RELICENSE_EVENTS carries the four dated, sourced events and nothing undated", () => {
  assert.equal(KNOWN_RELICENSE_EVENTS.length, 4);
  for (const row of KNOWN_RELICENSE_EVENTS) {
    assert.match(row.date, /^\d{4}-\d{2}-\d{2}$/, `${row.project} is missing a real date`);
    assert.ok(row.from && row.to && row.note);
  }
  const projects = KNOWN_RELICENSE_EVENTS.map((r) => r.project);
  assert.ok(projects.some((p) => p.includes("Terraform")));
  assert.ok(projects.some((p) => p.includes("Redis")));
  assert.ok(projects.some((p) => p.includes("MongoDB")));
  assert.ok(projects.some((p) => p.includes("Elastic")));
});

test("parseSnapshot: JSON array, flexible key casing", () => {
  const list = parseSnapshot(JSON.stringify([
    { Name: "left-pad", Version: "1.3.0", License: "MIT" },
    { name: "chalk", version: "5.0.0", licenses: [{ type: "MIT" }] },
  ]));
  assert.deepEqual(list, [
    { name: "chalk", version: "5.0.0", license: "MIT" },
    { name: "left-pad", version: "1.3.0", license: "MIT" },
  ]);
});

test("parseSnapshot: JSON object with a dependencies array", () => {
  const list = parseSnapshot(JSON.stringify({ dependencies: [{ name: "x", version: "1.0.0", license: "ISC" }] }));
  assert.deepEqual(list, [{ name: "x", version: "1.0.0", license: "ISC" }]);
});

test("parseSnapshot: rejects invalid JSON-looking input with a clear error", () => {
  assert.throws(() => parseSnapshot("[not json"), /not valid JSON/);
});

test("parseSnapshot: CSV with a header row (pip-licenses style)", () => {
  const csv = "Name,Version,License\nrequests,2.31.0,Apache-2.0\nflask,3.0.0,BSD-3-Clause";
  const list = parseSnapshot(csv);
  assert.deepEqual(list, [
    { name: "flask", version: "3.0.0", license: "BSD-3-Clause" },
    { name: "requests", version: "2.31.0", license: "Apache-2.0" },
  ]);
});

test("parseSnapshot: header-less 2-column CSV (go-licenses style: name,license)", () => {
  const csv = "github.com/pkg/errors,BSD-2-Clause\ngithub.com/spf13/cobra,Apache-2.0";
  const list = parseSnapshot(csv);
  assert.deepEqual(list, [
    { name: "github.com/pkg/errors", version: "", license: "BSD-2-Clause" },
    { name: "github.com/spf13/cobra", version: "", license: "Apache-2.0" },
  ]);
});

test("parseSnapshot: duplicate names, last occurrence wins", () => {
  const list = parseSnapshot(JSON.stringify([
    { name: "x", version: "1.0.0", license: "MIT" },
    { name: "x", version: "2.0.0", license: "BUSL-1.1" },
  ]));
  assert.deepEqual(list, [{ name: "x", version: "2.0.0", license: "BUSL-1.1" }]);
});

test("parseSnapshot: empty input is an empty snapshot, not an error", () => {
  assert.deepEqual(parseSnapshot(""), []);
  assert.deepEqual(parseSnapshot("   \n  "), []);
});

test("diffSnapshots: added, removed, changed, unchanged", () => {
  const baseline = parseSnapshot(JSON.stringify([
    { name: "stable-pkg", version: "1.0.0", license: "MIT" },
    { name: "about-to-relicense", version: "1.2.0", license: "MPL-2.0" },
    { name: "dropped-pkg", version: "0.5.0", license: "ISC" },
  ]));
  const current = parseSnapshot(JSON.stringify([
    { name: "stable-pkg", version: "1.0.1", license: "MIT" },
    { name: "about-to-relicense", version: "2.0.0", license: "BUSL-1.1" },
    { name: "brand-new-pkg", version: "1.0.0", license: "Apache-2.0" },
  ]));
  const result = diffSnapshots(baseline, current);

  assert.equal(result.unchanged, 1);
  assert.equal(result.removed.length, 1);
  assert.equal(result.removed[0].name, "dropped-pkg");
  assert.equal(result.added.length, 1);
  assert.equal(result.added[0].name, "brand-new-pkg");
  assert.equal(result.changed.length, 1);
  assert.deepEqual(result.changed[0], {
    name: "about-to-relicense",
    beforeVersion: "1.2.0",
    afterVersion: "2.0.0",
    beforeLicense: "MPL-2.0",
    afterLicense: "BUSL-1.1",
    beforeFamily: "copyleft",
    afterFamily: "source-available",
  });
});

test("diffSnapshots: a version bump alone (same license) is unchanged, not changed", () => {
  const baseline = parseSnapshot(JSON.stringify([{ name: "x", version: "1.0.0", license: "MIT" }]));
  const current = parseSnapshot(JSON.stringify([{ name: "x", version: "1.5.0", license: "MIT" }]));
  const result = diffSnapshots(baseline, current);
  assert.equal(result.unchanged, 1);
  assert.equal(result.changed.length, 0);
});

test("diffSnapshots: license comparison ignores case and surrounding whitespace", () => {
  const baseline = parseSnapshot(JSON.stringify([{ name: "x", version: "1.0.0", license: "  MIT " }]));
  const current = parseSnapshot(JSON.stringify([{ name: "x", version: "1.0.0", license: "mit" }]));
  const result = diffSnapshots(baseline, current);
  assert.equal(result.unchanged, 1);
  assert.equal(result.changed.length, 0);
});

test("diffSnapshots: --ignore moves a change out of the fail-worthy list", () => {
  const baseline = parseSnapshot(JSON.stringify([{ name: "accepted", version: "1.0.0", license: "MIT" }]));
  const current = parseSnapshot(JSON.stringify([{ name: "accepted", version: "2.0.0", license: "GPL-3.0" }]));
  const result = diffSnapshots(baseline, current, { ignore: ["Accepted"] });
  assert.equal(result.changed.length, 0);
  assert.equal(result.ignoredChanges.length, 1);
  assert.equal(result.ignoredChanges[0].name, "accepted");
});

test("summarizeDiff: changed vs clean", () => {
  const changedResult = diffSnapshots(
    parseSnapshot(JSON.stringify([{ name: "x", version: "1.0.0", license: "MIT" }])),
    parseSnapshot(JSON.stringify([{ name: "x", version: "1.0.0", license: "GPL-3.0" }])),
  );
  assert.equal(summarizeDiff(changedResult).status, "changed");

  const cleanResult = diffSnapshots(
    parseSnapshot(JSON.stringify([{ name: "x", version: "1.0.0", license: "MIT" }])),
    parseSnapshot(JSON.stringify([{ name: "x", version: "1.0.0", license: "MIT" }])),
  );
  assert.equal(summarizeDiff(cleanResult).status, "ok");
});
