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
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { checkModule, checkAll } from "./optout-persistence.mjs";

// This file's own repo-relative path, so the catalogue test's failure message
// can quote a runnable `git log` rather than a path typed out by hand -- the
// kind of restatement that survives a rename and then sends the next reader
// to a file that is not there.
const RELATIVE_SELF = relative(
  join(fileURLToPath(new URL(".", import.meta.url)), "..", ".."),
  fileURLToPath(import.meta.url),
);

// How many venture usage modules offer an in-page way to turn counting off,
// measured 2026-09-12. Every one of them must keep the choice across a
// reload, and the count itself is pinned -- see the catalogue test at the
// bottom for why a lower bound is not enough.
//
// It went 69 -> 93 when discovery stopped using a name allowlist, and 93 ->
// 254 when the page-level repair gave 161 more modules a `writeOptOut` the
// recorder itself consults. That last jump is the point of the pinned count
// rather than an embarrassment to it: a number that moves by 161 is a claim
// worth restating deliberately, and the assertion made me restate it.
// 254 -> 255 on 2026-09-13, when `obsidian-plugin-review-check` (#4663)
// merged with a `usage.mjs` opt-out following the same working pattern as
// its sibling ventures -- missed by #4665's fix for this same venture's
// other CI gap (the missing venture-scores.yaml row), which didn't touch
// this file, so main stayed red here until now.
// 255 -> 256 on 2026-09-13, when `caption-quality-check` shipped with a
// `usage.mjs` following the same `readOptOut`/`writeOptOut` pattern as
// redirect-chain-check and its siblings.
// 256 -> 257 on 2026-09-11 (missed at the time), when
// `process-server-fee-calculator` graduated with a `usage.mjs` opt-out
// following the same `readOptOut`/`writeOptOut` pattern as its siblings --
// its own PR touched venture-scores.yaml, publish-surface.yaml and the
// front-door mirror but not this file, so main stayed red here by one until
// this comment was written, same shape as the obsidian-plugin-review-check
// miss above.
// 257 -> 258 on 2026-09-16, when `pdf-accessibility-tag-check` graduated
// with a `usage.mjs` copying the same `readOptOut`/`writeOptOut` pattern
// (via cors-misconfig-check's usage.mjs, keyed under its own storage name).
// 258 -> 259 on 2026-09-16, when `process-server-fee-calculator` (#4720)
// graduated with a `usage.mjs` opt-out. That merge left `main` red here --
// the same shape as the 254 -> 255 entry above, and for the same reason: the
// venture's own suite is green, and nothing in a new venture's diff points at
// this file. Found by a session that merged `main` into its branch and re-ran
// the checklist, not by CI, which is starved.
// One thing that entry is worth keeping separate from the others: it is the
// first addition here that does NOT copy the `readOptOut`/`writeOptOut` pair.
// It spells the same switch `usageAllowed`/`toggleUsage`, persisting an
// `...-usage-opt-out` key in `localStorage`. Behavioural discovery found it
// regardless, which is the argument for behavioural discovery -- the name
// allowlist this file started with would have filed it `no-switch` and left a
// real opt-out unverified while the count still read as full coverage.
// 259 -> 260 on 2026-09-16, when `photo-addon-pricing-calculator` graduated
// with a `usage.mjs` opt-out following the same `readOptOut`/`writeOptOut`
// pattern as its siblings.
// 260 -> 261 on 2026-09-16, when `security-txt-check` graduated with the same
// `readOptOut`/`writeOptOut` pair. Worth one line on why that switch matters
// more than most on this particular page: the tool reads a file naming a
// company's disclosure contact, so a list of which sites someone is checking
// is itself sensitive. Nothing is uploaded either way -- the counters are
// local and record only an event name and a day -- but the opt-out is the
// visitor's own control over even that, and it has to survive a reload to
// mean anything.
// 261 -> 262 on 2026-09-16, when `agent-instructions-drift-check` graduated
// with a `setUsageOptOut`/`usageOptedOut` switch -- named differently from
// the `readOptOut`/`writeOptOut` siblings but discovered the same way
// (behaviourally: does the switch's state survive a reload), which is the
// point of not using a name allowlist here.
// 262 -> 263 on 2026-09-16, when `hoa-reserve-fund-calculator` graduated
// with its own `toggleUsage`/`usageAllowed` opt-out switch, same discovery
// method as the rest of this running count.
// 263 -> 264 on 2026-09-16, when `overtime-pay-calculator` graduated with a
// `usage.mjs` opt-out following the same `readOptOut`/`writeOptOut` pattern
// as its siblings.
// 264 -> 265 on 2026-09-16, when `cron-dst-drift-check` graduated with its
// own `setUsageOptOut`/`usageOptedOut` switch (opts out of the
// `schedule_checked`/`drift_checked`/`example_loaded` counters), same
// discovery method as the rest of this running count.
// 265 -> 266 on 2026-09-16, when `bridal-hair-makeup-pricing-calculator`
// graduated with its own `toggleUsage`/`usageAllowed` switch (the same pair
// `hoa-reserve-fund-calculator` uses), same discovery method as the rest of
// this running count. Recorded a run late: #4766 and #4758 were open at the
// same time and each raised the constant by one against a base where the
// other had not landed, so the pair of graduations only moved it once. The
// count is a property of the tree, not of either diff -- which is why this
// check reads the catalogue and does not trust the number, and why the fix
// is one line here rather than anything in either venture.
// 266 -> 267 on 2026-09-16, when `sql-migration-lock-check` graduated with a
// `setUsageOptOut`/`usageOptedOut` switch (opts out of the
// `check_run`/`example_loaded` counters), same discovery method as the rest
// of this running count.
// 267 -> 268 on 2026-09-16, when `sbom-diff-check` graduated with its own
// `setUsageOptOut`/`usageOptedOut` switch (opts out of the
// `diff_run`/`example_loaded` counters), same discovery method as the rest
// of this running count.
// 268 -> 269 on 2026-09-16, when `commissary-kitchen-cost-split-calculator`
// graduated with its own `toggleUsage`/`usageAllowed` switch (the same pair
// `hoa-reserve-fund-calculator` and `bridal-hair-makeup-pricing-calculator`
// use), same discovery method as the rest of this running count.
// 269 -> 270 on 2026-09-16, when `backflow-test-fee-calculator` graduated
// with its own `setUsageOptOut`/`usageOptedOut` switch (the same
// `record`/`readUsage` pattern `overtime-pay-calculator` uses), same
// discovery method as the rest of this running count.
// 270 -> 271 on 2026-09-16, when `land-survey-bid-calculator` graduated with
// its own `toggleUsage`/`usageAllowed` switch (the same pair
// `hoa-reserve-fund-calculator` and `bridal-hair-makeup-pricing-calculator`
// use), same discovery method as the rest of this running count.
const SWITCHES_IN_THE_CATALOGUE = 271;

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
  // `no-switch`, leave 93 modules passing, and keep this assertion green.
  //
  // Equality makes an addition update the number deliberately, which is the
  // point: the count is the claim about how much of the catalogue this guard
  // covers, and a claim that can drift is not one. If this fails after you
  // added a venture, raise it. If it fails and you added nothing, a switch
  // stopped being a switch -- find out which before touching this line.
  //
  // The message names the repair because the bare number does not. Five
  // ventures have now graduated without bumping this line, and #4667 was a
  // whole PR spent rediscovering that a count moving up by one after a
  // venture addition is a one-line edit. The archaeology is what costs, not
  // the fix -- and a failure that has to be re-derived every time is one that
  // eventually gets waved through. The comment block above records *what*
  // happened each time; this records *how to find out* which it was.
  assert.equal(
    switched.length,
    SWITCHES_IN_THE_CATALOGUE,
    `the set of modules offering an opt-out changed: found ${switched.length}, ` +
      `this file pins ${SWITCHES_IN_THE_CATALOGUE}. Name what moved before ` +
      `editing the constant:\n` +
      `  git log -1 --format=%h -G'SWITCHES_IN_THE_CATALOGUE = [0-9]' -- ${RELATIVE_SELF}\n` +
      `  git diff --name-status <that-commit> HEAD -- 'ventures/*/usage.mjs' 'ventures/*/usage.js'\n` +
      `One 'A' line per unit of increase is a venture graduating: raise the ` +
      `constant and note it above. Anything else -- a decrease, or a rise no ` +
      `addition accounts for -- means a switch stopped being a switch, and ` +
      `the constant is not what needs changing.`,
  );
});
