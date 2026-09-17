import test from "node:test";
import assert from "node:assert/strict";

import { SPEC_ID } from "./photo-spec.mjs";
import {
  countFindings,
  evidenceJson,
  formatHandoffSummary,
  photoReadErrorMessage,
  recordFileName,
  reportMarkdown,
} from "./report.mjs";

const CHECKED_AT = "2026-09-03T14:32:05.000Z";

function runWith(reports, skipped = []) {
  return { reports, skipped, checkedAt: CHECKED_AT };
}

const clean = {
  info: { name: "living.jpg", format: "jpeg", width: 1600, height: 1200, nbytes: 900000, unreadable: null },
  findings: [],
};

const flagged = {
  info: { name: "agent-logo.jpg", format: "jpeg", width: 1600, height: 1200, nbytes: 900000, unreadable: null },
  findings: [
    { rule: "branding_filename", detail: 'filename contains branding token "logo"', severity: "blocking" },
    { rule: "aspect", detail: "1600x1200 matches no accepted ratio", severity: "degrading" },
  ],
};

test("countFindings separates blocking from the total", () => {
  assert.deepEqual(countFindings([clean, flagged]), { total: 2, blocking: 1 });
  assert.deepEqual(countFindings([clean]), { total: 0, blocking: 0 });
});

test("the markdown record states the spec, the counts and the limitation", () => {
  const md = reportMarkdown(runWith([clean, flagged], ["notes.txt"]));
  assert.match(md, /# Listing Lens photo preflight record/);
  assert.match(md, new RegExp(`Spec: ${SPEC_ID}`));
  assert.match(md, /Photos checked: 2/);
  assert.match(md, /Findings: 2 \(1 blocking\)/);
  assert.match(md, /Non-photo files skipped: 1/);
  assert.match(md, /## Skipped files/);
  assert.match(md, /- notes\.txt/);
  assert.match(md, /not a warranty that a board or portal will accept/);
  assert.match(md, /visual_watermark/);
});

test("a passing file still gets a row, so the record covers the whole delivery", () => {
  const md = reportMarkdown(runWith([clean]));
  assert.match(md, /\| living\.jpg \| No findings \| pass \|/);
});

test("the skipped-files section is omitted when nothing was skipped", () => {
  assert.ok(!reportMarkdown(runWith([clean])).includes("## Skipped files"));
});

test("pipes in a filename cannot break the markdown table", () => {
  const odd = { info: { ...clean.info, name: "a|b.jpg" }, findings: [] };
  const md = reportMarkdown(runWith([odd]));
  assert.match(md, /\| a\\\|b\.jpg \|/);
});

test("the handoff summary leads with the blocking count", () => {
  assert.match(formatHandoffSummary(runWith([clean, flagged])), /\| 1 blocking finding\n/);
  assert.match(formatHandoffSummary(runWith([clean])), /\| No blocking findings\n/);
});

test("the handoff summary pluralises and lists every file", () => {
  const text = formatHandoffSummary(runWith([clean, flagged], ["notes.txt"]));
  assert.match(text, /Checked 2 photos against/);
  assert.match(text, /living\.jpg: no findings/);
  assert.match(text, /agent-logo\.jpg: branding_filename \(blocking\), aspect \(degrading\)/);
  assert.match(text, /Skipped non-photo files: notes\.txt/);
  assert.match(text, /Evidence only/);
  assert.match(formatHandoffSummary(runWith([clean])), /Checked 1 photo against/);
});

test("the evidence json is the full record, pretty-printed", () => {
  const parsed = JSON.parse(evidenceJson(runWith([clean, flagged], ["notes.txt"])));
  assert.equal(parsed.reportType, "listing-lens-photo-preflight");
  assert.equal(parsed.checkedPhotos, 2);
  assert.deepEqual(parsed.skippedFiles, ["notes.txt"]);
  assert.equal(parsed.checkedAt, CHECKED_AT);
  assert.ok(parsed.unimplementedRules.includes("board_specific"));
  assert.match(evidenceJson(runWith([clean])), /\n  "specId"/, "pretty-printed, not minified");
});

test("record filenames are sortable and carry no colons", () => {
  const name = recordFileName(CHECKED_AT, "json");
  assert.equal(name, "listing-lens-preflight-2026-09-03T14-32-05.json");
  assert.ok(!name.includes(":"), "colons are not portable in filenames");
  assert.ok(recordFileName(CHECKED_AT, "md").endsWith(".md"));
});

test("the read-error message keeps the browser's own detail and says what to do", () => {
  assert.match(photoReadErrorMessage(new Error("NotReadableError")), /NotReadableError/);
  assert.match(photoReadErrorMessage(new Error("  ")), /could not read one or more files/);
  assert.match(photoReadErrorMessage("nope"), /could not read one or more files/);
  assert.match(photoReadErrorMessage(new Error("x")), /Try selecting them again/);
});
