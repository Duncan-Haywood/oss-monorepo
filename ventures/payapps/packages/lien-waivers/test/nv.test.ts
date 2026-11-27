import assert from "node:assert/strict";
import { test } from "node:test";
import { listForms, render, toPlainText, undeclaredPlaceholders } from "../src/index.ts";

const BASE = {
  projectName: "Henderson Clinic TI",
  jobLocation: "200 Example Pkwy, Henderson NV",
  customerName: "Silver State Builders",
  invoiceNumber: "Pay App 3",
  paymentAmountCents: 4_275_050,
  claimantName: "Basin Mechanical Inc.",
  signerTitle: "President",
  signedDate: "2026-11-25",
};

test("NV forms are verified, renderable and declare every blank", () => {
  const forms = listForms("NV");
  assert.equal(forms.length, 4);
  for (const f of forms) {
    assert.equal(f.source, "statutory");
    assert.equal(f.citation?.verification.status, "verified");
    assert.ok(f.body);
    assert.deepEqual(undeclaredPlaceholders(f), []);
  }
});

test("NV conditional progress fills the header blanks and the signature block", () => {
  const form = listForms("nv").find((f) => f.kind === "conditional-progress");
  assert.ok(form);
  const r = render(form, BASE);
  assert.ok(r.ok, JSON.stringify(!r.ok && r.errors));
  const text = toPlainText(r.document);
  assert.match(text, /^CONDITIONAL WAIVER AND RELEASE UPON PROGRESS PAYMENT/);
  assert.match(text, /Property Name: Henderson Clinic TI/);
  assert.match(text, /Undersigned’s Customer: Silver State Builders/);
  assert.match(text, /Invoice\/Payment Application Number: Pay App 3/);
  assert.match(text, /Payment Amount: \$42,750\.50/);
  assert.match(text, /Dated: November 25, 2026/);
  assert.match(text, /Company Name: Basin Mechanical Inc\./);
  assert.match(text, /By: _+/);
  assert.match(text, /Its: President/);
  assert.equal(r.document.citation, "Nev. Rev. Stat. § 108.2457");
});

test("NV final forms take the disputed claims; a blank prints a fill-in line", () => {
  const form = listForms("NV").find((f) => f.kind === "conditional-final");
  assert.ok(form);
  const r = render(form, { ...BASE, paymentPeriod: "October 2026" });
  assert.ok(r.ok);
  const text = toPlainText(r.document);
  assert.match(text, /Payment Period: October 2026/);
  assert.match(text, /Amount of Disputed Claims: _+/);
});

test("NV's two unconditional notices differ as the statute's do", () => {
  const notice = (kind: string) =>
    listForms("NV")
      .find((f) => f.kind === kind)
      ?.body?.find((b) => b.type === "notice");
  const progress = notice("unconditional-progress");
  const final = notice("unconditional-final");
  assert.ok(progress?.type === "notice" && final?.type === "notice");
  assert.match(progress.text, /to the extent of the Payment Amount or the amount received\./);
  assert.match(final.text, /even if you have not been paid\./);
  assert.equal(notice("conditional-progress"), undefined);
});

test("NV refuses to render without the statute's required blanks", () => {
  const form = listForms("NV").find((f) => f.kind === "unconditional-progress");
  assert.ok(form);
  const r = render(form, { throughDate: "2026-10-31" });
  assert.equal(r.ok, false);
  if (r.ok) return;
  const got = r.errors.map((e) => `${e.field}:${e.code}`).sort();
  assert.ok(got.includes("throughDate:UNKNOWN_FIELD"), "Nevada's forms have no through date");
  for (const k of ["paymentAmountCents", "invoiceNumber", "customerName", "jobLocation"]) {
    assert.ok(got.includes(`${k}:REQUIRED`), k);
  }
});
