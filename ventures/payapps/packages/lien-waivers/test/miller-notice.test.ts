import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  MILLER_NOTICE_ID,
  MILLER_PHRASES,
  millerActNotice,
  placeholdersOf,
  renderNotice,
  toPlainText,
} from "../src/index.ts";

// GPO's United States Code, 2023 edition, 40 U.S.C. § 3133, fetched 2026-11-27 (see its header).
const normalize = (s: string) => s.replace(/\s+/g, " ").trim();
const STATUTE = normalize(
  readFileSync(new URL("../sources/us-40-3133.txt", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => !l.startsWith("#"))
    .join(" "),
);

const DATA = {
  noticeDate: "2026-11-27",
  primeContractor: "Granite Federal Builders Inc.\n400 Commerce St, Norfolk, VA 23510",
  project: "Naval Station Norfolk, Building LP-14 renovation",
  claimant: "Tidewater Electric LLC\n12 Shore Dr, Virginia Beach, VA 23451",
  furnishedTo: "Bayside Mechanical Inc.",
  amountClaimed: "$48,250.00",
  lastDay: "2026-10-02",
};

test("Miller notice: each statute phrase it quotes is § 3133's own wording", () => {
  for (const phrase of Object.values(MILLER_PHRASES)) {
    assert.ok(STATUTE.includes(phrase), `not in § 3133 as published: ${phrase}`);
  }
  // Every quotation in the notes, too (straight double quotes delimit them).
  const form = millerActNotice();
  let quotes = 0;
  for (const note of form.notes) {
    for (const m of note.matchAll(/"([^"]+)"/g)) {
      const q = normalize((m[1] ?? "").replace(/\\'/g, "'"));
      assert.ok(STATUTE.includes(q), `quoted but not in § 3133: ${q}`);
      quotes++;
    }
  }
  assert.ok(quotes >= 7, `expected the notes to quote the statute, got ${quotes}`);
});

test("Miller notice: headings carry the statute's two required items and the last day", () => {
  const form = millerActNotice();
  const headings = form.body.flatMap((b) => (b.type === "heading" ? [b.text.toLowerCase()] : []));
  assert.ok(headings.includes(`${MILLER_PHRASES.amount}:`));
  assert.ok(headings.includes(`${MILLER_PHRASES.party}:`));
  assert.ok(headings.includes(`${MILLER_PHRASES.lastDay}:`));
  assert.ok(headings.includes(`to ${MILLER_PHRASES.contractor}:`));
  const declared = new Set(form.fields.map((f) => f.key));
  assert.deepEqual(
    [...placeholdersOf(form.body)].filter((k) => !declared.has(k)),
    [],
  );
  assert.equal(form.id, MILLER_NOTICE_ID);
  assert.equal(form.citation.verification.status, "verified");
  assert.ok(form.notes.some((n) => n.includes("PayApps' wording")));
});

test("Miller notice renders the values and leaves off blank optional items", () => {
  const r = renderNotice(millerActNotice(), DATA);
  assert.ok(r.ok);
  const text = toPlainText(r.document);
  assert.match(text, /NOTICE OF CLAIM ON PAYMENT BOND/);
  assert.match(text, /Granite Federal Builders Inc\.\n400 Commerce St/);
  assert.match(text, /The amount claimed:\n\n\$48,250\.00/);
  assert.match(
    text,
    /furnished or supplied or for whom the labor was done or performed:\n\nBayside/,
  );
  assert.match(text, /October 2, 2026/);
  assert.doesNotMatch(text, /Federal contract number|The labor or material:|\{\{/);
  assert.equal(r.document.citation, "40 U.S.C. § 3133(b)(2)");

  const full = renderNotice(millerActNotice(), {
    ...DATA,
    contractNumber: "N40085-25-C-0123",
    workDescription: "Electrical labor and materials, PO 2214",
  });
  assert.ok(full.ok);
  const t2 = toPlainText(full.document);
  assert.match(t2, /Federal contract number:\n\nN40085-25-C-0123/);
  assert.match(t2, /The labor or material:\n\nElectrical labor/);
});

test("Miller notice refuses a missing amount, a missing party and a bad date", () => {
  const r = renderNotice(millerActNotice(), {
    ...DATA,
    amountClaimed: " ",
    furnishedTo: "",
    lastDay: "2026-02-30",
  });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.deepEqual(r.errors.map((e) => e.field).sort(), [
    "amountClaimed",
    "furnishedTo",
    "lastDay",
  ]);
});

// Red-team run of 2026-11-28: a notice dated before the last day it claims for rendered, so a
// claimant could print a notice saying work was last done on a day after the notice itself.
test("a notice dated before its own last day is refused, naming the last day", () => {
  const r = renderNotice(millerActNotice(), { ...DATA, noticeDate: "2026-10-01" });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.deepEqual(
    r.errors.map((e) => [e.field, e.code]),
    [["lastDay", "INVALID_DATE"]],
  );
  assert.match(r.errors[0]?.message ?? "", /after the date of the notice/);
});

test("a notice dated on its last day renders", () => {
  assert.ok(renderNotice(millerActNotice(), { ...DATA, noticeDate: DATA.lastDay }).ok);
});
