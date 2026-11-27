import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { AZ_BODIES } from "../src/az.ts";
import {
  listForms,
  render,
  toPlainText,
  undeclaredPlaceholders,
  WAIVER_KINDS,
} from "../src/index.ts";

// The Arizona Legislature's text, fetched 2026-11-25 (see the file's header).
const SOURCE = readFileSync(new URL("../sources/az-33-1008.txt", import.meta.url), "utf8")
  .split("\n")
  .filter((l) => !l.startsWith("#"))
  // Captions under blanks, e.g. "(maker of check)" or "(amount of check)    (payee ...)".
  .filter((l) => !/^\s*(\([^)]*\)\s*)+$/.test(l))
  .join(" ");

const BLANK_TOKEN = " \u0000 ";
const normalize = (s: string) => s.replace(/\s+/g, " ").trim();
/** Statute blanks ("$______", "____") and our placeholders both become one token. */
const official = normalize(SOURCE.replace(/\$?\s*_{3,}/g, BLANK_TOKEN));
const ours = (text: string) => normalize(text.replace(/\{\{\w+\}\}/g, BLANK_TOKEN));

/** Every run of words between blanks must appear in the statute, in order. */
function assertVerbatim(text: string, from = 0): number {
  let at = from;
  for (const piece of ours(text).split("\u0000")) {
    const frag = normalize(piece);
    if (frag === "" || frag === "," || frag === ".") continue;
    const found = official.indexOf(frag, at);
    assert.ok(found >= 0, `not in § 33-1008 as published (after offset ${at}): ${frag}`);
    at = found + frag.length;
  }
  return at;
}

for (const kind of WAIVER_KINDS) {
  test(`AZ ${kind}: every sentence is the statute's own wording, in order`, () => {
    let at = 0;
    for (const b of AZ_BODIES[kind]) {
      if (b.type === "title" || b.type === "paragraph" || b.type === "notice") {
        at = assertVerbatim(b.text, b.type === "notice" ? 0 : at);
      } else if (b.type === "field") {
        assertVerbatim(`${b.label}: ${b.value}`, 0);
      }
    }
  });
}

test("AZ forms are verified, renderable and declare every blank", () => {
  const forms = listForms("AZ");
  assert.equal(forms.length, 4);
  for (const f of forms) {
    assert.equal(f.source, "statutory");
    assert.equal(f.citation?.verification.status, "verified");
    assert.ok(f.body);
    assert.deepEqual(undeclaredPlaceholders(f), []);
  }
});

test("AZ conditional progress renders the payment, parties and through date", () => {
  const form = listForms("az").find((f) => f.kind === "conditional-progress");
  assert.ok(form);
  const r = render(form, {
    projectName: "Mesa Clinic TI",
    jobNumber: "24-117",
    ownerName: "Desert Health LLC",
    jobDescription: "Tenant improvement, 100 W Main St, Mesa AZ",
    customerName: "Copper State Builders",
    claimantName: "Saguaro Drywall Inc.",
    signerTitle: "President",
    signedDate: "2026-11-25",
    checkMaker: "Copper State Builders",
    checkAmountCents: 4_275_050,
    checkPayee: "Saguaro Drywall Inc.",
    throughDate: "2026-10-31",
  });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  const text = toPlainText(r.document);
  assert.match(text, /check from Copper State Builders in the sum of \$42,750\.50 payable to/);
  assert.match(text, /through October 31, 2026 only and does not cover any retention/);
  assert.match(text, /Company name: Saguaro Drywall Inc\./);
  assert.match(text, /By \(Signature\): _+/);
  assert.equal(r.document.citation, "Ariz. Rev. Stat. § 33-1008");
});

test("AZ unconditional forms carry the statutory notice; conditional ones do not", () => {
  for (const f of listForms("AZ")) {
    const hasNotice = (f.body ?? []).some(
      (b) => b.type === "notice" && b.text.startsWith("Notice: This document waives rights"),
    );
    assert.equal(hasNotice, f.kind.startsWith("unconditional"), f.kind);
  }
});

test("AZ refuses to render without the owner, job and contracting party", () => {
  const form = listForms("AZ").find((f) => f.kind === "unconditional-final");
  assert.ok(form);
  const r = render(form, {});
  assert.equal(r.ok, false);
  if (r.ok) return;
  const missing = r.errors.map((e) => e.field).sort();
  assert.deepEqual(missing, [
    "claimantName",
    "customerName",
    "jobDescription",
    "ownerName",
    "signedDate",
    "signerTitle",
  ]);
});
