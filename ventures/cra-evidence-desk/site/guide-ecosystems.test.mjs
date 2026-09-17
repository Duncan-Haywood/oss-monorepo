/**
 * Holds the guide page's published ecosystem table to the real alias table.
 *
 * `sbom-and-advisory-package-names-dont-match.html` answers one question:
 * which registries do a CycloneDX SBOM and an OSV advisory export spell
 * differently? It answers it by *printing the list*, which makes the page a
 * third copy of `ECOSYSTEM_ALIASES` — after `normalize.py` (the CLI's) and
 * `match.mjs` (the browser port's, already pinned by `parity.test.mjs`).
 *
 * CLAUDE.md records that restating a rule instead of importing it has cost
 * this repo live product twice, and prose is the copy least likely to be
 * updated when the rule changes: a new alias would be added to the two code
 * copies by the session that needed it, while the page went on telling a
 * vendor that their registry is one of the ones that already agrees. That
 * reader's next move is to stop debugging a mismatch that is real.
 *
 * So this pins the page to `match.mjs`, which `parity.test.mjs` pins to
 * `normalize.py` — one chain, no free-floating third copy. It is deliberately
 * bidirectional: a row on the page that is not in the table fails, and an
 * alias in the table that is not on the page fails too.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { ECOSYSTEM_ALIASES } from "./match.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const guide = readFileSync(
  path.join(here, "sbom-and-advisory-package-names-dont-match.html"),
  "utf8",
);

/**
 * The aliases that actually rename something, keyed as the page presents them:
 * OSV ecosystem on the left, purl type on the right.
 *
 * An identity entry (`npm` -> `npm`) is in the table so that a lookup never
 * misses, not because the two formats disagree — so it belongs in the page's
 * prose sentence, not in its table of mismatches.
 */
const renaming = Object.entries(ECOSYSTEM_ALIASES).filter(([osv, purl]) => osv !== purl);
const identity = Object.entries(ECOSYSTEM_ALIASES).filter(([osv, purl]) => osv === purl);

/** The page's two-column table, lowercased — it prints conventional casing
 *  (`RubyGems`, `SwiftURL`) while `canonical_ecosystem` lowercases on lookup. */
function publishedRows() {
  const body = guide.match(/<tbody>([\s\S]*?)<\/tbody>/);
  assert.ok(body, "the guide no longer has a <tbody> — the ecosystem table was restructured or removed");
  return [...body[1].matchAll(/<tr><td>([^<]+)<\/td><td>([^<]+)<\/td><\/tr>/g)].map(
    ([, osv, purl]) => [osv.trim().toLowerCase(), purl.trim().toLowerCase()],
  );
}

test("the guide publishes exactly the aliases that rename a registry", () => {
  assert.ok(renaming.length > 0, "no renaming aliases found — match.mjs's table is empty or unreadable");
  assert.deepEqual(
    publishedRows().sort(),
    renaming.map(([osv, purl]) => [osv, purl]).sort(),
    "the guide's ecosystem table has drifted from ECOSYSTEM_ALIASES — a registry the two " +
      "formats spell differently is either missing from the page or listed on it wrongly",
  );
});

test("the guide names every identity ecosystem in its prose", () => {
  // These are the ones the page tells a reader they need not worry about.
  // Claiming agreement for a registry that has since gained an alias is the
  // failure that sends someone away from a real mismatch.
  const prose = guide
    .replace(/<tbody>[\s\S]*?<\/tbody>/, " ")
    .replace(/<[^>]+>/g, " ")
    .toLowerCase();
  const missing = identity
    .map(([osv]) => osv)
    .filter((name) => !prose.includes(name));
  assert.deepEqual(
    missing,
    [],
    "the guide's prose no longer names these ecosystems as already agreeing between the two formats",
  );
});

test("the guide states the count it claims for the renaming aliases", () => {
  // The page opens by promising "five registries". A sixth alias landing
  // without that word changing would make the prose contradict its own table.
  const words = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
  const expected = words[renaming.length];
  assert.ok(expected, `no spelled-out word for ${renaming.length} renaming aliases — extend the list`);
  assert.ok(
    new RegExp(`\\b${expected}\\b`, "i").test(guide),
    `the guide should say "${expected}" registries are spelled differently, to match its own table`,
  );
});
