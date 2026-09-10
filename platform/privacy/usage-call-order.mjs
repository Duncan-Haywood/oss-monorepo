// Does each venture call its own `recordUsage` in the order that venture
// declares it?
//
// The portfolio ships two spellings of the same function and has done for a
// long time. 143 ventures declare it
//
//     recordUsage(storage = localStorage, optedOut = false, event = '...')
//
// and 10 declare the arguments the other way round
//
//     recordUsage(event, optedOut = false, storage = localStorage)
//
// Neither is wrong. What is wrong is a page written against the majority
// spelling in a venture that ships the minority one, and that failure is
// completely silent in both directions:
//
//   - `event` receives the Storage object, so the tally key becomes
//     `[object Storage]:2026-09-10` rather than `link_copied:2026-09-10`;
//   - `storage` receives the event string, so the very next line calls
//     `'link_copied'.getItem(...)`, which throws;
//   - `usage.mjs` catches that on purpose — a calculator must keep working
//     when storage is unavailable — so the throw is swallowed.
//
// The button therefore works, the feature looks instrumented, and the number
// is never counted. Nothing goes red anywhere: not `node --test`, not the
// browser checks, not the privacy suite, because from the outside a counter
// that records nothing is indistinguishable from a user who opted out.
//
// Found 2026-09-10 on `kdp-royalty-calculator`'s brand-new "Copy shareable
// link" button — a venture in the 10, given a handler written from the 143.
// The share link is a distribution experiment whose entire point is the
// `link_copied` tally, so the one number that would have said whether the
// feature was worth building was the number it failed to record.
//
// This is the same shape CLAUDE.md records against `platform/proposal/` and
// the front-door mirror: a rule that lives in one file, restated by hand in
// another, going quietly out of agreement. It cannot be fixed by importing
// here, because the two signatures are a real divergence across 153 ventures
// rather than a copy of one rule. So it is checked instead — read each
// venture's declaration, read its call sites, and compare.
import { readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { readdirSync, statSync } from "node:fs";

const VENTURES = new URL("../../ventures/", import.meta.url).pathname;

/** Which parameter a venture's `recordUsage` takes first: "event" or "storage". */
export function declaredFirstParameter(source) {
  const match = source.match(/export\s+function\s+recordUsage\s*\(([^)]*)\)/);
  if (!match) return null;
  const first = match[1].split(",")[0]?.split("=")[0]?.trim();
  if (!first) return null;
  return /storage/i.test(first) ? "storage" : "event";
}

// What the first argument at a call site *is*, or null when it is something
// this check cannot classify. Unclassifiable is not a failure: a page may
// legitimately pass a variable whose name says nothing (`args[0]`, a
// destructured value), and accusing it would train readers to ignore the
// result — the same reasoning `run_workflow_locally.py` applies to UNRUN.
export function classifyArgument(text) {
  const arg = text.trim();
  if (/^['"`]/.test(arg)) return "event";
  if (/storage$/i.test(arg)) return "storage";
  if (/^(event|eventName|name)$/.test(arg)) return "event";
  return null;
}

/** Every `recordUsage(` call site in a file, with its first argument. */
export function callSites(source) {
  return [...source.matchAll(/recordUsage\s*\(\s*([^,)]+)/g)].map((m) => ({
    argument: m[1].trim(),
    kind: classifyArgument(m[1]),
  }));
}

function walk(dir, predicate, found = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, predicate, found);
    else if (predicate(entry)) found.push(full);
  }
  return found;
}

/**
 * Check every venture that declares a `recordUsage`. Returns one finding per
 * call site whose first argument contradicts that venture's own declaration.
 */
export function findMismatches(root = VENTURES) {
  const findings = [];
  for (const module of walk(root, (e) => e === "usage.mjs" || e === "usage.js").sort()) {
    const declared = declaredFirstParameter(readFileSync(module, "utf8"));
    if (!declared) continue;
    const ventureDir = dirname(module);
    for (const page of walk(ventureDir, (e) => e.endsWith(".html")).sort()) {
      for (const { argument, kind } of callSites(readFileSync(page, "utf8"))) {
        if (kind && kind !== declared) {
          findings.push({
            page: relative(root, page),
            usageModule: relative(root, module),
            declared,
            argument,
            passed: kind,
          });
        }
      }
    }
  }
  return findings;
}

export function report(findings) {
  if (findings.length === 0) return "usage-call-order: every recordUsage call matches its venture's own signature.";
  return findings
    .map(
      (f) =>
        `${f.page}: recordUsage(${f.argument}, ...) passes a ${f.passed} first, but ` +
        `${f.usageModule} declares ${f.declared} first — the tally is silently never recorded.`,
    )
    .join("\n");
}
