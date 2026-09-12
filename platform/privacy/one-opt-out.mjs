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

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { findUsageModules } from "./browser-signals.mjs";

const REPO_ROOT = new URL("../../", import.meta.url).pathname;

// A key is an opt-out key if it says so. Counter keys, draft keys and share
// keys are none of this check's business -- a module may have as many of those
// as it likes.
const OPT_OUT_KEY = /(opt.?out|usage-off|nocount|no-count)/i;

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
