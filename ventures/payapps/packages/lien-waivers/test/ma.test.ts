import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  allForms,
  alternativeForms,
  amountInWords,
  formById,
  GENERIC_NOTICE,
  hasStatutoryForms,
  listForms,
  MA_PARTIAL_FORM_ID,
  render,
  toPlainText,
  undeclaredPlaceholders,
  WAIVER_KINDS,
} from "../src/index.ts";
import { MA_BODY } from "../src/ma.ts";

// The General Court's text of c. 254, § 32, fetched 2026-11-26 (see the file's header).
const SOURCE = readFileSync(new URL("../sources/ma-254-32.txt", import.meta.url), "utf8")
  .split("\n")
  .filter((l) => !l.startsWith("#"))
  .join(" ");

const BLANK_TOKEN = " \u0000 ";
const normalize = (s: string) => s.replace(/\s+/g, " ").trim();
const official = normalize(SOURCE.replace(/\$?_{2,}/g, BLANK_TOKEN));
const ours = (text: string) =>
  normalize(text.replace(/\{\{\w+\}\}/g, BLANK_TOKEN).replace(/_{2,}/g, BLANK_TOKEN));

/** Every run of words between blanks must appear in the statute, in order. */
function assertVerbatim(text: string, from = 0): number {
  let at = from;
  for (const piece of ours(text).split("\u0000")) {
    const frag = normalize(piece);
    if (["", ",", ".", ":", "(", ")"].includes(frag)) continue;
    const found = official.indexOf(frag, at);
    assert.ok(found >= 0, `not in c. 254, § 32 as published (after offset ${at}): ${frag}`);
    at = found + frag.length;
  }
  return at;
}

const BASE = {
  signedDate: "2026-11-26",
  county: "Middlesex",
  applicationNumber: "4",
  ownerName: "Example Realty Trust",
  contractorName: "Bay State Drywall LLC",
  lenderName: "Example Savings Bank",
  originalContractCents: 50_000_000,
  approvedChangeOrders: "$2,500.00",
  adjustedContractCents: 50_250_000,
  completedToDateCents: 20_100_000,
  retainageCents: 1_005_000,
  totalPayableCents: 19_095_000,
  previousPaymentsCents: 14_250_000,
  currentAmountDueCents: 4_845_000,
  pendingChangeOrders: "$1,200.00",
  disputedClaimsCents: 0,
  customerName: "Example Builders Inc.",
  propertyDescription: "Example Commons, 12 Example Street",
  cityOrTown: "Cambridge",
  paymentAmountWords: "Forty-Eight Thousand Four Hundred Fifty and 00/100 Dollars",
  paymentAmountCents: 4_845_000,
  invoiceDate: "2026-10-31",
  throughDate: "2026-10-31",
  signerName: "Dana Example",
  signerTitle: "Manager",
};

test("MA partial waiver: every sentence and line is the statute's own wording, in order", () => {
  let at = official.indexOf("Partial Waiver and Subordination of Lien");
  assert.ok(at > 0);
  for (const b of MA_BODY) {
    if (b.type === "title" || b.type === "heading" || b.type === "paragraph") {
      at = assertVerbatim(b.text, at);
    } else if (b.type === "field") {
      at = assertVerbatim(`${b.label}:`, at);
    }
  }
  assert.ok(at < official.indexOf("The giving of a partial waiver"));
});

test("MA is not a statutory-forms state: the general forms, with Massachusetts notes", () => {
  assert.equal(hasStatutoryForms("MA"), false);
  const forms = listForms("ma");
  assert.deepEqual(
    forms.map((f) => [f.kind, f.source]),
    WAIVER_KINDS.map((k) => [k, "generic"]),
  );
  for (const f of forms) {
    assert.ok(f.notes.includes(GENERIC_NOTICE));
    assert.ok(f.notes.some((n) => n.includes("c. 254, § 32")));
  }
  assert.ok(!listForms("NH")[0]?.notes.some((n) => n.includes("c. 254")));
  assert.deepEqual(alternativeForms("NH"), []);
});

test("MA offers its § 32(4) partial waiver beside the general conditional progress form", () => {
  const alts = alternativeForms("MA");
  assert.equal(alts.length, 1);
  const form = alts[0];
  assert.ok(form?.body);
  assert.equal(form.id, MA_PARTIAL_FORM_ID);
  assert.equal(form.kind, "conditional-progress");
  assert.equal(form.source, "statutory");
  assert.equal(form.citation?.verification.status, "verified");
  assert.match(form.appliesTo ?? "", /notice of contract/);
  assert.deepEqual(undeclaredPlaceholders(form), []);
  assert.equal(allForms("MA").length, 5);
  assert.equal(formById("MA", MA_PARTIAL_FORM_ID)?.id, MA_PARTIAL_FORM_ID);
  assert.equal(formById("CT", MA_PARTIAL_FORM_ID), undefined);
});

test("MA partial waiver fills the pay application's lines and the recital", () => {
  const form = formById("MA", MA_PARTIAL_FORM_ID);
  assert.ok(form);
  const missing = render(form, { ...BASE, county: "" });
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.ok(missing.errors.some((e) => e.field === "county"));
  const r = render(form, BASE);
  assert.ok(r.ok, JSON.stringify(!r.ok && r.errors));
  const text = toPlainText(r.document);
  assert.match(text, /^PARTIAL WAIVER AND SUBORDINATION OF LIEN\n/);
  assert.match(text, /COMMONWEALTH OF MASSACHUSETTS: Date: November 26, 2026\n/);
  assert.match(text, /Middlesex COUNTY\n/);
  assert.match(text, /1\. Original Contract Amount: \$500,000\.00\n/);
  assert.match(text, /2\. Approved Change Orders: \$2,500\.00\n/);
  assert.match(text, /8\. Current Amount Due: \$48,450\.00\n/);
  assert.match(text, /10\. Disputed Claims: \$0\.00\n/);
  assert.match(
    text,
    /known and identified as Example Commons, 12 Example Street located in Cambridge \(city or town\), Middlesex County, Commonwealth of Massachusetts and owned by Example Realty Trust, upon receipt of Forty-Eight Thousand Four Hundred Fifty and 00\/100 Dollars \(\$48,450\.00\) in payment of an invoice\/requisition\/application for payment dated October 31, 2026 does hereby:/,
  );
  assert.match(text, /through the following date: October 31, 2026 \(payment period\)/);
  assert.match(text, /Signed under the penalties of perjury this _+ day of _+, _+\./);
  assert.match(text, /Name: Dana Example\nTitle: Manager\nFor: Bay State Drywall LLC/);
  assert.equal(r.document.citation, "Mass. Gen. Laws c. 254, § 32(4)");
  // A blank optional line prints a rule to fill by hand.
  const noLender = render(form, { ...BASE, lenderName: "" });
  assert.ok(noLender.ok);
  assert.match(toPlainText(noLender.document), /LENDER\/MORTGAGEE: _+\n/);
});

test("amountInWords writes dollars as cheques do", () => {
  assert.equal(amountInWords(0), "Zero and 00/100 Dollars");
  assert.equal(amountInWords(5), "Zero and 05/100 Dollars");
  assert.equal(amountInWords(100), "One and 00/100 Dollars");
  assert.equal(amountInWords(1_900), "Nineteen and 00/100 Dollars");
  assert.equal(
    amountInWords(1_234_567),
    "Twelve Thousand Three Hundred Forty-Five and 67/100 Dollars",
  );
  assert.equal(
    amountInWords(4_845_000),
    "Forty-Eight Thousand Four Hundred Fifty and 00/100 Dollars",
  );
  assert.equal(amountInWords(100_000_000), "One Million and 00/100 Dollars");
  assert.equal(
    amountInWords(200_001_000_99),
    "Two Hundred Million One Thousand and 99/100 Dollars",
  );
  assert.throws(() => amountInWords(-1), RangeError);
  assert.throws(() => amountInWords(1.5), RangeError);
});
