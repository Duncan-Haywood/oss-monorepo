import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  AZ_CAPTIONS,
  AZ_NOT_A_LIEN,
  AZ_OWNER_NOTICE,
  AZ_RECEIPT_TITLE,
  AZ_TEN_DAYS,
  azPreliminaryNotice,
} from "../src/az-notice.ts";
import {
  AZ_NOTICE_ID,
  noticeById,
  noticeForms,
  placeholdersOf,
  renderNotice,
  toPlainText,
} from "../src/index.ts";

// Ariz. Rev. Stat. §§ 33-992.01 and 33-992.02 from azleg.gov, 2026-11-28 (see the file's header).
const RAW = readFileSync(new URL("../sources/az-33-992.txt", import.meta.url), "utf8")
  .split("\n")
  .filter((l) => !l.startsWith("#"));
const normalize = (s: string) => s.replace(/\s+/g, " ").trim();
const at = (prefix: string) => {
  const i = RAW.findIndex((l) => l.startsWith(prefix));
  assert.ok(i >= 0, `${prefix} missing from the snapshot`);
  return i;
};
// Subsection D, the form: from "D." up to "E.".
const FORM_LINES = RAW.slice(at("D. "), at("E. "));
const FORM = normalize(FORM_LINES.join(" "));
const S99201 = normalize(RAW.slice(0, at("33-992.02 ")).join(" "));
const S99202 = normalize(RAW.slice(at("33-992.02 ")).join(" "));

const words = (s: string) =>
  s
    .replace(/\{\{\w+\}\}/g, " ")
    .split(/\s+/)
    .map((w) => w.replace(/^[^\w(]+|[^\w)]+$/g, ""))
    .filter(Boolean);

/**
 * The statute prints the form in two columns, so in the snapshot a caption's words are interleaved
 * with the other column's. A caption is the statute's own if its words appear in the form in order.
 */
function inOrder(caption: string, text: string): boolean {
  const want = words(caption);
  const have = words(text);
  let j = 0;
  for (const w of have) if (j < want.length && w === want[j]) j++;
  return j === want.length;
}

const DATA = {
  ownerNameAddress: "Desert Clinic Partners LLC\n4100 N Central Ave, Phoenix, AZ 85012",
  directContractor: "Saguaro Builders Inc.\n700 E Jefferson St, Phoenix, AZ 85034",
  lender: "None",
  contractedWith: "Saguaro Builders Inc.\n700 E Jefferson St, Phoenix, AZ 85034",
  claimantName: "Copper State Electric LLC",
  claimantAddress: "88 W Washington St, Phoenix, AZ 85003",
  workDescription: "Electrical rough-in and finish, labor and materials",
  propertyAddress: "4100 N Central Ave, Phoenix, AZ 85012",
  county: "Maricopa",
  estimate: "$184,500.00",
  signedDate: "2026-11-28",
};

const form = () => {
  const f = noticeById("AZ", AZ_NOTICE_ID);
  assert.ok(f);
  return f;
};

test("AZ notice is encoded for Arizona only, once", () => {
  assert.deepEqual(
    noticeForms("az").map((n) => n.id),
    [AZ_NOTICE_ID],
  );
  assert.equal(noticeById("CA", AZ_NOTICE_ID), undefined);
  assert.equal(noticeForms("NM").length, 0);
});

test("AZ notice: every caption is § 33-992.01(D)'s own, in the form's words and order", () => {
  for (const [key, caption] of Object.entries(AZ_CAPTIONS)) {
    assert.ok(inOrder(caption, FORM), `${key} is not the statute's caption: ${caption}`);
  }
  // The title, word for word, is the form's first line.
  assert.equal(FORM_LINES[1], "Arizona Preliminary Twenty Day Lien Notice");
  assert.ok(FORM.includes(AZ_NOT_A_LIEN));
});

test("AZ notice: the boldface Notice to Property Owner and the ten-day paragraphs are word for word", () => {
  const owner = normalize(AZ_OWNER_NOTICE.join(" "));
  const from = FORM.indexOf("Notice to Property Owner") + "Notice to Property Owner".length;
  const to = FORM.indexOf("(The following language shall be in type");
  assert.equal(owner, normalize(FORM.slice(from, to)));
  const ten = normalize(AZ_TEN_DAYS.join(" "));
  const tenFrom = FORM.indexOf("on the document.)") + "on the document.)".length;
  const tenTo = FORM.indexOf("Dated:");
  assert.equal(ten, normalize(FORM.slice(tenFrom, tenTo)));
  // (C)(5) asks for the same statement in bold; its wording matches the form's apart from
  // "furnished or to be furnished" (C) and "furnished, or to be furnished" (D).
  assert.ok(
    S99201.includes(owner.replace("furnished, or to be furnished", "furnished or to be furnished")),
  );
  // Both are printed as notice blocks (bold, at the page's largest size).
  const notices = form()
    .body.filter((b) => b.type === "notice")
    .map((b) => ("text" in b ? b.text : ""));
  assert.deepEqual(notices, [AZ_NOT_A_LIEN, ...AZ_OWNER_NOTICE, ...AZ_TEN_DAYS]);
});

test("AZ notice ends with § 33-992.02(1)'s acknowledgment of receipt, as the form says", () => {
  assert.ok(
    FORM.includes(
      "(Acknowledgement of receipt language from Arizona Revised Statutes section 33-992.02 shall be inserted here.)",
    ),
  );
  assert.ok(S99202.includes(AZ_RECEIPT_TITLE));
  assert.ok(
    S99202.includes(
      "This acknowledges receipt on (insert date) of a copy of the preliminary twenty day notice at (insert address) .",
    ),
  );
  for (const label of [
    "Signature of sender",
    "(Date this acknowledgment is executed)",
    "Signature of person acknowledging receipt, with title if acknowledgment is made on behalf of another person",
  ]) {
    assert.ok(S99202.includes(label), label);
    const printed = form().body.some(
      (b) =>
        ("text" in b && b.text === label) ||
        (b.type === "signature" && (b.lines ?? []).some((l) => l.label === label)),
    );
    assert.ok(printed, `not printed: ${label}`);
  }
});

test("AZ notice: the notes quote the statute exactly where they quote it", () => {
  const f = form();
  for (const note of f.notes) {
    for (const m of note.matchAll(/"([^"]+)"/g)) {
      const q = m[1] ?? "";
      assert.ok(S99201.includes(q) || S99202.includes(q), `not in the statute: ${q}`);
    }
  }
  assert.ok(S99201.includes(`serve ${f.sendTo} with a written preliminary twenty day notice`));
});

test("AZ notice declares every placeholder it uses", () => {
  const f = azPreliminaryNotice();
  const declared = new Set(f.fields.map((x) => x.key));
  assert.deepEqual(
    [...placeholdersOf(f.body)].filter((k) => !declared.has(k)),
    [],
  );
});

test("AZ notice renders the values, rules for a blank legal description, and a blank receipt", () => {
  const r = renderNotice(form(), DATA);
  assert.ok(r.ok);
  const text = toPlainText(r.document);
  assert.match(text, /^ARIZONA PRELIMINARY TWENTY DAY LIEN NOTICE/);
  assert.match(text, /owner or reputed owner are:\n\nDesert Clinic Partners LLC\n4100 N Central/);
  assert.match(text, /By: Copper State Electric LLC/);
  assert.match(text, /land in Maricopa County, Arizona, described as follows:\n\n_{8,}/);
  assert.match(text, /furnished or to be furnished is: \$184,500\.00/);
  assert.match(text, /Dated: November 28, 2026/);
  assert.match(text, /By \(Signature\): _{8,}/);
  assert.match(text, /This acknowledges receipt on _{8,} of a copy/);
  assert.equal(r.document.citation, "Ariz. Rev. Stat. §§ 33-992.01, 33-992.02");
  assert.ok(r.document.disclaimers.some((d) => d.includes("§ 33-992.01(F)")));
  assert.equal(r.document.attachment, null);
  // The receipt comes after the claimant's signature, where the form says to insert it.
  assert.ok(text.indexOf("By (Signature)") < text.indexOf(AZ_RECEIPT_TITLE));
});

test("AZ notice refuses missing required fields", () => {
  const r = renderNotice(form(), { ...DATA, county: " ", estimate: "" });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.deepEqual(r.errors.map((e) => [e.field, e.code]).sort(), [
    ["county", "REQUIRED"],
    ["estimate", "REQUIRED"],
  ]);
});
