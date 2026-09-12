// The tests that matter here are the ones proving this checker can FAIL.
//
// A guard that accepts everything reads as coverage while proving nothing,
// and this one guards a promise: every venture offering "turn usage counting
// off" is telling the visitor their choice sticks. The catalogue-wide run at
// the bottom is only trustworthy because the fixtures above show the checker
// distinguishes a module that keeps the choice from one that forgets it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { checkModule, checkAll } from "./optout-persistence.mjs";

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
  // And the sweep must keep finding the subjects it found before. Zero of
  // zero passes vacuously, which is the shape this repository is worst at
  // noticing -- but the sharper risk is the one measured here: discovery
  // quietly narrowing, as the name allowlist did, and taking live controls
  // out of the check while it stays green. 93 today; raise this with the
  // catalogue, and never lower it without saying which switch went away.
  assert.ok(switched.length >= 93, `only ${switched.length} modules offer a switch`);
});
