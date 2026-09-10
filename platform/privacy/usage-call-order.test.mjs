// Most of what follows proves the checker can FAIL. A static check that
// accepts everything reports a clean run over ground it never examined, which
// is the failure `browser-signals.mjs` was written to close and the one this
// module would be most likely to repeat: the fleet is currently clean, so a
// checker that always returned `[]` would look exactly as healthy as this one.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  declaredFirstParameter,
  classifyArgument,
  callSites,
  findMismatches,
  report,
} from "./usage-call-order.mjs";

const STORAGE_FIRST = `
export function recordUsage(storage = globalThis.localStorage, optedOut = false, event = 'calculated') {
  if (optedOut || !storage) return;
  storage.setItem(event, '1');
}
`;

const EVENT_FIRST = `
export function recordUsage(event, optedOut = false, storage = globalThis.localStorage) {
  if (optedOut || !storage) return;
  storage.setItem(event, '1');
}
`;

let counter = 0;
function venture(usageSource, pageSource, usageName = "usage.mjs") {
  const root = mkdtempSync(join(tmpdir(), `usage-order-${counter++}-`));
  const dir = join(root, "a-calculator");
  mkdirSync(dir);
  writeFileSync(join(dir, usageName), usageSource);
  writeFileSync(join(dir, "index.html"), pageSource);
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test("reads whichever parameter a venture declares first", () => {
  assert.equal(declaredFirstParameter(STORAGE_FIRST), "storage");
  assert.equal(declaredFirstParameter(EVENT_FIRST), "event");
  assert.equal(declaredFirstParameter("export function other() {}"), null);
});

test("classifies a call site's first argument, and admits when it cannot", () => {
  assert.equal(classifyArgument("'link_copied'"), "event");
  assert.equal(classifyArgument('"bid_calculated"'), "event");
  assert.equal(classifyArgument("localStorage"), "storage");
  assert.equal(classifyArgument("window.sessionStorage"), "storage");
  assert.equal(classifyArgument("event"), "event");
  // Unclassifiable stays unclassifiable rather than guessing. A wrong
  // accusation here is worse than a miss: it teaches the next reader to skip
  // the output.
  assert.equal(classifyArgument("args[0]"), null);
  assert.equal(classifyArgument("pick()"), null);
});

test("finds every call site, including several on one page", () => {
  const sites = callSites(`
    recordUsage('a', x);
    recordUsage(localStorage, y, 'b');
    recordUsage( 'c' );
  `);
  assert.deepEqual(sites.map((s) => s.kind), ["event", "storage", "event"]);
});

test("catches the exact defect this exists for: sibling order in a minority venture", () => {
  const { root, cleanup } = venture(
    EVENT_FIRST,
    `<script type="module">recordUsage(localStorage, optedOut, 'link_copied');</script>`,
  );
  try {
    const findings = findMismatches(root);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].declared, "event");
    assert.equal(findings[0].passed, "storage");
    assert.match(report(findings), /silently never recorded/);
  } finally {
    cleanup();
  }
});

test("catches the mirror-image defect too", () => {
  const { root, cleanup } = venture(
    STORAGE_FIRST,
    `<script type="module">recordUsage('link_copied', optedOut);</script>`,
  );
  try {
    const findings = findMismatches(root);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].declared, "storage");
    assert.equal(findings[0].passed, "event");
  } finally {
    cleanup();
  }
});

test("does not accuse a venture that calls its own signature correctly", () => {
  for (const [usage, call] of [
    [STORAGE_FIRST, "recordUsage(localStorage, optedOut, 'link_copied')"],
    [EVENT_FIRST, "recordUsage('link_copied', optedOut)"],
    // A wrapper forwarding a loop variable named `event` is the common shape
    // across the 143 and must stay clean under both spellings.
    [STORAGE_FIRST, "const count = (event) => recordUsage(localStorage, optedOut(), event)"],
  ]) {
    const { root, cleanup } = venture(usage, `<script type="module">${call};</script>`);
    try {
      assert.deepEqual(findMismatches(root), [], call);
    } finally {
      cleanup();
    }
  }
});

test("reads a CommonJS usage.js the same way, since a handful of ventures ship one", () => {
  const { root, cleanup } = venture(
    EVENT_FIRST,
    `<script>recordUsage(localStorage, false, 'x');</script>`,
    "usage.js",
  );
  try {
    assert.equal(findMismatches(root).length, 1);
  } finally {
    cleanup();
  }
});

test("the shipped catalogue calls recordUsage the way each venture declares it", () => {
  const findings = findMismatches();
  assert.deepEqual(findings, [], report(findings));
});
