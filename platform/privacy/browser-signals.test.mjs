// Tests for the checker, not for the ventures. A guard that cannot fail is
// worse than no guard: it reads as coverage while proving nothing. These pin
// both directions - that a module ignoring the signals is caught, and that a
// module obeying them is not falsely accused.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { checkModule, findUsageModules } from "./browser-signals.mjs";

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
  assert.ok(found.every((p) => p.endsWith("usage.mjs")));
  assert.equal(new Set(found).size, found.length, "no duplicates");
});

test("the driver leaves no globals behind", async () => {
  const before = ["navigator", "localStorage", "window"].map((k) => k in globalThis);
  const { path, cleanup } = fixture(HONOURING);
  try {
    await checkModule(path);
    assert.deepEqual(["navigator", "localStorage", "window"].map((k) => k in globalThis), before);
  } finally { cleanup(); }
});
