import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { GA_BODIES, GA_MIN_FONT_PT } from "../src/ga.ts";
import {
  hasStatutoryForms,
  listForms,
  render,
  toPlainText,
  undeclaredPlaceholders,
  WAIVER_KINDS,
} from "../src/index.ts";

// O.C.G.A. § 44-14-366 rebuilt from SB 315 (2020) and SB 143 (2021), fetched 2026-11-26 (see the
// file's header).
const SOURCE = readFileSync(new URL("../sources/ga-44-14-366.txt", import.meta.url), "utf8")
  .split("\n")
  .filter((l) => !l.startsWith("#"))
  .join(" ");

const BLANK_TOKEN = " \u0000 ";
const normalize = (s: string) => s.replace(/\s+/g, " ").trim();
const official = normalize(SOURCE.replace(/\$?_{3,}/g, BLANK_TOKEN));
const ours = (text: string) =>
  normalize(text.replace(/\{\{\w+\}\}/g, BLANK_TOKEN).replace(/_{3,}/g, BLANK_TOKEN));

/** Every run of words between blanks must appear in the statute, in order. */
function assertVerbatim(text: string, from: number): number {
  let at = from;
  for (const piece of ours(text).split("\u0000")) {
    const frag = normalize(piece);
    if (frag === "" || frag === "," || frag === "." || frag === ", ____.") continue;
    const found = official.indexOf(frag, at);
    assert.ok(found >= 0, `not in § 44-14-366 as rebuilt (after offset ${at}): ${frag}`);
    at = found + frag.length;
  }
  return at;
}

const BASE = {
  county: "Fulton",
  customerName: "Peachtree Builders, Inc.",
  workDescription: "electrical labor and materials",
  projectName: "Midtown Clinic Addition",
  cityOrTown: "Atlanta",
  propertyCounty: "Fulton",
  ownerName: "Example Holdings LLC",
  propertyDescription: "100 Example St NE, Atlanta, GA 30309",
  amountPaidCents: 4_250_000,
  claimantName: "Red Clay Electric LLC",
};

test("GA: every sentence of both forms is the statute's own wording, in order", () => {
  const interimStart = official.indexOf("(d) When a claimant");
  const finalStart = official.indexOf("(e) When a claimant");
  assert.ok(interimStart > 0 && finalStart > interimStart);
  for (const [kind, from, before] of [
    ["unconditional-progress", interimStart, finalStart],
    ["unconditional-final", finalStart, official.indexOf("(f) Nothing contained")],
  ] as const) {
    let at = from;
    for (const b of GA_BODIES[kind] ?? []) {
      if (b.type === "notice" || b.type === "title" || b.type === "paragraph") {
        at = assertVerbatim(b.text.replace("§ 44-14-366.", "§ 44-14-366.'"), at);
      }
    }
    assert.ok(at < before, `${kind}: read past its own subsection`);
  }
});

test("GA: verified statutory forms for all four kinds, interim for progress and final for final", () => {
  assert.equal(hasStatutoryForms("ga"), true);
  const forms = listForms("GA");
  assert.deepEqual(
    forms.map((f) => [
      f.kind,
      f.source,
      f.body !== null,
      f.citation?.text,
      f.citation?.verification.status,
    ]),
    [
      ["conditional-progress", "statutory", true, "O.C.G.A. § 44-14-366(d)", "verified"],
      ["unconditional-progress", "statutory", true, "O.C.G.A. § 44-14-366(d)", "verified"],
      ["conditional-final", "statutory", true, "O.C.G.A. § 44-14-366(e)", "verified"],
      ["unconditional-final", "statutory", true, "O.C.G.A. § 44-14-366(e)", "verified"],
    ],
  );
  for (const f of forms) {
    assert.equal(f.minFontPt, GA_MIN_FONT_PT);
    assert.deepEqual(undeclaredPlaceholders(f), [], f.id);
    assert.ok(f.notes.some((n) => n.includes("90 days after it was signed")));
  }
  // The 12-point floor is Georgia's alone.
  assert.equal(listForms("AZ")[0]?.minFontPt, undefined);
});

test("GA interim waiver renders the through date, excepts retained amounts, and keeps the notice", () => {
  const form = listForms("GA").find((f) => f.kind === "conditional-progress");
  assert.ok(form);
  const r = render(form, { ...BASE, throughDate: "2026-10-31" });
  assert.ok(r.ok, JSON.stringify(!r.ok && r.errors));
  assert.equal(r.document.minFontPt, 12);
  const text = toPlainText(r.document);
  assert.match(text, /UPON INTERIM PAYMENT/);
  assert.match(text, /EMPLOYED BY Peachtree Builders, Inc\. \(NAME OF CONTRACTOR\)/);
  assert.match(text, /THE SUM OF \$42,500\.00, THE MECHANIC/);
  assert.match(text, /THROUGH THE DATE OF .*2026.* \(DATE\) AND EXCEPTING/);
  assert.match(text, /RETAINED AMOUNTS/);
  assert.match(
    text,
    /90 DAYS AFTER THE DATE STATED ABOVE UNLESS YOU FILE AN AFFIDAVIT OF NONPAYMENT/,
  );
  assert.match(text, /Claimant: Red Clay Electric LLC/);
  // Dated by hand, under seal.
  assert.match(text, /THIS ______ DAY OF ______________, ____\./);
});

test("GA final waiver has no through date and no retainage exception; a missing blank is refused", () => {
  const form = listForms("GA").find((f) => f.kind === "unconditional-final");
  assert.ok(form);
  assert.ok(!form.fields.some((f) => f.key === "throughDate"));
  const r = render(form, BASE);
  assert.ok(r.ok);
  const text = toPlainText(r.document);
  assert.match(text, /UPON FINAL PAYMENT/);
  assert.doesNotMatch(text, /RETAINED AMOUNTS/);
  const { workDescription: _, ...missing } = BASE;
  const bad = render(form, missing);
  assert.ok(!bad.ok);
  assert.ok(bad.errors.some((e) => e.field === "workDescription" && e.code === "REQUIRED"));
});

test("GA: every kind is printable", () => {
  for (const kind of WAIVER_KINDS) {
    const form = listForms("GA").find((f) => f.kind === kind);
    assert.ok(form?.body, kind);
  }
});
