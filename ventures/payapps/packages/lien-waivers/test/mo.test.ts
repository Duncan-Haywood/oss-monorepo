import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  allForms,
  alternativeForms,
  formById,
  GENERIC_NOTICE,
  hasStatutoryForms,
  listForms,
  MO_RESIDENTIAL_FORM_ID,
  render,
  toPlainText,
  undeclaredPlaceholders,
  WAIVER_KINDS,
} from "../src/index.ts";
import { MO_BODY } from "../src/mo.ts";

// The Missouri Revisor's text of § 429.016, fetched 2026-11-25 (see the file's header). The form
// prints captions where its blanks go, e.g. "(Provide legal description of the Property)".
const SOURCE = readFileSync(new URL("../sources/mo-429-016.txt", import.meta.url), "utf8")
  .split("\n")
  .filter((l) => !l.startsWith("#"))
  .join(" ");

const BLANK_TOKEN = " \u0000 ";
const normalize = (s: string) => s.replace(/\s+/g, " ").trim();
const official = normalize(SOURCE.replace(/\((provide|Provide) [^)]*\)/g, BLANK_TOKEN));
const ours = (text: string) => normalize(text.replace(/\{\{\w+\}\}/g, BLANK_TOKEN));

/** Every run of words between blanks must appear in the statute, in order. */
function assertVerbatim(text: string, from = 0): number {
  let at = from;
  for (const piece of ours(text).split("\u0000")) {
    const frag = normalize(piece);
    if (frag === "" || frag === "," || frag === "." || frag === ":") continue;
    const found = official.indexOf(frag, at);
    assert.ok(found >= 0, `not in § 429.016 as published (after offset ${at}): ${frag}`);
    at = found + frag.length;
  }
  return at;
}

const BASE = {
  claimantName: "Show-Me Framing LLC",
  claimantAddress: "400 Example Rd, Springfield, MO 65802",
  legalDescription: "Lot 12, Block 3, Example Ridge Subdivision, Greene County, Missouri",
  signerName: "Dana Example",
  signerTitle: "Member",
  signerAddress: "400 Example Rd, Springfield, MO 65802",
  signerPhone: "417-555-0100",
  signedDate: "2026-11-25",
};

test("MO residential form: every sentence is the statute's own wording, in order", () => {
  let at = 0;
  for (const b of MO_BODY) {
    if (b.type === "title" || b.type === "heading" || b.type === "paragraph") {
      at = assertVerbatim(b.text, at);
    }
  }
  assert.ok(at > official.indexOf("27. An unconditional, final mechanic's lien waiver"));
});

test("MO is not a statutory-forms state: the general forms, with Missouri notes", () => {
  assert.equal(hasStatutoryForms("MO"), false);
  const forms = listForms("mo");
  assert.deepEqual(
    forms.map((f) => [f.kind, f.source]),
    WAIVER_KINDS.map((k) => [k, "generic"]),
  );
  for (const f of forms) {
    assert.ok(f.notes.includes(GENERIC_NOTICE));
    assert.ok(f.notes.some((n) => n.includes("§ 429.016.27")));
    assert.equal(f.appliesTo, undefined);
  }
  // Other general-form states are unchanged.
  assert.ok(!listForms("NY")[0]?.notes.some((n) => n.includes("429.016")));
  assert.deepEqual(alternativeForms("NY"), []);
});

test("MO offers its residential unconditional final form beside the general one", () => {
  const alts = alternativeForms("MO");
  assert.equal(alts.length, 1);
  const form = alts[0];
  assert.ok(form?.body);
  assert.equal(form.id, MO_RESIDENTIAL_FORM_ID);
  assert.equal(form.kind, "unconditional-final");
  assert.equal(form.source, "statutory");
  assert.equal(form.citation?.verification.status, "verified");
  assert.match(form.appliesTo ?? "", /Residential real property/);
  assert.match(form.appliesTo ?? "", /owner-occupied/);
  assert.deepEqual(undeclaredPlaceholders(form), []);
  assert.equal(allForms("MO").length, 5);
  assert.equal(formById("MO", MO_RESIDENTIAL_FORM_ID)?.id, MO_RESIDENTIAL_FORM_ID);
  assert.equal(formById("MO", "MO/unconditional-final/generic")?.source, "generic");
  assert.equal(formById("KS", MO_RESIDENTIAL_FORM_ID), undefined);
});

test("MO residential form fills its two blanks and the signature block the statute asks for", () => {
  const form = formById("MO", MO_RESIDENTIAL_FORM_ID);
  assert.ok(form);
  const missing = render(form, { ...BASE, signerPhone: "" });
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.ok(missing.errors.some((e) => e.field === "signerPhone"));
  const r = render(form, BASE);
  assert.ok(r.ok, JSON.stringify(!r.ok && r.errors));
  const text = toPlainText(r.document);
  assert.match(text, /^UNCONDITIONAL FINAL LIEN WAIVER\n\nFOR RESIDENTIAL REAL PROPERTY/);
  assert.match(
    text,
    /Claimant Show-Me Framing LLC, 400 Example Rd, Springfield, MO 65802 hereby fully, finally, and unconditionally waives/,
  );
  assert.match(text, /Lot 12, Block 3, Example Ridge Subdivision/);
  // The date signed sits beside the signature (§ 429.016.27).
  assert.match(text, /Signature: _+\nDate signed: November 25, 2026\n/);
  assert.match(text, /Telephone: 417-555-0100/);
  assert.equal(r.document.citation, "Mo. Rev. Stat. § 429.016.27");
});
