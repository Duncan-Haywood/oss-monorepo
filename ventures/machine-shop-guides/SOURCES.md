# Sources

Every regulatory statement on these pages traces to one of the sources below.
Checked on **24 November 2026**. Rules change; re-check before relying on a
page, and update the date here and on `cmmc-level-1-vs-level-2.html` when you do.

## How they were checked, and what was not

The session that built this venture could not open the official hosts directly
(`ecfr.gov`, `acq.osd.mil`, `acquisition.gov`, `war.gov`, `dowcio.war.gov` and
`nist.gov` were refused by the container's network proxy). The facts below were
checked through web-search excerpts of those official pages, restricted to the
official domains where possible. Two items are **transcribed rather than
re-read** and are the first thing a session with access should verify:

1. **Annex A point values** (`sprs-data.mjs`). Transcribed from the DoD
   Assessment Methodology v1.2.1 Annex A. Internal check: the 109 scored
   values sum to 313, so an all-unmet score is 110 − 313 = −203, which matches
   the −203 to 110 range in the DoD CIO briefing "CMMC Alignment to NIST
   Standards". A single wrong weight would break that sum unless offset by
   another error; `sprs.test.mjs` asserts it.
2. **The 32 CFR 170.21(a)(2) list** of requirements that may never be on a
   POA&M. Not encoded; the calculator and guide say so and send the reader to
   the section.

## Sources

| Fact | Source |
|---|---|
| Start at 110; subtract 5/3/1 per unimplemented requirement; partial credit for 3.5.3 and 3.13.11; no SSP means no completed assessment; Basic assessment fields (date, score, date 110 will be reached) | NIST SP 800-171 DoD Assessment Methodology, Version 1.2.1, 24 June 2020, <https://www.acq.osd.mil/asda/dpc/cp/cyber/docs/safeguarding/NIST-SP-800-171-Assessment-Methodology-Version-1.2.1-6.24.2020.pdf> |
| Score range −203 to 110; 88 minimum passing | DoD CIO, "CMMC Alignment to NIST Standards" briefing, <https://dodcio.defense.gov/Portals/0/Documents/CMMC/CMMC-AlignmentNIST-Standards.pdf> |
| CMMC scoring; 3.5.3 (5 none / 3 remote+privileged only); 3.13.11 (5 none / 3 not FIPS-validated) | 32 CFR 170.24, <https://www.ecfr.gov/current/title-32/subtitle-A/chapter-I/subchapter-G/part-170/subpart-D/section-170.24> |
| Conditional status ≥ 80% (88); POA&M items generally 1-point only, 3.13.11 partial the exception; 180-day closeout | 32 CFR 170.21, <https://www.ecfr.gov/current/title-32/subtitle-A/chapter-I/subchapter-G/part-170/subpart-D/section-170.21>; 80% also in the final-rule preamble, 89 FR, 15 Oct 2024, <https://www.federalregister.gov/documents/2024/10/15/2024-22905/cybersecurity-maturity-model-certification-cmmc-program> |
| Level 1: 15 FAR 52.204-21 requirements, annual self-assessment and affirmation, results in SPRS, no POA&M | 32 CFR 170.15, <https://www.ecfr.gov/current/title-32/subtitle-A/chapter-I/subchapter-G/part-170/subpart-D/section-170.15>; DoW CIO "About CMMC", <https://dodcio.defense.gov/cmmc/About/> |
| Level 2 (Self): triennial, annual affirmation, SPRS, artifacts kept six years | 32 CFR 170.16, <https://www.ecfr.gov/current/title-32/subtitle-A/chapter-I/subchapter-G/part-170/subpart-D/section-170.16> |
| Phase 1 began 10 Nov 2025 with the DFARS rule | DFARS Case 2019-D041 final rule, Federal Register, 10 Sep 2025, <https://www.federalregister.gov/documents/2025/09/10/2025-17359/defense-federal-acquisition-regulation-supplement-assessing-contractor-implementation-of> |
| Phase 2 (planned 10 Nov 2026) suspended 13 Jul 2026; L1 (Self) and L2 (Self) remain; no C3PAO/DIBCAC requirements during suspension; DFARS 252.204-7012 continues; class deviation 2026-O0025 Rev. 3; Task Force RFI comments due 14 Aug 2026 | Department of War release, 13 Jul 2026, <https://www.war.gov/News/Releases/Release/Article/4542329/forging-the-arsenal-of-freedom-department-of-war-suspends-cmmc-phase-ii-require/>; DoW CIO implementing memo, <https://dowcio.war.gov/Portals/0/Documents/Library/ImplementingSuspensionCMMC-PhaseII.pdf>; deviation memo, <https://www.acq.osd.mil/dpap/dars/classdev/DFARS_RFO/Part-240/2026-O0025_Rev3_TAB_A_Deviation_Memo.pdf>; SBA Office of Advocacy, 20 Jul 2026, <https://advocacy.sba.gov/2026/07/20/dow-requests-information-for-cmmc-reform-task-force/> |
| No announced Phase 2 restart date as of 24 Nov 2026 | Absence of evidence: no official or secondary source found in searches on 24 Nov 2026. Re-check. |
| SPRS assessment no more than three years old | DFARS 252.204-7019 / 252.204-7020, <https://www.ecfr.gov/current/title-48/chapter-2/subchapter-H/part-252/subpart-252.2/section-252.204-7019> |
| 3.12.2 and 3.12.4 requirement wording; requirement labels | NIST SP 800-171 Rev. 2, <https://csrc.nist.gov/pubs/sp/800/171/r2/upd1/final> (labels in `sprs-data.mjs` are paraphrases) |

## CMMC Level 1 self-assessment (added 25 November 2026)

| Fact | Source |
|---|---|
| The 15 requirement texts in `l1-data.mjs`, and the clause's paragraph (c) flow-down wording | FAR 52.204-21 (Nov 2021), **copied word for word** from GSA's published FAR source, <https://github.com/GSA/GSA-Acquisition-FAR/blob/master/dita/52.204-21.dita> (fetched 25 Nov 2026; file sha256 `5d9ff06ba3d5119fc8ac703902daca44ccec271865de1f7d697118bcc5fc832f`). A script compared all 15 texts to that file: 15 of 15 identical. `l1.test.mjs` pins their hash. The official page is <https://www.acquisition.gov/far/52.204-21>; `acquisition.gov` and `ecfr.gov` were not reachable from the building session. |
| Level 1 requirements are FAR 52.204-21(b)(1)(i)–(xv); identifier format AC.L1-b.1.i … SI.L1-b.1.xv; the table mapping them to NIST SP 800-171A objectives | 32 CFR 170.14(c)(2) and 170.15. **All 15 rows of Table 2 to 170.15(c)(1)(ii) read directly** from the eCFR versioner API (`/api/versioner/v1/full/2026-11-01/title-32.xml?part=170&section=170.15`, needs `Accept-Encoding: gzip`) by a second session on 25 Nov 2026; all 15 match `l1-data.mjs`, and `l1.test.mjs` pins them. The same session re-read the 15 texts on <https://www.acquisition.gov/far/52.204-21> (reachable that day) and found them identical to the GSA copy. |
| The 59 assessment objectives (`L1_OBJECTIVES`); "must be performed using the objectives defined in NIST SP 800-171A"; FCI read for CUI | 32 CFR 170.15(c)(1)(i), read directly 25 Nov 2026; objectives extracted with `pdftotext` from NIST SP 800-171A (June 2018), <https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-171A.pdf>, read directly 25 Nov 2026: the "Determine if" items of the 17 mapped NIST numbers (6+2+6+5+3+3+2+4+6+8+2+6+2+1+3). CUI replaced by FCI in five (3.1.22[b], [d], [e]; 3.8.3[a], [b]), flagged `fciSubstituted`. |
| Every requirement MET for Final Level 1 (Self); annual self-assessment; SPRS entry records level, date, scope, CAGE codes and result | 32 CFR 170.15(a)(1) and (b), same excerpts |
| No POA&M at Level 1 | 32 CFR 170.21, same excerpts |
| Affirmation at the end of the self-assessment and annually | 32 CFR 170.22(b)(1), same excerpts |
| MET / NOT MET / N/A findings; N/A objective "equivalent to ... MET"; evidence in final form, not drafts; Level 1 "scored as MET or NOT MET in their entirety" | 32 CFR 170.24(b) and (c)(1), read directly from the eCFR API 25 Nov 2026. (The first Level 1 build had no N/A because no excerpt it could read covered it; this is that text.) |
| "Examples of evidence" under each requirement | Ours. Not from any rule; the page says so. |

## Machining costs

No machining rate, material price, cycle time or markup appears anywhere in
this venture. The quote calculator starts empty and uses only what the user
types; the pricing guide describes a method.
