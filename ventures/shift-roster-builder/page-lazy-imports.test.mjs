// The export readers load on the first file pick, not with the page (perf, 2026-11-25;
// docs/history/shift-roster-page-perf-2026-11-25.md): 178 -> 133 kB gzip and 13 -> 6 modules on first load.
// This pins that no import-*.mjs comes back as a static import, that every reader the page names is in the lazy
// list, and that each name the handlers take from the loaded modules is exported by one of them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const script = html.slice(html.indexOf('<script type="module">'));
const readers = readdirSync(new URL(".", import.meta.url)).filter((f) => /^import-.*\.mjs$/.test(f) && !f.includes(".test."));

test("no export reader is a static import of the page", () => {
  const statics = [...script.matchAll(/^\s*import\s[^;]*?from\s+"\.\/([^"]+)"/gm)].map((m) => m[1]);
  assert.ok(statics.includes("calc.mjs"), "the parser found the page's static imports");
  for (const f of statics) assert.ok(!/^import-/.test(f), `${f} is imported statically again`);
});

test("every export reader is loaded on demand, and the names the handlers use exist", async () => {
  const lazy = [...script.matchAll(/import\("\.\/(import-[^"]+)"\)/g)].map((m) => m[1]).sort();
  assert.deepEqual(lazy, [...readers].sort());
  const exported = new Set();
  for (const f of lazy) for (const k of Object.keys(await import("./" + f))) exported.add(k);
  const used = [...script.matchAll(/const \{ ([^}]+) \} = (?:m|imp);/g)].flatMap((m) => m[1].split(",").map((x) => x.trim()));
  assert.ok(used.length >= 10, "found the destructured reader names");
  for (const k of used) assert.ok(exported.has(k), `${k} is not exported by any export reader`);
});
