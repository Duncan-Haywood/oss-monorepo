import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  noticeById,
  noticeForms,
  OH_NOTICE_DAYS,
  OH_NOTICE_ID,
  placeholdersOf,
  renderNotice,
  toPlainText,
} from "../src/index.ts";
import { OH_CAPTIONS, OH_SUBTITLE, OH_WARNING, ohNoticeOfFurnishing } from "../src/oh-notice.ts";

// Ohio Rev. Code §§ 1311.011 to 1311.261 from codes.ohio.gov, 2026-11-28.
const RAW = readFileSync(new URL("../sources/oh-1311.txt", import.meta.url), "utf8")
  .split("\n")
  .filter((l) => !l.startsWith("#"));
const normalize = (s: string) => s.replace(/\s+/g, " ").trim();
const at = (prefix: string, from = 0) => {
  const i = RAW.findIndex((l, n) => n >= from && l.startsWith(prefix));
  assert.ok(i >= 0, `${prefix} missing from the snapshot`);
  return i;
};
const section = (n: string) => {
  const start = at(`Section ${n} `);
  const next = RAW.findIndex((l, i) => i > start && l.startsWith("Section "));
  return normalize(RAW.slice(start + 1, next < 0 ? undefined : next).join(" "));
};
const S1305 = section("1311.05");
const QUOTABLE = [S1305, section("1311.04"), section("1311.19")];
// § 1311.05(B)'s form: from the opening quotation mark to the closing one after "Date:".
const FORM_START = at('"Notice of Furnishing', at("Section 1311.05 "));
const FORM_LINES = RAW.slice(FORM_START, at('Date:"', FORM_START) + 1);

/** Every blank (a run of underscores, or a placeholder) as one marker, so the form and the notice compare. */
const BLANK = "<>";
const blanks = (s: string) =>
  normalize(s)
    .replace(/_{4,}/g, BLANK)
    .replace(/\{\{\w+\}\}/g, BLANK)
    .replace(/\s*<>\s*/g, ` ${BLANK} `)
    .replace(new RegExp(`${BLANK}(\\s*${BLANK})+`, "g"), BLANK)
    .replace(/\s+/g, " ")
    .trim();

const DATA = {
  designee: "Buckeye Clinic Holdings LLC",
  designeeAddress: "88 E Broad St, Columbus, OH 43215",
  originalContractor: "Scioto Builders Inc.",
  originalContractorAddress: "250 S High St, Columbus, OH 43215",
  contractedWith: "Scioto Builders Inc.\n250 S High St, Columbus, OH 43215",
  propertyLocation: "1400 N High St, Columbus, OH 43201",
  firstFurnishedDate: "2026-11-16",
  claimantName: "Olentangy Electric LLC",
  claimantAddress: "600 W Spring St, Columbus, OH 43215",
  signer: "Dana Ruiz, President",
  signedDate: "2026-11-28",
};

const form = () => {
  const f = noticeById("OH", OH_NOTICE_ID);
  assert.ok(f);
  return f;
};

test("OH notice of furnishing is encoded for Ohio only, once, with § 1311.05(A)'s 21 days", () => {
  assert.deepEqual(
    noticeForms("oh").map((n) => n.id),
    [OH_NOTICE_ID],
  );
  assert.equal(noticeById("MI", OH_NOTICE_ID), undefined);
  assert.equal(OH_NOTICE_DAYS, 21);
  assert.ok(S1305.includes("within twenty-one days after performing the first labor or work"));
});

test("OH notice is § 1311.05(B)'s form word for word, blanks aside", () => {
  const printed = form()
    .body.filter((b) => "text" in b)
    .map((b) => ("text" in b ? b.text : ""))
    .join(" ");
  // The statute quotes the form ("Notice of Furnishing ... Date:"); the notice leaves the marks
  // off, and gives the original contractor's address and the date a line each to write on.
  const statute = blanks(
    FORM_LINES.join(" ")
      .replace(/^"/, "")
      .replace(/Date:"$/, "Date: ____")
      .replace(
        "(Name of original contractor from notice of commencement) (Address",
        "(Name of original contractor from notice of commencement) ____ (Address",
      ),
  );
  assert.equal(blanks(printed), statute);
  for (const caption of Object.values(OH_CAPTIONS))
    assert.ok(normalize(FORM_LINES.join(" ")).includes(caption), caption);
  assert.ok(normalize(FORM_LINES.join(" ")).includes(OH_SUBTITLE));
  assert.ok(S1305.includes(OH_WARNING));
  // The warning prints as a notice block (bold).
  assert.deepEqual(
    form()
      .body.filter((b) => b.type === "notice")
      .map((b) => ("text" in b ? b.text : "")),
    [OH_WARNING],
  );
});

test("OH notice: sendTo and the notes quote the statute exactly where they quote it", () => {
  const f = form();
  assert.ok(
    S1305.includes(
      `notice of furnishing, if any person has recorded a notice of commencement in accordance with section 1311.04 of the Revised Code, upon ${f.sendTo}`,
    ),
  );
  let quotes = 0;
  for (const note of f.notes) {
    for (const m of note.matchAll(/"([^"]+)"/g)) {
      const q = m[1] ?? "";
      quotes += 1;
      assert.ok(
        QUOTABLE.some((s) => s.includes(q)),
        `not in the statute: ${q}`,
      );
    }
  }
  assert.ok(quotes >= 8, `found ${quotes} quotes`);
});

test("OH notice declares every placeholder it uses", () => {
  const f = ohNoticeOfFurnishing();
  const declared = new Set(f.fields.map((x) => x.key));
  assert.deepEqual(
    [...placeholdersOf(f.body)].filter((k) => !declared.has(k)),
    [],
  );
});

test("OH notice renders the job, the date first furnished, and a line for an unset signer address", () => {
  const r = renderNotice(form(), DATA);
  assert.ok(r.ok);
  const text = toPlainText(r.document);
  assert.match(text, /^NOTICE OF FURNISHING\n/i);
  assert.match(text, /To: Buckeye Clinic Holdings LLC/);
  assert.match(text, /To: Scioto Builders Inc\./);
  assert.match(text, /furnishing certain materials to Scioto Builders Inc\.\n250 S High/);
  assert.match(text, /real property located at 1400 N High St/);
  assert.match(text, /furnished first on November 16, 2026 \(date\)\./);
  assert.match(text, /By Dana Ruiz, President/);
  assert.match(text, /Date: November 28, 2026/);
  assert.match(text, /_{8,}\n+\(Address of party signing\)/);
  assert.equal(r.document.citation, "Ohio Rev. Code § 1311.05");
  assert.ok(r.document.disclaimers.some((d) => d.includes("§ 1311.19(B)")));
});

test("OH notice refuses missing required fields", () => {
  const r = renderNotice(form(), { ...DATA, designee: " ", firstFurnishedDate: "" });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.deepEqual(r.errors.map((e) => [e.field, e.code]).sort(), [
    ["designee", "REQUIRED"],
    ["firstFurnishedDate", "REQUIRED"],
  ]);
});
