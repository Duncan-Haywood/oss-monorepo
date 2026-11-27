import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { listForms, render, toPlainText, undeclaredPlaceholders } from "../src/index.ts";
import { WY_BODIES } from "../src/wy.ts";

// The Wyoming Legislature's Title 29, § 29-10-101, fetched 2026-11-25 (see the file's header).
const SOURCE = readFileSync(new URL("../sources/wy-29-10-101.txt", import.meta.url), "utf8")
  .split("\n")
  .filter((l) => !l.startsWith("#"))
  .join(" ");

const BLANK_TOKEN = " \u0000 ";
const normalize = (s: string) => s.replace(/\s+/g, " ").trim();
const official = normalize(SOURCE.replace(/\$?_{3,}/g, BLANK_TOKEN));
const ours = (text: string) =>
  normalize(text.replace(/\{\{\w+\}\}/g, BLANK_TOKEN).replace(/_{3,}/g, BLANK_TOKEN));

/** Every run of words between blanks must appear in the statute, in order. */
function assertVerbatim(text: string, from = 0): number {
  let at = from;
  for (const piece of ours(text).split("\u0000")) {
    const frag = normalize(piece);
    if (frag === "" || frag === "," || frag === "." || frag === ")") continue;
    const found = official.indexOf(frag, at);
    assert.ok(found >= 0, `not in § 29-10-101 as published (after offset ${at}): ${frag}`);
    at = found + frag.length;
  }
  return at;
}

const BASE = {
  customerName: "Teton Builders, Inc.",
  projectName: "Jackson Clinic Addition",
  claimantName: "Cowboy State Electric LLC",
  signedDate: "2026-11-25",
  amountPaidCents: 3_125_000,
  retainageHeldCents: 412_500,
  unpaidCents: 0,
  signerTitle: "Owner",
};

test("WY: every sentence of the form is the statute's own wording, in order", () => {
  let at = 0;
  for (const b of WY_BODIES["unconditional-progress"] ?? []) {
    if (b.type === "notice" || b.type === "title" || b.type === "paragraph") {
      at = assertVerbatim(b.text, at);
    }
  }
  assert.ok(at > 0);
});

test("WY has one verified form for both unconditional kinds; the conditional kinds are absent", () => {
  const forms = listForms("WY");
  assert.deepEqual(
    forms.map((f) => [f.kind, f.body !== null, Boolean(f.absent)]),
    [
      ["conditional-progress", false, true],
      ["unconditional-progress", true, false],
      ["conditional-final", false, true],
      ["unconditional-final", true, false],
    ],
  );
  for (const f of forms) {
    assert.equal(f.citation?.text, "Wyo. Stat. § 29-10-101(b)");
    assert.equal(f.citation?.verification.status, "verified");
    assert.equal(f.citation?.officialUrl, "https://wyoleg.gov/statutes/compress/title29.pdf");
    assert.deepEqual(undeclaredPlaceholders(f), []);
    assert.ok(!f.notes.some((n) => n.startsWith("Statutory text pending")));
  }
});

test("WY form needs the retainage and unpaid amounts, and fills its blanks", () => {
  const form = listForms("wy").find((f) => f.kind === "unconditional-progress");
  assert.ok(form);
  const { retainageHeldCents: _r, unpaidCents: _u, ...partial } = BASE;
  const missing = render(form, partial);
  assert.equal(missing.ok, false);
  if (!missing.ok) {
    const fields = missing.errors.map((e) => e.field);
    assert.ok(fields.includes("retainageHeldCents"));
    assert.ok(fields.includes("unpaidCents"));
  }
  const r = render(form, BASE);
  assert.ok(r.ok, JSON.stringify(!r.ok && r.errors));
  const text = toPlainText(r.document);
  assert.match(text, /^Note to lien claimant: Signing this form has legal implications/);
  assert.match(text, /\nLIEN WAIVER\n/);
  assert.match(text, /TO: Teton Builders, Inc\./);
  assert.match(text, /FROM: Cowboy State Electric LLC/);
  assert.match(text, /PAYMENT: \$31,250\.00/);
  assert.match(text, /withheld as retainage in the amount of \$4,125\.00, and any labor/);
  assert.match(text, /has not been paid the sum of \$0\.00 for work performed/);
  assert.match(text, /Title: Owner/);
  // The acknowledgment's blanks are left for the notarial officer.
  assert.match(text, /acknowledged before me on this _____ day of _____________, 20___, by/);
  assert.match(text, /Notarial officer/);
  assert.equal(r.document.citation, "Wyo. Stat. § 29-10-101(b)");
});

test("WY conditional waivers are refused with the reason, never made up", () => {
  const form = listForms("WY").find((f) => f.kind === "conditional-progress");
  assert.ok(form);
  const r = render(form, BASE);
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.errors[0]?.code, "NO_STATUTORY_FORM");
    assert.match(r.errors[0]?.message ?? "", /§ 29-10-101\(b\)/);
  }
});
