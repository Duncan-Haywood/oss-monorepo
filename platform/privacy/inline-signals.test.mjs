// The tests that matter here are the ones proving this checker can FAIL.
//
// A static check that accepts everything is worse than no check: it reports a
// clean run over ground it never examined, which is the precise failure this
// module was written to close in `browser-signals.mjs`. So most of what
// follows feeds it counters that are genuinely unguarded and asserts it says
// so -- including the exact shape the behavioural checker warns about, a
// signal read into a variable that nothing branches on.
//
// Three of these caught real bugs while the checker was being written:
// widening past the enclosing function let a sibling's signal read vouch for a
// writer; a body-extent off-by-one made every predicate look like a writer too
// and deleted it from the predicate set; and the first branch test missed the
// braceless minified form entirely.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  checkInlinePage,
  checkAllInline,
  findInlineUsagePages,
  claimsUsageCounter,
} from "./inline-signals.mjs";
import { findUsageModules } from "./browser-signals.mjs";

const REPO_ROOT = new URL("../../", import.meta.url).pathname;
const VENTURES = join(REPO_ROOT, "ventures");

/** Build a throwaway venture and return the path to its index.html. */
function venture(files) {
  const root = mkdtempSync(join(tmpdir(), "inline-signals-"));
  const dir = join(root, "ventures", "probe");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "VENTURE.yaml"), "slug: probe\n");
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body);
  return {
    page: join(dir, "index.html"),
    root: join(root, "ventures"),
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

const page = (script) => `<!doctype html><title>p</title><main></main><script>${script}</script>`;

test("a signal read that nothing branches on is unguarded", () => {
  // The exact failure browser-signals.mjs names: "a module can read it into a
  // variable it never branches on".
  const v = venture({
    "index.html": page(`
      const blocked = navigator.globalPrivacyControl;
      const track = (event) => {
        localStorage.setItem('probe:' + event, '1');
      };
    `),
  });
  try {
    assert.equal(checkInlinePage(v.page).status, "unguarded");
  } finally { v.cleanup(); }
});

test("a signal checked only AFTER the write is unguarded", () => {
  const v = venture({
    "index.html": page(`
      const track = (event) => {
        localStorage.setItem('probe:' + event, '1');
        if (navigator.doNotTrack) console.log('too late');
      };
    `),
  });
  try {
    assert.equal(checkInlinePage(v.page).status, "unguarded");
  } finally { v.cleanup(); }
});

test("a signal read in a sibling function does not cover the writer", () => {
  const v = venture({
    "index.html": page(`
      const banner = () => navigator.doNotTrack ? 'private' : 'normal';
      const track = (event) => { localStorage.setItem('probe:' + event, '1'); };
    `),
  });
  try {
    assert.equal(checkInlinePage(v.page).status, "unguarded");
  } finally { v.cleanup(); }
});

test("a captured signal that is referenced but not branched on is unguarded", () => {
  // Accepting `const privacySignal = navigator.doNotTrack === '1' || ...` as a
  // way of consulting the signal is what lets chargeback-evidence-packet pass.
  // This is the hole that widening could have opened: the alias is mentioned
  // inside the writing function and nothing branches on it.
  const v = venture({
    "index.html": page(`
      const blocked = navigator.doNotTrack === '1';
      const track = (event) => {
        const note = blocked;
        localStorage.setItem('probe:' + event, note);
      };
    `),
  });
  try {
    assert.equal(checkInlinePage(v.page).status, "unguarded");
  } finally { v.cleanup(); }
});

test("an unguarded writer is not rescued by an unrelated predicate", () => {
  // The indirection rule must not become a back door: a predicate that exists
  // but never guards the writer leaves the venture unguarded.
  const v = venture({
    "index.html": page(`
      const store = (key) => { localStorage.setItem(key, '1'); };
      const countable = () => !navigator.doNotTrack;
      const bump = (key) => { store(key); };
    `),
  });
  try {
    assert.equal(checkInlinePage(v.page).status, "unguarded");
  } finally { v.cleanup(); }
});

test("test files cannot satisfy the check on an implementation's behalf", () => {
  // A test asserting about doNotTrack would otherwise make an inert
  // implementation look guarded. The invariant is that it cannot produce a
  // `pass` -- not which non-pass status it lands on. An ungated write and a
  // draft-saving write are the same shape in source, and what separates them
  // is the page's own promise, which `claimsUsageCounter` reads.
  const v = venture({
    "index.html": page(`const track = (e) => { localStorage.setItem(e, '1'); };`),
    "usage-guard.test.mjs": `assert.ok(navigator.doNotTrack); localStorage.setItem('x','1');`,
  });
  try {
    assert.notEqual(checkInlinePage(v.page).status, "pass");
  } finally { v.cleanup(); }
});

test("a page that promises a counter but reads no signal fails coverage", () => {
  const v = venture({
    "index.html": page(`const track = (e) => { localStorage.setItem(e, '1'); };`)
      .replace("<main></main>", "<main><p>Anonymous local usage counts stay on this device.</p></main>"),
  });
  try {
    assert.ok(claimsUsageCounter(v.page));
    assert.notEqual(checkInlinePage(v.page).status, "pass");
  } finally { v.cleanup(); }
});

// ---------------------------------------------------------------------------
// The shapes that must pass, one per spelling in use across the catalogue.

test("an early return on the signal passes", () => {
  const v = venture({
    "index.html": page(`
      const track = (event) => {
        if (navigator.doNotTrack || navigator.globalPrivacyControl) return;
        try { localStorage.setItem('probe:' + event, '1'); } catch {}
      };
    `),
  });
  try {
    const result = checkInlinePage(v.page);
    assert.equal(result.status, "pass");
    assert.equal(result.signal, "doNotTrack");
  } finally { v.cleanup(); }
});

test("a guard outside a try block still passes", () => {
  // The regression that made 10 of 11 real ventures look unguarded: the
  // innermost block around the write is the `try`, not the function.
  const v = venture({
    "index.html": page(`
      const track = (event) => {
        if (navigator.globalPrivacyControl) return;
        try {
          const key = 'probe';
          localStorage.setItem(key, '1');
        } catch { }
      };
    `),
  });
  try {
    assert.equal(checkInlinePage(v.page).status, "pass");
  } finally { v.cleanup(); }
});

test("a braceless minified `if (cond) write()` passes", () => {
  // cam-reconciliation-check ships its whole script on one line in this shape.
  const v = venture({
    "index.html": page(
      `const count=key=>{if($('usage').checked&&!navigator.doNotTrack&&!navigator.globalPrivacyControl)localStorage.setItem(key,'1');};`,
    ),
  });
  try {
    assert.equal(checkInlinePage(v.page).status, "pass");
  } finally { v.cleanup(); }
});

test("a predicate call guarding the write in the same function passes", () => {
  // construction-evidence-log and commercial-photo-license-calculator.
  const v = venture({
    "index.html": page(`
      function usageAllowed() {
        if (navigator.doNotTrack === '1' || navigator.globalPrivacyControl) return false;
        return true;
      }
      function event(name) {
        if (!usageAllowed()) return;
        try { localStorage.setItem('probe-usage', name); } catch (_) {}
      }
    `),
  });
  try {
    assert.equal(checkInlinePage(v.page).status, "pass");
  } finally { v.cleanup(); }
});

test("a captured signal that IS branched on passes", () => {
  // chargeback-evidence-packet.
  const v = venture({
    "index.html": page(`
      const privacySignal = navigator.doNotTrack === '1' || navigator.globalPrivacyControl === true;
      function event(name){ if(!privacySignal){ localStorage.setItem('k', name); } }
    `),
  });
  try {
    assert.equal(checkInlinePage(v.page).status, "pass");
  } finally { v.cleanup(); }
});

test("a signal-reading predicate guarding a separate writer passes", () => {
  // cash-runway-planner's shape, and the one indirect form this understands.
  const v = venture({
    "index.html": page("import './app.mjs';"),
    "app.mjs": `
      const store = (key, value) => { try { localStorage.setItem(key, value); } catch {} };
      const countable = () => usage.checked && !navigator.doNotTrack && !navigator.globalPrivacyControl;
      const bump = (key) => { if (countable()) store(key, '1'); };
    `,
  });
  try {
    const result = checkInlinePage(v.page);
    assert.equal(result.status, "pass");
    assert.equal(result.via, "predicate");
  } finally { v.cleanup(); }
});

test("saving the visitor's own draft is not a usage counter", () => {
  // A venture that stores the user's work locally and keeps no counter must
  // not be required to gate that write on DNT -- it is the user's data, held
  // for the user. This is the false positive that would push ventures to break
  // a feature to satisfy a privacy check.
  const v = venture({
    "index.html": page(`
      const save = (state) => { localStorage.setItem('probe-state', JSON.stringify(state)); };
    `),
  });
  try {
    assert.equal(checkInlinePage(v.page).status, "no-counter");
  } finally { v.cleanup(); }
});

test("ventures with a usage module are left to browser-signals.mjs", () => {
  const v = venture({
    "index.html": page("import './usage.mjs';"),
    "usage.mjs": "export const record = () => {};",
  });
  try {
    assert.deepEqual(findInlineUsagePages(v.root), []);
  } finally { v.cleanup(); }
});

// ---------------------------------------------------------------------------
// The real tree.

test("every inline usage counter in the repo branches on a signal", () => {
  const unguarded = checkAllInline().filter((r) => r.status === "unguarded");
  assert.deepEqual(
    unguarded.map((r) => r.name),
    [],
    "these pages write a usage count without consulting Do Not Track or " +
      "Global Privacy Control first, breaking the promise their own footer makes",
  );
});

test("no venture making the usage-counter promise is unchecked by either half", () => {
  // The coverage assertion, and the reason this file exists. `browser-signals`
  // checks modules; this file checks inline counters. A venture that makes the
  // footer promise and falls into neither set is exactly the silent skip that
  // let 11 ventures go unverified -- so growing that set has to fail loudly
  // rather than quietly widen the gap again.
  const withModule = new Set(
    findUsageModules(VENTURES).map((p) => p.slice(0, p.lastIndexOf("/"))),
  );
  const inline = new Map(
    checkAllInline().map((r) => {
      const full = join(REPO_ROOT, r.name);
      return [full.slice(0, full.lastIndexOf("/")), r];
    }),
  );

  const uncovered = [];
  for (const pagePath of findInlineUsagePages()) {
    const dir = pagePath.slice(0, pagePath.lastIndexOf("/"));
    if (withModule.has(dir)) continue;
    if (!claimsUsageCounter(pagePath)) continue;
    const verdict = inline.get(dir);
    if (!verdict || verdict.status !== "pass") uncovered.push(pagePath.replace(REPO_ROOT, ""));
  }
  assert.deepEqual(
    uncovered,
    [],
    "these pages tell the visitor a usage counter exists, but neither the " +
      "behavioural module check nor the inline structural check verifies it",
  );
});

test("the inline half actually covers the ventures it was written for", () => {
  // A guard against the check quietly becoming a no-op: if a refactor made
  // findInlineUsagePages() return nothing, every assertion above would still
  // pass vacuously.
  const pages = findInlineUsagePages();
  assert.ok(
    pages.length >= 10,
    `expected the inline half to cover the ventures without a usage module, found ${pages.length}`,
  );
  const passed = checkAllInline().filter((r) => r.status === "pass");
  assert.ok(passed.length >= 10, `expected inline counters to be verified, got ${passed.length}`);
});

// Red-team 2026-10-18: boundary cases the mutation campaign showed nothing pinned.

test("a signal read at the very first character of a script file still guards a top-level write", () => {
  const v = venture({
    "index.html": "<!doctype html><title>p</title><main></main>",
    "app.js": "doNotTrack?0:localStorage.setItem('probe-usage','1');",
  });
  try {
    assert.equal(checkInlinePage(v.page).status, "pass");
  } finally { v.cleanup(); }
});

test("a predicate whose braced body opens with the signal read is still a predicate", () => {
  const v = venture({
    "index.html": page(`
      const countable = () => {doNotTrack; return true;};
      function store(k) { try { localStorage.setItem(k, '1'); } catch (_) {} }
      function bump(k) { if (countable()) store(k); }
    `),
  });
  try {
    assert.equal(checkInlinePage(v.page).status, "pass");
  } finally { v.cleanup(); }
});

test("an expression-bodied predicate ends at its own semicolon, not after a nested block", () => {
  // Overrunning the body makes the predicate look like a writer too, and the
  // self-vouching guard then drops it, so a correctly gated counter fails.
  const v = venture({
    "index.html": page(`
      const countable = () => [1].some((x) => { return x; }) && !navigator.doNotTrack;
      function store(k) { try { localStorage.setItem(k, '1'); } catch (_) {} }
      function bump(k) { if (countable()) store(k); }
    `),
  });
  try {
    assert.equal(checkInlinePage(v.page).status, "pass");
  } finally { v.cleanup(); }
});

test("the CLI exits 0 when every inline counter is gated", () => {
  const run = spawnSync(process.execPath, [new URL("./inline-signals.mjs", import.meta.url).pathname], {
    encoding: "utf8",
  });
  assert.equal(run.status, 0, run.stderr);
});
