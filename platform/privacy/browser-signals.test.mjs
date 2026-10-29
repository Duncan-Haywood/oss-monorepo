// Tests for the checker, not for the ventures. A guard that cannot fail is
// worse than no guard: it reads as coverage while proving nothing. These pin
// both directions - that a module ignoring the signals is caught, and that a
// module obeying them is not falsely accused.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { checkModule, findUsageModules } from "./browser-signals.mjs";

const REPO_ROOT = new URL("../../", import.meta.url).pathname;

let counter = 0;
function fixture(source) {
  // A fresh directory per fixture: the checker imports by URL, and Node caches
  // module URLs for the life of the process.
  const dir = mkdtempSync(join(tmpdir(), `usage-fixture-${counter++}-`));
  const path = join(dir, "usage.mjs");
  writeFileSync(path, source);
  return { path, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

const HONOURING = `
function blocked() {
  return globalThis.navigator?.doNotTrack === '1' || globalThis.navigator?.globalPrivacyControl === true;
}
export function recordUsage(storage = globalThis.localStorage, optedOut = false, event = 'calculated') {
  if (optedOut || !storage || blocked()) return;
  storage.setItem('k', JSON.stringify({ [event]: 1 }));
}
`;

const IGNORING = `
export function recordUsage(storage = globalThis.localStorage, optedOut = false, event = 'calculated') {
  if (optedOut || !storage) return;
  storage.setItem('k', JSON.stringify({ [event]: 1 }));
}
`;

test("a module that honours both signals passes", async () => {
  const { path, cleanup } = fixture(HONOURING);
  try {
    assert.equal((await checkModule(path)).status, "pass");
  } finally { cleanup(); }
});

test("a module that ignores the signals fails, and names the signal", async () => {
  const { path, cleanup } = fixture(IGNORING);
  try {
    const result = await checkModule(path);
    assert.equal(result.status, "fail");
    assert.equal(result.signal, "Global Privacy Control");
    assert.deepEqual(result.keys, ["k"]);
  } finally { cleanup(); }
});

test("a module that honours GPC but not Do Not Track still fails", async () => {
  const { path, cleanup } = fixture(`
    export function recordUsage(storage = globalThis.localStorage) {
      if (!storage || globalThis.navigator?.globalPrivacyControl === true) return;
      storage.setItem('k', '1');
    }
  `);
  try {
    const result = await checkModule(path);
    assert.equal(result.status, "fail");
    assert.equal(result.signal, "Do Not Track");
  } finally { cleanup(); }
});

test("a module that never records is reported undrivable, not passed", async () => {
  // The failure mode this guards: a recorder the driver cannot call would
  // write nothing under a signal and look identical to one that obeys it.
  const { path, cleanup } = fixture(`export function recordUsage() { /* inert */ }`);
  try {
    assert.equal((await checkModule(path)).status, "undrivable");
  } finally { cleanup(); }
});

test("a recorder behind an event allowlist is driven with its own event names", async () => {
  const { path, cleanup } = fixture(`
    const EVENTS = new Set(['scenario_planned']);
    function blocked() {
      return globalThis.navigator?.doNotTrack === '1' || globalThis.navigator?.globalPrivacyControl === true;
    }
    export function recordUsage(event, enabled = true, storage = globalThis.localStorage) {
      if (!enabled || !EVENTS.has(event) || blocked() || !storage) return;
      storage.setItem('k', '1');
    }
  `);
  try {
    assert.equal((await checkModule(path)).status, "pass");
  } finally { cleanup(); }
});

test("a factory that returns the recorder is unwrapped", async () => {
  const { path, cleanup } = fixture(`
    export function createUsage(storage = globalThis.localStorage) {
      return {
        recordUsage(event = 'calculated') {
          if (!storage) return;
          if (globalThis.navigator?.doNotTrack === '1' || globalThis.navigator?.globalPrivacyControl === true) return;
          storage.setItem('k', event);
        },
      };
    }
  `);
  try {
    assert.equal((await checkModule(path)).status, "pass");
  } finally { cleanup(); }
});

test("a module gated on window being defined is still driven", async () => {
  const { path, cleanup } = fixture(`
    export function recordUsage(event) {
      if (typeof window === 'undefined' || !event) return;
      if (navigator.doNotTrack === '1' || navigator.globalPrivacyControl) return;
      localStorage.setItem('k', event);
    }
  `);
  try {
    assert.equal((await checkModule(path)).status, "pass");
  } finally { cleanup(); }
});

test("discovery finds every venture usage module", () => {
  const found = findUsageModules();
  assert.ok(found.length > 100, `expected the whole portfolio, found ${found.length}`);
  assert.ok(found.every((p) => /usage\.m?js$/.test(p)));
  assert.equal(new Set(found).size, found.length, "no duplicates");
});

test("discovery also finds the classic-script usage.js trackers, not only usage.mjs", () => {
  const found = findUsageModules();
  const commonJsTrackers = found.filter((p) => p.endsWith("usage.js"));
  assert.ok(
    commonJsTrackers.length >= 5,
    `expected at least the 5 known CommonJS trackers, found ${commonJsTrackers.length}`,
  );
});

test("discovery skips build output, so the count does not depend on who has built", () => {
  // Measured 2026-09-12: the catalogue count read 254 in CI and 260 in a
  // working tree where `ventures/ai-engineering-academy`'s build had run,
  // because `site/dist/tools/*/usage.mjs` are six copies of modules already
  // counted from their sources. The pinned count in
  // optout-persistence.test.mjs then failed for a reason that was not a
  // change to the catalogue -- the worst kind of red, because the honest
  // response to it is to raise the number and bake the artefact in.
  const root = mkdtempSync(join(REPO_ROOT, "ventures", "discovery-probe-"));
  try {
    writeFileSync(join(root, "usage.mjs"), HONOURING);
    mkdirSync(join(root, "dist"), { recursive: true });
    writeFileSync(join(root, "dist", "usage.mjs"), HONOURING);
    const found = findUsageModules(root);
    assert.deepEqual(found, [join(root, "usage.mjs")],
      "the source module is the catalogue; the built copy of it is not");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("discovery outside the repository keeps everything, including a dist", () => {
  // The fixtures above live in a tmpdir, where `git check-ignore` cannot
  // answer. Keeping every path is the right failure: a checker that quietly
  // found nothing because git was unavailable would report a clean catalogue
  // having driven no module at all.
  const root = mkdtempSync(join(tmpdir(), "discovery-outside-"));
  try {
    mkdirSync(join(root, "dist"), { recursive: true });
    writeFileSync(join(root, "dist", "usage.mjs"), HONOURING);
    assert.deepEqual(findUsageModules(root), [join(root, "dist", "usage.mjs")]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("discovery skips an entry that vanishes mid-walk instead of crashing", () => {
  // Test files run in parallel, and the probe above makes and removes a
  // scratch venture under ventures/ while other files walk it. A dangling
  // symlink is the same readdir-then-ENOENT race, made deterministic.
  const root = mkdtempSync(join(tmpdir(), "discovery-vanish-"));
  try {
    writeFileSync(join(root, "usage.mjs"), HONOURING);
    symlinkSync(join(root, "gone"), join(root, "dangling"));
    assert.deepEqual(findUsageModules(root), [join(root, "usage.mjs")]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("the driver leaves no globals behind", async () => {
  const before = ["navigator", "localStorage", "window"].map((k) => k in globalThis);
  const { path, cleanup } = fixture(HONOURING);
  try {
    await checkModule(path);
    assert.deepEqual(["navigator", "localStorage", "window"].map((k) => k in globalThis), before);
  } finally { cleanup(); }
});

// The command-line summary and exit status are what CI reads.
function runCli(source) {
  const { path, cleanup } = fixture(source);
  try {
    const dir = join(path, "..");
    const r = spawnSync(process.execPath, [new URL("./browser-signals.mjs", import.meta.url).pathname, dir], { encoding: "utf8" });
    return r;
  } finally { cleanup(); }
}

test("cli: a clean tree exits 0 and counts the module as passed", () => {
  const r = runCli(HONOURING);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /^1 usage module\(s\) honour .*; 0 failed, 0 errored, 0 undrivable\./);
});

test("cli: a failing module exits 1 and is reported as FAIL", () => {
  const r = runCli(IGNORING);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /FAIL .*Global Privacy Control/);
  assert.match(r.stdout, /0 usage module\(s\).*1 failed, 0 errored, 0 undrivable/);
});

test("cli: a module that cannot be imported exits 1 and is reported as ERROR", () => {
  const r = runCli("export const = ;");
  assert.equal(r.status, 1);
  assert.match(r.stderr, /ERROR /);
  assert.match(r.stdout, /0 failed, 1 errored, 0 undrivable/);
});

test("cli: an undrivable module exits 1 and is reported as UNDRIVABLE", () => {
  const r = runCli("export function nothing() {}");
  assert.equal(r.status, 1);
  assert.match(r.stderr, /UNDRIVABLE /);
  assert.match(r.stdout, /0 failed, 0 errored, 1 undrivable/);
});

test("cli: importing the module does not run the scan", () => {
  // If the entry-point guard is inverted, an import scans the tree and calls
  // process.exit, which silently truncates the test run that imported it.
  const url = new URL("./browser-signals.mjs", import.meta.url).href;
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", `await import(${JSON.stringify(url)}); console.log("imported");`], { encoding: "utf8" });
  assert.equal(r.stdout, "imported\n");
  assert.equal(r.status, 0);
});
