#!/usr/bin/env node
// Behavioural contract for every venture's usage.mjs.
//
// 1,293 ventures vendor their own copy of the same on-device usage counter.
// check_storage_guard.py reads them as text; this file *runs* each one against
// a fake localStorage and checks what a visitor's browser would see. It exists
// because a red-team campaign on 2026-11-11 seeded two faults into one copy
// (an `||` turned into `&&` in the stored-value shape check) and that copy's
// own suite, like every copy's, never stored anything but an object or
// unparseable text, so both faults went green. A counter that keeps a stored
// array silently drops every event (JSON.stringify of an array ignores named
// keys), and one that returns a stored number hands the stats panel a
// non-object.
//
// The contract, for files that read the global (the 239 that take
// `storage = globalThis.localStorage` as a parameter are a different shape,
// as in check_storage_guard.py) and export record() and readUsage():
//   - record() counts and readUsage() reads the counts back;
//   - a stored value that is valid JSON but not a plain object (array,
//     number, string, null, boolean) reads as {} and record() recovers;
//   - Do Not Track and Global Privacy Control stop counting;
//   - setUsageOptOut(true), where exported, clears counters and stops new ones;
//   - a store whose global read throws, or whose writes throw, never makes
//     record(), readUsage() or setUsageOptOut() throw.
//
// The same checks, reading the stored counter directly, run on the 36 copies
// of the usageAllowed()/recordEvent()/toggleUsage() design (checkEventModule).
//
//   node platform/ci/usage_contract.mjs [ventures-dir]      exit 1 on a breach

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

function fakeStorage({ throwOnSet = false } = {}) {
  const store = new Map();
  return {
    store,
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => {
      if (throwOnSet) throw new Error("QuotaExceededError");
      store.set(k, String(v));
    },
    removeItem: (k) => store.delete(k),
  };
}

function setNavigator(value) {
  Object.defineProperty(globalThis, "navigator", { value, configurable: true, writable: true });
}

function reset(storage = fakeStorage()) {
  Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true, writable: true });
  globalThis.__usageOptOut = false;
  setNavigator({});
  return storage;
}

function blockStorage() {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    get() {
      throw new Error("SecurityError: access to localStorage is denied");
    },
  });
}

const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const NOT_OBJECTS = ["[1,2]", "[]", "5", "\"text\"", "null", "true"];

export async function checkModule(mod) {
  const problems = [];
  const fail = (msg) => problems.push(msg);
  const { record, readUsage, setUsageOptOut } = mod;

  // 1. counts round-trip, and find the storage key this copy uses.
  let storage = reset();
  record("contract_a");
  record("contract_a");
  record("contract_b");
  const usage = readUsage();
  if (!isPlainObject(usage) || usage.contract_a !== 2 || usage.contract_b !== 1) {
    fail(`record x3 then readUsage() gave ${JSON.stringify(usage)}, want {contract_a:2, contract_b:1}`);
  }
  const key = [...storage.store.keys()].find((k) => {
    try {
      return JSON.parse(storage.store.get(k)).contract_a === 2;
    } catch {
      return false;
    }
  });
  if (!key) {
    fail("record() wrote no JSON object counter to localStorage");
    return problems;
  }

  // 2. valid JSON that is not a plain object.
  for (const raw of NOT_OBJECTS) {
    storage = reset();
    storage.setItem(key, raw);
    let read;
    let after;
    try {
      read = readUsage();
      record("contract_a");
      after = readUsage();
    } catch (err) {
      fail(`stored ${raw}: threw ${err && err.message}`);
      continue;
    }
    if (!isPlainObject(read) || Object.keys(read).length) {
      fail(`stored ${raw}: readUsage() gave ${JSON.stringify(read)}, want {}`);
    }
    if (!isPlainObject(after) || after.contract_a !== 1) {
      fail(`stored ${raw}: record() then readUsage() gave ${JSON.stringify(after)}, want {contract_a:1}`);
    }
  }

  // 3. browser privacy signals.
  for (const [label, nav] of [["doNotTrack=\"1\"", { doNotTrack: "1" }], ["globalPrivacyControl", { globalPrivacyControl: true }]]) {
    reset();
    setNavigator(nav);
    record("contract_a");
    setNavigator({});
    const read = readUsage();
    if (!isPlainObject(read) || read.contract_a) fail(`${label}: record() still counted (${JSON.stringify(read)})`);
  }

  // 4. explicit opt-out.
  if (typeof setUsageOptOut === "function") {
    reset();
    record("contract_a");
    setUsageOptOut(true);
    const cleared = readUsage();
    record("contract_a");
    const stopped = readUsage();
    if (!isPlainObject(cleared) || Object.keys(cleared).length) fail(`setUsageOptOut(true) left counters ${JSON.stringify(cleared)}`);
    if (!isPlainObject(stopped) || stopped.contract_a) fail(`after setUsageOptOut(true), record() still counted (${JSON.stringify(stopped)})`);
    setUsageOptOut(false);
  }

  // 5. blocked or full storage never throws.
  const calls = [["record", () => record("contract_a")], ["readUsage", () => readUsage()]];
  if (typeof setUsageOptOut === "function") {
    calls.push(["setUsageOptOut(true)", () => setUsageOptOut(true)], ["setUsageOptOut(false)", () => setUsageOptOut(false)]);
  }
  for (const [label, arrange] of [["blocked site data", blockStorage], ["writes that throw", () => reset(fakeStorage({ throwOnSet: true }))]]) {
    for (const [name, call] of calls) {
      reset();
      arrange();
      try {
        call();
      } catch (err) {
        fail(`${label}: ${name} threw ${err && err.message}`);
      }
    }
  }
  reset();
  globalThis.__usageOptOut = false;
  return problems;
}

// The second design (36 copies, 2026-11-11): usageAllowed(), recordEvent(name)
// and toggleUsage(enabled), with no reader, so the contract reads the stored
// counter itself. Same red-team origin: its `||`-to-`&&` mutants in the shape
// check escaped in two ventures' suites on the same day.
export async function checkEventModule(mod) {
  const problems = [];
  const fail = (msg) => problems.push(msg);
  const { recordEvent, toggleUsage, usageAllowed } = mod;
  const parse = (storage, key) => {
    try {
      return JSON.parse(storage.store.get(key));
    } catch {
      return undefined;
    }
  };

  // 1. counts land in one JSON object under one key.
  let storage = reset();
  recordEvent("contract_a");
  recordEvent("contract_a");
  recordEvent("contract_b");
  const key = [...storage.store.keys()].find((k) => {
    const v = parse(storage, k);
    return isPlainObject(v) && v.contract_a === 2 && v.contract_b === 1;
  });
  if (!key) {
    fail("recordEvent x3 wrote no JSON object counter {contract_a:2, contract_b:1} to localStorage");
    return problems;
  }

  // 2. valid JSON that is not a plain object: recordEvent recovers.
  for (const raw of NOT_OBJECTS) {
    storage = reset();
    storage.setItem(key, raw);
    try {
      recordEvent("contract_a");
    } catch (err) {
      fail(`stored ${raw}: recordEvent threw ${err && err.message}`);
      continue;
    }
    const after = parse(storage, key);
    if (!isPlainObject(after) || after.contract_a !== 1) {
      fail(`stored ${raw}: recordEvent left ${storage.store.get(key)}, want {"contract_a":1}`);
    }
  }

  // 3. browser privacy signals.
  for (const [label, nav] of [["doNotTrack=\"1\"", { doNotTrack: "1" }], ["globalPrivacyControl", { globalPrivacyControl: true }]]) {
    storage = reset();
    setNavigator(nav);
    if (usageAllowed()) fail(`${label}: usageAllowed() is true`);
    recordEvent("contract_a");
    setNavigator({});
    if (storage.store.has(key)) fail(`${label}: recordEvent still counted (${storage.store.get(key)})`);
  }

  // 4. explicit opt-out, and opting back in.
  storage = reset();
  toggleUsage(false);
  if (usageAllowed()) fail("after toggleUsage(false), usageAllowed() is true");
  recordEvent("contract_a");
  if (storage.store.has(key)) fail(`after toggleUsage(false), recordEvent still counted (${storage.store.get(key)})`);
  toggleUsage(true);
  recordEvent("contract_a");
  if (parse(storage, key)?.contract_a !== 1) fail("after toggleUsage(true), recordEvent did not count again");

  // 5. blocked or full storage never throws.
  const calls = [
    ["recordEvent", () => recordEvent("contract_a")],
    ["usageAllowed", () => usageAllowed()],
    ["toggleUsage(false)", () => toggleUsage(false)],
    ["toggleUsage(true)", () => toggleUsage(true)],
  ];
  for (const [label, arrange] of [["blocked site data", blockStorage], ["writes that throw", () => reset(fakeStorage({ throwOnSet: true }))]]) {
    for (const [name, call] of calls) {
      reset();
      arrange();
      try {
        call();
      } catch (err) {
        fail(`${label}: ${name} threw ${err && err.message}`);
      }
    }
  }
  reset();
  return problems;
}

export function usageFiles(root) {
  return readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => join(root, d.name, "usage.mjs"))
    .filter((p) => existsSync(p))
    .filter((p) => !readFileSync(p, "utf8").includes("storage = globalThis.localStorage"))
    .sort();
}

// A copy that exports neither record()/readUsage() nor
// usageAllowed()/recordEvent()/toggleUsage() is another design
// (recordUsage(storage, ...), isOptedOut/getUsageSummary) and is out of scope.
const isCounterShape = (mod) => typeof mod.record === "function" && typeof mod.readUsage === "function";
const isEventShape = (mod) =>
  ["usageAllowed", "recordEvent", "toggleUsage"].every((name) => typeof mod[name] === "function");

export async function checkTree(root) {
  const problems = [];
  let checked = 0;
  let skipped = 0;
  for (const file of usageFiles(root)) {
    let mod;
    try {
      mod = await import(pathToFileURL(resolve(file)).href);
    } catch (err) {
      problems.push(`${file}: failed to import: ${err && err.message}`);
      continue;
    }
    const check = isCounterShape(mod) ? checkModule : isEventShape(mod) ? checkEventModule : null;
    if (!check) {
      skipped += 1;
      continue;
    }
    checked += 1;
    let found;
    try {
      found = await check(mod);
    } catch (err) {
      found = [`threw ${err && err.message}`];
    }
    for (const p of found) problems.push(`${file}: ${p}`);
  }
  return { files: checked, skipped, problems };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = process.argv[2] || join(dirname(fileURLToPath(import.meta.url)), "..", "..", "ventures");
  const { files, skipped, problems } = await checkTree(root);
  for (const p of problems.slice(0, 50)) console.log(p);
  if (problems.length) {
    console.log(`${problems.length} usage.mjs contract breach(es) across ${files} files`);
    process.exit(1);
  }
  console.log(`usage.mjs contract: ${files} files OK (${skipped} of another design skipped)`);
}
