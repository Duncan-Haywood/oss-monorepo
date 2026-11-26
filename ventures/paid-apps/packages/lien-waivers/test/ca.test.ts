import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { listForms, render, toPlainText, undeclaredPlaceholders } from "../src/index.ts";

const BASE = {
  claimantName: "Golden Gate Drywall Inc.",
  customerName: "Bayview Builders",
  jobLocation: "500 Example St, Oakland CA",
  ownerName: "Example Properties LLC",
  signerTitle: "President",
  signedDate: "2026-11-25",
};

const snapshot = readFileSync(new URL("../sources/ca-8132-8138.txt", import.meta.url), "utf8")
  .split("\n")
  .filter((l) => !l.startsWith("#"))
  .join(" ")
  .replace(/\s+/g, " ");

test("CA forms are verified, renderable, cite one section each and declare every blank", () => {
  const forms = listForms("CA");
  assert.equal(forms.length, 4);
  for (const f of forms) {
    assert.equal(f.source, "statutory");
    assert.equal(f.citation?.verification.status, "verified");
    assert.ok(f.body);
    assert.equal(f.absent, undefined);
    assert.deepEqual(undeclaredPlaceholders(f), []);
    assert.ok(!f.notes.some((n) => n.startsWith("Statutory text pending")));
  }
});

test("every sentence of every CA form is in the statute, in order", () => {
  for (const f of listForms("CA")) {
    assert.ok(f.body);
    let at = 0;
    for (const b of f.body) {
      if (b.type !== "paragraph" && b.type !== "notice" && b.type !== "title") continue;
      for (const part of b.text.split(/\{\{\w+\}\}/)) {
        const p = part.trim();
        if (!p) continue;
        const i = snapshot.indexOf(p, at);
        assert.ok(i >= 0, `${f.kind}: not in the statute after offset ${at}: ${p}`);
        at = i + p.length;
      }
    }
  }
});

test("CA conditional progress fills the check, the through date and the prior unpaid waivers", () => {
  const form = listForms("ca").find((f) => f.kind === "conditional-progress");
  assert.ok(form);
  const r = render(form, {
    ...BASE,
    throughDate: "2026-10-31",
    checkMaker: "Bayview Builders",
    checkAmountCents: 4_500_000,
    checkPayee: "Golden Gate Drywall Inc.",
    priorWaiverDates: "2026-09-30",
    priorUnpaidAmounts: "12,500.00",
  });
  assert.ok(r.ok, JSON.stringify(!r.ok && r.errors));
  const text = toPlainText(r.document);
  assert.match(text, /^CONDITIONAL WAIVER AND RELEASE ON PROGRESS PAYMENT/);
  assert.match(text, /Amount of Check: \$45,000\.00/);
  assert.match(text, /Through Date: /);
  assert.match(text, /Date\(s\) of waiver and release: /);
  assert.match(text, /12,500\.00/);
  assert.match(text, /\(4\) Contract rights/);
  assert.equal(r.document.citation, "Cal. Civ. Code § 8132");
});

test("CA unconditional forms carry the Notice to Claimant right under the title", () => {
  for (const kind of ["unconditional-progress", "unconditional-final"] as const) {
    const body = listForms("CA").find((f) => f.kind === kind)?.body;
    assert.ok(body);
    assert.equal(body[0]?.type, "title");
    const notice = body[1];
    assert.ok(notice?.type === "notice");
    assert.match(notice.text, /^NOTICE TO CLAIMANT: .*EVEN IF YOU HAVE NOT BEEN PAID\./);
  }
});

test("CA unconditional progress needs the payment received; final needs no amount", () => {
  const progress = listForms("CA").find((f) => f.kind === "unconditional-progress");
  const final = listForms("CA").find((f) => f.kind === "unconditional-final");
  assert.ok(progress && final);
  const missing = render(progress, { ...BASE, throughDate: "2026-10-31" });
  assert.equal(missing.ok, false);
  if (!missing.ok)
    assert.ok(missing.errors.some((e) => e.field === "amountPaidCents" && e.code === "REQUIRED"));
  const ok = render(final, { ...BASE, disputedClaimsCents: 320_000 });
  assert.ok(ok.ok, JSON.stringify(!ok.ok && ok.errors));
  const text = toPlainText(ok.document);
  assert.match(text, /The claimant has been paid in full\./);
  assert.match(text, /Disputed claims for extras in the amount of: \$3,200\.00/);
});

test("CA final forms take no through date (the statute has none)", () => {
  const form = listForms("CA").find((f) => f.kind === "conditional-final");
  assert.ok(form);
  const r = render(form, {
    ...BASE,
    checkMaker: "Bayview Builders",
    checkAmountCents: 1,
    checkPayee: "Golden Gate Drywall Inc.",
    throughDate: "2026-10-31",
  });
  assert.equal(r.ok, false);
  if (!r.ok)
    assert.ok(r.errors.some((e) => e.field === "throughDate" && e.code === "UNKNOWN_FIELD"));
});
