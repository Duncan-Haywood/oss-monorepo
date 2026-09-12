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
// **The switch itself is discovered the same way, and the first draft of this
// file got that wrong.** It carried a five-name allowlist
// (`setUsageOptOut|setOptOut|toggleUsage|setUsageEnabled|optOut`) and filed
// everything else as `no-switch`, which silently excluded at least five live
// controls wired to real buttons — `clearAndDisable`, `writeOptOut`,
// `setUsageCountingEnabled`, `disableUsage`, `setOptedOut`. A persistence
// regression in any of them would have left CI green. That is the same defect
// this file exists to catch, committed by the file itself: a hand-maintained
// list of names, in a checker whose entire thesis is that names prove nothing.
//
// So a switch is now **defined by what it does**: an exported function which,
// called, makes the recorder stop writing on this page. That definition needs
// no list, cannot go stale, and rejects the near misses on their behaviour —
// a `clearUsageLog()` empties the counters and the recorder writes again, so
// it is not a switch.
//
// It reuses `drive` and `eventNamesFrom` from `browser-signals.mjs` rather
// than restating them: those encode which call shapes the catalogue's
// recorders actually accept, and a copied constant is how this repository has
// twice shipped a rule that went stale on one side.

import { relative } from "node:path";
import { pathToFileURL } from "node:url";

import { drive, eventNamesFrom, findUsageModules } from "./browser-signals.mjs";

const REPO_ROOT = new URL("../../", import.meta.url).pathname;

// The names `drive` itself calls. They are the recorder, so they are never the
// switch, and calling them here would just add counter writes.
const RECORDER_NAME = /^(record|count|create)/i;

// This is NOT how switches are found — that is behavioural, below. It decides
// something different and narrower: when no exported function turns counting
// off, is that because the module offers nothing (out of scope, `no-switch`)
// or because it offers something this driver could not work (`undrivable`, a
// failure)? Getting that backwards is what the allowlist did, so the fallback
// here is deliberately the loud one.
const PROMISES_A_SWITCH = /(opt.?out|opted|disable|enable|toggle|counting|tracking)/i;

function switchCandidates(module) {
  const candidates = Object.entries(module).filter(
    ([name, value]) => typeof value === "function" && !RECORDER_NAME.test(name),
  );
  // Plainly-named controls first, so a module that has one is never diagnosed
  // through some unrelated export that happens to silence the recorder.
  return candidates.sort(
    (a, b) => Number(PROMISES_A_SWITCH.test(b[0])) - Number(PROMISES_A_SWITCH.test(a[0])),
  );
}

const STORE = Symbol("the driver's storage");

// Turning counting *off* is spelled at least four ways in this catalogue, and
// the argument means opposite things in two of them: `setUsageOptOut(true)`,
// `toggleUsage(false)`, `disableUsage()` and `writeOptOut(storage, true)` are
// all the same request. Every shape is tried and the behavioural test below
// decides which one actually did it — so a wrong-direction call
// (`setUsageCountingEnabled(true)`) simply fails to silence and is discarded,
// rather than needing to be recognised.
const OFF_SHAPES = [[], [true], [false], [STORE, true], [STORE, false]];

function fill(args, storage) {
  return args.map((arg) => (arg === STORE ? storage : arg));
}

function describe(name, args) {
  return `${name}(${args.map((a) => (a === STORE ? "storage" : String(a))).join(", ")})`;
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

// What a reload actually destroys is *every* in-memory global, not one named
// property. An earlier draft deleted `globalThis.__usageOptOut` and nothing
// else, so a module keeping its transient flag under any other name --
// `globalThis.trackingDisabled` -- carried the choice across the simulated
// reload and passed, while a real page load would have lost it and resumed
// counting. The realm is restored wholesale instead: whatever the page put on
// `globalThis`, the reload takes away.
function snapshotGlobals() {
  const snapshot = new Map();
  for (const key of Reflect.ownKeys(globalThis)) {
    snapshot.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  }
  return snapshot;
}

function restoreGlobals(snapshot) {
  for (const key of Reflect.ownKeys(globalThis)) {
    if (snapshot.has(key)) continue;
    try { delete globalThis[key]; } catch { /* non-configurable; not ours anyway */ }
  }
  for (const [key, descriptor] of snapshot) {
    const now = Object.getOwnPropertyDescriptor(globalThis, key);
    if (now && now.value === descriptor.value && now.get === descriptor.get && now.set === descriptor.set) {
      continue;
    }
    try { Object.defineProperty(globalThis, key, descriptor); } catch { /* frozen built-in */ }
  }
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
  // Before the module has been evaluated at all: the realm a fresh page load
  // starts from. Restoring to this is what makes the reload below a reload,
  // and the `finally` hands the next module the same clean realm this one
  // got -- 265 modules share one process, and a global left behind by an
  // earlier one would answer for a later one.
  const pristine = snapshotGlobals();
  try {
    return await drivenCheck(path, pristine);
  } finally {
    restoreGlobals(pristine);
  }
}

async function drivenCheck(path, pristine) {
  const name = relative(REPO_ROOT, path);
  const url = pathToFileURL(path).href;
  const first = await import(url);
  const eventNames = eventNamesFrom(path);
  const candidates = switchCandidates(first);
  const promised = candidates.filter(([n]) => PROMISES_A_SWITCH.test(n)).map(([n]) => n);

  // Nothing this driver can call, so nothing to conclude either way. A module
  // whose exports do not even claim a switch is out of scope; one that claims
  // a switch we cannot reach is an unverified promise, which is a failure.
  const unverifiable = (detail) =>
    promised.length > 0
      ? { name, status: "undrivable", detail: `${detail} (exports ${promised.join(", ")})` }
      : { name, status: "no-switch" };

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
  // Which keys ARE the counters is measured, never guessed. An earlier draft
  // asked whether the key contained "opt" or "off", which passes a module
  // whose counter is honestly named `coffee-usage`: the resumed write is
  // filtered out and the broken switch reads as green.
  const counterKeys = new Set(control);
  if (counterKeys.size === 0) return unverifiable("no exported recorder wrote with nothing switched off");

  // Second control, on the storage the first one left behind. The switch test
  // below reads "the recorder went quiet" as evidence, so a recorder that goes
  // quiet on its own -- one that records an event once and then dedupes --
  // would make every candidate look like a switch. Ask before relying on it.
  const repeat = [];
  withStorage(values, repeat, (storage) => {
    delete globalThis.__usageOptOut;
    drive(first, {}, repeat, eventNames, storage);
  });
  if (!repeat.some((key) => counterKeys.has(key))) {
    return unverifiable("the recorder does not write repeatably, so silence proves nothing");
  }
  // The page state a visitor would be switching off from: counted already,
  // module evaluated, nothing switched off yet. `loaded` is that realm; the
  // next attempt is reset to it so one candidate's globals cannot make the
  // following candidate look like a switch.
  const baseline = new Map(values);
  const loaded = snapshotGlobals();
  const restoreBaseline = () => {
    values.clear();
    for (const [key, value] of baseline) values.set(key, value);
    restoreGlobals(loaded);
  };

  for (const [switchName, switchFn] of candidates) {
    for (const shape of OFF_SHAPES) {
      restoreBaseline();
      const switchWrites = [];
      let accepted = true;
      withStorage(values, switchWrites, (storage) => {
        try { switchFn(...fill(shape, storage)); } catch { accepted = false; }
      });
      if (!accepted) continue;

      // Is this a switch at all? Only if the recorder stops writing here and
      // now -- same realm, in-memory flag intact. A call that leaves counting
      // on was the wrong function, or the wrong direction, and neither is
      // this check's business.
      const samePage = [];
      withStorage(values, samePage, (storage) => {
        drive(first, {}, samePage, eventNames, storage);
      });
      if (samePage.some((key) => counterKeys.has(key))) continue;

      // The reload. Two things go, in the order a browser does them: every
      // global the page put there, then the module instance itself. The
      // cache-buster is the only way to get a second realm in one process,
      // and it is imported *after* the restore so its own top-level
      // evaluation re-establishes whatever it sets, exactly as a fresh page
      // load would.
      restoreGlobals(pristine);
      const reloaded = await import(`${url}?optout-reload=${reloadCounter++}`);
      const after = [];
      withStorage(values, after, (storage) => {
        drive(reloaded, {}, after, eventNames, storage);
      });

      // A write after the reload is the switch's own bookkeeping only if the
      // switch demonstrably wrote that key and the recorder never does.
      // Anything else counts as counting: this filter is what turns a fail
      // into a pass, so it stays conservative in that direction.
      const flagKeys = new Set(switchWrites);
      const resumed = after.filter((key) => counterKeys.has(key) || !flagKeys.has(key));
      if (resumed.length === 0) {
        return { name, status: "pass", via: describe(switchName, shape) };
      }
      return {
        name,
        status: "fail",
        switch: switchName,
        keys: [...new Set(resumed)],
        detail:
          `counting resumed after a reload (wrote ${[...new Set(resumed)].join(", ")}), ` +
          `so the advertised switch does not survive a visit`,
      };
    }
  }

  return unverifiable("no exported function turned counting off");
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
