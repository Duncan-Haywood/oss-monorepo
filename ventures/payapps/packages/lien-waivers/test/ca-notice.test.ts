import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  CA_NOTICE_ID,
  noticeById,
  noticeForms,
  placeholdersOf,
  renderNotice,
  toPlainText,
} from "../src/index.ts";
import { CA_NOTICE_ITEMS } from "../src/notices.ts";

// Cal. Civ. Code §§ 8102-8216 from the Legislative Counsel's bulk download, 2026-11-25 (see the
// file's header).
const LINES = readFileSync(new URL("../sources/ca-8102-8216.txt", import.meta.url), "utf8")
  .split("\n")
  .filter((l) => !l.startsWith("#"));
const normalize = (s: string) => s.replace(/\s+/g, " ").trim();
function section(n: string): string {
  const start = LINES.indexOf(`Section ${n}.`);
  assert.ok(start >= 0, `Section ${n} missing from the snapshot`);
  const end = LINES.findIndex((l, i) => i > start && l.startsWith("Section "));
  return normalize(LINES.slice(start + 1, end < 0 ? undefined : end).join(" "));
}
const S8102 = section("8102");
const S8202 = section("8202");

const DATA = {
  ownerNameAddress: "Valley Medical Partners LLC\n2100 Tulare St, Fresno, CA 93721",
  directContractor: "Sierra Builders Inc.\n500 Van Ness Ave, Fresno, CA 93721",
  siteDescription: "Valley Clinic tenant improvement, 2100 Tulare St, Fresno, CA 93721",
  claimant:
    "Golden State Electric LLC, 88 Blackstone Ave, Fresno, CA 93701; subcontractor to Sierra Builders Inc.",
  hiredBy: "Sierra Builders Inc.",
  workDescription: "Electrical rough-in and finish, labor and materials",
  estimate: "$184,500.00",
  signedDate: "2026-11-25",
};

const form = () => {
  const f = noticeById("CA", CA_NOTICE_ID);
  assert.ok(f);
  return f;
};

test("CA notice: the boldface statement is § 8202(a)(3)'s, word for word and in full", () => {
  const f = form();
  const title = f.body.findIndex(
    (b) => b.type === "title" && b.text === "NOTICE TO PROPERTY OWNER",
  );
  assert.ok(title > 0);
  const printed = normalize(
    f.body
      .slice(title + 1)
      .filter((b) => b.type === "notice")
      .map((b) => ("text" in b ? b.text : ""))
      .join(" "),
  );
  const from = S8202.indexOf("NOTICE TO PROPERTY OWNER") + "NOTICE TO PROPERTY OWNER".length;
  const to = S8202.indexOf("(b)If preliminary notice");
  assert.equal(printed, normalize(S8202.slice(from, to)));
  // Printed as "notice" blocks: bold at the page's largest size, as § 8202(a)(3) asks ("boldface").
  assert.ok(f.body.slice(title + 1).filter((b) => b.type === "notice").length === 3);
});

test("CA notice: each item's heading is its own phrase in § 8102(a) or § 8202, and none is missing", () => {
  const f = form();
  const headings = f.body
    .filter((b) => b.type === "heading")
    .map((b) => ("text" in b ? b.text : ""));
  assert.equal(headings.length, CA_NOTICE_ITEMS.length);
  for (const [i, item] of CA_NOTICE_ITEMS.entries()) {
    const src = item.from === "8102" ? S8102 : S8202;
    // The whole item: it starts after the item's number (or "shall include") and ends its sentence.
    const at = src.indexOf(item.heading);
    assert.ok(at >= 0, `not in § ${item.from}: ${item.heading}`);
    assert.match(src.slice(at - 8, at), /(\)|include )$/, `cut at the start: ${item.heading}`);
    assert.equal(src.charAt(at + item.heading.length), ".", `cut at the end: ${item.heading}`);
    assert.equal(headings[i]?.toLowerCase(), `${item.heading}:`.toLowerCase());
  }
  // § 8102(a)(1)-(5) and (6)(B)-(C), § 8202(a)(1)-(2) and (b): one heading each.
  for (const phrase of [
    "owner or reputed owner",
    "direct contractor",
    "construction lender",
    "description of the site",
    "relationship to the parties",
    "to or for whom the work is provided",
    "claimant’s demand",
    "general description of the work to be provided",
    "estimate of the total price",
    "name and address of the laborer",
  ]) {
    assert.equal(headings.filter((h) => h.includes(phrase)).length, 1, phrase);
  }
});

test("CA notice: placeholders declared; offered for California only", () => {
  const f = form();
  const declared = new Set(f.fields.map((x) => x.key));
  assert.deepEqual(
    [...placeholdersOf(f.body)].filter((k) => !declared.has(k)),
    [],
  );
  for (const k of f.omitIfBlank ?? []) {
    assert.equal(f.fields.find((x) => x.key === k)?.required, false, k);
  }
  assert.deepEqual(
    noticeForms("ca").map((n) => n.id),
    [CA_NOTICE_ID],
  );
  assert.equal(noticeById("NV", CA_NOTICE_ID), undefined);
  assert.match(f.sendTo, /owner or reputed owner.*direct contractor.*construction lender/);
});

test("CA notice renders the job's values; blank 'if any' items are left off, other blanks print a rule", () => {
  const r = renderNotice(form(), DATA);
  assert.ok(r.ok);
  const text = toPlainText(r.document);
  assert.match(text, /^PRELIMINARY NOTICE/);
  assert.match(
    text,
    /The name and address of the owner or reputed owner:\n\nValley Medical Partners LLC\n2100 Tulare/,
  );
  assert.match(
    text,
    /An estimate of the total price of the work provided and to be provided:\n\n\$184,500\.00/,
  );
  assert.doesNotMatch(text, /construction lender, if any:/);
  assert.doesNotMatch(text, /claimant’s demand/);
  assert.doesNotMatch(text, /name and address of the laborer/);
  assert.match(text, /NOTICE TO PROPERTY OWNER\n\nEVEN THOUGH YOU HAVE PAID/);
  assert.match(text, /Date: November 25, 2026/);
  assert.equal(r.document.attachment, null);
  assert.equal(r.document.citation, "Cal. Civ. Code §§ 8102, 8202");
  assert.ok(r.document.disclaimers.some((d) => d.includes("not later than 20 days")));

  const withAll = renderNotice(form(), {
    ...DATA,
    lender: "First Valley Bank, 1 Bank Plz, Fresno, CA 93721",
    demand: "$0.00",
    laborers: "J. Doe, 1 A St, Fresno, CA",
  });
  assert.ok(withAll.ok);
  const all = toPlainText(withAll.document);
  assert.match(all, /construction lender, if any:\n\nFirst Valley Bank/);
  assert.match(all, /just credits and offsets:\n\n\$0\.00/);
  assert.match(all, /to which payments are due:\n\nJ\. Doe/);
});

test("CA notice refuses missing required items", () => {
  const { estimate: _e, ...rest } = DATA;
  const r = renderNotice(form(), { ...rest, hiredBy: " " });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.deepEqual(r.errors.map((e) => [e.field, e.code]).sort(), [
    ["estimate", "REQUIRED"],
    ["hiredBy", "REQUIRED"],
  ]);
});
