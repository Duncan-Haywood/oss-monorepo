import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  CA_NOTICE_METHODS,
  caNoticeCompleteOn,
  caNoticeDueOn,
  caNoticeTiming,
  caProofAttachments,
  caProofOfNotice,
  toPlainText,
} from "../src/index.ts";

// Cal. Civ. Code §§ 8106-8118 and 8204 from the Legislative Counsel's bulk download (see the
// snapshot's header): the wording the timing rules and the declaration quote.
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

test("the rules quote the statute: 20 days (§ 8204), five days for § 415.20 (§ 8116(c))", () => {
  assert.ok(
    section("8204").includes(
      "A preliminary notice shall be given not later than 20 days after the claimant has first furnished work on the work of improvement.",
    ),
  );
  assert.ok(
    section("8204").includes("only for work performed within 20 days prior to the service"),
  );
  assert.ok(
    section("8116").includes(
      "Section 415.20 of the Code of Civil Procedure for service of summons in a civil action, five days after mailing.",
    ),
  );
  assert.ok(
    section("8110").includes(
      "registered or certified mail, express mail, or overnight delivery by an express service carrier",
    ),
  );
});

test("§ 8118(b)'s accompanying documents are copied word for word", () => {
  const s8118 = section("8118");
  const all = new Set(CA_NOTICE_METHODS.flatMap((m) => caProofAttachments(m)));
  assert.equal(all.size, 4);
  for (const t of all) {
    // The statute lists them as "(1)Documentation ..." under "one of the following:".
    assert.ok(s8118.includes(t.replace(/\.$/, "")), `not in § 8118: ${t}`);
  }
  assert.deepEqual(caProofAttachments("personal"), []);
  assert.equal(caProofAttachments("overnight-carrier").length, 2);
  assert.match(caProofAttachments("certified-mail")[0] ?? "", /United States Postal Service/);
});

test("due date: 20 calendar days after first furnishing, across a month end", () => {
  assert.equal(caNoticeDueOn("2026-11-05"), "2026-11-25");
  assert.equal(caNoticeDueOn("2026-12-20"), "2027-01-09");
  assert.equal(caNoticeDueOn("2028-02-15"), "2028-03-06");
  assert.throws(() => caNoticeDueOn("2026-13-01"), RangeError);
});

test("completion (§ 8116): on delivery or deposit; five days after mailing for § 415.20", () => {
  assert.equal(caNoticeCompleteOn("personal", "2026-11-10"), "2026-11-10");
  assert.equal(caNoticeCompleteOn("certified-mail", "2026-11-10"), "2026-11-10");
  assert.equal(caNoticeCompleteOn("overnight-carrier", "2026-11-10"), "2026-11-10");
  assert.equal(caNoticeCompleteOn("leave-and-mail", "2026-11-10"), "2026-11-15");
});

test("timing: on time on the last day; late notice covers work from 20 days before service", () => {
  assert.deepEqual(caNoticeTiming("2026-11-01", null), {
    dueOn: "2026-11-21",
    givenOn: null,
    onTime: null,
    coversWorkFrom: null,
  });
  assert.equal(
    caNoticeTiming("2026-11-01", { method: "certified-mail", on: "2026-11-21" }).onTime,
    true,
  );
  const late = caNoticeTiming("2026-11-01", { method: "certified-mail", on: "2026-12-01" });
  assert.equal(late.onTime, false);
  assert.equal(late.coversWorkFrom, "2026-11-11");
  // Left and mailed on the 18th completes on the 23rd: two days late.
  const left = caNoticeTiming("2026-11-01", { method: "leave-and-mail", on: "2026-11-18" });
  assert.equal(left.givenOn, "2026-11-23");
  assert.equal(left.onTime, false);
  assert.equal(left.coversWorkFrom, "2026-11-03");
});

const INPUT = {
  recipient: "owner" as const,
  recipientNameAddress: "Valley Medical Partners LLC\n2100 Tulare St, Fresno, CA 93721",
  method: "certified-mail" as const,
  on: "2026-11-12",
  place: "Fresno, California",
  tracking: "9407 1000 0000 0000 0000 00",
  declarant: "Dana Ruiz, office manager",
  claimant: "Golden State Electric LLC",
  siteDescription: "Valley Clinic TI, 2100 Tulare St, Fresno, CA 93721",
};

test("the declaration states each § 8118(a) item and lists the mail documents to attach", () => {
  const doc = caProofOfNotice(INPUT);
  const text = toPlainText(doc);
  assert.match(text, /PROOF OF NOTICE DECLARATION/);
  for (const h of [
    "(1) The type or description of the notice given",
    "(2) The date, place, and manner of notice",
    "(3) The name and address of the person to which notice was given",
  ]) {
    assert.ok(text.includes(h), h);
    // The headings are § 8118(a)'s own phrases.
    assert.ok(section("8118").includes(h.slice(4)), h);
  }
  assert.match(text, /Valley Medical Partners LLC/);
  assert.match(text, /certified mail .*November 12, 2026 at Fresno, California/);
  assert.match(text, /9407 1000/);
  assert.match(text, /Owner or reputed owner/);
  assert.match(text, /United States Postal Service/);
  assert.equal(doc.citation, "Cal. Civ. Code § 8118");
  // No unchecked perjury wording; the disclaimer says why.
  assert.doesNotMatch(text, /penalty of perjury/);
  assert.match(doc.disclaimers.join(" "), /2015\.5/);
});

test("personal delivery needs no documents; § 415.20 states the completion date", () => {
  const personal = toPlainText(caProofOfNotice({ ...INPUT, method: "personal", tracking: "" }));
  assert.doesNotMatch(personal, /Accompanying documentation/);
  assert.match(personal, /complete when delivered/);
  const left = toPlainText(caProofOfNotice({ ...INPUT, method: "leave-and-mail" }));
  assert.match(left, /complete five days after mailing, on November 17, 2026/);
});

test("refuses a blank required value or a bad date", () => {
  assert.throws(() => caProofOfNotice({ ...INPUT, place: " " }), /place is required/);
  assert.throws(() => caProofOfNotice({ ...INPUT, on: "11/12/2026" }), RangeError);
});
