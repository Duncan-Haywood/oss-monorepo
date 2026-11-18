// The tests that matter here are the ones proving this checker can FAIL.
//
// A guard that accepts everything reads as coverage while proving nothing,
// and this one guards a promise: every venture offering "turn usage counting
// off" is telling the visitor their choice sticks. The catalogue-wide run at
// the bottom is only trustworthy because the fixtures above show the checker
// distinguishes a module that keeps the choice from one that forgets it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { checkModule, checkAll } from "./optout-persistence.mjs";

// The venture usage modules that offer an in-page way to turn counting off,
// one path per line in optout-switches.txt next to this file. Every one must
// keep the choice across a reload, and the set itself is pinned -- see the
// catalogue test at the bottom for why a lower bound is not enough.
//
// Until 2026-11-14 this was a single pinned number, SWITCHES_IN_THE_CATALOGUE,
// with a running "+1: <venture> graduated" changelog that had grown to 1,700
// of this file's 2,278 lines. Concurrent new ventures each bumped the number
// against the same base, which conflicted or merged into a count one short
// (platform/ci/sync_tree_counts.py has the numbers). A list of names merges
// cleanly and its failure names the module that moved. The changelog, which
// records how the count went 69 -> 93 (behavioural discovery replacing a name
// allowlist) -> 254 (161 modules gaining a writeOptOut the recorder reads) and
// why a usageAllowed/toggleUsage switch is found where an allowlist missed it,
// is in history: git show 6f83e2bc7:platform/privacy/optout-persistence.test.mjs
const SWITCH_LIST = join(fileURLToPath(new URL(".", import.meta.url)), "optout-switches.txt");
const LIST_SELF = relative(
  join(fileURLToPath(new URL(".", import.meta.url)), "..", ".."),
  SWITCH_LIST,
);

function listedSwitches() {
  return readFileSync(SWITCH_LIST, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
}

let counter = 0;
function fixture(source) {
  // A fresh directory per fixture: the checker imports by URL, and Node caches
  // module URLs for the life of the process.
  const dir = mkdtempSync(join(tmpdir(), `optout-fixture-${counter++}-`));
  const path = join(dir, "usage.mjs");
  writeFileSync(path, source);
  return { path, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

// The shape the catalogue shipped: the choice lives only in globalThis, which
// is a fresh realm on every page load.
const FORGETS = `
const KEY = "fixture-usage";
export function record(event) {
  if (typeof localStorage === "undefined" || globalThis.__usageOptOut) return;
  localStorage.setItem(KEY, String((Number(localStorage.getItem(KEY)) || 0) + 1));
}
export function setUsageOptOut(value) {
  globalThis.__usageOptOut = Boolean(value);
  if (value && typeof localStorage !== "undefined") localStorage.removeItem(KEY);
}
`;

const REMEMBERS = `
const KEY = "fixture-usage";
const OPT_OUT = "fixture-usage-opt-out";
function optedOut() {
  if (globalThis.__usageOptOut) return true;
  try { return localStorage.getItem(OPT_OUT) === "1"; } catch { return false; }
}
export function record(event) {
  if (typeof localStorage === "undefined" || optedOut()) return;
  localStorage.setItem(KEY, String((Number(localStorage.getItem(KEY)) || 0) + 1));
}
export function setUsageOptOut(value) {
  const off = Boolean(value);
  globalThis.__usageOptOut = off;
  if (off) { localStorage.removeItem(KEY); localStorage.setItem(OPT_OUT, "1"); }
  else localStorage.removeItem(OPT_OUT);
}
`;

// Stores the flag but never consults it. This is the case a static check
// cannot tell from a correct module, and the reason this checker drives the
// code instead of reading it.
const WRITES_BUT_NEVER_READS = `
const KEY = "fixture-usage";
const OPT_OUT = "fixture-usage-opt-out";
export function record(event) {
  if (typeof localStorage === "undefined" || globalThis.__usageOptOut) return;
  localStorage.setItem(KEY, String((Number(localStorage.getItem(KEY)) || 0) + 1));
}
export function setUsageOptOut(value) {
  globalThis.__usageOptOut = Boolean(value);
  if (value) { localStorage.removeItem(KEY); localStorage.setItem(OPT_OUT, "1"); }
}
`;

// No in-page switch at all: honours DNT/GPC only. A defensible design, and
// not this checker's business -- flagging it would make the check noise.
const NO_SWITCH = `
const KEY = "fixture-usage";
export function record(event) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(KEY, String((Number(localStorage.getItem(KEY)) || 0) + 1));
}
`;

// Clearing the counters is not switching them off, and a checker that took
// any storage change for a switch would confuse the two. The recorder starts
// again immediately, which is exactly how the behavioural test tells them
// apart.
const CLEARS_BUT_DOES_NOT_DISABLE = `
const KEY = "fixture-usage";
export function record(event) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(KEY, String((Number(localStorage.getItem(KEY)) || 0) + 1));
}
export function clearUsageLog() {
  if (typeof localStorage !== "undefined") localStorage.removeItem(KEY);
}
`;

// A live control whose name is in no allowlist -- this one is real, from
// equipment-rental-break-even, wired to a "clear usage" button. The first
// draft of the checker filed it as \`no-switch\` and would have stayed green
// through any regression in it.
const UNLISTED_NAME = `
const KEY = "fixture-usage";
export function record(event) {
  if (typeof localStorage === "undefined" || globalThis.__usageOptOut) return;
  localStorage.setItem(KEY, String((Number(localStorage.getItem(KEY)) || 0) + 1));
}
export function clearAndDisable() {
  globalThis.__usageOptOut = true;
  if (typeof localStorage !== "undefined") localStorage.removeItem(KEY);
}
`;

// And a name that hints at nothing at all, to prove the discovery is not the
// old allowlist with more entries in it. Nothing about "hush" says opt-out;
// what identifies it is that the recorder goes quiet when it is called.
const UNHINTED_NAME = `
const KEY = "fixture-usage";
const OFF = "fixture-usage-off";
function silenced() {
  if (globalThis.__usageOptOut) return true;
  try { return localStorage.getItem(OFF) === "1"; } catch { return false; }
}
export function record(event) {
  if (typeof localStorage === "undefined" || silenced()) return;
  localStorage.setItem(KEY, String((Number(localStorage.getItem(KEY)) || 0) + 1));
}
export function hush() {
  globalThis.__usageOptOut = true;
  localStorage.removeItem(KEY);
  localStorage.setItem(OFF, "1");
}
`;

// A counter key that honestly contains "off". An earlier draft decided which
// writes were counters by looking for "opt" or "off" in the key, so this
// module -- broken in exactly the way the FORGETS fixture is -- passed.
const COUNTER_NAMED_LIKE_A_FLAG = `
const KEY = "coffee-usage";
export function record(event) {
  if (typeof localStorage === "undefined" || globalThis.__usageOptOut) return;
  localStorage.setItem(KEY, String((Number(localStorage.getItem(KEY)) || 0) + 1));
}
export function setUsageOptOut(value) {
  globalThis.__usageOptOut = Boolean(value);
  if (value && typeof localStorage !== "undefined") localStorage.removeItem(KEY);
}
`;

// The same forgetting, under a different global. An earlier draft simulated
// the reload by deleting `globalThis.__usageOptOut` and nothing else, so this
// module -- broken in exactly the way FORGETS is -- kept its flag across the
// "reload" and passed. A real page load discards every global, not one name.
const ALTERNATE_GLOBAL = `
const KEY = "fixture-usage";
export function record(event) {
  if (typeof localStorage === "undefined" || globalThis.trackingDisabled) return;
  localStorage.setItem(KEY, String((Number(localStorage.getItem(KEY)) || 0) + 1));
}
export function disableTracking() {
  globalThis.trackingDisabled = true;
  if (typeof localStorage !== "undefined") localStorage.removeItem(KEY);
}
`;

// A recorder that writes once and then dedupes. It falls silent on its own,
// so "the recorder went quiet" stops being evidence of anything and every
// export would look like a switch.
const RECORDS_ONCE = `
const KEY = "fixture-usage";
export function record(event) {
  if (typeof localStorage === "undefined") return;
  if (localStorage.getItem(KEY)) return;
  localStorage.setItem(KEY, "1");
}
export function setUsageOptOut(value) { globalThis.__usageOptOut = Boolean(value); }
`;

// The inverted spelling: the argument means "enabled", so turning counting off
// is toggleUsage(false). A checker that only tried `true` would call this
// broken.
const INVERTED = `
const KEY = "fixture-usage";
const OPT_OUT = "fixture-usage-opt-out";
function allowed() {
  try { return localStorage.getItem(OPT_OUT) !== "1"; } catch { return true; }
}
export function record(event) {
  if (typeof localStorage === "undefined" || !allowed()) return;
  localStorage.setItem(KEY, String((Number(localStorage.getItem(KEY)) || 0) + 1));
}
export function toggleUsage(enabled) {
  if (enabled) localStorage.removeItem(OPT_OUT);
  else { localStorage.removeItem(KEY); localStorage.setItem(OPT_OUT, "1"); }
}
`;

async function statusOf(source) {
  const { path, cleanup } = fixture(source);
  try {
    return await checkModule(path);
  } finally {
    cleanup();
  }
}

test("a switch the reload forgets is caught", async () => {
  const result = await statusOf(FORGETS);
  assert.equal(result.status, "fail", JSON.stringify(result));
  assert.match(result.detail, /reload/);
});

test("a switch that survives the reload passes", async () => {
  const result = await statusOf(REMEMBERS);
  assert.equal(result.status, "pass", JSON.stringify(result));
});

test("storing the flag without reading it is still a failure", async () => {
  // The case that defeats every static rule: the grep for a stored opt-out
  // key succeeds, and the visitor is still counted on their next visit.
  const result = await statusOf(WRITES_BUT_NEVER_READS);
  assert.equal(result.status, "fail", JSON.stringify(result));
});

test("a module with no in-page switch is not accused", async () => {
  // Honouring DNT/GPC without offering a button is a different design, not a
  // broken promise. A guard that failed on it would be noise and get muted.
  const result = await statusOf(NO_SWITCH);
  assert.equal(result.status, "no-switch", JSON.stringify(result));
});

test("an enabled-style switch is understood", async () => {
  const result = await statusOf(INVERTED);
  assert.equal(result.status, "pass", JSON.stringify(result));
  assert.match(result.via, /toggleUsage/);
});

test("clearing the counters is not switching them off", async () => {
  // The recorder starts again on the next call, so this is a delete button,
  // not an opt-out. A checker that read any storage change as a switch would
  // then "verify" a promise the module never made.
  const result = await statusOf(CLEARS_BUT_DOES_NOT_DISABLE);
  assert.equal(result.status, "no-switch", JSON.stringify(result));
});

test("a switch whose name is in no allowlist is still checked", async () => {
  // `clearAndDisable` is real, and the first draft of this checker filed it
  // and four siblings as no-switch -- so a regression in any of them left CI
  // green. This is that defect, committed by the guard against it.
  const result = await statusOf(UNLISTED_NAME);
  assert.equal(result.status, "fail", JSON.stringify(result));
  assert.match(result.switch, /clearAndDisable/);
});

test("a switch whose name hints at nothing is found by what it does", async () => {
  const result = await statusOf(UNHINTED_NAME);
  assert.equal(result.status, "pass", JSON.stringify(result));
  assert.match(result.via, /hush/);
});

test("a counter key that contains \"off\" is still a counter", async () => {
  // `coffee-usage`. Deciding which writes were counters by looking for "opt"
  // or "off" in the key passed this module, which is broken in exactly the
  // way FORGETS is. Counter keys are now measured in the control run.
  const result = await statusOf(COUNTER_NAMED_LIKE_A_FLAG);
  assert.equal(result.status, "fail", JSON.stringify(result));
  assert.deepEqual(result.keys, ["coffee-usage"]);
});

test("a flag under a different global is still lost on reload", async () => {
  // The reload has to discard the realm, not one property of it. Special-
  // casing `__usageOptOut` passed a module that spells its flag anything
  // else, which is the same "names prove nothing" mistake as the allowlist.
  const result = await statusOf(ALTERNATE_GLOBAL);
  assert.equal(result.status, "fail", JSON.stringify(result));
  assert.match(result.switch, /disableTracking/);
});

test("a check leaves the realm as it found it", async () => {
  // 265 modules share one process. A global left behind by one would answer
  // for the next, and the failure would land on an innocent venture.
  assert.equal("trackingDisabled" in globalThis, false);
  await statusOf(ALTERNATE_GLOBAL);
  assert.equal("trackingDisabled" in globalThis, false);
});

test("a recorder that falls silent on its own is not read as an opt-out", async () => {
  // Silence is the evidence this whole check runs on, so it is worth nothing
  // from a recorder that goes quiet unprompted. Reported, never passed.
  const result = await statusOf(RECORDS_ONCE);
  assert.equal(result.status, "undrivable", JSON.stringify(result));
  assert.match(result.detail, /repeatab/);
});

test("a module the driver cannot reach is reported, not passed", async () => {
  // Silence from a recorder that never ran is not evidence of anything. This
  // is the same control the browser-signals checker keeps, for the same
  // reason: without it, an unreachable module "passes".
  const result = await statusOf(`
    export function setUsageOptOut(value) { globalThis.__usageOptOut = Boolean(value); }
  `);
  assert.equal(result.status, "undrivable", JSON.stringify(result));
});

test("a plainly named switch is tried before an unrelated export that silences the recorder", async () => {
  // Candidates run in export order after the sort, and the first one that
  // silences the recorder decides the verdict. `hush` forgets on reload but is
  // exported first; the module is sound because `setUsageOptOut` persists.
  // Without the promised-names-first sort the unrelated export answers for it.
  const result = await statusOf(`
const KEY = "fixture-usage";
const OPT_OUT = "fixture-usage-opt-out";
function optedOut() {
  if (globalThis.__usageOptOut) return true;
  try { return localStorage.getItem(OPT_OUT) === "1"; } catch { return false; }
}
export function record(event) {
  if (typeof localStorage === "undefined" || optedOut()) return;
  localStorage.setItem(KEY, String((Number(localStorage.getItem(KEY)) || 0) + 1));
}
export function hush() { globalThis.__usageOptOut = true; }
export function setUsageOptOut(value) {
  globalThis.__usageOptOut = Boolean(value);
  if (value) localStorage.setItem(OPT_OUT, "1"); else localStorage.removeItem(OPT_OUT);
}
`);
  assert.equal(result.status, "pass", JSON.stringify(result));
  assert.match(result.via, /setUsageOptOut/);
});

test("a candidate that throws is skipped, not judged as a switch", async () => {
  // `disableUsage` flips the in-memory flag and then throws on every call
  // shape. Treating a throw as acceptance would fail the module on that
  // function's reload even though the real switch after it keeps the choice.
  const result = await statusOf(`
const KEY = "fixture-usage";
const OPT_OUT = "fixture-usage-opt-out";
function optedOut() {
  if (globalThis.__usageOptOut) return true;
  try { return localStorage.getItem(OPT_OUT) === "1"; } catch { return false; }
}
export function record(event) {
  if (typeof localStorage === "undefined" || optedOut()) return;
  localStorage.setItem(KEY, String((Number(localStorage.getItem(KEY)) || 0) + 1));
}
export function disableUsage() { globalThis.__usageOptOut = true; throw new Error("not a switch"); }
export function setUsageOptOut(value) {
  globalThis.__usageOptOut = Boolean(value);
  if (value) localStorage.setItem(OPT_OUT, "1"); else localStorage.removeItem(OPT_OUT);
}
`);
  assert.equal(result.status, "pass", JSON.stringify(result));
  assert.match(result.via, /setUsageOptOut/);
});

test("a check puts back a global it overwrote or deleted", async () => {
  // restoreGlobals must reinstate pre-existing globals a module changed, not
  // only delete the ones it added.
  globalThis.__optoutChanged = "original";
  globalThis.__optoutRemoved = "original";
  try {
    await statusOf(`
globalThis.__optoutChanged = "module";
delete globalThis.__optoutRemoved;
${REMEMBERS}`);
    assert.equal(globalThis.__optoutChanged, "original");
    assert.equal(globalThis.__optoutRemoved, "original");
  } finally {
    delete globalThis.__optoutChanged;
    delete globalThis.__optoutRemoved;
  }
});

test("an export named like a recorder is never tried as the switch", async () => {
  // Calling `countOptOut(true)` is what silences this module, but the name
  // puts it with the recorders `drive` itself calls. With it excluded the
  // module offers no switch (`no-switch`); letting it through would judge the
  // module on a function that is the recorder's own business.
  const result = await statusOf(`
const KEY = "fixture-usage";
export function record(event) {
  if (typeof localStorage === "undefined" || globalThis.__usageOptOut) return;
  localStorage.setItem(KEY, String((Number(localStorage.getItem(KEY)) || 0) + 1));
}
export function countOptOut(value) { if (value === true) globalThis.__usageOptOut = true; }
`);
  assert.equal(result.status, "no-switch", JSON.stringify(result));
});

test("a write to a key the control never saw is counting that resumed", async () => {
  // After the reload this recorder lands on a different key than the control
  // run did. The key is neither a measured counter nor the switch's own, so it
  // has to read as counting; only the switch's own bookkeeping is exempt.
  const result = await statusOf(`
const KEY = import.meta.url.includes("optout-reload") ? "fixture-reloaded" : "fixture-usage";
export function record(event) {
  if (typeof localStorage === "undefined" || globalThis.__usageOptOut) return;
  localStorage.setItem(KEY, String((Number(localStorage.getItem(KEY)) || 0) + 1));
}
export function setUsageOptOut(value) {
  globalThis.__usageOptOut = Boolean(value);
  if (value) localStorage.removeItem("fixture-usage");
}
`);
  assert.equal(result.status, "fail", JSON.stringify(result));
  assert.deepEqual(result.keys, ["fixture-reloaded"]);
});

test("a check puts back an accessor global the module replaced", async () => {
  // Same value (undefined) and same setter, different getter: the restore must
  // compare getters too, or a replaced accessor leaks into the next module.
  Object.defineProperty(globalThis, "__optoutAccessor", {
    get: () => "original", configurable: true,
  });
  try {
    await statusOf(`
Object.defineProperty(globalThis, "__optoutAccessor", { get: () => "module", configurable: true });
${REMEMBERS}`);
    assert.equal(globalThis.__optoutAccessor, "original");
  } finally {
    delete globalThis.__optoutAccessor;
  }
});

test("every venture that offers the switch keeps it across a reload", async () => {
  // The catalogue-wide assertion. 2026-09-12: 37 of the 69 ventures then
  // visible failed this, all of them keeping the choice only in
  // `globalThis.__usageOptOut`. Fixed in the same change that added this.
  // Behavioural switch discovery then raised the visible set from 69 to 93 --
  // 24 controls the first draft's name allowlist had filed as `no-switch`.
  const results = await checkAll();

  // `undrivable` counts as broken here, and the reason is the point. It means
  // the module offers a switch (or `no-switch` would have returned first) and
  // the driver could not reach its recorder -- so nothing was verified. The
  // unit test above insists an unreachable recorder is never silently
  // accepted; excluding it here would grant exactly that at catalogue scale.
  // A venture changing to a signature the driver cannot call would otherwise
  // drop out of the check while CI stayed green.
  const broken = results.filter((r) => r.status !== "pass" && r.status !== "no-switch");
  assert.deepEqual(
    broken.map((r) => `${r.name} [${r.status}]: ${r.detail ?? r.error ?? "not verified"}`),
    [],
    "an advertised usage opt-out is unverified or does not survive a reload",
  );

  // Every module offering a switch must have been driven -- no slack, because
  // slack is where a silently-dropped module hides. An earlier draft allowed
  // `>= 60` of today's 69, which would have let nine become unverifiable
  // without failing.
  const switched = results.filter((r) => r.status !== "no-switch");
  assert.equal(
    results.filter((r) => r.status === "pass").length,
    switched.length,
    "some module offering an opt-out was not verified",
  );
  // And the sweep must find exactly the subjects it found before. Not `>=`:
  // a lower bound buys back the slack it was meant to remove the moment the
  // catalogue grows past it. With a 94th switch added, a regression in
  // `ltl-freight-class-estimator`'s `clearUsage()` -- a real opt-out that is
  // found behaviourally and by nothing else -- would reclassify it as
  // `no-switch`, leave 93 modules passing, and keep a count green. A set
  // comparison names it instead: an addition elsewhere cannot hide it.
  //
  // Equality makes an addition update the list deliberately, which is the
  // point: the list is the claim about how much of the catalogue this guard
  // covers, and a claim that can drift is not one.
  const listed = listedSwitches();
  assert.deepEqual(
    listed,
    [...new Set(listed)].sort(),
    `${LIST_SELF} must be sorted with no repeats (sorted lines are what let ` +
      `two new ventures' additions merge cleanly): run python3 platform/ci/sync_tree_counts.py`,
  );
  const found = new Set(switched.map((r) => r.name));
  const have = new Set(listed);
  const added = [...found].filter((n) => !have.has(n)).sort();
  const gone = listed.filter((n) => !found.has(n));
  const deleted = gone.filter((n) => !existsSync(fileURLToPath(new URL(`../../${n}`, import.meta.url))));
  const stopped = gone.filter((n) => !deleted.includes(n));
  assert.deepEqual(
    { added, deleted, stopped },
    { added: [], deleted: [], stopped: [] },
    `the set of modules offering an opt-out differs from ${LIST_SELF}.\n` +
      `  added: a new switch (a venture graduating) -- add its line.\n` +
      `  deleted: the listed file is gone (venture removed or renamed) -- drop its line.\n` +
      `  python3 platform/ci/sync_tree_counts.py does both.\n` +
      `  stopped: the file exists but no longer offers a switch this guard can drive -- ` +
      `a regression: fix the module, not the list.`,
  );
});
