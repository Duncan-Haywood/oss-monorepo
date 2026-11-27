import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { GA_FIELDS } from "../src/ga.ts";
import {
  GA_AFFIDAVIT_COPY_NOTICE,
  GA_AFFIDAVIT_ID,
  gaAffidavitCopyDueOn,
  gaAffidavitOfNonpayment,
  gaNinetyDays,
} from "../src/ga-affidavit.ts";
import { noticeForms, renderNotice } from "../src/index.ts";
import { placeholdersOf } from "../src/render.ts";

// O.C.G.A. § 44-14-366 rebuilt from SB 315 (2020) and SB 143 (2021); see the snapshot's header.
const SOURCE = readFileSync(new URL("../sources/ga-44-14-366.txt", import.meta.url), "utf8")
  .split("\n")
  .filter((l) => !l.startsWith("#"))
  .join(" ");

const BLANK = " \u0000 ";
const normalize = (s: string) => s.replace(/\s+/g, " ").trim();
const official = normalize(SOURCE.replace(/\$?_{3,}/g, BLANK));
const ours = (text: string) =>
  normalize(text.replace(/\{\{\w+\}\}/g, BLANK).replace(/_{3,}/g, BLANK));

function assertVerbatim(text: string, from: number): number {
  let at = from;
  for (const piece of ours(text).split("\u0000")) {
    const frag = normalize(piece);
    if (frag === "" || frag === "," || frag === ".") continue;
    const found = official.indexOf(frag, at);
    assert.ok(found >= 0, `not in § 44-14-366(g)(2) as rebuilt (after offset ${at}): ${frag}`);
    at = found + frag.length;
  }
  return at;
}

const VALUES = {
  county: "Fulton",
  customerName: "Peachtree Builders, Inc.",
  workDescription: "electrical labor and materials",
  projectName: "Midtown Clinic Addition",
  cityOrTown: "Atlanta",
  propertyCounty: "Fulton",
  ownerName: "Example Holdings LLC",
  propertyDescription: "100 Example St NE, Atlanta, GA 30309",
  waiverDate: "2026-10-05",
  waiverAmountCents: 4_250_000,
  unpaidCents: 1_250_000,
  claimantName: "Red Clay Electric LLC",
};

test("GA affidavit: every sentence is (g)(2)'s own wording, in order, inside (g)(2)", () => {
  const start = official.indexOf("AFFIDAVIT OF NONPAYMENT UNDER");
  const end = official.indexOf("(3) A claimant who is paid");
  assert.ok(start > 0 && end > start);
  let at = start;
  for (const b of gaAffidavitOfNonpayment().body) {
    if (b.type === "title" || b.type === "paragraph" || b.type === "notice") {
      at = assertVerbatim(b.text, at);
    }
  }
  assert.ok(at <= end, "read past (g)(2)");
  // The closing paragraph is the statute's last sentence of the form, whole.
  assert.ok(official.includes(GA_AFFIDAVIT_COPY_NOTICE));
});

test("GA affidavit: placeholders are the declared fields, and a waiver's values fill the shared ones", () => {
  const form = gaAffidavitOfNonpayment();
  const declared = new Set(form.fields.map((x) => x.key));
  for (const p of placeholdersOf(form.body)) assert.ok(declared.has(p), p);
  assert.equal(placeholdersOf(form.body).size, declared.size);
  const waiverKeys = new Set((GA_FIELDS["conditional-progress"] ?? []).map((x) => x.key));
  const own = form.fields.map((x) => x.key).filter((k) => !waiverKeys.has(k));
  assert.deepEqual(own, ["waiverDate", "waiverAmountCents", "unpaidCents"]);
});

test("GA affidavit renders at 12 pt with the dates, amounts and notary lines", () => {
  const r = renderNotice(gaAffidavitOfNonpayment(), VALUES);
  assert.ok(r.ok, JSON.stringify(!r.ok && r.errors));
  const d = r.document;
  assert.equal(d.formId, GA_AFFIDAVIT_ID);
  assert.equal(d.minFontPt, 12);
  const text = d.blocks
    .map((b) =>
      b.type === "signature"
        ? b.lines.map((l) => `${l.label}: ${l.value}`).join("\n")
        : "text" in b
          ? b.text
          : "",
    )
    .join("\n");
  assert.match(text, /AFFIDAVIT OF NONPAYMENT UNDER O\.C\.G\.A\. 44-14-366/);
  assert.match(text, /DATED October 5, 2026\. THE AMOUNT SET FORTH/);
  assert.match(text, /RELEASE \(\$42,500\.00\) HAS NOT BEEN PAID IN FULL AND \$12,500\.00 OF/);
  assert.match(text, /THIS ______ DAY OF ______________, ____\./);
  assert.match(text, /NOTARY PUBLIC/);
  assert.match(text, /Claimant: Red Clay Electric LLC/);
  assert.match(text, /WITHIN SEVEN DAYS OF FILING/);
});

test("GA affidavit refuses a zero or too-large unpaid amount", () => {
  const form = gaAffidavitOfNonpayment();
  for (const unpaidCents of [0, 4_250_001]) {
    const r = renderNotice(form, { ...VALUES, unpaidCents });
    assert.ok(!r.ok);
    assert.equal(r.errors[0]?.field, "unpaidCents");
  }
  const whole = renderNotice(form, { ...VALUES, unpaidCents: 4_250_000 });
  assert.ok(whole.ok);
});

test("GA affidavit is not offered as a preliminary notice", () => {
  assert.deepEqual(noticeForms("GA"), []);
});

test("GA ninety days: counted in calendar days from the waiver's date", () => {
  assert.deepEqual(gaNinetyDays("2026-10-05", "2026-11-26"), {
    signedOn: "2026-10-05",
    endsOn: "2027-01-03",
    daysLeft: 38,
    ended: false,
  });
  assert.equal(gaNinetyDays("2026-10-05", "2027-01-03").daysLeft, 0);
  assert.equal(gaNinetyDays("2026-10-05", "2027-01-03").ended, false);
  assert.equal(gaNinetyDays("2026-10-05", "2027-01-04").ended, true);
  // Across a leap day.
  assert.equal(gaNinetyDays("2028-01-15", "2028-01-15").endsOn, "2028-04-14");
  assert.equal(gaAffidavitCopyDueOn("2026-12-29"), "2027-01-05");
});
