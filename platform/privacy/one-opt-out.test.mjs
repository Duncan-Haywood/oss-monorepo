// A guard that cannot fail reads as coverage while proving nothing, so the
// fixtures come first and each one is a shape that actually shipped.
//
// The four below are the four real instances, reduced to the lines that
// mattered. They are written out here rather than read from git on purpose: a
// web session's clone is shallow, and a test pinned to a sha the clone lacks
// skips or fails for a reason that is not a regression -- the exact trap
// `platform/webcheck/history-blob.mjs` exists to handle. These are small
// enough to carry.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  checkSource, checkAll, optOutUsage, resolveKey, describe,
  checkPage, checkAllPages, checkOrder, checkAllPageOrders, describeOrder,
} from "./one-opt-out.mjs";

const ONE_KEY = `
const KEY = "widget-usage";
const OPT_OUT = "widget-usage-opt-out";
export function record(event) { if (localStorage.getItem(OPT_OUT) === "1") return; }
export function readOptOut(s) { return s.getItem(OPT_OUT) === "1"; }
export function writeOptOut(s, off) { if (off) s.setItem(OPT_OUT, "1"); else s.removeItem(OPT_OUT); }
`;

test("one key, one encoding, passes", () => {
  const result = checkSource(ONE_KEY);
  assert.equal(result.status, "pass");
  assert.deepEqual(result.keys, ["widget-usage-opt-out"]);
  assert.deepEqual(result.values, ["1"]);
});

test("a template key that resolves to the same string is one key, not two", () => {
  // `${KEY}-opt-out` and "widget-usage-opt-out" are the same flag. A check
  // that read them as two would fire on almost every module here and be
  // switched off within a day.
  const result = checkSource(`
    const KEY = "widget-usage";
    export function readOptOut(s) { return s.getItem(\`\${KEY}-opt-out\`) === "1"; }
    export function record() { if (localStorage.getItem("widget-usage-opt-out") === "1") return; }
  `);
  assert.equal(result.status, "pass", JSON.stringify(result));
  assert.deepEqual(result.keys, ["widget-usage-opt-out"]);
});

test("counter, draft and share keys are none of this check's business", () => {
  const result = checkSource(`
    const KEY = "widget-usage";
    const DRAFT = "widget-draft";
    const SHARE = "widget-share";
    export function record(e) { localStorage.setItem(KEY, e); localStorage.setItem(DRAFT, e); localStorage.getItem(SHARE); }
  `);
  assert.equal(result.status, "no-opt-out");
  assert.deepEqual(result.keys, []);
});

// --- the four that shipped -------------------------------------------------

test("tender-radar: a second key beside the one the recorder reads", () => {
  const result = checkSource(`
    const OPT_OUT = "tender-radar:opt-out";
    const KEY = "tender-radar:usage";
    export function enabled() { return localStorage.getItem(OPT_OUT) !== "1"; }
    export function readOptOut(s) { return s.getItem(\`\${KEY}-opt-out\`) === "1"; }
  `);
  assert.equal(result.status, "two-keys");
  assert.deepEqual(result.keys, ["tender-radar:opt-out", "tender-radar:usage-opt-out"]);
  assert.match(describe({ name: "x", ...result }), /can only ever set one of them/);
});

test("notary-trip-quote: the page's key and the generated pair's key", () => {
  const result = checkSource(`
    const KEY = "notary-trip-quote-usage";
    export function recordUsage(e) { if (localStorage.getItem("notary-trip-quote-optout") === "1") return; }
    export function readOptOut(s) { return s.getItem(\`\${KEY}-opt-out\`) === "1"; }
  `);
  assert.equal(result.status, "two-keys");
});

test("mcp-supply-chain-watch: an events key that is not the opt-out key", () => {
  const result = checkSource(`
    const STORAGE_KEY = "mcp-supply-chain-watch:usage-events";
    const OPT_OUT_KEY = "mcp-supply-chain-watch:usage-opt-out";
    export function isUsageCountingEnabled() { return localStorage.getItem(OPT_OUT_KEY) !== "1"; }
    export function readOptOut(s) { return s.getItem(\`\${STORAGE_KEY}-opt-out\`) === "1"; }
  `);
  assert.equal(result.status, "two-keys");
});

test("vendor-rate-break-even: one key, two encodings, which is the same failure", () => {
  // The subtle one, and the reason this check counts values as well as keys.
  // Both halves agree on where the choice lives and disagree on what it looks
  // like, so an existing opt-out is honoured by the recorder and invisible to
  // the control.
  const result = checkSource(`
    const countsKey = "vendor-rate-break-even-usage";
    const optOutKey = "vendor-rate-break-even-usage-opt-out";
    export function recordUsage() { if (store.getItem(optOutKey) === "true") return; }
    export function setUsageOptOut(v) { store.setItem(optOutKey, String(Boolean(v))); }
    export function readOptOut(s) { return s.getItem(\`\${countsKey}-opt-out\`) === "1"; }
  `);
  assert.equal(result.status, "two-encodings");
  assert.deepEqual(result.values, ["1", "true"]);
  assert.match(describe({ name: "x", ...result }), /invisible to the other/);
});

test("a computed written value is not counted, only what a reader accepts", () => {
  // `String(Boolean(v))` is not a literal, and guessing at it would report a
  // second encoding on a module that has one. What decides is what the
  // readers compare against, and every reader compares against a literal.
  const { values } = optOutUsage(`
    const optOutKey = "widget-usage-opt-out";
    export function setOptOut(v) { store.setItem(optOutKey, String(Boolean(v))); }
    export function readOptOut(s) { return s.getItem(optOutKey) === "true"; }
  `);
  assert.deepEqual(values, ["true"]);
});

test("an unresolvable key expression is kept as written, so two of them are two keys", () => {
  // Resolving is best-effort. The failure to avoid is two different unknown
  // expressions collapsing into one and reading as agreement.
  assert.equal(resolveKey("someFn()", {}), "someFn()");
  assert.equal(resolveKey("`${MISSING}-opt-out`", {}), "${MISSING}-opt-out");
  assert.equal(resolveKey("`${KEY}-opt-out`", { KEY: "w" }), "w-opt-out");
});

// --- the page layer -------------------------------------------------------

test("a page's script and the modules it loads are read as one unit", () => {
  // Three of the instances were `<script src="app.mjs">` pages: the second key
  // was in the module and the first was in the page, or the other way round,
  // and neither file on its own looked wrong. Reading only inline scripts
  // reported the whole catalogue clean while three pages carried two flags.
  const dir = mkdtempSync(join(tmpdir(), "one-opt-out-page-"));
  try {
    writeFileSync(join(dir, "app.mjs"), `
      const usagePreference = 'widget-usage-preference';
      localStorage.setItem(usagePreference, '1');
      localStorage.setItem('widget-disable', '1');
    `);
    writeFileSync(join(dir, "index.html"), `<script type="module" src="app.mjs"></script>`);
    const result = checkPage(join(dir, "index.html"));
    assert.equal(result.status, "two-keys", JSON.stringify(result));
    assert.deepEqual(result.keys, ["widget-disable", "widget-usage-preference"]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("inline JSON-LD is data, and its strings are not storage keys", () => {
  const dir = mkdtempSync(join(tmpdir(), "one-opt-out-jsonld-"));
  try {
    writeFileSync(join(dir, "index.html"), `
      <script type="application/ld+json">{"text":"localStorage.getItem('other-opt-out')"}</script>
      <script type="module">localStorage.getItem('widget-opt-out') === '1';</script>
    `);
    const result = checkPage(join(dir, "index.html"));
    assert.equal(result.status, "pass", JSON.stringify(result));
    assert.deepEqual(result.keys, ["widget-opt-out"]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("the restore must come before anything that counts", () => {
  // cut-list-optimizer and cash-runway-planner had exactly one key and still
  // lied: the restore was appended below the startup work, so a shared link
  // replayed and a page_viewed recorded while the control still showed its
  // default. One key is not enough if it is read too late.
  const late = `
    recordUsage('share-opens');
    const usagePreference = 'widget-usage-preference';
  `;
  const early = `
    const usagePreference = 'widget-usage-preference';
    recordUsage('share-opens');
  `;
  const flagged = checkOrder(late);
  assert.equal(flagged.status, "records-first");
  assert.equal(flagged.call, "recordUsage(");
  assert.equal(checkOrder(early).status, "pass");
  // A script with no restore is not this check's business, and must not read
  // as a pass either -- "nothing to check" and "checked and fine" are
  // different answers.
  assert.equal(checkOrder("recordUsage('x');").status, "no-restore");
});

test("every page restores the control before it counts, and spells it one way", () => {
  // 2026-09-12: 3 pages carried two keys and 11 restored too late, every one
  // of them from the page-level half of this change. The two assertions are
  // separate because they are separate failures -- one flag read at the wrong
  // time is as wrong as two flags.
  const keys = checkAllPages();
  assert.deepEqual(
    keys.filter((r) => r.status !== "pass" && r.status !== "no-opt-out").map(describe), []);

  const order = checkAllPageOrders();
  assert.deepEqual(
    order.filter((r) => r.status === "records-first").map(describeOrder), []);

  // And both must be reaching the catalogue rather than an empty list.
  assert.ok(keys.length > 900, `expected every venture page, read ${keys.length}`);
  assert.ok(
    keys.filter((r) => r.status === "pass").length > 300,
    "most pages do offer a control; if this drops, discovery broke, not the pages",
  );
  assert.ok(
    order.filter((r) => r.status === "pass").length > 10,
    "the ordering check must have pages to be about",
  );
});

test("every venture usage module spells the opt-out exactly one way", () => {
  // The catalogue assertion. 2026-09-12: four modules failed it, every one of
  // them a repair rather than original code -- a generated readOptOut pair
  // that invented a key or an encoding beside the one the venture already had.
  // The visitor-facing symptom is identical in all four: recording correctly
  // off, and the control saying the choice was forgotten.
  const results = checkAll();
  const broken = results.filter((r) => r.status !== "pass" && r.status !== "no-opt-out");
  assert.deepEqual(broken.map(describe), []);

  // And the check must be reaching the catalogue, not an empty list. A sweep
  // that found nothing would satisfy the assertion above.
  assert.ok(results.length > 200, `expected the whole catalogue, checked ${results.length}`);
  assert.ok(
    results.filter((r) => r.status === "pass").length > 200,
    "most modules do offer an opt-out; if this drops, discovery broke, not the catalogue",
  );
});
