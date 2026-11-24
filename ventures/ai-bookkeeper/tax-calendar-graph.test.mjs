// The tax calendar only needs dates. Its static import graph stays engine-free
// (2026-11-24: it was 31 files, 263 kB gzip, through salestaxreturn.mjs and
// taxforms.mjs into engine.mjs; split out into salestax-rules.mjs and irsdates.mjs).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as rules from "./salestax-rules.mjs";
import * as str from "./salestaxreturn.mjs";
import * as irs from "./irsdates.mjs";
import * as taxforms from "./taxforms.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const IMPORT = /(?:^|[;\n}\s])import\s*(?:[\w*{}\s,$]+?\s*from\s*)?["'](\.\/[^"']+)["']/g;
const specs = (src) => [...src.matchAll(IMPORT)].map((m) => m[1].slice(2));

test("tax-calendar.html's static module graph is the four date modules, no engine", () => {
  const html = readFileSync(join(here, "tax-calendar.html"), "utf8");
  const inline = [...html.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)].map((m) => m[1]).join("\n");
  const seen = new Set();
  const todo = specs(inline);
  while (todo.length) {
    const f = todo.pop();
    if (seen.has(f)) continue;
    seen.add(f);
    todo.push(...specs(readFileSync(join(here, f), "utf8")));
  }
  assert.deepEqual([...seen].sort(), ["calendar.mjs", "irsdates.mjs", "salestax-rules.mjs", "usage.mjs"]);
});

test("salestaxreturn.mjs and taxforms.mjs re-export the split-out functions unchanged", () => {
  const moved = Object.keys(rules).filter((k) => !["LEN", "periodOf", "periodEnd", "periodBefore"].includes(k));
  assert.ok(moved.length >= 18);
  for (const k of moved) assert.equal(str[k], rules[k], k);
  for (const k of ["LEN", "periodOf", "periodEnd", "periodBefore"]) assert.equal(str[k], undefined, `${k} stays internal`);
  assert.equal(taxforms.estimatedDueDates, irs.estimatedDueDates);
  assert.equal(taxforms.fileAndPayDeadline, irs.fileAndPayDeadline);
});
