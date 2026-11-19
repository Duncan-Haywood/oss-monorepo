// Deterministic mutation fuzzing for the file-check ventures' `repair()` functions.
//
// About 50 ventures (qif-file-check, mt940-statement-check, vcard-contacts-check, the CSV import checkers...)
// export `validate(text)`, `repair(text)` and one or more `sample*()` files. Their tests check the planted faults
// in the samples; nothing checked what happens to the endless files in between. This module mutates the samples
// (deletes, duplicates, truncations, inserted separators and quotes, swapped characters) and checks three
// properties on every mutant:
//
//   1. `validate` never throws (a bad upload gets findings, not a blank page);
//   2. `repair` never throws;
//   3. `repair` is idempotent: repairing its own output changes nothing. A repair that changes its output again
//      either fixed only half of something on the first pass or rewrote something it had just written, and the
//      user who downloads the "fixed" file gets one that the same tool still wants to change.
//
// The first sweep, 2026-11-18, found one crash and six non-idempotent repairs across 49 ventures, each a real
// bug (docs/posts/2026-11-18-fuzzing-fifty-repair-buttons.md). The generator is seeded, so a test is
// reproducible and never flaky; a failure carries the smallest input seen.
//
//   import * as calc from "./calc.mjs";
//   import { checkRepair } from "../../platform/fuzz/repair.mjs";
//   test("repair is idempotent on mutated samples", () => assert.deepEqual(checkRepair(calc), []));
//
// CLI sweep over every venture that qualifies:  node platform/fuzz/repair.mjs [--n 1500] [--seed N] [slug ...]

const TOKENS = ["\n", "\r\n", "\r", ",", ";", "\t", "\"", "\"\"", ":", "-", ".", "0", "9", " ", "  ", "/", "=", "é",
  "\uFEFF", "<", ">", "*", "~", "^", "BEGIN:VCARD", "END:VCARD", "BEGIN:VEVENT", "END:VEVENT"];

export function rng(seed = 1) {
  let s = seed >>> 0 || 1;
  // Scale the high bits, never `s % n`: the low bit of a power-of-two LCG alternates on every call, so
  // `% 6` fixed each choice's parity by its position and three of the six operations never ran alone
  // (quality audit 2026-11-19).
  return (n) => { s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff; return Math.floor((s / 0x80000000) * n); };
}

export function mutate(text, rnd, tokens = TOKENS) {
  let s = text;
  const n = 1 + rnd(4);
  for (let i = 0; i < n; i++) {
    const p = rnd(s.length + 1), q = Math.min(s.length, p + rnd(40));
    switch (rnd(6)) {
      case 0: s = s.slice(0, p) + s.slice(q); break; // delete a span
      case 1: s = s.slice(0, p) + tokens[rnd(tokens.length)] + s.slice(p); break; // insert a separator or marker
      case 2: s = s.slice(0, p) + s.slice(p, q) + s.slice(p); break; // duplicate a span in place
      case 3: s = s.slice(0, p); break; // truncate
      case 4: s = s.slice(0, p) + String.fromCharCode(32 + rnd(95)) + s.slice(p + 1); break; // overwrite a character
      default: { const r = rnd(s.length + 1); s = s.slice(0, p) + s.slice(r, r + rnd(80)) + s.slice(p); } // copy a span elsewhere
    }
  }
  return s;
}

/** The repaired text from whatever a venture's repair returns, or null when it wrote nothing. */
export function repairedText(r) {
  if (typeof r === "string") return r;
  if (!r || typeof r !== "object") return null;
  for (const k of ["text", "output", "repaired", "csv", "fixed", "content"]) if (typeof r[k] === "string") return r[k];
  return null;
}

/** The module's sample files (every exported sample*() that returns a string). */
export function samplesOf(mod) {
  return Object.keys(mod).filter((k) => /^sample/.test(k) && typeof mod[k] === "function")
    .map((k) => { try { return mod[k](); } catch { return null; } }).filter((x) => typeof x === "string");
}

/**
 * Run the three properties over the samples and `iterations` mutants. Returns a list of failures,
 * [{ property, message, input }], one per distinct message with the shortest input seen; [] is a pass.
 */
export function checkRepair(mod, { iterations = 400, seed = 20261118, slowMs = 1000 } = {}) {
  const seeds = samplesOf(mod);
  if (!seeds.length) return [{ property: "setup", message: "no sample*() function returns a string", input: "" }];
  if (typeof mod.repair !== "function") return [{ property: "setup", message: "no repair() export", input: "" }];
  const rnd = rng(seed);
  const fails = new Map();
  const note = (property, message, input) => {
    const key = `${property}: ${message}`.slice(0, 200);
    if (!fails.has(key) || input.length < fails.get(key).input.length) fails.set(key, { property, message, input });
  };
  for (let i = 0; i < seeds.length + iterations; i++) {
    const x = i < seeds.length ? seeds[i] : mutate(seeds[rnd(seeds.length)], rnd);
    if (typeof mod.validate === "function") {
      try { mod.validate(x); } catch (e) { note("validate-throws", `${e?.constructor?.name}: ${e?.message}`, x); }
    }
    let once;
    const t0 = performance.now();
    try { once = repairedText(mod.repair(x)); } catch (e) { note("repair-throws", `${e?.constructor?.name}: ${e?.message}`, x); continue; }
    if (performance.now() - t0 > slowMs) note("repair-slow", `over ${slowMs} ms`, x);
    if (once == null) continue;
    let twice;
    try { twice = repairedText(mod.repair(once)); } catch (e) { note("repair-throws", `on its own output: ${e?.message}`, x); continue; }
    if (twice != null && twice !== once) note("repair-not-idempotent", i < seeds.length ? "a second repair changes the repaired sample" : "a second repair changes the output", x);
  }
  return [...fails.values()];
}

/** One line per failure, with the input as JSON so it can be pasted into a test. */
export function describe(failures) {
  return failures.map((f) => `${f.property}: ${f.message}\n  input ${JSON.stringify(f.input)}`).join("\n");
}

// CLI: sweep every venture whose calc.mjs exports repair() and a sample*().
if (process.argv[1] && import.meta.url === (await import("node:url")).pathToFileURL(process.argv[1]).href) {
  const { readdirSync, readFileSync, existsSync } = await import("node:fs");
  const { join, dirname } = await import("node:path");
  const { fileURLToPath, pathToFileURL } = await import("node:url");
  const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "ventures");
  const args = process.argv.slice(2);
  let iterations = 1500;
  const ni = args.indexOf("--n");
  if (ni >= 0) { iterations = Number(args[ni + 1]); args.splice(ni, 2); }
  let seed;
  const si = args.indexOf("--seed");
  if (si >= 0) { seed = Number(args[si + 1]); args.splice(si, 2); }
  if (!Number.isInteger(iterations) || iterations < 0) { console.error(`--n must be a whole number of 0 or more, got ${JSON.stringify(String(iterations))}`); process.exit(2); }
  if (seed !== undefined && !Number.isInteger(seed)) { console.error("--seed must be a whole number"); process.exit(2); }
  const slugs = args.length ? args : readdirSync(root).filter((d) => {
    const f = join(root, d, "calc.mjs");
    if (!existsSync(f)) return false;
    const src = readFileSync(f, "utf8");
    return /export (function|const) repair\b/.test(src) && /export (function|const) sample/.test(src);
  });
  let bad = 0;
  for (const slug of slugs) {
    const mod = await import(pathToFileURL(join(root, slug, "calc.mjs")));
    const t0 = performance.now();
    const f = checkRepair(mod, { iterations, ...(seed !== undefined ? { seed } : {}) });
    const ms = Math.round(performance.now() - t0);
    if (f.length) bad++;
    console.log(`${f.length ? "FAIL" : "ok  "} ${slug} (${ms} ms)${f.length ? "\n" + describe(f).replace(/^/gm, "    ") : ""}`);
  }
  console.log(`\n${slugs.length} venture(s), ${bad} with failures, ${iterations} mutants each.`);
  process.exitCode = bad ? 1 : 0;
}
