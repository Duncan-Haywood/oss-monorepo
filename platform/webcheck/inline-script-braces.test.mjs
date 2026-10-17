// A venture page whose inline <script> still carries template-escaped braces (`import {{ a }} from`) is a
// syntax error: the whole tool is dead on the live page while every content test stays green. This happened on
// uk-cis-deduction-refund-calculator (merged 2026-10-13, fixed forward the same day). Scan every page for it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, existsSync } from "node:fs";

const root = new URL("../../ventures/", import.meta.url);
const SIGNATURES = [/import\s*\{\{/, /\}\}\s*from\s*["']/];

test("no inline script has doubled template braces", () => {
  const offenders = [];
  for (const slug of readdirSync(root)) {
    for (const rel of ["index.html", "site/index.html"]) {
      const f = new URL(`${slug}/${rel}`, root);
      if (!existsSync(f)) continue;
      const html = readFileSync(f, "utf8");
      for (const m of html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/g)) {
        if (/ld\+json/.test(m[1])) continue;
        if (SIGNATURES.some((re) => re.test(m[2]))) offenders.push(`${slug}/${rel}`);
      }
    }
  }
  assert.deepEqual(offenders, []);
});
