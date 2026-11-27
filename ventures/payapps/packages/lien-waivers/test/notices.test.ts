import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  noticeById,
  noticeForms,
  placeholdersOf,
  renderNotice,
  toPlainText,
  WY_NOTICE_ID,
} from "../src/index.ts";

// The Wyoming Legislature's Title 29, § 29-10-101, fetched 2026-11-25 (see the file's header).
const RAW = readFileSync(new URL("../sources/wy-29-10-101.txt", import.meta.url), "utf8")
  .split("\n")
  .filter((l) => !l.startsWith("#"))
  .join(" ");
const BLANK_TOKEN = " \u0000 ";
const normalize = (s: string) => s.replace(/\s+/g, " ").trim();
const official = normalize(RAW.replace(/\$?_{3,}/g, BLANK_TOKEN));
// Subsection (a), the notice, ends where (b), the waiver form, begins.
const subsectionA = official.slice(0, official.indexOf("(b) The form for waiver"));
const ours = (text: string) =>
  normalize(text.replace(/\{\{\w+\}\}/g, BLANK_TOKEN).replace(/_{3,}/g, BLANK_TOKEN));

function assertVerbatim(text: string, from: number): number {
  let at = from;
  for (const piece of ours(text).split("\u0000")) {
    const frag = normalize(piece);
    if (frag === "") continue;
    const found = subsectionA.indexOf(frag, at);
    assert.ok(found >= 0, `not in § 29-10-101(a) as published (after offset ${at}): ${frag}`);
    at = found + frag.length;
  }
  return at;
}

const DATA = {
  claimantContact:
    "Cowboy State Electric LLC\n120 Elk Ave, Jackson, WY 83001\n(307) 555-0142, Dana Ruiz",
  workDescription: "Electrical rough-in and finish per subcontract",
  propertyDescription: "Jackson Clinic Addition",
  propertyAddress: "455 W Broadway, Jackson, WY 83001",
  signedDate: "2026-11-25",
};

test("WY notice: every heading and sentence is § 29-10-101(a)'s own wording, in order", () => {
  const form = noticeById("WY", WY_NOTICE_ID);
  assert.ok(form);
  let at = 0;
  for (const b of form.body) {
    if (
      b.type === "notice" ||
      b.type === "title" ||
      b.type === "heading" ||
      b.type === "paragraph"
    ) {
      at = assertVerbatim(b.text, at);
    } else if (b.type === "signature") {
      for (const l of b.lines ?? []) at = assertVerbatim(`${l.label}:`, at);
    }
  }
  assert.ok(at > subsectionA.indexOf("LEGAL DESCRIPTION"));
});

test("WY notice: the statute's whole subsection (a) is printed, nothing left out", () => {
  const form = noticeById("WY", WY_NOTICE_ID);
  assert.ok(form);
  const texts = form.body.flatMap((b) =>
    b.type === "signature"
      ? (b.lines ?? []).map((l) => `${l.label}: ${BLANK_TOKEN}`)
      : "text" in b
        ? [b.text]
        : [],
  );
  const printed = normalize(ours(texts.join(" ")).replaceAll("\u0000", ""));
  // Subsection (a)'s form, from the note to the date, with its blanks removed.
  const start = subsectionA.indexOf("Note to Lien Claimant");
  const statute = normalize(subsectionA.slice(start).replaceAll("\u0000", ""));
  assert.equal(printed, statute);
});

test("WY notice declares every placeholder it uses; Missouri has none", () => {
  const form = noticeById("WY", WY_NOTICE_ID);
  assert.ok(form);
  const declared = new Set(form.fields.map((f) => f.key));
  assert.deepEqual(
    [...placeholdersOf(form.body)].filter((k) => !declared.has(k)),
    [],
  );
  assert.equal(noticeForms("wy").length, 1);
  assert.equal(noticeForms("CA").length, 1);
  assert.equal(noticeForms("TX").length, 2); // tx-notice.test.ts
  assert.deepEqual(noticeForms("MO"), []);
  assert.equal(noticeById("CO", WY_NOTICE_ID), undefined);
  assert.throws(() => noticeForms("ZZ"), RangeError);
});

test("WY notice renders the values, a rule for a blank legal description, and the blank waiver", () => {
  const form = noticeById("WY", WY_NOTICE_ID);
  assert.ok(form);
  const r = renderNotice(form, DATA);
  assert.ok(r.ok);
  const text = toPlainText(r.document);
  assert.match(text, /^Note to Lien Claimant:/);
  assert.match(text, /NOTICE TO OWNER/);
  assert.match(text, /Cowboy State Electric LLC\n120 Elk Ave/);
  assert.match(text, /LEGAL DESCRIPTION:\n\n_{8,}/);
  assert.match(text, /DATE: November 25, 2026/);
  assert.match(text, /SIGNED: _{8,}/);
  assert.equal(r.document.citation, "Wyo. Stat. § 29-10-101(a)");
  assert.match(r.document.sendTo, /record owner/);
  assert.ok(r.document.disclaimers.some((d) => d.includes("§ 29-2-112")));
  // The attached waiver: § 29-10-101(b), every blank a printed rule, nothing filled in.
  const att = r.document.attachment;
  assert.ok(att);
  const waiver = toPlainText({ blocks: att.blocks });
  assert.match(waiver, /LIEN WAIVER/);
  assert.match(waiver, /PAYMENT: _{8,}/);
  assert.match(waiver, /retainage in the amount of _{8,}/);
  assert.doesNotMatch(waiver, /\{\{|Cowboy|November/);
});

test("WY notice refuses missing required fields and unknown ones", () => {
  const form = noticeById("WY", WY_NOTICE_ID);
  assert.ok(form);
  const r = renderNotice(form, { ...DATA, workDescription: " ", extra: "x" });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.deepEqual(r.errors.map((e) => [e.field, e.code]).sort(), [
    ["extra", "UNKNOWN_FIELD"],
    ["workDescription", "REQUIRED"],
  ]);
  const bad = renderNotice(form, { ...DATA, signedDate: "2026-02-30" });
  assert.equal(bad.ok, false);
});
