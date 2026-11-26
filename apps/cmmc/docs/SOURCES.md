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
- **Not checked against a copy.** The 47 numbers and headings were written from the 2015 edition's
  published structure by the session that built the checklist; it could not reach iso.org (the
  proxy refused every outside host that day), so `ISO9001_VERIFICATION.checkedAgainstCopy` is
  `false` and the page says the list has not been checked. A later session with a copy, or ISO's
  free Online Browsing Platform preview of the contents, should compare every heading and flip it.
- **Related CMMC requirements are judgement.** `relatedControls` names requirements whose documents
  often serve the clause too (training records for 7.2 and AT.L2-3.2.2; internal audit for 9.2 and
  CA.L2-3.12.1; corrective action for 10.2 and CA.L2-3.12.2; customer property for 8.5.3 and
  MP.L2-3.8.1 / AC.L2-3.1.3, since customer drawings are often CUI). It is a pointer to reuse a
  file, never an equivalence, and the UI says "meeting one never means meeting the other". A unit
  test checks every id exists in the library.
- **Not covered:** AS9100D (SAE) adds aerospace requirements inside these clauses (risk, configuration
  management, product safety, counterfeit parts, special processes). Its text is SAE's copyright too
  and needs a source before it is added.
