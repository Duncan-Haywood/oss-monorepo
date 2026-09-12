// Every venture that offers an in-page "turn usage counting off" switch is
// making a promise, and a promise a reload cancels is worse than no promise:
// the visitor believes they have already used it, so they never look again.
//
// Measured 2026-09-12, on `vpat-acr-generator` and then across the catalogue:
// the common shape kept the choice only in `globalThis.__usageOptOut`, which
// is a fresh realm on every page load. The visitor clicked the switch, the
// counters were deleted, and the next visit started counting again while
// offering the switch back.
//
// WHY THIS IS BEHAVIOURAL AND NOT A GREP
//
// The same reason `browser-signals.mjs` gives, learned again the hard way
// here. Four separate static rules were tried against this question and all
// four were wrong, always overcounting:
//
//   `setItem(OPT_OUT...)`        missed `vendor-rate-break-even`, whose key
//                                constant is lowercase `optOutKey`
//   `getItem(...opt-out...)`     missed `wash-and-fold-price-calculator`,
//                                whose key is spelled `-usage-off`
//   comparing setter bodies      compared the setter and not the gate, so it
//                                called 37 modules identical when their
//                                recording paths differ
//   any of the above             cannot see whether the value is ever
//                                branched on, which is the only thing that
//                                matters
//
// A module can store a flag it never reads, read one it never branches on, or
// spell its key anything at all. The only question that survives all of that
// is the one a visitor would ask: **if I switch it off and come back, is it
// still off?** So each module is driven for real — counting, then opting out,
// then re-imported in a fresh realm with the same storage, which is what a
// reload is — and asked whether it writes again.
//
// It reuses `drive` and `eventNamesFrom` from `browser-signals.mjs` rather
// than restating them: those encode which call shapes the catalogue's
// recorders actually accept, and a copied constant is how this repository has
// twice shipped a rule that went stale on one side.

import { relative } from "node:path";
import { pathToFileURL } from "node:url";

import { drive, eventNamesFrom, findUsageModules } from "./browser-signals.mjs";

const REPO_ROOT = new URL("../../", import.meta.url).pathname;

// Names the catalogue uses for "turn counting off". A module offering none of
// them makes no in-page promise -- it honours DNT/GPC only, which is a
// different and defensible design -- and is not this checker's business.
const SWITCH = /^(setUsageOptOut|setOptOut|toggleUsage|setUsageEnabled|optOut)$/i;

function findSwitch(module) {
  for (const [name, value] of Object.entries(module)) {
    if (typeof value === "function" && SWITCH.test(name)) return [name, value];
  }
  return null;
}

// Turning counting *off* is spelled differently depending on whether the
// argument means "opted out" or "enabled": `setUsageOptOut(true)` and
// `toggleUsage(false)` are the same request. Both are tried, and the check
// only cares that at least one of them silences the recorder.
function offArguments(name) {
  return /enabled|toggle/i.test(name) ? [[false], [true]] : [[true], [false]];
}

/**
 * A storage that survives the "reload": the same Map is handed to the module
 * before and after, exactly as a browser keeps localStorage across a page
 * load. `writes` records only what happens during the window the caller is
 * watching.
 */
function persistentStorage(values, writes) {
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { writes.push(key); values.set(key, String(value)); },
    removeItem: (key) => values.delete(key),
    clear: () => values.clear(),
  };
}

function withStorage(values, writes, fn) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const storage = persistentStorage(values, writes);
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
  try {
    return fn(storage);
  } finally {
    if (previous) Object.defineProperty(globalThis, "localStorage", previous);
    else delete globalThis.localStorage;
  }
}

let reloadCounter = 0;

export async function checkModule(path) {
  const name = relative(REPO_ROOT, path);
  const url = pathToFileURL(path).href;
  const first = await import(url);

  const found = findSwitch(first);
  if (!found) return { name, status: "no-switch" };
  const [switchName, switchFn] = found;

  const eventNames = eventNamesFrom(path);
  const values = new Map();

  // Control: the recorder must actually write before we can conclude anything
  // from it not writing later. Without this, a module the driver never
  // reached would "pass" on a silence it was always going to produce -- the
  // same trap `browser-signals.mjs` guards with its own control run.
  const control = [];
  withStorage(values, control, (storage) => {
    delete globalThis.__usageOptOut;
    drive(first, {}, control, eventNames, storage);
  });
  if (control.length === 0) return { name, status: "undrivable" };

  for (const args of offArguments(switchName)) {
    values.clear();
    let accepted = true;
    withStorage(values, [], () => {
      delete globalThis.__usageOptOut;
      try { switchFn(...args); } catch { accepted = false; }
    });
    if (!accepted) continue;

    // The reload. A fresh module realm -- which is what drops an in-memory
    // flag -- over the storage the switch just wrote to. The cache-buster is
    // the only way to get a second realm in one process.
    const reloaded = await import(`${url}?optout-reload=${reloadCounter++}`);
    const after = [];
    withStorage(values, after, (storage) => {
      delete globalThis.__usageOptOut;
      drive(reloaded, {}, after, eventNames, storage);
    });

    const countersWritten = after.filter((key) => !/opt|off/i.test(key));
    if (countersWritten.length === 0) {
      return { name, status: "pass", via: `${switchName}(${args[0]})` };
    }
  }

  return {
    name,
    status: "fail",
    switch: switchName,
    detail: "counting resumed after a reload, so the advertised switch does not survive a visit",
  };
}

export async function checkAll(root) {
  const results = [];
  for (const path of findUsageModules(root)) {
    try {
      results.push(await checkModule(path));
    } catch (error) {
      results.push({ name: relative(REPO_ROOT, path), status: "error", error: error.message });
    }
  }
  return results;
}
