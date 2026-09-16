// One venture, one opt-out. A usage module may spell the visitor's choice
// however it likes, but it must spell it exactly one way.
//
// This exists because the same defect arrived four times in two review rounds,
// each time from a repair rather than from the original code. A generated
// `readOptOut`/`writeOptOut` pair was added to 163 usage modules; where a
// venture already had an opt-out, the pair did not delegate to it, and the two
// went out of phase:
//
//   tender-radar             `tender-radar:opt-out`         vs `tender-radar:usage-opt-out`
//   notary-trip-quote        `notary-trip-quote-optout`     vs `notary-trip-quote-usage-opt-out`
//   mcp-supply-chain-watch   `…:usage-opt-out`              vs `…:usage-events-opt-out`
//   vendor-rate-break-even   one key, written `"true"`      and read `=== "1"`
//
// Every one of them fails the same way, and it is the failure this whole area
// is about: recording is correctly off, and the control says the visitor's
// choice was forgotten. The page has one control, so it can only ever set one
// of two flags; the other keeps the recorder gated while the label claims
// counting is back on.
//
// The check is static, deliberately. The behavioural checker beside this one
// asks whether a choice survives a reload, which is a question about one gate;
// this asks how many gates there are, and a second gate the page never touches
// is invisible to any amount of driving through the page's own control.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

import { findUsageModules } from "./browser-signals.mjs";

const REPO_ROOT = new URL("../../", import.meta.url).pathname;

// A key is an opt-out key if it says so. Counter keys, draft keys and share
// keys are none of this check's business -- a module may have as many of those
// as it likes.
// A key is an opt-out key if it says so. Counter keys, draft keys and share
// keys are none of this check's business -- a module may have as many of those
// as it likes.
//
// `disable` and `usage-preference` are in the list because the two page-level
// spellings this catalogue actually uses are `<venture>-disable` and
// `<venture>-usage-preference`; a pattern built only from the word "opt-out"
// read every one of those pages as having no opt-out at all, which is the
// quiet way for a guard to pass.
const OPT_OUT_KEY = /(opt.?out|usage-off|nocount|no-count|-disable|usage-preference)/i;

const BINDING = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(["'`])([^"'`]*)\2\s*;/g;
const ACCESS = /\.(getItem|setItem|removeItem)\(\s*([^,)]+?)\s*(?:,\s*([^)]*?)\s*)?\)/g;
// `storage.getItem(K) === "1"` / `!== "1"`, with the comparison to the right.
const COMPARISON = /\.getItem\(\s*([^,)]+?)\s*\)\s*(?:===|!==|==|!=)\s*(["'])([^"']*)\2/g;

/**
 * Resolve a key expression to the string it will be at run time, as far as
 * the module's own top-level string constants allow. An expression this
 * cannot resolve is returned as written -- two unresolvable expressions that
 * differ textually are still two keys, which is the answer this check needs.
 */
export function resolveKey(expression, bindings) {
  const text = expression.trim();
  const literal = /^(["'])([^"']*)\1$/.exec(text);
  if (literal) return literal[2];
  if (Object.hasOwn(bindings, text)) return bindings[text];
  const template = /^`([^`]*)`$/.exec(text);
  if (template) {
    return template[1].replace(/\$\{([^}]+)\}/g, (whole, name) => {
      const key = name.trim();
      return Object.hasOwn(bindings, key) ? bindings[key] : whole;
    });
  }
  return text;
}

function bindingsIn(source) {
  const bindings = {};
  for (const [, name, , value] of source.matchAll(BINDING)) bindings[name] = value;
  return bindings;
}

/**
 * The distinct opt-out keys a module touches, and the distinct string values
 * it treats as meaning "opted out".
 *
 * Values come from two places: a literal written with `setItem`, and a literal
 * a `getItem` is compared against. A computed write (`String(Boolean(x))`) is
 * not a literal and is not counted -- what matters is what the readers accept,
 * and every reader compares against something written down.
 */
export function optOutUsage(source) {
  const bindings = bindingsIn(source);
  const keys = new Set();
  const values = new Set();

  for (const [, call, keyExpression, valueExpression] of source.matchAll(ACCESS)) {
    const key = resolveKey(keyExpression, bindings);
    if (!OPT_OUT_KEY.test(key)) continue;
    keys.add(key);
    if (call !== "setItem" || valueExpression === undefined) continue;
    const literal = /^(["'])([^"']*)\1$/.exec(valueExpression.trim());
    if (literal) values.add(literal[2]);
  }

  for (const [, keyExpression, , value] of source.matchAll(COMPARISON)) {
    const key = resolveKey(keyExpression, bindings);
    if (!OPT_OUT_KEY.test(key)) continue;
    values.add(value);
  }

  return { keys: [...keys].sort(), values: [...values].sort() };
}

export function checkSource(source) {
  const { keys, values } = optOutUsage(source);
  if (keys.length === 0) return { status: "no-opt-out", keys, values };
  if (keys.length > 1) return { status: "two-keys", keys, values };
  if (values.length > 1) return { status: "two-encodings", keys, values };
  return { status: "pass", keys, values };
}

export function checkModule(path) {
  return { name: relative(REPO_ROOT, path), ...checkSource(readFileSync(path, "utf8")) };
}

export function checkAll(root) {
  return findUsageModules(root).map(checkModule);
}

// --- the same invariant, one layer up ---------------------------------------
//
// The check above reads usage *modules*. Three more instances arrived from the
// layer it cannot see: a page-local block that remembers the control's own
// boolean under a `…-usage-preference` key of its own, added where nothing else
// could remember. On a venture that already had an opt-out
// (`payment-reconciliation-disable`, `duplicate-payment-audit-disable`,
// `shopify-permission-drift:usage-opt-out`) that key became a second source of
// truth in exactly the way the module-level cases were, and no amount of
// reading `usage.mjs` would show it.
//
// So the unit is the page and the local modules it imports: one page, one
// control, one flag.

const SCRIPT = /<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
// And the other way a page loads its code. Missing this is not a small gap:
// every one of the three page-level instances was a `<script src="app.mjs">`
// page, so a scanner that read only inline scripts reported the whole
// catalogue clean while three pages carried a second flag.
const SCRIPT_SRC = /<script\b[^>]*\bsrc=["'](\.?\/?[^"':]+?)["'][^>]*>/gi;
const IMPORT = /(?:^|\n)\s*import\s(?:[^'"]*from\s*)?["'](\.[^"']+)["']/g;
// A page's inline JSON-LD is data, not code, and its strings are not keys.
const JSON_LD = /<script\b[^>]*type=["']application\/(?:ld\+)?json["'][^>]*>[\s\S]*?<\/script>/gi;

function scriptsIn(html) {
  return [...html.replace(JSON_LD, "").matchAll(SCRIPT)].map((m) => m[1]);
}

/**
 * Every source that runs on one page: its inline module scripts and the local
 * modules they reach, transitively, within the venture.
 */
export function pageSources(htmlPath) {
  const html = readFileSync(htmlPath, "utf8");
  const here = dirname(htmlPath);
  const seen = new Set();
  // [source text, the directory its own relative imports resolve against]
  const queue = scriptsIn(html).map((s) => [s, here]);
  for (const [, src] of html.matchAll(SCRIPT_SRC)) {
    const resolved = resolve(here, src);
    if (seen.has(resolved) || !existsSync(resolved) || !statSync(resolved).isFile()) continue;
    seen.add(resolved);
    queue.push([readFileSync(resolved, "utf8"), dirname(resolved)]);
  }
  const sources = queue.map(([text]) => text);
  while (queue.length) {
    const [source, from] = queue.shift();
    for (const [, specifier] of source.matchAll(IMPORT)) {
      const resolved = resolve(from, specifier);
      if (seen.has(resolved) || !existsSync(resolved)) continue;
      seen.add(resolved);
      const text = readFileSync(resolved, "utf8");
      sources.push(text);
      queue.push([text, dirname(resolved)]);
    }
  }
  return sources;
}

export function checkPage(htmlPath) {
  const name = relative(REPO_ROOT, htmlPath);
  return { name, ...checkSource(pageSources(htmlPath).join("\n")) };
}

const VENTURES = join(REPO_ROOT, "ventures");

/** Every venture page: `index.html` at any depth, plus its siblings. */
export function findPages(root = VENTURES) {
  const found = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      if (entry === "node_modules" || entry === "dist" || entry.startsWith(".")) continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith(".html")) found.push(full);
    }
  };
  walk(root);
  return found.sort();
}

export function checkAllPages(root) {
  return findPages(root).map(checkPage);
}

// --- and the other half: one flag is not enough if it is read too late ------
//
// Two more instances, `cut-list-optimizer` and `cash-runway-planner`, had
// exactly one key and still lied to the visitor. The block that restores the
// control was appended at the end of the script, after the startup work — a
// shared link being replayed, a `page_viewed` being recorded — so those events
// ran while the control was still in its default state. A visitor who opted
// out had a visit counted anyway; a visitor who opted in lost one.
//
// The invariant is positional and reads exactly as it says: in a script that
// restores the control from storage, that restore comes before anything is
// recorded.

const RESTORE = /const usagePreference\s*=/;
// Deliberately not `save|restore`: a page may legitimately restore a draft
// before anything else, and the promise being guarded is about counting.
//
// This matches a recorder wherever it appears, including inside a function
// definition that is not called at startup -- `countable(` in
// `cash-runway-planner` is a helper, not a visit. That over-strictness is the
// point rather than a rounding error: deciding which of a script's calls
// actually run on load means knowing which functions are invoked from where,
// and a check that guesses at that is one that can be wrong in the direction
// of passing. What is asked instead is simple, decidable and always the right
// answer anyway -- put the restore first.
const RECORDS = /\b(?:record|count|bump)[A-Za-z]*\s*\(/;

export function checkOrder(source) {
  const restore = RESTORE.exec(source);
  if (!restore) return { status: "no-restore" };
  const before = source.slice(0, restore.index);
  const records = RECORDS.exec(before);
  if (!records) return { status: "pass" };
  const line = before.slice(0, records.index).split("\n").length;
  return { status: "records-first", line, call: records[0] };
}

export function checkPageOrder(htmlPath) {
  const name = relative(REPO_ROOT, htmlPath);
  for (const source of pageSources(htmlPath)) {
    const result = checkOrder(source);
    if (result.status !== "no-restore") {
      if (result.status !== "pass") return { name, ...result };
      return { name, status: "pass" };
    }
  }
  return { name, status: "no-restore" };
}

export function checkAllPageOrders(root) {
  return findPages(root).map(checkPageOrder);
}

export function describeOrder(result) {
  if (result.status !== "records-first") return `${result.name}: ${result.status}`;
  return `${result.name}: \`${result.call}\` appears at line ${result.line}, above the `
    + `restore. Move the restore to the top of this script: anything counted before `
    + `it is counted against the control's default state rather than the visitor's `
    + `choice`;
}

export function describe(result) {
  if (result.status === "two-keys") {
    return `${result.name}: ${result.keys.length} opt-out keys, so the page's one `
      + `control can only ever set one of them — ${result.keys.join(", ")}`;
  }
  if (result.status === "two-encodings") {
    return `${result.name}: one key (${result.keys[0]}) written and read as `
      + `${result.values.map((v) => JSON.stringify(v)).join(" and ")}, so a choice `
      + `stored by one half is invisible to the other`;
  }
  return `${result.name}: ${result.status}`;
}
