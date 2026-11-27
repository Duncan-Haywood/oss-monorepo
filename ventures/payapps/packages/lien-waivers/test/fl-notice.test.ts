import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  FL_NOTICE_ID,
  flNoticeDates,
  noticeById,
  noticeForms,
  placeholdersOf,
  renderNotice,
  toPlainText,
} from "../src/index.ts";

// Fla. Stat. §§ 713.06(2) and 713.18 from the Florida Senate's 2026 Florida Statutes, fetched
// 2026-11-27 (see the file's header).
const LINES = readFileSync(new URL("../sources/fl-713-06.txt", import.meta.url), "utf8")
  .split("\n")
  .filter((l) => !l.startsWith("#"));
const normalize = (s: string) => s.replace(/\s+/g, " ").trim();
const ALL = normalize(LINES.join(" "));
const S713_18 = ALL.slice(ALL.indexOf("713.18 Manner of serving documents"));
const S713_06 = ALL.slice(0, ALL.indexOf("713.18 Manner of serving documents"));

// The form: from the first warning to the line about combining it with a notice to contractor.
const FORM_START = "WARNING! FLORIDA’S CONSTRUCTION LIEN LAW";
const FORM_END = "The form may be combined";
const FORM = S713_06.slice(S713_06.indexOf(FORM_START), S713_06.indexOf(FORM_END));
// Captions the statute prints in place of a blank, and its printed rule.
const CAPTIONS = [
  "(Owner’s name and address)",
  "(General description of services or materials)",
  "(property description)",
  "(Lienor’s Signature)",
  "(Lienor’s Name)",
  "(Lienor’s Address)",
  "(Those persons listed in Section 713.06(2)(a) and (b), Florida Statutes)",
];
const stripBlanks = (s: string) => {
  let out = s.replaceAll("____", " ");
  for (const c of CAPTIONS) out = out.replaceAll(c, " ");
  return normalize(out.replace(/\{\{\w+\}\}/g, " ")).replace(/ ([.:])/g, "$1");
};

const form = () => {
  const f = noticeById("FL", FL_NOTICE_ID);
  assert.ok(f);
  return f;
};

const DATA = {
  ownerNameAddress: "Bayshore Dental Holdings LLC\n410 S Howard Ave, Tampa, FL 33606",
  workDescription: "Electrical rough-in and finish, labor and materials",
  siteDescription: "Bayshore Dental build-out, 410 S Howard Ave, Tampa, FL 33606",
  hiredBy: "Gulf Coast Builders Inc.",
  lienorName: "Sunshine Electric LLC",
  lienorAddress: "77 N Franklin St, Tampa, FL 33602",
};

test("FL notice: the whole § 713.06(2)(c) form is printed word for word, in order, nothing added", () => {
  const f = form();
  assert.ok(FORM.length > 1500, "form slice found in the snapshot");
  for (const c of CAPTIONS) assert.ok(FORM.includes(c), `caption missing from snapshot: ${c}`);
  const printed = f.body
    .flatMap((b) => {
      if (b.type === "signature") return (b.lines ?? []).map((l) => l.value);
      return "text" in b ? [b.text] : [];
    })
    .join(" ");
  assert.equal(stripBlanks(printed), stripBlanks(FORM));
});

test("FL notice: the blank lines carry the statute's own captions", () => {
  const f = form();
  const sig = f.body.find((b) => b.type === "signature");
  assert.ok(sig && sig.type === "signature");
  assert.deepEqual(
    (sig.lines ?? []).map((l) => `(${l.label})`),
    ["(Lienor’s Signature)", "(Lienor’s Name)", "(Lienor’s Address)"],
  );
  const label = (k: string) => f.fields.find((x) => x.key === k)?.label;
  assert.equal(`(${label("ownerNameAddress")})`, CAPTIONS[0]);
  assert.equal(`(${label("workDescription")})`, CAPTIONS[1]);
  assert.equal(`(${label("siteDescription")})`.toLowerCase(), CAPTIONS[2]);
  // The three warnings print as notices (bold), before the title.
  const title = f.body.findIndex((b) => b.type === "title" && b.text === "NOTICE TO OWNER");
  assert.equal(title, 3);
  assert.ok(f.body.slice(0, 3).every((b) => b.type === "notice"));
});

test("FL notice: every phrase the notes quote is in the statute as published", () => {
  const f = form();
  let quotes = 0;
  for (const note of f.notes) {
    for (const m of note.matchAll(/"([^"]+)"/g)) {
      const q = normalize(m[1] ?? "");
      assert.ok(ALL.includes(q), `not in §§ 713.06(2), 713.18: ${q}`);
      quotes++;
    }
  }
  assert.ok(quotes >= 6);
  // The paraphrased service methods are § 713.18(1)'s and (2)'s.
  for (const phrase of [
    "registered, Global Express Guaranteed, or certified mail",
    "By posting on the site of the improvement",
    "within 40 days after the date the lienor first furnishes",
    "mail log",
  ]) {
    assert.ok(S713_18.includes(phrase), phrase);
  }
  assert.ok(S713_06.includes("not later than 45 days after commencing"));
});

test("FL notice: placeholders declared; offered for Florida only", () => {
  const f = form();
  const declared = new Set(f.fields.map((x) => x.key));
  assert.deepEqual(
    [...placeholdersOf(f.body)].filter((k) => !declared.has(k)),
    [],
  );
  for (const k of placeholdersOf(f.body)) assert.ok(declared.has(k), k);
  assert.deepEqual(
    noticeForms("fl").map((n) => n.id),
    [FL_NOTICE_ID],
  );
  assert.equal(noticeById("GA", FL_NOTICE_ID), undefined);
  assert.equal(f.citation.verification.status, "verified");
});

test("FL notice renders the job's values; a blank 'Copies to' prints a line to fill by hand", () => {
  const r = renderNotice(form(), DATA);
  assert.ok(r.ok);
  const text = toPlainText(r.document);
  assert.match(text, /NOTICE TO OWNER/);
  assert.match(text, /Bayshore Dental Holdings LLC/);
  assert.match(text, /under an order given by Gulf Coast Builders Inc\./);
  assert.match(text, /Sunshine Electric LLC/);
  assert.match(text, /Copies to:/);
  assert.ok(r.document.disclaimers.some((d) => /not legal advice/i.test(d)));
  const missing = renderNotice(form(), { ...DATA, hiredBy: "" });
  assert.equal(missing.ok, false);
  const withCopy = renderNotice(form(), {
    ...DATA,
    copiesTo: "Gulf Coast Builders Inc., 1 Harbour Pl, Tampa, FL 33602",
  });
  assert.ok(withCopy.ok);
  assert.match(toPlainText(withCopy.document), /1 Harbour Pl/);
});

test("FL dates: 45 days to serve, 40 days to mail for service on mailing, calendar days", () => {
  assert.deepEqual(flNoticeDates("2026-11-02"), { serveBy: "2026-12-17", mailBy: "2026-12-12" });
  // Across a month end and a leap day.
  assert.deepEqual(flNoticeDates("2028-01-20"), { serveBy: "2028-03-05", mailBy: "2028-02-29" });
  assert.throws(() => flNoticeDates("11/02/2026"), RangeError);
});
