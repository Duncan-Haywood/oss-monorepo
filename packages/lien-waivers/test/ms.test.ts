import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  hasStatutoryForms,
  listForms,
  MS_AFFIDAVIT_ID,
  msAffidavitCopyDueOn,
  msAffidavitOfNonpayment,
  msSixtyDays,
  render,
  renderNotice,
  toPlainText,
  undeclaredPlaceholders,
  WAIVER_KINDS,
} from "../src/index.ts";
import { MS_BODIES } from "../src/ms.ts";
import { MS_AFFIDAVIT_COPY_NOTICE } from "../src/ms-affidavit.ts";
import { placeholdersOf } from "../src/render.ts";
import type { BlockTemplate } from "../src/types.ts";

// Miss. Code Ann. §§ 85-7-419 and 85-7-433(1)-(3) from SB 2622 (2014), fetched 2026-11-26 (see the
// file's header).
const SOURCE = readFileSync(new URL("../sources/ms-85-7-433.txt", import.meta.url), "utf8")
  .split("\n")
  .filter((l) => !l.startsWith("#"))
  .join(" ");

const BLANK = " \u0000 ";
const normalize = (s: string) => s.replace(/\s+/g, " ").trim();
const official = normalize(SOURCE.replace(/\$?_{2,}/g, BLANK));
const ours = (text: string) =>
  normalize(text.replace(/\{\{\w+\}\}/g, BLANK).replace(/_{2,}/g, BLANK));

/** Every run of words between blanks must appear in the statute, in order. */
function assertVerbatim(text: string, from: number): number {
  let at = from;
  for (const piece of ours(text).split("\u0000")) {
    const frag = normalize(piece);
    if (frag === "" || frag === "," || frag === ".") continue;
    const found = official.indexOf(frag, at);
    assert.ok(found >= 0, `not in § 85-7-433 as enacted (after offset ${at}): ${frag}`);
    at = found + frag.length;
  }
  return at;
}

function walk(body: readonly BlockTemplate[], from: number): number {
  let at = from;
  for (const b of body) {
    if (b.type === "notice" || b.type === "title" || b.type === "paragraph") {
      at = assertVerbatim(b.text, at);
    }
  }
  return at;
}

const BASE = {
  county: "Hinds",
  customerName: "Magnolia Builders, Inc.",
  workDescription: "electrical labor and materials",
  projectName: "Fondren Clinic Addition",
  cityOrTown: "Jackson",
  propertyCounty: "Hinds",
  ownerName: "Example Holdings LLC",
  propertyDescription: "100 Example St, Jackson, MS 39216",
  amountPaidCents: 4_250_000,
  claimantName: "Pearl River Electric LLC",
  signerName: "Jordan Example",
  signerTitle: "President",
};

const at = (s: string) => official.indexOf(s);

test("MS: every sentence of both forms is the statute's own wording, in order, in its own subsection", () => {
  const interim = at("85-7-433. (1)");
  const final = at("(2) The following form is");
  const affidavit = at("(3) The following form is");
  assert.ok(interim > 0 && final > interim && affidavit > final);
  for (const [kind, from, before] of [
    ["unconditional-progress", interim, final],
    ["unconditional-final", final, affidavit],
  ] as const) {
    const end = walk(MS_BODIES[kind] ?? [], from);
    assert.ok(end <= before, `${kind}: read past its own subsection`);
  }
});

test("MS: verified statutory forms for all four kinds, interim for progress and final for final", () => {
  assert.equal(hasStatutoryForms("ms"), true);
  const forms = listForms("MS");
  assert.deepEqual(
    forms.map((f) => [
      f.kind,
      f.source,
      f.body !== null,
      f.citation?.text,
      f.citation?.verification.status,
    ]),
    [
      ["conditional-progress", "statutory", true, "Miss. Code Ann. § 85-7-433(1)", "verified"],
      ["unconditional-progress", "statutory", true, "Miss. Code Ann. § 85-7-433(1)", "verified"],
      ["conditional-final", "statutory", true, "Miss. Code Ann. § 85-7-433(2)", "verified"],
      ["unconditional-final", "statutory", true, "Miss. Code Ann. § 85-7-433(2)", "verified"],
    ],
  );
  for (const f of forms) {
    assert.deepEqual(undeclaredPlaceholders(f), [], f.id);
    assert.ok(f.notes.some((n) => n.includes("60 days after the waiver was signed")));
    assert.ok(!f.notes.some((n) => n.includes("pending")), f.id);
    // No type-size floor in Mississippi's statute.
    assert.equal(f.minFontPt, undefined);
  }
});

test("MS interim waiver renders the through date, excepts retained amounts, keeps the notice and the jurat", () => {
  const form = listForms("MS").find((f) => f.kind === "conditional-progress");
  assert.ok(form);
  const r = render(form, { ...BASE, throughDate: "2026-10-31" });
  assert.ok(r.ok, JSON.stringify(!r.ok && r.errors));
  const text = toPlainText(r.document);
  assert.match(text, /INTERIM WAIVER AND RELEASE UPON PAYMENT/);
  assert.match(text, /STATE OF MISSISSIPPI/);
  assert.match(text, /COUNTY OF Hinds/);
  assert.match(text, /EMPLOYED BY Magnolia Builders, Inc\. \(NAME OF CONTRACTOR\)/);
  assert.match(text, /THE SUM OF \$42,500\.00, THE MECHANIC/);
  assert.match(text, /THROUGH THE DATE OF October 31, 2026 \(DATE\) AND EXCEPTING/);
  assert.match(text, /RETAINED AMOUNTS/);
  assert.match(text, /SIXTY \(60\) DAYS AFTER THE DATE STATED ABOVE/);
  assert.match(text, /Claimant: Pearl River Electric LLC/);
  assert.match(text, /BY \(PRINT NAME\): Jordan Example/);
  assert.match(text, /ITS \(PRINT TITLE\): President/);
  // The notary fills in the jurat by hand.
  assert.match(text, /SWORN TO AND SUBSCRIBED BEFORE ME, THIS THE ____ DAY OF _________, 20__\./);
  assert.match(text, /NOTARY PUBLIC/);
  // The description sits above the statute's caption for it.
  assert.ok(text.indexOf("100 Example St") < text.indexOf("(DESCRIBE THE PROPERTY"));
});

test("MS final waiver: no through date, no retainage exception, signature and jurat twice; a missing blank is refused", () => {
  const form = listForms("MS").find((f) => f.kind === "unconditional-final");
  assert.ok(form);
  assert.ok(!form.fields.some((f) => f.key === "throughDate"));
  const r = render(form, BASE);
  assert.ok(r.ok);
  const text = toPlainText(r.document);
  assert.match(text, /WAIVER AND RELEASE UPON FINAL PAYMENT/);
  assert.doesNotMatch(text, /RETAINED AMOUNTS/);
  assert.equal(text.match(/NOTARY PUBLIC/g)?.length, 2);
  assert.equal(text.match(/Claimant: Pearl River Electric LLC/g)?.length, 2);
  const notice = text.indexOf("NOTICE: WHEN YOU EXECUTE");
  assert.ok(text.indexOf("NOTARY PUBLIC") < notice && text.lastIndexOf("NOTARY PUBLIC") > notice);
  const { workDescription: _, ...missing } = BASE;
  const bad = render(form, missing);
  assert.ok(!bad.ok);
  assert.ok(bad.errors.some((e) => e.field === "workDescription" && e.code === "REQUIRED"));
});

test("MS: the signer's name and title may be left for hand, and print as lines", () => {
  const form = listForms("MS").find((f) => f.kind === "unconditional-progress");
  assert.ok(form);
  const { signerName: _n, signerTitle: _t, ...rest } = BASE;
  const r = render(form, { ...rest, throughDate: "2026-10-31" });
  assert.ok(r.ok, JSON.stringify(!r.ok && r.errors));
  const sig = r.document.blocks.find((b) => b.type === "signature");
  assert.ok(sig && sig.type === "signature");
  assert.deepEqual(
    sig.lines.map((l) => [l.label, l.value]),
    [
      ["Claimant", "Pearl River Electric LLC"],
      ["SIGNATURE", ""],
      ["BY (PRINT NAME)", ""],
      ["ITS (PRINT TITLE)", ""],
    ],
  );
});

test("MS: every kind is printable", () => {
  for (const kind of WAIVER_KINDS) {
    assert.ok(listForms("MS").find((f) => f.kind === kind)?.body, kind);
  }
});

// The affidavit of nonpayment, § 85-7-433(3).

const { amountPaidCents: _sum, ...HEAD_AND_SIGNER } = BASE;
const AFFIDAVIT_VALUES = {
  ...HEAD_AND_SIGNER,
  waiverDate: "2026-10-05",
  waiverAmountCents: 4_250_000,
};

test("MS affidavit: every sentence is (3)'s own wording, in order, inside (3)", () => {
  const start = at("(3) The following form is");
  assert.ok(start > 0);
  const end = walk(msAffidavitOfNonpayment().body, start);
  assert.equal(end, official.length, "the affidavit's last paragraph closes the snapshot");
});

test("MS affidavit: the whole form equals the statute's form", () => {
  const squash = (s: string) => s.replace(/\s+/g, " ").trim();
  const statute = squash(SOURCE);
  const begin = statute.indexOf("AFFIDAVIT OF NONPAYMENT STATE OF MISSISSIPPI");
  assert.ok(begin > 0);
  const theirs = squash(
    statute
      .slice(begin)
      .split("SIGNATURE")
      .join(" ")
      .split("(PRINT NAME)")
      .join(" ")
      .split("(PRINT TITLE)")
      .join(" ")
      .replace("FOLLOWS: (DESCRIBE", "FOLLOWS: ____ (DESCRIBE")
      .replace(/_{2,}/g, " ▢ ")
      .replace(/\$\s*▢/g, "▢"),
  )
    .replace(/ ([,.:)])/g, "$1")
    // "DATED ____, ___." (month and day, year) is one date blank here.
    .replace("DATED ▢, ▢.", "DATED ▢.");
  const mine = squash(
    msAffidavitOfNonpayment()
      .body.map((b) =>
        b.type === "signature"
          ? "▢ BY: ▢ ITS: ▢"
          : "text" in b
            ? b.text.replace(/\{\{\w+\}\}/g, "▢").replace(/_{2,}/g, " ▢ ")
            : "",
      )
      .join(" "),
  ).replace(/ ([,.:)])/g, "$1");
  assert.equal(mine, theirs);
});

test("MS affidavit renders from a waiver's values, keeps the two-day copy paragraph, needs no unpaid amount", () => {
  const form = msAffidavitOfNonpayment();
  assert.equal(form.id, MS_AFFIDAVIT_ID);
  assert.equal(form.citation.verification.status, "verified");
  assert.equal(form.crossCheck, undefined);
  assert.ok(!form.fields.some((f) => f.key === "unpaidCents"));
  const declared = new Set(form.fields.map((f) => f.key));
  for (const k of placeholdersOf(form.body)) assert.ok(declared.has(k), k);
  const r = renderNotice(form, AFFIDAVIT_VALUES);
  assert.ok(r.ok, JSON.stringify(!r.ok && r.errors));
  const blocks = r.document.blocks;
  const text = blocks.map((b) => ("text" in b ? b.text : "")).join("\n");
  assert.match(text, /^AFFIDAVIT OF NONPAYMENT$/m);
  assert.match(text, /WITH RESPECT TO THIS PROPERTY DATED October 5, 2026\./);
  assert.match(text, /\(\$42,500\.00\) HAS NOT BEEN PAID/);
  assert.match(text, /THE ABOVE FACTS ARE SWORN TRUE AND CORRECT BY THE UNDERSIGNED\./);
  const last = blocks.at(-1);
  assert.ok(last && last.type === "notice" && last.text === MS_AFFIDAVIT_COPY_NOTICE);
  const { waiverDate: _, ...missing } = AFFIDAVIT_VALUES;
  const bad = renderNotice(form, missing);
  assert.ok(!bad.ok && bad.errors.some((e) => e.field === "waiverDate" && e.code === "REQUIRED"));
});

test("MS sixty days: counted in calendar days from the waiver's date; the copy is due two days after filing", () => {
  assert.deepEqual(msSixtyDays("2026-10-05", "2026-11-26"), {
    signedOn: "2026-10-05",
    endsOn: "2026-12-04",
    daysLeft: 8,
    ended: false,
  });
  assert.equal(msSixtyDays("2026-10-05", "2026-12-04").daysLeft, 0);
  assert.equal(msSixtyDays("2026-10-05", "2026-12-04").ended, false);
  assert.equal(msSixtyDays("2026-10-05", "2026-12-05").ended, true);
  // Across a leap day and a year end.
  assert.equal(msSixtyDays("2028-01-15", "2028-01-15").endsOn, "2028-03-15");
  assert.equal(msSixtyDays("2026-12-20", "2026-12-20").endsOn, "2027-02-18");
  assert.equal(msAffidavitCopyDueOn("2026-12-31"), "2027-01-02");
});

test("MS affidavit's notes give the 60 and 2 days and say the Code itself was not read", () => {
  const notes = msAffidavitOfNonpayment().notes.join(" ");
  assert.match(notes, /60 days/);
  assert.match(notes, /two days/);
  assert.match(notes, /was not read/);
});
