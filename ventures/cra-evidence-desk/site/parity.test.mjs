/**
 * Holds this ESM port to the Python rule set it was copied from.
 *
 * Same reasoning as the sibling guards in
 * `ventures/print-atelier/site/parity.test.mjs` and
 * `ventures/real-estate-agent-photo-app/site/parity.test.mjs`, and the same
 * lesson behind it: CLAUDE.md records that copying a rule instead of importing
 * it has already cost this repo live product twice. Importing across the
 * Python boundary is not available -- that boundary is precisely why this port
 * exists -- so the substitute is to read the source as text and assert the
 * rules still agree.
 *
 * The stakes here are higher than a layout difference. Both surfaces hand a
 * vendor a document they may act on under a reporting deadline, so a rule that
 * drifted would put two different answers, and two different liability
 * positions, in front of two sets of users who each believe they used "the CRA
 * evidence desk".
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  COVERAGE_NOTE,
  DRAFT_ACTION,
  DRAFT_DISCLAIMER,
  DRAFT_TITLE,
  ECOSYSTEM_ALIASES,
  NEXT_STEP,
  RANGE_ONLY_REASON,
} from "./match.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const pySource = (name) => readFileSync(path.join(here, "..", "src", "cra_evidence_desk", name), "utf8");
const normalizePy = pySource("normalize.py");
const corePy = pySource("core.py");

test("the coverage boundary is word-for-word the CLI's", () => {
  // The single sentence that tells a reviewer what this tool did not check.
  assert.ok(
    corePy.includes(`"${COVERAGE_NOTE}"`),
    "the coverage note has drifted from core.py — the two surfaces would state different boundaries",
  );
});

test("the next step sentence is word-for-word the CLI's", () => {
  assert.ok(corePy.includes(`"${NEXT_STEP}"`), "the next-step sentence has drifted from core.py");
});

test("the draft's title, action and disclaimer are word-for-word the CLI's", () => {
  // These travel inside a document a vendor may file against a deadline.
  assert.ok(corePy.includes(`"${DRAFT_TITLE}"`), "the draft title has drifted from core.py");
  assert.ok(corePy.includes(`"${DRAFT_ACTION}"`), "the draft's customer-action line has drifted from core.py");
  assert.ok(corePy.includes(`"${DRAFT_DISCLAIMER}"`), "the draft's disclaimer has drifted from core.py");
});

test("the range-only refusal is word-for-word the CLI's", () => {
  // This is the sentence that stops a clean report being read as coverage it
  // does not have, so a divergence here is a divergence about what the tool
  // admits it cannot do.
  assert.ok(
    normalizePy.includes(`"${RANGE_ONLY_REASON}"`),
    "the range-only reason has drifted from normalize.py",
  );
});

test("every ecosystem alias agrees with normalize.py", () => {
  // Read the Python dict literal rather than a hand-kept list, so an alias
  // added on one side and not the other fails here instead of silently
  // costing a match on a real SBOM.
  const block = normalizePy.match(/ECOSYSTEM_ALIASES = \{([\s\S]*?)\n\}/);
  assert.ok(block, "ECOSYSTEM_ALIASES is no longer declared in normalize.py — the port has drifted");
  const pyAliases = {};
  for (const [, key, value] of block[1].matchAll(/"([^"]+)":\s*"([^"]+)"/g)) {
    pyAliases[key] = value;
  }
  assert.deepEqual(
    ECOSYSTEM_ALIASES,
    pyAliases,
    "the ecosystem table differs between match.mjs and normalize.py",
  );
});

test("the ranges key is still the one thing normalize.py refuses to read", () => {
  // A guard on the discipline itself, not just its wording: if the Python side
  // ever starts resolving ranges, this port would be the stricter of the two
  // without anyone noticing.
  assert.ok(
    /`affected\[\]\.ranges` is a range expression/.test(normalizePy)
      || /ranges.*ignored/.test(normalizePy),
    "normalize.py no longer documents that it ignores OSV ranges — check whether it still does",
  );
  assert.ok(
    !/affected\.get\("ranges"\)\s*:?\s*\n?\s*for version/.test(normalizePy),
    "normalize.py appears to iterate OSV ranges as versions",
  );
});
