// The other half of the Do Not Track / Global Privacy Control promise.
//
// `browser-signals.mjs` drives every `usage.mjs` / `usage.js` module under
// `ventures/` and proves it actually *acts* on the two signals its venture's
// footer names. It finds its subjects by filename, and its own comment says
// why that was already a near-miss: a handful of ventures ship the tracker as
// `usage.js` instead, and CLAUDE.md records what a filename convention nobody
// enforced has cost this repository twice.
//
// It is still a near-miss. Measured 2026-09-05: **11 ventures make the footer
// promise and have no usage module at all**, because they implement the
// counter inline -- inside the page's own `<script>`, or in the venture's
// `app.mjs`. `findUsageModules()` cannot see them, so the suite that exists to
// hold the portfolio's central privacy claim silently skips a fifteenth of the
// catalogue and reports a clean run. That is the exact shape CLAUDE.md warns
// about: a test nobody runs is worth less than no test, because it also tells
// the next session the ground is covered.
//
//   cam-reconciliation-check             change-order-margin-calculator
//   cash-runway-planner                  chargeback-evidence-packet
//   commercial-photo-license-calculator  construction-evidence-log
//   dns-configuration-evidence           freelance-retainer-calculator
//   grant-reporting-tracker              tender-bid-readiness
//   which-job-first
//
// All 11 turned out to be correctly gated. They were unverified, not broken.
//
// ## Why this checks structure instead of driving the code
//
// `browser-signals.mjs` is behavioural on purpose, and it is right that
// behaviour is the stronger evidence: "reading `globalPrivacyControl` proves
// nothing; a module can read it into a variable it never branches on."
//
// An inline tracker cannot be driven the same way. It is not importable, and
// it is closed over the page's DOM -- `which-job-first`'s recorder opens with
// `if (!$('usage').checked || ...)`, so calling it needs a document, an
// element with that id, and the rest of the page's initialisation. Standing up
// a DOM for 11 pages to test six lines each would be slower than the whole
// existing suite and would fail for reasons that have nothing to do with
// privacy.
//
// So this takes the weaker evidence deliberately, and takes the *strongest*
// weak evidence available rather than a grep. The failure mode the behavioural
// check guards against -- a signal read that nothing branches on -- is
// structural, and structure is exactly what can be read from source without
// running it. This asserts that the signal is consulted **before** the write,
// with a branch between them. A variable assigned and ignored does not satisfy
// that; neither does a signal read in a sibling function, nor one read after
// the counter has already been incremented.
//
// Five spellings are accepted because five are in use: an early return, a
// wrapping conditional, a braceless minified `if (cond) write()`, a predicate
// call (`usageAllowed()`), and a captured const (`privacySignal`). Every one
// of those indirections still has to be *branched on*, so none of them is a
// back door.
//
// What it cannot see: a guard chained more than two hops, or one assembled
// dynamically. Those return `unguarded` rather than passing, so the error is
// toward a false alarm a human resolves, never toward a silent pass. No
// venture is in that shape today; if one arrives, widen this deliberately
// rather than loosening what the direct check asserts.

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const REPO_ROOT = new URL("../../", import.meta.url).pathname;
const VENTURES = join(REPO_ROOT, "ventures");

// The same two signals `browser-signals.mjs` drives, and the same two the
// footers name. Kept as a literal here rather than imported because that
// module's copy is a list of *navigator states* to install, and this one is a
// list of *identifiers to find in source*. Same promise, different shape.
const SIGNAL_NAMES = ["doNotTrack", "globalPrivacyControl"];

// A write to `localStorage` is not by itself a usage counter. Every one of
// these ventures also saves the visitor's own draft so it survives a reload,
// and that write must NOT be suppressed under DNT -- it is the user's data,
// held for the user, on the user's machine. Requiring a signal guard on it
// would be asking ventures to break a feature to satisfy a privacy check.
//
// So a function is only treated as a tracker when it both writes to storage
// and consults a signal. A `save()` that does neither is correctly ignored.
const WRITE = "localStorage.setItem";

// How far out to widen from the write before giving up. A tracker's guard sits
// one or two blocks out (`try {` inside the recorder, occasionally an `if`
// inside that). Ten is far past anything these ventures do and stops a
// pathological file from walking to the top of the page.
const MAX_ENCLOSING_BLOCKS = 10;

export function findInlineUsagePages(root = VENTURES) {
  const found = [];
  for (const slug of readdirSync(root).sort()) {
    const dir = join(root, slug);
    if (!statSync(dir).isDirectory()) continue;
    if (!existsSync(join(dir, "VENTURE.yaml"))) continue;
    if (!existsSync(join(dir, "index.html"))) continue;
    // A venture with a usage module is `browser-signals.mjs`'s subject, and
    // driving it there is strictly better evidence than reading it here.
    if (existsSync(join(dir, "usage.mjs")) || existsSync(join(dir, "usage.js"))) continue;
    found.push(join(dir, "index.html"));
  }
  return found;
}

// The tracker does not have to live in the page. `cash-runway-planner` keeps
// it in `app.mjs`, which the page loads as a module -- so read the page and
// its sibling non-test scripts as one body of source. Test files are excluded
// deliberately: a test that *asserts* about `doNotTrack` would otherwise
// satisfy this check on behalf of an implementation that does nothing.
export function sourcesFor(pagePath) {
  const dir = pagePath.slice(0, pagePath.lastIndexOf("/"));
  const sources = [{ file: pagePath, text: readFileSync(pagePath, "utf8") }];
  for (const entry of readdirSync(dir).sort()) {
    if (!/\.(mjs|js)$/.test(entry)) continue;
    if (/\.test\.(mjs|js)$/.test(entry)) continue;
    sources.push({ file: join(dir, entry), text: readFileSync(join(dir, entry), "utf8") });
  }
  return sources;
}

// Walk backwards from an offset to the opening brace of the innermost block
// that encloses it. Returns the index just after that brace.
//
// This is not a JavaScript parser and does not need to be. The question is
// only "what text precedes this write, inside the thing that contains it",
// and brace balance answers that for every shape these ventures actually use.
function enclosingBodyStart(text, offset) {
  let depth = 0;
  for (let i = offset; i >= 0; i -= 1) {
    const ch = text[i];
    if (ch === "}") depth += 1;
    else if (ch === "{") {
      if (depth === 0) return i + 1;
      depth -= 1;
    }
  }
  return 0;
}

// Is the block opening at `bodyStart` a function body rather than a `try`,
// `if` or loop block? Read backwards from the brace: an arrow's `=>`, or a
// parameter list belonging to `function`/a method, marks one.
function isFunctionBody(text, bodyStart) {
  const head = text.slice(Math.max(0, bodyStart - 200), bodyStart - 1);
  if (/=>\s*$/.test(head)) return true;
  if (/\bfunction\b[^(){}]*\([^()]*\)\s*$/.test(head)) return true;
  return false;
}

function enclosingBodyEnd(text, offset) {
  let depth = 0;
  for (let i = offset; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      if (depth === 0) return i;
      depth -= 1;
    }
  }
  return text.length;
}

/**
 * Does `prefix` -- the source between the start of the writing function and
 * the write itself -- actually branch on a signal?
 *
 * A `marker` is any spelling of "the signal is consulted here": the signal
 * identifier itself, a predicate call that reads it (`usageAllowed()`), or a
 * const the venture captured it into (`privacySignal`). All three are the same
 * assertion, and the branch requirement applies identically to each -- which is
 * what keeps the const spelling from becoming the read-into-a-variable-nothing-
 * branches-on hole this module exists to close. The variable has to be branched
 * on, here, before the write.
 *
 * Requiring the marker is not enough; that is the grep this module exists not
 * to be. Requiring a branch too is what rules out the assigned-and-ignored
 * read. The accepted forms are the ones these ventures use:
 *
 *     if (navigator.doNotTrack || ...) return;      // early return
 *     if (!optedOut && !navigator.doNotTrack) {     // wrapping conditional
 *     const on = !navigator.globalPrivacyControl ? ... :             // ternary
 *     if (...&&!navigator.doNotTrack)localStorage.setItem(...)       // minified
 */
function branchesOnSignal(prefix, markers = SIGNAL_NAMES) {
  let signal = null;
  let at = Infinity;
  for (const marker of markers) {
    const found = prefix.indexOf(marker);
    if (found !== -1 && found < at) {
      at = found;
      signal = marker;
    }
  }
  if (!signal) return null;
  const after = prefix.slice(at);
  // A branch has to exist *between* consulting the signal and doing the write.
  if (/\breturn\b/.test(after) || /\)\s*\{/.test(after) || /[?]/.test(after)) return signal;
  // `if (cond) doTheWrite();` with no braces -- the form a minified page uses.
  // `cam-reconciliation-check` ships its whole script on one line as
  // `if($('usage').checked&&!navigator.doNotTrack&&...)localStorage.setItem(...)`,
  // which is a correctly gated counter that the forms above do not match. The
  // condition's closing paren immediately preceding the write is the branch.
  if (/\)\s*$/.test(after)) return signal;
  return null;
}

// The source of one function definition, and only that one.
//
// `enclosingBodyEnd` expects an offset already *inside* a body; handed an
// offset before the opening brace its depth accounting is off by one and the
// "body" runs to the end of the file. That is not a cosmetic slip: an
// over-long body makes every predicate look like a writer too, and the
// self-vouching guard in `namedFunctions` then deletes it from the predicate
// set, so a correctly guarded venture reads as unguarded. Both real ventures
// that use the predicate shape failed exactly that way.
//
// Two body shapes to handle: a braced block, and an arrow with an expression
// body (`const countable = () => a && !navigator.doNotTrack;`) which ends at
// its statement's semicolon.
function definitionBody(text, afterMatch) {
  let i = afterMatch;
  // Step past a parameter list the match did not consume. The `function NAME(`
  // alternative of the pattern ends *inside* the parameter list, having eaten
  // the opening paren, so start already one deep or the closing paren drives
  // the counter negative and nothing ever matches at depth zero.
  let parens = text[afterMatch - 1] === "(" ? 1 : 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "(") parens += 1;
    else if (ch === ")") parens -= 1;
    else if (parens === 0 && (ch === "{" || ch === ";")) break;
    i += 1;
  }
  if (text[i] === "{") return text.slice(i + 1, enclosingBodyEnd(text, i + 1));
  // Expression body: to the end of the statement, at depth zero.
  let depth = 0;
  for (let j = afterMatch; j < text.length; j += 1) {
    const ch = text[j];
    if (ch === "(" || ch === "[" || ch === "{") depth += 1;
    else if (ch === ")" || ch === "]" || ch === "}") depth -= 1;
    else if (ch === ";" && depth <= 0) return text.slice(afterMatch, j);
  }
  return text.slice(afterMatch, Math.min(afterMatch + 400, text.length));
}

const DEFINITION = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>|function\s+([A-Za-z_$][\w$]*)\s*\(/g;

function namedFunctions(text) {
  const predicates = new Set();
  const writers = new Set();
  for (const match of text.matchAll(DEFINITION)) {
    const name = match[1] ?? match[2];
    if (!name) continue;
    const body = definitionBody(text, match.index + match[0].length);
    if (SIGNAL_NAMES.some((n) => body.includes(n))) predicates.add(name);
    if (body.includes(WRITE)) writers.add(name);
  }
  // A function that both reads a signal and writes is the direct shape, not an
  // indirection -- leaving it in `predicates` would let it vouch for itself.
  for (const name of writers) predicates.delete(name);
  return { predicates, writers };
}

// Names a venture captured a signal read into: `const privacySignal =
// navigator.doNotTrack === '1' || navigator.globalPrivacyControl === true;`
// (chargeback-evidence-packet). Function initialisers are excluded -- those
// are predicates, matched by name-plus-parens so that mentioning the function
// without calling it does not count.
function signalAliases(text) {
  const aliases = new Set();
  for (const match of text.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*([^;\n]{0,300})/g)) {
    const [, name, initialiser] = match;
    if (!initialiser || initialiser.includes("=>") || /\bfunction\b/.test(initialiser)) continue;
    if (SIGNAL_NAMES.some((n) => initialiser.includes(n))) aliases.add(name);
  }
  return aliases;
}

// Every spelling of "consults the signal" that this source offers, longest
// first so a shorter marker cannot shadow a longer one.
function markersFor(text) {
  const { predicates } = namedFunctions(text);
  return [
    ...SIGNAL_NAMES,
    ...[...predicates].map((p) => `${p}(`),
    ...signalAliases(text),
  ].sort((a, b) => b.length - a.length);
}

// The indirect shape, and the reason this function exists rather than the
// check simply being loosened.
//
// `cash-runway-planner` splits the counter across three one-line helpers:
//
//     const store = (key, value) => { try { localStorage.setItem(key, value); } ... };
//     const countable = () => usage.checked && !navigator.doNotTrack && !navigator.globalPrivacyControl;
//     const bump = (key) => { if (countable()) store(key, ...); };
//
// That is properly gated, and no amount of widening the *ordering* rule will
// see it: at the write itself the nearest signal read is in a sibling helper,
// and it appears **after** the write in source order. So this handles it
// deliberately and narrowly -- one level of indirection, both ends named and
// matched -- rather than by relaxing anything the direct check asserts.
//
// A predicate is a named function whose body reads a signal. A writer is a
// named function whose body writes to storage. A venture passes when some
// third function branches on the predicate and calls the writer inside that
// branch. Two hops, no further.
function guardedByPredicate(text) {
  const { predicates, writers } = namedFunctions(text);
  if (predicates.size === 0 || writers.size === 0) return null;

  for (const predicate of predicates) {
    for (const writer of writers) {
      // `if (countable()) store(...)`, with or without a wrapping block, and
      // the `predicate() && writer(...)` short-circuit spelling of the same.
      const guarded = new RegExp(
        `(?:if\\s*\\(\\s*!?${predicate}\\s*\\(|${predicate}\\s*\\(\\s*\\)\\s*&&)` +
        `[^;]{0,200}?\\b${writer}\\s*\\(`,
      );
      if (guarded.test(text)) {
        return SIGNAL_NAMES.find((n) => text.includes(n)) ?? SIGNAL_NAMES[0];
      }
    }
  }
  return null;
}

/**
 * A verdict for one venture page.
 *
 *   `pass`       -- a function writes to storage and consults a signal, with a
 *                   branch, before doing so.
 *   `unguarded`  -- something writes to storage and a signal appears in the
 *                   venture's source, but nothing gates the write in a shape
 *                   this can follow. A human decides.
 *   `no-counter` -- nothing here consults a signal at all. Not a failure on its
 *                   own: a venture that keeps no usage counter is making no
 *                   promise to break. The coverage test pairs this with the
 *                   page's own text, which is what turns it into a defect.
 */
export function checkInlinePage(pagePath) {
  const name = relative(REPO_ROOT, pagePath);
  const sources = sourcesFor(pagePath);

  const readsSignal = sources.some((s) => SIGNAL_NAMES.some((n) => s.text.includes(n)));
  if (!readsSignal) return { name, status: "no-counter" };

  for (const { text } of sources) {
    const markers = markersFor(text);
    let from = 0;
    for (;;) {
      const at = text.indexOf(WRITE, from);
      if (at === -1) break;
      from = at + WRITE.length;

      // Walk *outward* through enclosing blocks, not just the innermost one.
      // The innermost block around the write is usually a `try {`, and every
      // one of these ventures wraps the storage write in one -- so stopping at
      // the first brace looks past the guard and reports a correctly-gated
      // counter as unguarded.
      let cursor = at;
      for (let depth = 0; depth < MAX_ENCLOSING_BLOCKS; depth += 1) {
        const bodyStart = enclosingBodyStart(text, cursor);
        const bodyEnd = enclosingBodyEnd(text, at);
        const body = text.slice(bodyStart, bodyEnd);

        if (markers.some((m) => body.includes(m))) {
          const signal = branchesOnSignal(text.slice(bodyStart, at), markers);
          if (signal) return { name, status: "pass", signal };
          break;
        }
        // Stop at the function that contains the write. Widening past it
        // reaches module scope, where *any* sibling function's signal read
        // would satisfy the check -- precisely the "signal read in a sibling
        // function" case this must reject. Blocks inside the function (`try`,
        // `if`, `for`) are widened through; the function body is the last one.
        if (isFunctionBody(text, bodyStart)) break;
        if (bodyStart <= 1) break;
        cursor = bodyStart - 2; // step outside this block's opening brace
      }
    }
  }

  // Nothing matched at the write site. Before failing, try the one indirect
  // shape this checker understands: a signal-reading predicate guarding a call
  // to a separate writer.
  for (const { text } of sources) {
    if (!text.includes(WRITE)) continue;
    const signal = guardedByPredicate(text);
    if (signal) return { name, status: "pass", signal, via: "predicate" };
  }
  return { name, status: "unguarded" };
}

export function checkAllInline(root = VENTURES) {
  return findInlineUsagePages(root).map(checkInlinePage);
}

// Does this page tell the visitor a usage counter exists? That sentence is the
// promise; a page that makes it and has no gated counter is the defect worth
// failing on, and a page that makes no claim is simply a product without
// analytics.
const PROMISE = /usage count|usage counter|anonymous local usage/i;

export function claimsUsageCounter(pagePath) {
  return PROMISE.test(readFileSync(pagePath, "utf8"));
}

if (import.meta.url === `file://${process.argv[1] ?? ""}`) {
  const results = checkAllInline();
  const unguarded = results.filter((r) => r.status === "unguarded");
  for (const r of unguarded) {
    console.error(`UNGUARDED ${r.name}: writes a usage count with no signal branch before it`);
  }
  const passed = results.filter((r) => r.status === "pass").length;
  const none = results.filter((r) => r.status === "no-counter").length;
  console.log(
    `${passed} inline usage counter(s) branch on Do Not Track or Global Privacy Control; ` +
    `${unguarded.length} unguarded, ${none} venture(s) keep no counter.`,
  );
  process.exit(unguarded.length > 0 ? 1 : 0);
}
