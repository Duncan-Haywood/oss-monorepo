import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { listForms, render, toPlainText, undeclaredPlaceholders } from "../src/index.ts";

const BASE = {
  customerName: "Great Lakes Builders LLC",
  workProvided: "electrical labor and materials",
  jobLocation: "1200 Example Ave, Grand Rapids MI",
  paymentAmountCents: 1_850_000,
  throughDate: "2026-10-31",
  claimantName: "Wolverine Electric Inc.",
  signedDate: "2026-11-25",
};

const statute = readFileSync(new URL("../sources/mi-570-1115.txt", import.meta.url), "utf8")
  .split("\n")
  .filter((l) => !l.startsWith("#"))
  .join(" ")
  .replace(/\s+/g, " ");

test("MI forms are verified, renderable and declare every blank", () => {
  const forms = listForms("MI");
  assert.equal(forms.length, 4);
  for (const f of forms) {
    assert.equal(f.source, "statutory");
    assert.equal(f.citation?.verification.status, "verified");
    assert.equal(f.citation?.text, "Mich. Comp. Laws § 570.1115");
    assert.ok(f.body, f.kind);
    assert.equal(f.absent, undefined);
    assert.deepEqual(undeclaredPlaceholders(f), []);
  }
});

test("every MI sentence without a blank appears in the statute", () => {
  for (const f of listForms("MI")) {
    for (const b of f.body ?? []) {
      if (!("text" in b)) continue;
      for (const sentence of b.text.split(/(?<=\.) /)) {
        if (sentence.includes("{{")) continue;
        assert.ok(statute.includes(sentence), `${f.kind}: "${sentence}"`);
      }
    }
  }
});

test("MI partial conditional fills the blanks and keeps the circle-one choice for the signer", () => {
  const form = listForms("mi").find((f) => f.kind === "conditional-progress");
  assert.ok(form);
  const r = render(form, BASE);
  assert.ok(r.ok, JSON.stringify(!r.ok && r.errors));
  const text = toPlainText(r.document);
  assert.match(text, /^PARTIAL CONDITIONAL WAIVER/);
  assert.match(
    text,
    /I\/we have a contract with Great Lakes Builders LLC to provide electrical labor and materials for the improvement to the property described as: 1200 Example Ave, Grand Rapids MI, and by signing this waiver waive my\/our construction lien to the amount of \$18,500\.00, for labor\/materials provided through October 31, 2026\./,
  );
  assert.match(text, /\(circle one\) does does not cover/);
  assert.match(text, /This waiver is conditioned on actual payment of the amount shown above\./);
  assert.match(text, /Lien Claimant: Wolverine Electric Inc\./);
  assert.match(text, /Signed on: November 25, 2026/);
  assert.match(text, /DO NOT SIGN BLANK OR INCOMPLETE FORMS\. RETAIN A COPY\.\s*$/);
});

test("MI full unconditional has no amount or through date; full conditional names the payment", () => {
  const forms = listForms("MI");
  const full = forms.find((f) => f.kind === "unconditional-final");
  assert.ok(full);
  assert.deepEqual(
    full.fields.map((x) => x.key).filter((k) => k === "paymentAmountCents" || k === "throughDate"),
    [],
  );
  const { paymentAmountCents: _a, throughDate: _t, ...rest } = BASE;
  const r = render(full, rest);
  assert.ok(r.ok, JSON.stringify(!r.ok && r.errors));
  assert.match(toPlainText(r.document), /has been fully paid and satisfied\./);

  const cond = forms.find((f) => f.kind === "conditional-final");
  assert.ok(cond);
  const c = render(cond, rest);
  assert.equal(c.ok, false, "the conditional full waiver needs the payment it is conditioned on");
  const ok = render(cond, { ...rest, paymentAmountCents: 4_200_000 });
  assert.ok(ok.ok);
  assert.match(toPlainText(ok.document), /conditioned on actual payment of \$42,000\.00\./);
});

test("MI refuses to render without the statute's required blanks", () => {
  const form = listForms("MI").find((f) => f.kind === "unconditional-progress");
  assert.ok(form);
  const r = render(form, { claimantName: "X", signedDate: "2026-11-25" });
  assert.equal(r.ok, false);
  if (r.ok) return;
  const got = r.errors.map((e) => `${e.field}:${e.code}`);
  for (const k of [
    "customerName",
    "workProvided",
    "jobLocation",
    "paymentAmountCents",
    "throughDate",
  ]) {
    assert.ok(got.includes(`${k}:REQUIRED`), k);
  }
});
