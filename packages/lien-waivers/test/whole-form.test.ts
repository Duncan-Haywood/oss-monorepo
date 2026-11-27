// Each encoded statutory form, read back from its blocks, must equal the statute's form as a
// whole: same words, same order, nothing added and nothing left out. (test/az.test.ts and
// test/nv.test.ts check that every phrase appears in order; this also catches a dropped clause.)
//
// Both sides are reduced to one line: every blank (the statute's "____", "$____" or dotted
// "......"; our "{{field}}") becomes "▢", the captions printed under blanks and the drafting
// instructions between forms are dropped, and whitespace is collapsed.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  allForms,
  type BlockTemplate,
  type FormDefinition,
  listForms,
  WAIVER_KINDS,
  type WaiverKind,
} from "../src/index.ts";

interface StateCase {
  state: string;
  source: string;
  captions: readonly string[];
  /** Where one form's text ends: the next lettered or numbered paragraph. */
  end: RegExp;
  /** The signature block as the statute prints it, blanks as "▢". */
  signature: (kind: WaiverKind) => string;
  titles: Partial<Record<WaiverKind, string>>;
  /** How the statute prints a header blank (default "Label: ▢"; Texas has no colon). */
  fieldLine?: (label: string) => string;
  /** Text that precedes the title in the statute's form (Texas puts its notice above). */
  lead?: Partial<Record<WaiverKind, string>>;
  /** Drafting text between a form's parts, dropped before comparing. */
  drop?: readonly RegExp[];
  /** Characters the statute wraps the form in (Texas and Utah quote every line). */
  quotes?: boolean;
  /** Captions the statute prints in place of a blank (Florida), read as "▢". */
  blanks?: readonly string[];
  /** A caption that stands for more than one of our blanks, and what it reads as (Missouri). */
  blankAs?: Readonly<Record<string, string>>;
  /** Which form to compare, when it is not `listForms`' form of the kind (Missouri's alternative). */
  form?: (kind: WaiverKind) => FormDefinition | undefined;
}

const CASES: StateCase[] = [
  {
    state: "AZ",
    source: "../sources/az-33-1008.txt",
    captions: [
      "(maker of check)",
      "(amount of check)",
      "(payee or payees of check)",
      "(owner)",
      "(job description)",
      "(person with whom undersigned contracted)",
      "(date)",
      "(Company name)",
      "(Signature)",
      "(Title)",
    ],
    end: / \d\. Where the claimant/,
    signature: (k) => `${k === "conditional-progress" ? "Date" : "Dated"}: ▢ ▢ By: ▢ ▢`,
    titles: {
      "conditional-progress": "Conditional waiver and release on progress payment",
      "unconditional-progress": "Unconditional waiver and release on progress payment",
      "conditional-final": "Conditional waiver and release on final payment",
      "unconditional-final": "Unconditional waiver and release on final payment",
    },
  },
  {
    state: "NV",
    source: "../sources/nv-108-2457.txt",
    captions: ["(Company Name)"],
    end: / \([a-e]\) (Where|Notwithstanding)/,
    signature: () => "Dated: ▢ ▢ By: ▢ Its: ▢",
    titles: {
      "conditional-progress": "CONDITIONAL WAIVER AND RELEASE UPON PROGRESS PAYMENT",
      "unconditional-progress": "UNCONDITIONAL WAIVER AND RELEASE UPON PROGRESS PAYMENT",
      "conditional-final": "CONDITIONAL WAIVER AND RELEASE UPON FINAL PAYMENT",
      "unconditional-final": "UNCONDITIONAL WAIVER AND RELEASE UPON FINAL PAYMENT",
    },
  },
  {
    state: "TX",
    source: "../sources/tx-53-284.txt",
    captions: [
      "(maker of check)",
      "(payee or payees of check)",
      "(owner)",
      "(location)",
      "(job description)",
      "(person with whom signer contracted)",
      "(Company name)",
      "(Signature)",
      "(Title)",
    ],
    end: / \([b-e]\) If a claimant| Added by Acts/,
    signature: () => "Date ▢ ▢ By ▢ ▢",
    fieldLine: (label) => `${label} ▢`,
    quotes: true,
    lead: { "unconditional-progress": "NOTICE:", "unconditional-final": "NOTICE:" },
    drop: [/; and \(2\) below the notice, read:/g],
    titles: {
      "conditional-progress": "CONDITIONAL WAIVER AND RELEASE ON PROGRESS PAYMENT",
      "unconditional-progress": "UNCONDITIONAL WAIVER AND RELEASE ON PROGRESS PAYMENT",
      "conditional-final": "CONDITIONAL WAIVER AND RELEASE ON FINAL PAYMENT",
      "unconditional-final": "UNCONDITIONAL WAIVER AND RELEASE ON FINAL PAYMENT",
    },
  },
  {
    state: "UT",
    source: "../sources/ut-38-1a-802.txt",
    captions: ["(Company Name)"],
    end: / \([c-e]\) A (waiver|restrictive)/,
    signature: () => "Dated: ▢ ▢ ▢ By: ▢ ▢ Its: ▢",
    quotes: true,
    // Utah has two forms; the unconditional kinds are `absent` (src/ut.ts).
    titles: {
      "conditional-progress": "UTAH CONDITIONAL WAIVER AND RELEASE UPON PROGRESS PAYMENT",
      "conditional-final": "UTAH WAIVER AND RELEASE UPON FINAL PAYMENT",
    },
  },
  {
    state: "FL",
    source: "../sources/fl-713-20.txt",
    captions: [],
    blanks: [
      "(insert date)",
      "(insert the name of your customer)",
      "(insert the name of the owner)",
      "(description of property)",
      "(year)",
      "(Lienor)",
    ],
    end: / \([5-8]\) (When|A person)/,
    signature: () => "DATED on ▢, ▢. ▢ By: ▢",
    // Florida has two forms, neither labelled; the conditional kinds are `absent` (src/fl.ts).
    titles: {
      "unconditional-progress": "WAIVER AND RELEASE OF LIEN UPON PROGRESS PAYMENT",
      "unconditional-final": "WAIVER AND RELEASE OF LIEN UPON FINAL PAYMENT",
    },
  },
  {
    state: "MI",
    source: "../sources/mi-570-1115.txt",
    captions: ["(other contracting party)", "(signature of lien claimant)", "(date)"],
    end: / \([b-d]\) (PARTIAL|FULL)| History:/,
    signature: () => "▢ ▢ Signed on: ▢ Address: ▢ ▢ Telephone: ▢",
    // Michigan's partial waivers are the progress kinds, its full waivers the final kinds.
    titles: {
      "unconditional-progress": "PARTIAL UNCONDITIONAL WAIVER",
      "conditional-progress": "PARTIAL CONDITIONAL WAIVER",
      "unconditional-final": "FULL UNCONDITIONAL WAIVER",
      "conditional-final": "FULL CONDITIONAL WAIVER",
    },
  },
  {
    state: "MO",
    source: "../sources/mo-429-016.txt",
    captions: [],
    // "(provide legal name and address of Claimant)" is two blanks here: the name and the address.
    blankAs: {
      "(provide legal name and address of Claimant)": " ____, ____ ",
      "(Provide legal description of the Property)": " ____ ",
    },
    // The form ends where the statute says what to print by the signature (our signature block).
    end: / Claimant's legal name and the name, title or position/,
    signature: () => "",
    // Missouri's one form, residential only, offered beside the general form (src/mo.ts).
    titles: { "unconditional-final": "UNCONDITIONAL FINAL LIEN WAIVER" },
    form: (kind) => allForms("MO").find((f) => f.kind === kind && f.source === "statutory"),
  },
  {
    state: "MA",
    source: "../sources/ma-254-32.txt",
    captions: [],
    // The statute's sentence after the form is about the form, not part of it (a note in src/ma.ts).
    end: / The giving of a partial waiver/,
    // The statute prints no signature lines; ours say who signed under the perjury clause.
    signature: () => "",
    // Massachusetts' one form, for a person with a notice of contract, offered beside the general form.
    titles: { "conditional-progress": "Partial Waiver and Subordination of Lien" },
    form: (kind) => allForms("MA").find((f) => f.kind === kind && f.source === "statutory"),
  },
  {
    state: "CA",
    source: "../sources/ca-8132-8138.txt",
    captions: [],
    // Each form is its own section; the next section's heading ends it.
    end: / Section 81\d\d\./,
    signature: () => "Claimant’s Signature: ▢ Claimant’s Title: ▢ Date of Signature: ▢",
    titles: {
      "conditional-progress": "CONDITIONAL WAIVER AND RELEASE ON PROGRESS PAYMENT",
      "unconditional-progress": "UNCONDITIONAL WAIVER AND RELEASE ON PROGRESS PAYMENT",
      "conditional-final": "CONDITIONAL WAIVER AND RELEASE ON FINAL PAYMENT",
      "unconditional-final": "UNCONDITIONAL WAIVER AND RELEASE ON FINAL PAYMENT",
    },
  },
  {
    state: "GA",
    source: "../sources/ga-44-14-366.txt",
    // The statute's captions are kept in our text; these three label signature lines.
    captions: ["(SEAL)", "(WITNESS)", "(ADDRESS)"],
    // Three printed rules for the property description are one multiline blank here; the quote
    // that closes each form in the Act is dropped.
    drop: [/(_{2,} ){2}(?=_{2,} \(DESCRIBE THE PROPERTY)/g, /'(?= Provided, however)/g],
    end: / Provided, however/,
    signature: () => "▢ ▢ ▢ ▢",
    titles: {
      "conditional-progress":
        "WAIVER AND RELEASE OF LIEN AND PAYMENT BOND RIGHTS UPON INTERIM PAYMENT",
      "unconditional-progress":
        "WAIVER AND RELEASE OF LIEN AND PAYMENT BOND RIGHTS UPON INTERIM PAYMENT",
      "conditional-final": "WAIVER AND RELEASE OF LIEN AND PAYMENT BOND RIGHTS UPON FINAL PAYMENT",
      "unconditional-final":
        "WAIVER AND RELEASE OF LIEN AND PAYMENT BOND RIGHTS UPON FINAL PAYMENT",
    },
  },
  {
    state: "MS",
    source: "../sources/ms-85-7-433.txt",
    // The statute's captions under the signature lines (our signature block's labels).
    captions: ["SIGNATURE", "(PRINT NAME)", "(PRINT TITLE)"],
    // The statute prints no rule for the property description, only its caption: our
    // description, printed above the caption, is the blank.
    blankAs: { "FOLLOWS: (DESCRIBE": "FOLLOWS: ____ (DESCRIBE" },
    end: / \(\d\) The following form is/,
    // Our Claimant line is outside the statute's text; the other three are its own.
    signature: () => "▢ BY: ▢ ITS: ▢",
    titles: {
      "conditional-progress": "INTERIM WAIVER AND RELEASE UPON PAYMENT",
      "unconditional-progress": "INTERIM WAIVER AND RELEASE UPON PAYMENT",
      "conditional-final": "WAIVER AND RELEASE UPON FINAL PAYMENT",
      "unconditional-final": "WAIVER AND RELEASE UPON FINAL PAYMENT",
    },
  },
  {
    state: "WY",
    source: "../sources/wy-29-10-101.txt",
    captions: ["subcontractor/materialman/employee"],
    // The snapshot ends with the form; nothing follows it.
    end: / 29-10-102\./,
    signature: () => "By: ▢ Title: ▢ Date: ▢",
    lead: {
      "unconditional-progress": "Note to lien claimant:",
      "unconditional-final": "Note to lien claimant:",
    },
    // One form, listed as both unconditional kinds; the conditional kinds are `absent` (src/wy.ts).
    titles: { "unconditional-progress": "LIEN WAIVER", "unconditional-final": "LIEN WAIVER" },
  },
];

const squash = (s: string) => s.replace(/\s+/g, " ").trim();

function statuteText(c: StateCase): string {
  let s = readFileSync(new URL(c.source, import.meta.url), "utf8")
    .split("\n")
    .filter((l) => !l.startsWith("#"))
    .join("\n");
  // The captions sometimes wrap across lines in the published HTML.
  if (c.quotes) s = s.replaceAll('"', " ");
  s = squash(s);
  for (const re of c.drop ?? []) s = s.replace(re, " ");
  for (const cap of c.captions) s = s.split(cap).join(" ");
  for (const cap of c.blanks ?? []) s = s.split(cap).join(" ____ ");
  for (const [cap, as] of Object.entries(c.blankAs ?? {})) s = s.split(cap).join(as);
  s = s.replace(/\(Each unconditional waiver[^)]*\)/g, " ");
  s = s.replace(/_{2,}|\.{4,}/g, " ▢ ");
  s = s.replace(/\$\s*▢/g, "▢");
  return squash(s).replace(/ ([,.:)])/g, "$1");
}

function statuteForm(c: StateCase, kind: WaiverKind): string {
  const s = statuteText(c);
  // "CONDITIONAL ..." must not match inside "UNCONDITIONAL ...".
  const m = new RegExp(`(?<![A-Za-z])${c.titles[kind]}`).exec(s);
  assert.ok(m, `${c.state} ${kind}: title not found in the statute`);
  const lead = c.lead?.[kind];
  const start = lead ? s.lastIndexOf(lead, m.index) : m.index;
  assert.ok(start >= 0, `${c.state} ${kind}: "${lead}" not found before the title`);
  const rest = s.slice(start);
  const next = rest.search(c.end);
  return (next >= 0 ? rest.slice(0, next) : rest).trim();
}

function reading(c: StateCase, kind: WaiverKind, body: readonly BlockTemplate[]): string {
  const parts = body.map((b) => {
    switch (b.type) {
      case "title":
      case "heading":
      case "paragraph":
      case "notice":
        // Wyoming's acknowledgment keeps the statute's printed rules for the notary to fill.
        return b.text.replace(/\{\{\w+\}\}/g, "▢").replace(/_{2,}/g, " ▢ ");
      case "field":
        return c.fieldLine ? c.fieldLine(b.label) : `${b.label}: ▢`;
      case "signature":
        return c.signature(kind);
      default:
        return "";
    }
  });
  return squash(parts.join(" ")).replace(/ ([,.:)])/g, "$1");
}

for (const c of CASES) {
  for (const kind of WAIVER_KINDS.filter((k) => c.titles[k])) {
    test(`${c.state} ${kind}: the whole form equals the statute's form`, () => {
      const form = c.form ? c.form(kind) : listForms(c.state).find((f) => f.kind === kind);
      assert.ok(form?.body, "encoded");
      assert.equal(reading(c, kind, form.body), statuteForm(c, kind));
    });
  }
}
