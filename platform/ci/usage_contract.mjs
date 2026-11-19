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
//     record(), readUsage() or setUsageOptOut() throw;
//   - an opt-out survives the next page load (a fresh copy of the module with
//     the in-memory flag gone), and blocked storage never reads as an opt-out.
//     Added 2026-11-14: a red-team mutant turned the blocked-store branch of
//     usageOptedOut() into `return true` and every copy's suite but one passed,
//     and no test anywhere reloaded the module after opting out, though the
//     in-memory flag is the first thing a refactor would make "enough".
//
// The same checks, reading the stored counter directly, run on the 36 copies
// of the usageAllowed()/recordEvent()/toggleUsage() design (checkEventModule),
// and on the copies that take the store as a parameter,
// recordUsage(storage, optedOut, event)/readOptOut/writeOptOut (checkParamModule,
// added 2026-11-17: its first run found three copies that kept a stored array).
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

// A counter's day stamp (last_day in 211 copies, day in a dozen) is shown in
// the stats panels and compared across visits, so it must be a bare
// YYYY-MM-DD for today. Added 2026-11-18: a red-team mutant turned
// `.slice(0, 10)` into `.slice(0, 11)` ("2026-11-18T") and no suite or
// contract check noticed, since none read the stamp's value.
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
function localDay(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function dayStampProblems(value, now = new Date()) {
  const today = new Set([now.toISOString().slice(0, 10), localDay(now)]);
  const problems = [];
  const walk = (v, path) => {
    if (!isPlainObject(v)) return;
    for (const [k, inner] of Object.entries(v)) {
      const where = path ? `${path}.${k}` : k;
      if (/^\d{4}-/.test(k) && !(ISO_DAY.test(k) && today.has(k))) problems.push(`key ${where} is not today's YYYY-MM-DD`);
      if (/day/i.test(k) && typeof inner === "string" && !(ISO_DAY.test(inner) && today.has(inner))) {
        problems.push(`${where} = ${JSON.stringify(inner)}, want today's YYYY-MM-DD`);
      }
      walk(inner, where);
    }
  };
  walk(value, "");
  return problems;
}

export async function checkModule(mod, reload) {
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
  for (const p of dayStampProblems(JSON.parse(storage.store.get(key)))) fail(`record(): ${p}`);

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

  // 4b. the opt-out survives the next page load, and blocked storage is not one.
  if (typeof setUsageOptOut === "function" && reload) {
    reset();
    setUsageOptOut(true);
    delete globalThis.__usageOptOut;
    const fresh = await reload();
    fresh.record("contract_a");
    const read = fresh.readUsage();
    if (!isPlainObject(read) || read.contract_a) fail(`opt-out did not survive a page load: record() counted (${JSON.stringify(read)})`);
    if (typeof fresh.usageOptedOut === "function" && fresh.usageOptedOut() !== true) fail("opt-out did not survive a page load: usageOptedOut() is not true");
    reset();
    fresh.setUsageOptOut(false);
  }
  if (typeof mod.usageOptedOut === "function") {
    // Two ways a browser blocks: reading the global throws, or the store is
    // there and its methods throw. Each reaches a different branch.
    const boom = () => {
      throw new Error("SecurityError");
    };
    for (const [label, arrange] of [["blocked site data", blockStorage], ["a store whose reads throw", () => reset({ store: new Map(), getItem: boom, setItem: boom, removeItem: boom })]]) {
      reset();
      arrange();
      let opted;
      try {
        opted = mod.usageOptedOut();
      } catch (err) {
        opted = `threw ${err && err.message}`;
      }
      if (opted !== false) fail(`${label}: usageOptedOut() gave ${opted}, want false (the visitor never opted out)`);
    }
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
export async function checkEventModule(mod, reload) {
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
  for (const p of dayStampProblems(parse(storage, key))) fail(`recordEvent(): ${p}`);

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

  // 4b. the opt-out survives the next page load.
  if (reload) {
    storage = reset();
    toggleUsage(false);
    delete globalThis.__usageOptOut;
    const fresh = await reload();
    if (fresh.usageAllowed()) fail("opt-out did not survive a page load: usageAllowed() is true");
    fresh.recordEvent("contract_a");
    if (storage.store.has(key)) fail(`opt-out did not survive a page load: recordEvent counted (${storage.store.get(key)})`);
    reset();
    fresh.toggleUsage(true);
  }

  // 5. blocked or full storage never throws. "Reads that throw" added
  // 2026-11-18: 36 of 39 copies let a throwing getItem out of usageAllowed(),
  // so recordEvent() threw inside the page's render try and the calculator
  // showed "SecurityError" instead of its answer; three copies had been fixed
  // by hand on 2026-11-11 and the rest never were (platform/ci/copy_drift.mjs).
  const calls = [
    ["recordEvent", () => recordEvent("contract_a")],
    ["usageAllowed", () => usageAllowed()],
    ["toggleUsage(false)", () => toggleUsage(false)],
    ["toggleUsage(true)", () => toggleUsage(true)],
  ];
  for (const [label, arrange] of [["blocked site data", blockStorage], ["writes that throw", () => reset(fakeStorage({ throwOnSet: true }))], ["reads that throw", () => reset({ store: new Map(), getItem: readBoom, setItem: readBoom, removeItem: readBoom })]]) {
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

function readBoom() {
  throw new Error("SecurityError");
}

// The third design (195 copies, 2026-11-17): recordUsage(storage, optedOut,
// event), readOptOut(storage) and writeOptOut(storage, optedOut), with the
// store passed in. Red-team origin: on 2026-11-17 four mutants in
// mini-split-bid-calculator's copy escaped its suite (a stored opt-out ignored
// unless Do Not Track was also on, a stored array kept, a blocked store read as
// an opt-out, a throwing navigator read as one), and no check covered the
// other 194. The contract finds the counter key by what recordUsage() writes.
export async function checkParamModule(mod) {
  const problems = [];
  const fail = (msg) => problems.push(msg);
  const { recordUsage, readOptOut, writeOptOut } = mod;
  const parse = (storage, key) => {
    try {
      return JSON.parse(storage.store.get(key));
    } catch {
      return undefined;
    }
  };
  const total = (v) => (isPlainObject(v) ? Object.values(v).filter((n) => typeof n === "number").reduce((a, b) => a + b, 0) : NaN);
  const fresh = () => {
    reset();
    const s = fakeStorage();
    // every call names the store; the global is blocked to prove nothing reads it instead
    blockStorage();
    return s;
  };

  // 1. counts land in one JSON object under one key, and a named event counts.
  let storage = fresh();
  recordUsage(storage);
  recordUsage(storage);
  const keys = [...storage.store.keys()];
  const key = keys.find((k) => total(parse(storage, k)) === 2);
  if (!key) {
    fail(`recordUsage(storage) x2 wrote no JSON object counting 2 (store: ${JSON.stringify([...storage.store])})`);
    reset();
    return problems;
  }
  for (const p of dayStampProblems(parse(storage, key))) fail(`recordUsage(storage): ${p}`);
  recordUsage(storage, false, "contract_a");
  if (parse(storage, key)?.contract_a !== 1) fail(`recordUsage(storage, false, "contract_a") did not count contract_a (${storage.store.get(key)})`);

  // 2. the caller's opt-out argument.
  storage = fresh();
  recordUsage(storage, true);
  if (storage.store.has(key)) fail(`recordUsage(storage, true) still counted (${storage.store.get(key)})`);

  // 3. valid JSON that is not a plain object: recordUsage recovers.
  for (const raw of NOT_OBJECTS) {
    storage = fresh();
    storage.setItem(key, raw);
    try {
      recordUsage(storage);
    } catch (err) {
      fail(`stored ${raw}: recordUsage threw ${err && err.message}`);
      continue;
    }
    if (total(parse(storage, key)) !== 1) fail(`stored ${raw}: recordUsage left ${storage.store.get(key)}, want a fresh object counting 1`);
  }

  // 4. browser privacy signals.
  for (const [label, nav] of [["doNotTrack=\"1\"", { doNotTrack: "1" }], ["globalPrivacyControl", { globalPrivacyControl: true }]]) {
    storage = fresh();
    setNavigator(nav);
    recordUsage(storage);
    setNavigator({});
    if (storage.store.has(key)) fail(`${label}: recordUsage still counted (${storage.store.get(key)})`);
  }

  // 5. the stored opt-out: clears counters, is read back, and is honored by
  //    recordUsage on its own (no DNT, caller passes false); opting back in counts again.
  storage = fresh();
  recordUsage(storage);
  writeOptOut(storage, true);
  if (storage.store.has(key)) fail("writeOptOut(storage, true) left the counters in place");
  if (readOptOut(storage) !== true) fail("after writeOptOut(storage, true), readOptOut(storage) is not true");
  recordUsage(storage, false);
  if (storage.store.has(key)) fail(`a stored opt-out was ignored: recordUsage(storage, false) counted (${storage.store.get(key)})`);
  writeOptOut(storage, false);
  if (readOptOut(storage) !== false) fail("after writeOptOut(storage, false), readOptOut(storage) is not false");
  recordUsage(storage);
  if (total(parse(storage, key)) !== 1) fail("after writeOptOut(storage, false), recordUsage did not count again");

  // 6. blocked, missing or full storage never throws, and is never read as an opt-out.
  const throwing = { getItem() { throw new Error("SecurityError"); }, setItem() { throw new Error("SecurityError"); }, removeItem() { throw new Error("SecurityError"); } };
  fresh();
  for (const [label, s] of [["a store whose calls throw", throwing], ["no store", null], ["a full store", fakeStorage({ throwOnSet: true })]]) {
    if (label !== "a full store" && readOptOut(s) !== false) fail(`${label}: readOptOut is not false`);
    for (const [name, call] of [["recordUsage", () => recordUsage(s)], ["readOptOut", () => readOptOut(s)], ["writeOptOut(true)", () => writeOptOut(s, true)], ["writeOptOut(false)", () => writeOptOut(s, false)]]) {
      try {
        call();
      } catch (err) {
        fail(`${label}: ${name} threw ${err && err.message}`);
      }
    }
  }
  // the defaults, with site data blocked
  for (const [name, call] of [["recordUsage()", () => recordUsage()], ["readOptOut()", () => readOptOut()]]) {
    try {
      call();
    } catch (err) {
      fail(`blocked site data: ${name} threw ${err && err.message}`);
    }
  }

  // 7. a navigator that throws on read does not stop counting.
  storage = fresh();
  Object.defineProperty(globalThis, "navigator", { configurable: true, get() { throw new Error("blocked"); } });
  try {
    recordUsage(storage);
  } catch (err) {
    fail(`a navigator that throws: recordUsage threw ${err && err.message}`);
  }
  setNavigator({});
  if (total(parse(storage, key)) !== 1) fail("a navigator that throws on read stopped recordUsage from counting");
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
// recordUsage(storage, optedOut, event) exactly: copies that take (event, ...) or a
// navigator third are other designs, judged by their own suites.
const isParamShape = (mod) =>
  ["recordUsage", "readOptOut", "writeOptOut"].every((name) => typeof mod[name] === "function") &&
  /^function recordUsage\(storage(\s*=\s*[\w.()]+)?,\s*opt(?:ed)?Out(\s*=\s*\w+)?,\s*event\b/.test(String(mod.recordUsage));
const isEventShape = (mod) =>
  ["usageAllowed", "recordEvent", "toggleUsage"].every((name) => typeof mod[name] === "function");

export async function checkTree(root) {
  const problems = [];
  let checked = 0;
  let skipped = 0;
  for (const file of usageFiles(root)) {
    let mod;
    const href = pathToFileURL(resolve(file)).href;
    let loads = 0;
    // A query string gives a fresh module instance: what the next page load sees.
    const reload = () => import(`${href}?page-load=${++loads}`);
    try {
      mod = await import(href);
    } catch (err) {
      problems.push(`${file}: failed to import: ${err && err.message}`);
      continue;
    }
    const check = isCounterShape(mod) ? checkModule : isEventShape(mod) ? checkEventModule : isParamShape(mod) ? checkParamModule : null;
    if (!check) {
      skipped += 1;
      continue;
    }
    checked += 1;
    let found;
    try {
      found = await check(mod, reload);
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
