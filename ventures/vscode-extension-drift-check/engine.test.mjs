import test from "node:test";
import assert from "node:assert/strict";
import {
  parseSnapshot,
  diffSnapshots,
  summarizeDiff,
  classifySurfaceRisk,
  broadActivation,
  KNOWN_INCIDENTS,
} from "./engine.mjs";

test("parseSnapshot: empty input yields empty array", () => {
  assert.deepEqual(parseSnapshot(""), []);
  assert.deepEqual(parseSnapshot("   "), []);
});

test("parseSnapshot: JSON array with full surface fields", () => {
  const entries = parseSnapshot(JSON.stringify([
    { publisher: "Foo", name: "bar", version: "1.0.0", activationEvents: ["onLanguage:js"], main: "./out/main.js" },
  ]));
  assert.equal(entries.length, 1);
  assert.equal(entries[0].id, "foo.bar");
  assert.equal(entries[0].surfaceKnown, true);
  assert.deepEqual(entries[0].activationEvents, ["onLanguage:js"]);
});

test("parseSnapshot: dedupes by id, last occurrence wins, sorted", () => {
  const entries = parseSnapshot(JSON.stringify([
    { publisher: "b", name: "z", version: "1.0.0" },
    { publisher: "a", name: "a", version: "1.0.0" },
    { publisher: "b", name: "z", version: "2.0.0" },
  ]));
  assert.deepEqual(entries.map((e) => e.id), ["a.a", "b.z"]);
  assert.equal(entries[1].version, "2.0.0");
});

test("parseSnapshot: rejects a JSON object that isn't an array", () => {
  assert.throws(() => parseSnapshot('{"not":"an array"}'), /expected a JSON array/);
});

test("parseSnapshot: rejects invalid JSON that also fails the list-extensions shape", () => {
  assert.throws(() => parseSnapshot("[1,2,"), /not valid JSON/);
});

test("parseSnapshot: code --list-extensions --show-versions text format", () => {
  const entries = parseSnapshot("dbaeumer.vscode-eslint@2.4.4\nesbenp.prettier-vscode@10.1.0\n");
  assert.equal(entries.length, 2);
  assert.equal(entries[0].id, "dbaeumer.vscode-eslint");
  assert.equal(entries[0].version, "2.4.4");
  assert.equal(entries[0].surfaceKnown, false);
});

test("parseSnapshot: an unrecognised text line throws a clear error", () => {
  assert.throws(() => parseSnapshot("not-a-valid-line-at-all"), /not a recognised snapshot/);
});

test("diffSnapshots: version-only bump is reported but not a surface change", () => {
  const baseline = parseSnapshot(JSON.stringify([{ publisher: "a", name: "b", version: "1.0.0", activationEvents: ["onStartupFinished"] }]));
  const current = parseSnapshot(JSON.stringify([{ publisher: "a", name: "b", version: "1.1.0", activationEvents: ["onStartupFinished"] }]));
  const result = diffSnapshots(baseline, current);
  assert.equal(result.changed.length, 1);
  assert.equal(result.changed[0].versionChanged, true);
  assert.equal(result.changed[0].surfaceChanged, false);
});

test("diffSnapshots: gaining a startup activation event is flagged", () => {
  const baseline = parseSnapshot(JSON.stringify([{ publisher: "a", name: "b", version: "1.0.0", activationEvents: ["onLanguage:js"] }]));
  const current = parseSnapshot(JSON.stringify([{ publisher: "a", name: "b", version: "1.0.1", activationEvents: ["onLanguage:js", "*"] }]));
  const result = diffSnapshots(baseline, current);
  assert.equal(result.changed[0].surfaceChanged, true);
  assert.deepEqual(result.changed[0].riskTags, ["gained-startup-activation"]);
});

test("diffSnapshots: gaining an extension dependency is flagged", () => {
  const baseline = parseSnapshot(JSON.stringify([{ publisher: "a", name: "b", version: "1.0.0", extensionDependencies: [] }]));
  const current = parseSnapshot(JSON.stringify([{ publisher: "a", name: "b", version: "1.0.0", extensionDependencies: ["evil.ext"] }]));
  const result = diffSnapshots(baseline, current);
  assert.deepEqual(result.changed[0].riskTags, ["gained-extension-dependency"]);
});

test("diffSnapshots: a changed entry point is flagged", () => {
  const baseline = parseSnapshot(JSON.stringify([{ publisher: "a", name: "b", version: "1.0.0", main: "./out/a.js" }]));
  const current = parseSnapshot(JSON.stringify([{ publisher: "a", name: "b", version: "1.0.0", main: "./out/b.js" }]));
  const result = diffSnapshots(baseline, current);
  assert.deepEqual(result.changed[0].riskTags, ["entry-point-changed"]);
});

test("diffSnapshots: unknown surface on either side never claims 'unchanged'", () => {
  // baseline from `code --list-extensions` text (no surface data) vs a full JSON snapshot
  const baseline = parseSnapshot("a.b@1.0.0\n");
  const current = parseSnapshot(JSON.stringify([{ publisher: "a", name: "b", version: "1.0.0", activationEvents: ["*"] }]));
  const result = diffSnapshots(baseline, current);
  assert.equal(result.unchanged, 0);
  assert.equal(result.changed.length, 1);
  assert.equal(result.changed[0].surfaceUnknown, true);
  assert.equal(result.changed[0].surfaceChanged, false, "cannot claim a surface change when one side has no surface data");
});

test("diffSnapshots: two text-only snapshots with no version change are unchanged, not flagged uncertain", () => {
  const baseline = parseSnapshot("a.b@1.0.0\n");
  const current = parseSnapshot("a.b@1.0.0\n");
  const result = diffSnapshots(baseline, current);
  assert.equal(result.unchanged, 1);
  assert.equal(result.changed.length, 0);
});

test("diffSnapshots: identical snapshots are fully unchanged", () => {
  const snap = parseSnapshot(JSON.stringify([{ publisher: "a", name: "b", version: "1.0.0", activationEvents: ["onLanguage:js"] }]));
  const result = diffSnapshots(snap, snap);
  assert.equal(result.unchanged, 1);
  assert.equal(result.changed.length, 0);
});

test("diffSnapshots: added and removed extensions", () => {
  const baseline = parseSnapshot(JSON.stringify([{ publisher: "a", name: "old", version: "1.0.0" }]));
  const current = parseSnapshot(JSON.stringify([{ publisher: "a", name: "new", version: "1.0.0" }]));
  const result = diffSnapshots(baseline, current);
  assert.equal(result.added.length, 1);
  assert.equal(result.added[0].id, "a.new");
  assert.equal(result.removed.length, 1);
  assert.equal(result.removed[0].id, "a.old");
});

test("diffSnapshots: --ignore suppresses a change from the changed list", () => {
  const baseline = parseSnapshot(JSON.stringify([{ publisher: "a", name: "b", version: "1.0.0", activationEvents: [] }]));
  const current = parseSnapshot(JSON.stringify([{ publisher: "a", name: "b", version: "1.0.0", activationEvents: ["*"] }]));
  const result = diffSnapshots(baseline, current, { ignore: ["a.b"] });
  assert.equal(result.changed.length, 0);
  assert.equal(result.ignoredChanges.length, 1);
});

test("summarizeDiff: surface change wins the headline over a mere version bump", () => {
  const baseline = parseSnapshot(JSON.stringify([
    { publisher: "a", name: "b", version: "1.0.0", activationEvents: [] },
    { publisher: "c", name: "d", version: "1.0.0", activationEvents: [] },
  ]));
  const current = parseSnapshot(JSON.stringify([
    { publisher: "a", name: "b", version: "1.1.0", activationEvents: [] },
    { publisher: "c", name: "d", version: "1.0.0", activationEvents: ["*"] },
  ]));
  const { status, text } = summarizeDiff(diffSnapshots(baseline, current));
  assert.equal(status, "changed");
  assert.match(text, /1 extension\(s\) changed what triggers them/);
});

test("summarizeDiff: nothing changed reads ok", () => {
  const snap = parseSnapshot(JSON.stringify([{ publisher: "a", name: "b", version: "1.0.0", activationEvents: [] }]));
  const { status, text } = summarizeDiff(diffSnapshots(snap, snap));
  assert.equal(status, "ok");
  assert.match(text, /No surface changes/);
});

test("classifySurfaceRisk: a version-only change with identical surface yields no tags", () => {
  const before = { activationEvents: ["onStartupFinished"], extensionDependencies: [], main: "./a.js", browser: null };
  const after = { activationEvents: ["onStartupFinished"], extensionDependencies: [], main: "./a.js", browser: null };
  assert.deepEqual(classifySurfaceRisk(before, after), []);
});

test("broadActivation: lists only extensions with an unconditional startup trigger", () => {
  const entries = parseSnapshot(JSON.stringify([
    { publisher: "a", name: "quiet", version: "1.0.0", activationEvents: ["onLanguage:js"] },
    { publisher: "a", name: "loud", version: "1.0.0", activationEvents: ["*"] },
  ]));
  const loud = broadActivation(entries);
  assert.equal(loud.length, 1);
  assert.equal(loud[0].id, "a.loud");
});

test("KNOWN_INCIDENTS: every row is dated and sourced with a marketplace named", () => {
  assert.ok(KNOWN_INCIDENTS.length >= 2);
  for (const incident of KNOWN_INCIDENTS) {
    assert.match(incident.date, /^\d{4}-\d{2}(-\d{2})?$/);
    assert.ok(incident.marketplace);
    assert.ok(incident.note.length > 20);
  }
});
