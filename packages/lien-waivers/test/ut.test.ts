import assert from "node:assert/strict";
import { test } from "node:test";
import { listForms, render, toPlainText, undeclaredPlaceholders } from "../src/index.ts";

const BASE = {
  projectName: "Draper Office Shell",
  jobLocation: "50 Example Way, Draper UT",
  customerName: "Wasatch General Contractors",
  invoiceNumber: "Pay Application No. 2",
  paymentAmountCents: 2_610_075,
  claimantName: "Beehive Drywall LLC",
  signerTitle: "Manager",
  signedDate: "2026-11-25",
};

test("UT has two verified forms; the unconditional kinds are absent, not pending", () => {
  const forms = listForms("UT");
  assert.deepEqual(
    forms.map((f) => [f.kind, f.body !== null, Boolean(f.absent)]),
    [
      ["conditional-progress", true, false],
      ["unconditional-progress", false, true],
      ["conditional-final", true, false],
      ["unconditional-final", false, true],
    ],
  );
  for (const f of forms) {
    assert.equal(f.citation?.verification.status, "verified");
    assert.deepEqual(undeclaredPlaceholders(f), []);
  }
});

test("UT progress form fills its header and needs the payment period", () => {
  const form = listForms("ut").find((f) => f.kind === "conditional-progress");
  assert.ok(form);
  const missing = render(form, BASE);
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.ok(missing.errors.some((e) => e.field === "paymentPeriod"));
  const r = render(form, { ...BASE, paymentPeriod: "2026-10-01 to 2026-10-31" });
  assert.ok(r.ok, JSON.stringify(!r.ok && r.errors));
  const text = toPlainText(r.document);
  assert.match(text, /^UTAH CONDITIONAL WAIVER AND RELEASE UPON PROGRESS PAYMENT/);
  assert.match(text, /Undersigned's Customer: Wasatch General Contractors/);
  assert.match(text, /Payment Amount: \$26,100\.75/);
  assert.match(text, /Payment Period: 2026-10-01 to 2026-10-31/);
  assert.match(text, /Its: Manager/);
  assert.equal(r.document.citation, "Utah Code § 38-1a-802");
});

test("UT final form is the statute's unlabelled one, effective once the check is paid", () => {
  const form = listForms("UT").find((f) => f.kind === "conditional-final");
  assert.ok(form);
  const r = render(form, BASE);
  assert.ok(r.ok, JSON.stringify(!r.ok && r.errors));
  const text = toPlainText(r.document);
  assert.match(text, /^UTAH WAIVER AND RELEASE UPON FINAL PAYMENT/);
  assert.match(text, /\(2\) the check is paid by the depository institution/);
  assert.doesNotMatch(text, /Payment Period/);
});

test("UT unconditional kinds refuse with the reason, never generic wording", () => {
  const form = listForms("UT").find((f) => f.kind === "unconditional-final");
  assert.ok(form?.absent);
  const r = render(form, BASE);
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.errors[0]?.code, "NO_STATUTORY_FORM");
  assert.match(r.errors[0]?.message ?? "", /no unconditional waiver form/);
  assert.match(r.errors[0]?.message ?? "", /§ 38-1a-802\(4\)/);
});
