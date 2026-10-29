// Every venture's footer tells visitors the local usage counter can be turned
// off "with Do Not Track / Global Privacy Control". That sentence is a promise,
// and until now almost nothing held it: 150 usage modules read the signals and
// only 23 had a test proving they act on them.
//
// Per-venture tests would be ~130 near-identical copies of the same six lines,
// which is how the gap opened in the first place -- the test is boilerplate, so
// it gets skipped. This drives every module instead, the way
// platform/pages/clauses.mjs checks one clause across every published page.
//
// The check is behavioural, not a grep. Reading `globalPrivacyControl` proves
// nothing; a module can read it into a variable it never branches on. So each
// module is actually called, with a storage spy, under three navigator states.

import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";

const REPO_ROOT = new URL("../../", import.meta.url).pathname;
const VENTURES = join(REPO_ROOT, "ventures");

// The two signals the footers name. A module that reads neither is not making
// the promise and is not this checker's business.
const SIGNALS = [
  { label: "Global Privacy Control", navigator: { globalPrivacyControl: true } },
  { label: "Do Not Track", navigator: { doNotTrack: "1" } },
];

// The walk finds files on disk, and a build output is a file on disk. Six
// copies of `ai-engineering-academy`'s tool modules live under
// `ventures/ai-engineering-academy/site/dist/`, which `.gitignore` covers and
// only exists once somebody has run that venture's build -- so the catalogue
// count read 254 in CI and 260 in a working tree that had built, and the
// pinned-count assertion in the test beside this file failed for a reason
// that was not a change to the catalogue.
//
// Naming `dist` here alongside `node_modules` would fix today's instance and
// go stale at the next `build/`, `out/` or `_site/`. Git already knows the
// answer, so ask it: one `check-ignore` call over the whole list, tracked
// files exempt by default (that is check-ignore's own rule, and it is the one
// we want -- a committed file is part of the catalogue whatever a pattern
// says). Outside a repository -- the tmpdir fixtures in the test file -- git
// exits non-zero with no output and everything is kept, which is correct
// there: a fixture directory has no build output to confuse.
function ignoredByGit(paths) {
  if (paths.length === 0) return new Set();
  try {
    const out = execFileSync("git", ["-C", REPO_ROOT, "check-ignore", "--stdin", "-z"], {
      input: paths.join("\0"),
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
    });
    return new Set(out.split("\0").filter(Boolean));
  } catch (error) {
    // Exit 1 is "none of them are ignored" and carries an empty stdout; any
    // other failure (no git, no work tree) means we cannot tell, and keeping
    // every path is the honest answer -- a checker that silently checked
    // nothing because git was missing is the failure this repo keeps
    // recording.
    return new Set((error.stdout ?? "").split("\0").filter(Boolean));
  }
}

export function findUsageModules(root = VENTURES) {
  const found = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      if (entry === "node_modules" || entry.startsWith(".")) continue;
      const full = join(dir, entry);
      // `node --test` runs test files in parallel, and
      // browser-signals.test.mjs makes and removes a scratch venture under
      // ventures/. An entry gone between readdir and stat was never part of
      // the catalogue, so skip it rather than crash the walk (CI, 2026-10-21:
      // ENOENT on ventures/discovery-probe-IUtDEq in one-opt-out.test.mjs).
      let stats;
      try { stats = statSync(full); } catch (error) {
        if (error.code === "ENOENT") continue;
        throw error;
      }
      if (stats.isDirectory()) walk(full);
      // Almost every venture names its tracker usage.mjs, but a handful load
      // it as a classic (non-module) <script src="usage.js"> and pair it with
      // a require()-based node --test suite, so it is written as CommonJS and
      // named usage.js instead. Both make the same footer promise, so both
      // must be driven here — see CLAUDE.md on what a filename convention
      // nobody enforced already cost twice.
      else if (entry === "usage.mjs" || entry === "usage.js") found.push(full);
    }
  };
  walk(root);
  const ignored = ignoredByGit(found);
  return found.filter((path) => !ignored.has(path)).sort();
}

function makeStorage(writes) {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { writes.push(key); values.set(key, value); },
    removeItem: (key) => values.delete(key),
    clear: () => values.clear(),
  };
}

// Recorder signatures differ across ventures: most take
// (storage = globalThis.localStorage, optedOut, event), a few require storage
// as the first argument, and some take only an event name and reach for
// localStorage themselves. Rather than encode a convention nobody agreed to,
// try the plausible shapes and let the control run below decide whether any of
// them actually reached the code.
// `storage` is a parameter so a caller can hand in a store that SURVIVES
// between calls. This checker's runs are each self-contained, but
// `optout-persistence.mjs` needs the same localStorage before and after a
// simulated reload -- which is the whole property it tests -- and a driver
// that always installs a fresh empty store silently defeats that: the flag
// the module just wrote is invisible on the next call, so a correct module
// reads as broken. Measured on `3pl-quote-normalizer`, which passes by hand
// and failed here until this parameter existed.
export function drive(module, navigatorValue, writes, eventNames, storage = null) {
  storage = storage ?? makeStorage(writes);
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: navigatorValue });
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
  // Several modules gate on `typeof window === "undefined"` to stay inert under
  // Node, and one reads the legacy `window.doNotTrack`. Without a window they
  // return early and the control run below would call them undrivable.
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { navigator: navigatorValue, localStorage: storage, doNotTrack: navigatorValue.doNotTrack },
  });
  try {
    for (const [name, fn] of Object.entries(module)) {
      if (typeof fn !== "function") continue;
      // Factories (createUsage(storage) -> { record... }) hand back the recorder
      // rather than being one, so unwrap a level before giving up on them.
      if (/^create/i.test(name)) {
        let made;
        try { made = fn(storage); } catch { continue; }
        if (made && typeof made === "object") callRecorders(made, storage, eventNames);
        continue;
      }
      if (!/^(record|count)/i.test(name)) continue;
      // Deliberately no three-argument shape. The third parameter is an event
      // name in some ventures and a navigator override in others, and passing a
      // string where a navigator is expected bypasses the very guard under test
      // -- a false failure. Two arguments is as far as the shapes agree.
      for (const args of argShapes(storage, eventNames)) {
        try {
          fn(...args);
        } catch {
          // A signature this call shape does not fit. Another shape may fit, and
          // if none do the control run reports the module as undrivable.
        }
      }
    }
  } finally {
    restore(globalThis, "navigator", previousNavigator);
    restore(globalThis, "localStorage", previousStorage);
    restore(globalThis, "window", previousWindow);
  }
}

function callRecorders(target, storage, eventNames) {
  for (const [name, fn] of Object.entries(target)) {
    if (typeof fn !== "function" || !/^(record|count)/i.test(name)) continue;
    for (const args of argShapes(storage, eventNames)) {
      try { fn(...args); } catch { /* shape mismatch; another may fit */ }
    }
  }
}

function argShapes(storage, eventNames) {
  const shapes = [[], [storage], [storage, false]];
  for (const event of eventNames) shapes.push([event], [event, true]);
  return shapes;
}

// Some recorders only count events on an allowlist, so a generic probe name is
// rejected and the module reads as undrivable. Its own source carries the names
// it accepts: take the snake_case string literals and try those.
export function eventNamesFrom(path) {
  const source = readFileSync(path, "utf8");
  const found = new Set(["checked"]);
  for (const [, literal] of source.matchAll(/["'`]([a-z][a-z0-9]*(?:_[a-z0-9]+)+)["'`]/g)) {
    found.add(literal);
  }
  return [...found].slice(0, 24);
}

function restore(target, key, descriptor) {
  if (descriptor) Object.defineProperty(target, key, descriptor);
  else delete target[key];
}

export async function checkModule(path) {
  const source = await import(pathToFileURL(path).href);
  const name = relative(REPO_ROOT, path);

  // A control run with no signal set. If nothing is written here, the driver
  // never reached the recorder, so a clean signal run would be meaningless --
  // it would "pass" a module it never executed.
  const eventNames = eventNamesFrom(path);
  const control = [];
  drive(source, {}, control, eventNames);
  if (control.length === 0) return { name, status: "undrivable" };

  for (const signal of SIGNALS) {
    const writes = [];
    drive(source, signal.navigator, writes, eventNames);
    if (writes.length > 0) {
      return { name, status: "fail", signal: signal.label, keys: [...new Set(writes)] };
    }
  }
  return { name, status: "pass" };
}

export async function checkAll(root = VENTURES) {
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

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  // An optional root lets the test file drive the exit-code path on fixtures.
  const results = await checkAll(process.argv[2] ?? VENTURES);
  const failed = results.filter((r) => r.status === "fail");
  const errored = results.filter((r) => r.status === "error");
  const undrivable = results.filter((r) => r.status === "undrivable");
  const passed = results.filter((r) => r.status === "pass");

  for (const r of failed) {
    console.error(`FAIL ${r.name}: recorded under ${r.signal} (wrote ${r.keys.join(", ")})`);
  }
  for (const r of errored) console.error(`ERROR ${r.name}: ${r.error}`);
  for (const r of undrivable) console.error(`UNDRIVABLE ${r.name}: no exported recorder wrote with no signal set`);

  console.log(
    `${passed.length} usage module(s) honour Do Not Track and Global Privacy Control; ` +
    `${failed.length} failed, ${errored.length} errored, ${undrivable.length} undrivable.`,
  );
  process.exit(failed.length + errored.length + undrivable.length > 0 ? 1 : 0);
}
