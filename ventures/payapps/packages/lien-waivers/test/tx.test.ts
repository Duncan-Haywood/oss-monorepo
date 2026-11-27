import assert from "node:assert/strict";
import { test } from "node:test";
import { listForms, render, toPlainText, undeclaredPlaceholders } from "../src/index.ts";

const BASE = {
  projectName: "Riverside Clinic TI",
  jobNumber: "24-117",
  ownerName: "Riverside Health Partners LLC",
  jobLocation: "1200 Example Blvd, Austin TX",
  jobDescription: "electrical work in Pay Application No. 4",
  customerName: "Lone Star Builders",
  claimantName: "Hill Country Electric Inc.",
  signerTitle: "President",
  signedDate: "2026-11-25",
};

test("TX forms are verified, renderable and declare every blank", () => {
  const forms = listForms("TX");
  assert.equal(forms.length, 4);
  for (const f of forms) {
    assert.equal(f.source, "statutory");
    assert.equal(f.citation?.verification.status, "verified");
    assert.equal(f.citation?.text, "Tex. Prop. Code § 53.284");
    assert.ok(f.body);
    assert.equal(f.absent, undefined);
    assert.deepEqual(undeclaredPlaceholders(f), []);
  }
});

test("TX conditional progress fills the check, the property and the signature", () => {
  const form = listForms("tx").find((f) => f.kind === "conditional-progress");
  assert.ok(form);
  const r = render(form, {
    ...BASE,
    checkMaker: "Lone Star Builders",
    checkAmountCents: 1_834_000,
    checkPayee: "Hill Country Electric Inc.",
  });
  assert.ok(r.ok, JSON.stringify(!r.ok && r.errors));
  const text = toPlainText(r.document);
  assert.match(text, /^CONDITIONAL WAIVER AND RELEASE ON PROGRESS PAYMENT/);
  assert.match(text, /a check from Lone Star Builders in the sum of \$18,340\.00 payable to Hill/);
  assert.match(text, /on the property of Riverside Health Partners LLC located at 1200 Example/);
  assert.match(text, /to the following extent: electrical work in Pay Application No\. 4\./);
  assert.match(text, /attached statement\(s\) or progress payment request\(s\)/);
  assert.match(text, /Company name: Hill Country Electric Inc\./);
  assert.equal(r.document.citation, "Tex. Prop. Code § 53.284");
});

test("TX unconditional forms open with the statute's notice, above the title", () => {
  for (const kind of ["unconditional-progress", "unconditional-final"] as const) {
    const body = listForms("TX").find((f) => f.kind === kind)?.body;
    assert.ok(body);
    assert.equal(body[0]?.type, "notice", `${kind}: notice first (§ 53.284(c)(1), (e)(1))`);
    assert.equal(body[1]?.type, "title");
    const notice = body[0];
    assert.ok(notice?.type === "notice");
    assert.match(notice.text, /It is prohibited for a person to require you to sign this document/);
  }
  for (const kind of ["conditional-progress", "conditional-final"] as const) {
    const body = listForms("TX").find((f) => f.kind === kind)?.body;
    assert.ok(!body?.some((b) => b.type === "notice"), `${kind}: no unconditional notice`);
  }
});

test("TX unconditional progress needs the amount received; final needs none", () => {
  const progress = listForms("TX").find((f) => f.kind === "unconditional-progress");
  const final = listForms("TX").find((f) => f.kind === "unconditional-final");
  assert.ok(progress && final);
  const missing = render(progress, BASE);
  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.ok(missing.errors.some((e) => e.field === "amountPaidCents" && e.code === "REQUIRED"));
  }
  const ok = render(final, BASE);
  assert.ok(ok.ok, JSON.stringify(!ok.ok && ok.errors));
  assert.match(toPlainText(ok.document), /has been paid in full for all labor/);
});

test("TX forms take no through date (the statute has none)", () => {
  const form = listForms("TX").find((f) => f.kind === "conditional-final");
  assert.ok(form);
  const r = render(form, { ...BASE, throughDate: "2026-10-31" });
  assert.equal(r.ok, false);
  if (!r.ok)
    assert.ok(r.errors.some((e) => e.field === "throughDate" && e.code === "UNKNOWN_FIELD"));
});
