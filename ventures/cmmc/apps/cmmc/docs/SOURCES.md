# Sources, versions and verification status

All requirement, objective and scoring text comes from US government works, which are public domain
(17 U.S.C. § 105). Citations live in code at `src/shared/controls/sources.ts`.

| Data | Source | Version |
| --- | --- | --- |
| Level 1 requirements (15) | FAR 52.204-21(b)(1)(i)–(xv), adopted by 32 CFR 170.14(c)(2) | FAR clause as codified |
| Level 2 requirements (110) | NIST SP 800-171 Rev. 2, adopted by 32 CFR 170.14(c)(3) | Rev. 2, Feb 2020 (updated Jan 28, 2021) |
| Assessment objectives (320) | NIST SP 800-171A | June 2018 |
| Point values 5/3/1, partial credit for 3.5.3 and 3.13.11, no score without an SSP | NIST SP 800-171 DoD Assessment Methodology, Annex A; 32 CFR 170.24 | v1.2.1, June 24, 2020 |
| POA&M rules (≥ 88, 1-point items, excluded six, 180 days) | 32 CFR 170.21 | Final rule 89 FR 83092, Oct 15, 2024, effective Dec 16, 2024 |

## Level 2 baseline: Rev. 2, not Rev. 3

Recorded 2026-11-24: CMMC Level 2 references **NIST SP 800-171 Rev. 2** (32 CFR 170.14(c)(3)). NIST published
Rev. 3 in May 2024, and DoD class deviation 2024-O0013 kept DFARS 252.204-7012 on Rev. 2. The CMMC DFARS
rule (48 CFR) took effect Nov 10, 2025 (phase 1).

Confirmed 2026-11-25 on eCFR: 32 CFR 170.14(c)(3) reads "The security requirements in CMMC Level 2 are
identical to the requirements in NIST SP 800-171 R2." The class deviation was not re-read (dodcio.defense.gov and
acq.osd.mil refuse this environment's proxy); the regulation is the controlling text.

## Level 1: 15, not 17

32 CFR 170 counts **15** Level 1 requirements, one per FAR item. Older CMMC material split FAR item (ix) into three
practices (3.10.3, 3.10.4, 3.10.5) and counted 17. The library keeps 15 requirements and lists the 17 underlying
SP 800-171 numbers (tested).

## Verification, 2026-11-25

The library was transcribed on 2026-11-24 while the official hosts were blocked. On 2026-11-25 csrc.nist.gov,
nvlpubs.nist.gov and ecfr.gov were reachable, and every item was compared with them:

| Check | Source read | Result |
| --- | --- | --- |
| 110 requirement statements, basic/derived | NIST's `sp800-171r2-security-reqs.xlsx` (Rev. 2, updates of Jan 28, 2021) | 110 of 110 match; 110 of 110 kinds match (the spreadsheet's footnote markers and missing final periods are its own, not text) |
| 320 assessment objectives | NIST SP 800-171A PDF (June 2018) | 318 of 320 matched; **3.13.14[a] and [b] wrote "VoIP" for "Voice over Internet Protocol (VoIP)"**: fixed |
| 15 Level 1 requirements | FAR 52.204-21(b)(1)(i)–(xv), eCFR renderer | 14 of 15 matched; **(xv) was paraphrased** ("periodic and real-time scans of organizational information systems and files"): fixed to the FAR wording |
| Level 1 objectives (59) and their mapping | 32 CFR 170.15(c)(1)(i)–(ii), eCFR | mapping matches Table 2; **objectives said CUI where the rule says to read FCI** (3.1.22[b], [d], [e]; 3.8.3[a], [b]): fixed in `level1.ts` and tested |
| Point values | 32 CFR 170.24(c)(2)(i)(B), eCFR (it lists every 5- and 3-point requirement by number) | 110 of 110 match: 42 listed at 5 plus 3.5.3 and 3.13.11 (5, or 3 when partial), 14 at 3, 3.12.4 unscored, the rest 1 |
| POA&M rules | 32 CFR 170.21(a)(2) and (b), eCFR | match `scoring.ts`: score/110 ≥ 0.8 (88), only 1-point items except 3.13.11 at 3 when encryption is not FIPS-validated, the six excluded requirements, 180-day closeout |
| ESP scoping (table 4 to 170.19(c)(2)(i)) and SSP/CRM documentation ((c)(2)(ii)): the seven `ESP_QUOTES` in `src/shared/service-providers.ts` | 32 CFR 170.19, read in full from the eCFR versioner API, `https://www.ecfr.gov/api/versioner/v1/full/2026-11-20/title-32.xml?part=170&section=170.19`, on 2026-11-26 (amended 16 Dec 2024; file sha256 `69465e2bd4fc5a15247db28a15728a36aa2988ad32c1d3c08ad6299de084f197`, the same file the public scoping worksheet read on 2026-11-25) | 7 of 7 are verbatim substrings of the file's text, checked by script; `service-providers.test.ts` pins their hash. The FedRAMP basis line cites DFARS 252.204-7012(b)(2)(ii)(D) in the app's own words, not quoted |

The DoD Assessment Methodology v1.2.1 PDF itself was not opened (dodcio.defense.gov and acq.osd.mil refuse
this environment); 32 CFR 170.24 is the codified version of its values and governs CMMC.

`scripts/extract_official_text.py` downloads those sources and writes
`src/shared/controls/official-text.json`; `src/shared/controls/official-text.test.ts` fails if any requirement,
objective, Level 1 item or weight drifts from it. Re-run the script (`--check` reports drift without writing)
when NIST, the FAR or 32 CFR 170 change, and fix the library until the test passes.

## What the tests prove, and what they do not

`src/shared/controls/library.test.ts` checks the structure against published totals: 110 requirements, the
per-family counts (AC 22 … SI 7), 320 objectives, 15 Level 1 items mapping to 17 requirements, and weights of
44 × 5, 14 × 3, 51 × 1 plus the unscored SSP, giving the methodology's documented minimum of −203. Those totals
agreeing is strong evidence the structure is right. `official-text.test.ts` covers the wording (above).

## Still to check

1. The DoD Assessment Methodology v1.2.1 PDF and class deviation 2024-O0013, from a network that reaches
   dodcio.defense.gov or acq.osd.mil (the codified rules they feed into are verified above).
2. Re-read https://dodcio.defense.gov/CMMC/ for program news (phase dates) before launch copy cites them.

## ISO 9001 (`src/shared/quality/iso9001.ts`)

Added 2026-11-25. ISO 9001 is a copyrighted ISO standard, not a government work, so the rules differ
from the CMMC library above:

- **No requirement text.** Only the clause numbers and headings of clauses 4 to 10 of ISO 9001:2015
  (its table of contents) appear. Each clause's `prompt` ("what shops usually keep") is this app's
  own wording, a reminder of what records to gather, and the UI says so beside it. A shop needs its own
  copy of the standard.
- **Checked against the contents page (2026-11-26).** The 47 numbers and headings were first
  written from the 2015 edition's published structure on 2026-11-25, when the session could not
  reach iso.org. On 2026-11-26 they were compared with the contents page of ISO 9001:2015(E), fifth
  edition 2015-09-15, as printed in the publisher-licensed preview at
  <https://standards.iteh.ai/catalog/standards/iso/9563cbca-c505-47c0-ba11-9c961f5a927e/iso-9001-2015>
  (iso.org, its Online Browsing Platform and ANSI's preview PDFs returned 403 through the session's
  proxy). Result: all 47 numbers appear in the contents; 42 headings match word for word; the five
  "General" subclauses (7.1.1, 7.5.1, 8.4.1, 9.1.1, 10.1) are shown as "<parent heading>: general"
  so the row reads on its own. The contents page lists 66 numbered entries under clauses 4 to 10; the
  19 not given rows of their own are parents whose subclauses are rows (7.1, 7.5, 8.2, 8.4, 8.5,
  9.1) or subclauses folded into one parent row because a small shop keeps one set of records for
  them (5.1.1/5.1.2 in 5.1, 5.2.1/5.2.2 in 5.2, 8.3.1 to 8.3.6 in 8.3, 9.3.1 to 9.3.3 in 9.3). The
  contents page stops at three levels, so 7.1.5.1/7.1.5.2 (seen in the preview's body) sit in the
  7.1.5 row. `ISO9001_VERIFICATION.checkedAgainstCopy` is now `true`, with `checkedOn` and
  `checkedAgainst`; `src/shared/quality/iso9001-contents.test.ts` holds the contents page's numbers
  and headings (headings only, the same table-of-contents stance as the library) and fails if a row
  drifts from it.
- **Related CMMC requirements are judgement.** `relatedControls` names requirements whose documents
  often serve the clause too (training records for 7.2 and AT.L2-3.2.2; internal audit for 9.2 and
  CA.L2-3.12.1; corrective action for 10.2 and CA.L2-3.12.2; customer property for 8.5.3 and
  MP.L2-3.8.1 / AC.L2-3.1.3, since customer drawings are often CUI). It is a pointer to reuse a
  file, never an equivalence, and the UI says "meeting one never means meeting the other". A unit
  test checks every id exists in the library.
- **Not covered:** AS9100D (SAE) adds aerospace requirements inside these clauses (risk, configuration
  management, product safety, counterfeit parts, special processes). Its text is SAE's copyright too
  and needs a source before it is added.

## Document control (`src/shared/document-control.ts`)

No source text is quoted. ISO 9001:2015 is copyrighted, so the module names clause 7.5 ("Documented
information", the heading checked against the contents page above) and 7.5.3 as pointers only. The checks
are the app's own reading of what an auditor of a small shop asks to see, not requirements copied from the
standard: a master list of controlled documents; one approved revision in use at a time, with who approved
it and when; changes made as a new revision rather than an edit of the approved one; withdrawn documents
marked obsolete and kept rather than deleted; documents from outside (customer drawings, specifications)
identified with who issued them; and a review date where the shop sets one. The 12/24/36-month intervals
are choices the app offers, not periods the standard sets (it sets none). The revision counter follows
common shop practice (letters A to Z then AA, or zero-padded numbers); I and O are not skipped because
shops differ. AS9100D additions are not covered and need a source before they are.

## Internal audits and corrective actions (`src/shared/internal-audits.ts`)

No source text is quoted. ISO 9001:2015 is copyrighted, so the module names clauses 9.2 ("Internal
audit") and 10.2 ("Nonconformity and corrective action"), headings checked against the contents page above,
as pointers only. The checks are the app's own reading of what an auditor of a small shop asks to see: an
audit programme that covers the quality system at intervals the shop plans; auditors who do not audit
their own work (read here as: the auditor is not the clause's owner on the ISO 9001 checklist, a check the
app can make, not the only way to show impartiality); findings recorded with what was seen; nonconformities
followed by correction, a root cause, an action, and a later check that the action worked. The finding
grades (major, minor, observation, opportunity for improvement) are the words certification bodies
commonly use; ISO 9001 itself does not grade findings. The 12-month coverage window, the 30-day and 14-day
warnings and the 90-day default before an effectiveness check are the app's choices, not periods the
standard sets (it sets none), and the page says so. AS9100D additions are not covered.

## Suppliers (`src/shared/suppliers.ts`)

Read on 2026-11-26. ecfr.gov and acquisition.gov refused this environment that day, so the DFARS text came
from the DITA source GSA publishes for acquisition.gov:

| Source | File | sha256 |
| --- | --- | --- |
| DFARS 252.204-7021 (NOV 2025) | `https://raw.githubusercontent.com/GSA/GSA-Acquisition-DFARS/master/dita/252.204-7021.dita` | `c5bcbb3f0836e8ef7faeb941ca1a62619bb19a7910e84b90a33e817655911ac3` |
| DFARS 204.7502 | `.../dita/204.7502.dita` | `d1d7493b56df91a01464d92c036071ccbf4a4d7ed765f7250e43016ba9523d15` |

All 12 `SUPPLIER_QUOTES` are verbatim substrings of those files with tags removed and whitespace collapsed,
checked by script; `suppliers.test.ts` pins their hash. The file itself has a few run-together words
("basis,an", "requiredin"); the quotes stop short of them rather than correct them.

32 CFR 170.23 (Application to subcontractors) was read from eCFR on 2026-11-26, the text in force on
2026-11-01: `https://www.ecfr.gov/api/versioner/v1/full/2026-11-01/title-32.xml?part=170&section=170.23`
(needs `Accept-Encoding: gzip`, i.e. `curl --compressed`; without it eCFR answers 406, which is why the
first read failed), sha256 `05d63c9b120441134d9638c754568d7b4d644e8b5ffec143c123680e1fa85348`. All 6
`FLOWDOWN_RULE_QUOTES` are verbatim substrings of it with tags removed and whitespace collapsed, checked by
script; `suppliers.test.ts` pins their hash. `suggestFlowdownLevel` applies (a)(1)-(4): FCI only gives
Level 1 (Self); CUI gives Level 2 (Self), or Level 2 (C3PAO) when the prime contract requires Level 2
(C3PAO) or Level 3 (DIBCAC). Paragraph (b), DoD's own flow-down guidance, is why it stays a suggestion.

What the checks take from the clause: the "current" periods in paragraph (a) (Conditional 180 days, Final
Level 1 one year, Final Level 2 or 3 three years, affirmation one year), "or higher" from (d)(1)(i), the
affirmation before award from (d)(4), the clause in the subcontract unless the items are COTS or no FCI or
CUI goes with them from (f)(1), and the status check before award from (f)(2). 204.7502(b)(2) (Level 1 needs
a Final status for award) is shown as a note only: it governs DoD's awards, not a prime's.

**Not read: 32 CFR 170.23**, which the clause points to for the level a subcontract needs. The app does not
encode it: the shop picks the level it flows down. The one level rule the app applies, that a subcontract
flowing CUI needs Level 2 or higher because Level 1 covers FCI only, follows from 170.15 and 170.16 (read
2026-11-25, above) and is in the app's own words. Next: quote 170.23 from the eCFR versioner API when it
answers, and suggest the level from it.
