import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { FL_BODIES } from "../src/fl.ts";
import { listForms, render, toPlainText, undeclaredPlaceholders } from "../src/index.ts";

// The Florida Senate's text of § 713.20, fetched 2026-11-25 (see the file's header). Florida
// prints a caption in place of a blank, e.g. "(insert date)", so captions are blanks here.
const SOURCE = readFileSync(new URL("../sources/fl-713-20.txt", import.meta.url), "utf8")
  .split("\n")
  .filter((l) => !l.startsWith("#"))
  .join(" ");

const BLANK_TOKEN = " \u0000 ";
const normalize = (s: string) => s.replace(/\s+/g, " ").trim();
const official = normalize(
  SOURCE.replace(/\((insert [^)]*|description of property|year|Lienor)\)/g, BLANK_TOKEN).replace(
    /\$?\s*_{3,}/g,
    BLANK_TOKEN,
  ),
);
const ours = (text: string) => normalize(text.replace(/\{\{\w+\}\}/g, BLANK_TOKEN));

/** Every run of words between blanks must appear in the statute, in order. */
function assertVerbatim(text: string, from = 0): number {
  let at = from;
  for (const piece of ours(text).split("\u0000")) {
    const frag = normalize(piece);
    if (frag === "" || frag === "," || frag === "." || frag === ":") continue;
    const found = official.indexOf(frag, at);
    assert.ok(found >= 0, `not in § 713.20 as published (after offset ${at}): ${frag}`);
    at = found + frag.length;
  }
  return at;
}

const BASE = {
  amountPaidCents: 4_812_350,
  customerName: "Gulf Coast Builders, Inc.",
  ownerName: "Bayshore Medical Partners, LLC",
  jobLocation: "1200 Bayshore Blvd, Tampa, FL 33606",
  claimantName: "Sunshine Electric LLC",
  signedDate: "2026-11-25",
};

for (const kind of ["unconditional-progress", "unconditional-final"] as const) {
  test(`FL ${kind}: every sentence is the statute's own wording, in order`, () => {
    let at = 0;
    for (const b of FL_BODIES[kind] ?? []) {
      if (b.type === "title" || b.type === "paragraph") at = assertVerbatim(b.text, at);
    }
    assert.ok(at > 0);
  });
}

test("FL has two verified forms; the conditional kinds are absent, not pending", () => {
  const forms = listForms("FL");
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
    assert.equal(f.citation?.verification.status, "verified");
    assert.equal(f.citation?.officialUrl, "https://www.flsenate.gov/Laws/Statutes/2026/713.20");
    assert.deepEqual(undeclaredPlaceholders(f), []);
    assert.ok(!f.notes.some((n) => n.startsWith("Statutory text pending")));
  }
});

test("FL progress form fills its blanks and needs the through date", () => {
  const form = listForms("fl").find((f) => f.kind === "unconditional-progress");
  assert.ok(form);
  const missing = render(form, BASE);
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.ok(missing.errors.some((e) => e.field === "throughDate"));
  const r = render(form, { ...BASE, throughDate: "2026-10-31" });
  assert.ok(r.ok, JSON.stringify(!r.ok && r.errors));
  const text = toPlainText(r.document);
  assert.match(text, /^WAIVER AND RELEASE OF LIEN UPON PROGRESS PAYMENT/);
  assert.match(text, /in consideration of the sum of \$48,123\.50, hereby waives/);
  assert.match(text, /to Gulf Coast Builders, Inc\. on the job of Bayshore Medical Partners, LLC/);
  assert.match(text, /1200 Bayshore Blvd, Tampa, FL 33606/);
  assert.match(text, /does not cover any retention/);
  assert.match(text, /Lienor: Sunshine Electric LLC/);
  assert.equal(r.document.citation, "Fla. Stat. § 713.20");
});

test("FL final form has no through date and no retention exception", () => {
  const form = listForms("FL").find((f) => f.kind === "unconditional-final");
  assert.ok(form);
  assert.ok(!form.fields.some((x) => x.key === "throughDate"));
  const r = render(form, BASE);
  assert.ok(r.ok, JSON.stringify(!r.ok && r.errors));
  const text = toPlainText(r.document);
  assert.match(text, /^WAIVER AND RELEASE OF LIEN UPON FINAL PAYMENT/);
  assert.match(text, /final payment in the amount of \$48,123\.50/);
  assert.doesNotMatch(text, /retention/);
});

test("FL conditional kinds refuse with the reason, never generic wording", () => {
  const form = listForms("FL").find((f) => f.kind === "conditional-progress");
  assert.ok(form?.absent);
  const r = render(form, { ...BASE, throughDate: "2026-10-31" });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.errors[0]?.code, "NO_STATUTORY_FORM");
  assert.match(r.errors[0]?.message ?? "", /no separate conditional waiver form/);
  assert.match(r.errors[0]?.message ?? "", /§ 713\.20\(7\)/);
});
