// Preload module for check_numeric_sort.mjs: records every comparator-less
// sort of an all-number array.
//
//     NUMERIC_SORT_LOG=/tmp/x.jsonl node --import ./platform/ci/numeric_sort_hook.mjs --test
//
// `[10, 9, 1].sort()` returns `[1, 10, 9]`: with no comparator, JavaScript
// compares elements as strings (ECMA-262, Array.prototype.sort, SortCompare
// step 4-7). A static grep for `.sort()` cannot tell that apart from the
// hundreds of correct string sorts in this repository, so this hook watches
// the sorts the tests actually run and logs the ones whose elements were all
// numbers (or all decimal strings), with the first stack frame outside
// node's internals. `wrong` is true when the string order differed from the
// numeric one on that call; false means the input happened to sort the same
// (years, single digits), a latent bug at worst.
//
// It only observes: the sort still returns exactly what the built-in returns.
import { appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const LOG = process.env.NUMERIC_SORT_LOG;
const SELF = fileURLToPath(import.meta.url);
const nativeSort = Array.prototype.sort;
const nativeToSorted = Array.prototype.toSorted;
const DECIMAL = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/;
const seen = new Set();

/** "number" when every element is a finite-or-NaN number, "decimal-string"
 * when every element is a string that reads as a decimal number, else null. */
export function kindOf(arr) {
  if (!Array.isArray(arr) || arr.length < 2) return null;
  let nums = true;
  let strs = true;
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i];
    if (typeof v !== "number") nums = false;
    if (typeof v !== "string" || !DECIMAL.test(v.trim())) strs = false;
    if (!nums && !strs) return null;
  }
  return nums ? "number" : "decimal-string";
}

function numericOrder(arr) {
  return nativeSort.call(arr.slice(), (a, b) => Number(a) - Number(b));
}

function sameOrder(a, b) {
  for (let i = 0; i < a.length; i++) {
    const x = Number(a[i]);
    const y = Number(b[i]);
    if (x !== y && !(Number.isNaN(x) && Number.isNaN(y))) return false;
  }
  return true;
}

/** First frame outside this file and node's internals: "path:line:col". */
export function callSite(stack) {
  for (const raw of String(stack).split("\n").slice(1)) {
    const m = raw.match(/\(?((?:file:\/\/)?\/[^()\s]+):(\d+):(\d+)\)?\s*$/);
    if (!m) continue;
    const file = m[1].startsWith("file://") ? fileURLToPath(m[1]) : m[1];
    if (file === SELF || file.includes("/node_modules/")) continue;
    return `${file}:${m[2]}:${m[3]}`;
  }
  return null;
}

function record(kind, before, after) {
  if (!LOG) return;
  const site = callSite(new Error().stack);
  if (!site) return;
  const wrong = !sameOrder(after, numericOrder(before));
  const key = `${site}|${kind}|${wrong}`;
  if (seen.has(key)) return;
  seen.add(key);
  const sample = before.slice(0, 8).map((v) => (typeof v === "number" ? v : String(v)));
  try {
    appendFileSync(LOG, JSON.stringify({ site, kind, wrong, n: before.length, sample }) + "\n");
  } catch {
    /* the log is best effort; never break the program under test */
  }
}

Array.prototype.sort = function sort(compare) {
  if (compare === undefined && Array.isArray(this)) {
    const kind = kindOf(this);
    if (kind) {
      const before = this.slice();
      const out = nativeSort.call(this);
      record(kind, before, out);
      return out;
    }
  }
  return nativeSort.call(this, compare);
};

if (nativeToSorted) {
  Array.prototype.toSorted = function toSorted(compare) {
    if (compare === undefined) {
      const kind = kindOf(this);
      if (kind) {
        const out = nativeToSorted.call(this);
        record(kind, Array.from(this), out);
        return out;
      }
    }
    return nativeToSorted.call(this, compare);
  };
}
