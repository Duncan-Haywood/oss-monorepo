// The Rev. 2 vs Rev. 3 page: the Rev. 3 extract is NIST's catalog as read (hash pinned), every Rev. 2
// requirement resolves to a Rev. 3 number, the counts the page states are pinned, the CSV matches the
// table, and the page is built, linked and sourced.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import official from "../../cmmc/src/shared/controls/official-text.json" with { type: "json" };
import rev3 from "../fixtures/nist-800-171r3/rev3-extract.json" with { type: "json" };
import { build } from "../src/build.mjs";
import { buildPages } from "../src/pages.mjs";
import {
  CROSSWALK_FILE,
  crosswalk,
  crosswalkCsv,
  newInRev3,
  REV3_PATH,
  rev3Counts,
  toRev3Id,
} from "../src/rev2-vs-rev3.mjs";
import { SOURCES } from "../src/site.mjs";

test("the extract is the catalog file read on 2026-11-28", () => {
  // sha256 of NIST_SP800-171_rev3_catalog.json as downloaded (scripts/extract-rev3.mjs); a new
  // catalog means re-running the script and re-reading the counts below.
  assert.equal(rev3.sha256, "fd68bad4c1fee98dd1b2511884b585fb1f14265d4c5693d0492a25dd66e73dde");
  assert.equal(rev3.catalogVersion, "1.1.0");
  assert.equal(rev3.readOn, "2026-11-28");
  assert.equal(rev3.requirements.length, 130);
});

test("counts: 97 vs 110, 77 kept, 33 withdrawn, 20 new, 88 ODPs, 422 determinations", () => {
  assert.deepEqual(rev3Counts(), {
    rev2: 110,
    rev2Families: 14,
    rev2Objectives: 320,
    rev3: 97,
    rev3Families: 17,
    rev3Objectives: 422,
    odps: 88,
    withOdps: 50,
    kept: 77,
    withdrawn: 33,
    incorporated: 22,
    addressed: 5,
    withdrawnOnly: 6,
    added: 20,
    newFamilies: 3,
  });
  const c = rev3Counts();
  assert.equal(c.kept + c.added, c.rev3);
  assert.equal(c.incorporated + c.addressed + c.withdrawnOnly, c.withdrawn);
});

test("every Rev. 2 requirement maps, and every link lands on a live Rev. 3 requirement", () => {
  assert.equal(toRev3Id("3.13.16"), "03.13.16");
  const cw = crosswalk();
  assert.deepEqual(
    cw.map((c) => c.rev2),
    official.level2.map((r) => r.nistId),
  );
  const live = new Set(rev3.requirements.filter((r) => !r.withdrawn).map((r) => r.id));
  for (const c of cw) for (const id of c.into) assert.ok(live.has(id), `${c.rev2} -> ${id}`);
  // Spot checks against NIST's links.
  const by = new Map(cw.map((c) => [c.rev2, c]));
  assert.deepEqual(by.get("3.1.14").into, ["03.01.12"]);
  assert.equal(by.get("3.12.4").fate, "incorporated");
  assert.deepEqual(by.get("3.12.4").into, ["03.15.02"]);
  assert.equal(by.get("3.13.3").fate, "addressed");
  assert.equal(by.get("3.5.6").fate, "withdrawn");
  assert.equal(by.get("3.4.1").fate, "kept");
});

test("new requirements carry their statement, with ODPs as assignments", () => {
  const added = newInRev3();
  assert.equal(added.length, 20);
  for (const r of added) {
    assert.ok(r.title && r.statement.length, r.id);
    assert.ok(!r.statement.some((s) => s.text.includes("{{")), r.id);
  }
  const inv = added.find((r) => r.id === "03.04.10");
  assert.equal(inv.title, "System Component Inventory");
  assert.match(inv.statement[1].text, /\[Assignment: organization-defined frequency\]/);
  for (const r of rev3.requirements.filter((x) => !x.withdrawn))
    assert.ok(r.statement.length, `${r.id} has no statement`);
});

test("the CSV has a row per Rev. 2 requirement and per new one, and no formula cells", () => {
  const lines = crosswalkCsv().trimEnd().split("\r\n");
  assert.equal(lines.length, 1 + 110 + 20);
  assert.match(lines[0], /^Rev 2 requirement,/);
  for (const l of lines.slice(1)) assert.ok(!/(^|,)"?[=+\-@]/.test(l), l);
  const outDir = mkdtempSync(join(tmpdir(), "cmmc-rev3-"));
  try {
    assert.equal(build({ outDir })[CROSSWALK_FILE], crosswalkCsv());
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("the page is built, sourced and linked from the home and Level 2 pages", () => {
  const pages = buildPages();
  const page = pages.find((p) => p.path === REV3_PATH);
  assert.ok(page);
  assert.match(page.body, /identical to the requirements in NIST SP\s+800-171 R2/);
  assert.match(page.body, new RegExp(`href="/${CROSSWALK_FILE}"`));
  for (const r of official.level2)
    assert.ok(page.body.includes(`<th scope="row">${r.nistId}</th>`), r.nistId);
  for (const id of ["nist-800-171r3-oscal", "cfr-170-14"])
    assert.ok(
      SOURCES.some((s) => s.id === id),
      id,
    );
  for (const p of ["/", "/cmmc-level-2-requirements"])
    assert.ok(pages.find((x) => x.path === p).body.includes(`href="${REV3_PATH}"`), p);
});
