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
   Assessment Methodology v1.2.1 Annex A and first checked only by the sum
   (109 scored values add to 313, so all-unmet is −203). **Verified 25 Nov 2026
   against the regulation:** ecfr.gov answered that day, and 32 CFR
   170.24(c)(2)(i)(B)(1)–(4) lists by number every 5-point requirement (23
   basic, 19 derived, plus 3.5.3 and 3.13.11 at 5 or 3) and every 3-point one
   (7 basic, 7 derived), the rest being 1. All 110 values in `sprs-data.mjs`
   match; `sprs.test.mjs` pins them to those lists. The Methodology PDF itself
   (acq.osd.mil) still was not opened.
2. **The 32 CFR 170.21(a)(2)(iii) list** of requirements that may never be
   on a POA&M. Encoded from search excerpts, then **read directly** on the
   eCFR renderer API on 25 Nov 2026
   (`/api/renderer/v1/content/enhanced/current/title-32?part=170&section=170.21`):
   (A)-(F) are the six in `POAM_PROHIBITED`, titles identical.

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
| Level 2 requirements that may never be on a POA&M, 32 CFR 170.21(a)(2)(iii)(A)-(F): AC.L2-3.1.20 External Connections (CUI Data), AC.L2-3.1.22 Control Public Information (CUI Data), CA.L2-3.12.4 System Security Plan, PE.L2-3.10.3 Escort Visitors (CUI Data), PE.L2-3.10.4 Physical Access Logs (CUI Data), PE.L2-3.10.5 Manage Physical Access (CUI Data) | eCFR, <https://www.ecfr.gov/current/title-32/subtitle-A/chapter-I/subchapter-G/part-170/subpart-D/section-170.21>, read 25 Nov 2026 through web-search excerpts restricted to ecfr.gov, law.cornell.edu and govinfo.gov (the hosts themselves were refused by the session's proxy): one excerpt gave (A)-(D), another (E) and (F) with these titles. The count of six is confirmed by the DoD CIO CMMC FAQ ("not one of the (6) prohibited in accordance with 32 CFR 170.21(a)(2)(iii)"), <https://dodcio.defense.gov/Portals/0/Documents/CMMC/FAQsv6.pdf>. `sprs.test.mjs` pins the six. |
| No POA&M at Level 1 | 32 CFR 170.21, same excerpts |
| Affirmation at the end of the self-assessment and annually | 32 CFR 170.22(b)(1), same excerpts |
| MET / NOT MET / N/A findings; N/A objective "equivalent to ... MET"; evidence in final form, not drafts; Level 1 "scored as MET or NOT MET in their entirety" | 32 CFR 170.24(b) and (c)(1), read directly from the eCFR API 25 Nov 2026. (The first Level 1 build had no N/A because no excerpt it could read covered it; this is that text.) |
| "Examples of evidence" under each requirement | Ours. Not from any rule; the page says so. |

## Machining costs

No machining rate, material price, cycle time or markup appears anywhere in
this venture (the stock-size page's price field starts empty too). The quote calculator starts empty and uses only what the user
types; the pricing guide describes a method.

## NIST 800-171 SSP template (added 25 November 2026)

| Fact | Source |
|---|---|
| What an SSP must describe: system boundaries, environments of operation, how requirements are implemented, relationships with or connections to other systems | NIST SP 800-171 Rev. 2, requirement 3.12.4 (wording as already used on `ssp-and-poam.html`, row above). The section layout of the generated plan is ours; NIST prescribes no format. |
| No completed assessment without an SSP | DoD Assessment Methodology v1.2.1, row above |
| N/A at requirement level scored as met, only when every objective is N/A | 32 CFR 170.24(b), row above (objective level); the requirement-level reading is ours and the page says to give the reason |
| Date 110 will be achieved | DoD Assessment Methodology v1.2.1 Basic assessment fields, row above; the page derives it from the user's own milestone dates and leaves it unset if any gap has none |

The building session could not reach `nvlpubs.nist.gov`, `csrc.nist.gov` or
`ecfr.gov` (proxy 403), so the requirement titles in the plan are the same
paraphrased labels as the SPRS calculator, and the plan says so. NIST
publishes an OSCAL catalog for Rev. 3 only
(`usnistgov/oscal-content`, `nist.gov/SP800-171/rev3`), and CMMC Level 2 is
assessed against Rev. 2, so Rev. 3 text was not substituted.

## Stock size from a STEP or STL file (added 25 November 2026)

| Fact | Source |
|---|---|
| STEP file structure (Part 21 DATA section, simple and complex entities), B-rep entities (EDGE_CURVE same_sense, CIRCLE/ELLIPSE placement and parameter, B_SPLINE_CURVE_WITH_KNOTS and RATIONAL_B_SPLINE_CURVE, TOROIDAL_SURFACE, SURFACE_OF_REVOLUTION), length units (SI_UNIT prefix, CONVERSION_BASED_UNIT) | ISO 10303-21 and the ISO 10303-42 / AP214 entity definitions as written by Open CASCADE 8.0 (the fixtures in `fixtures/geometry/` are that writer's output). The ISO texts are paid documents and were not read in the building session; the reader was checked against the kernel's own answers, below. |
| Box, volume and round-bar figures the tests compare with | OpenCascade (`cadquery-ocp` 8.0.1.1 from PyPI): `BRepBndLib.AddOptimal` without shape tolerance for the box, `BRepGProp.VolumeProperties` for volume, and a 0.01–0.02 mm mesh for the round bar (a lower bound). `fixtures/geometry/make_fixtures.py` makes the files; `corpus_check.mjs` compares. |
| Accuracy stated on the page (68 parts, never smaller, 60 exact, rest at most 2.8 mm over) | 9 fixed fixtures (`truth.json`) plus 60 generated by `make_fixtures.py --random 60` with seed 20261125 (one skipped: a cut left an empty solid), run 25 Nov 2026. Worst over-statement: 2.78 mm on `spline-revolve` (B-spline profile); worst on the generated set 1.24 mm (B-spline fillet surfaces). Smallest box minus true box: never below -1e-7 mm. STL volumes within 0.2% of the kernel's. |
| Density presets: 6061 Al 2.70, 7075 Al 2.81, carbon steel 7.85, 304/316 stainless 8.00, C360 brass 8.50, Ti-6Al-4V 4.43, acetal 1.41 g/cm³ | Common handbook nominal values. **Not re-read from a primary source in the building session** (Wikipedia and supplier data sheets returned proxy 403). The page labels them typical and editable and asks for the supplier's data sheet; they only affect weight, and a cost only when the user types a price per weight. |
| 1 lb = 0.45359237 kg; 1 in = 25.4 mm | International yard and pound agreement (1959), exact definitions. |

## DFARS 252.204-7012 incident reporting (added 25 November 2026)

| Fact | Source |
|---|---|
| Clause version MAY 2024; "Rapidly report" = within 72 hours of discovery (paragraph (a)); review (c)(1)(i); report at dibnet.dod.mil (c)(1)(ii); report elements per DIBNet (c)(2); medium assurance certificate, public.cyber.mil/eca (c)(3); malware to DC3, not to the CO (d); images and monitoring/packet capture data kept at least 90 days from report submission (e); forensic access (f); damage assessment (g); marking attributional/proprietary information (h); other reporting not abrogated (l); flow-down and subcontractor report number to the higher tier (m); cloud providers meet (c)-(g) (b)(2)(ii)(D) | DFARS 252.204-7012 (MAY 2024), **read in full** from GSA's published DFARS source, <https://github.com/GSA/GSA-Acquisition-DFARS/blob/master/dita/252.204-7012.dita> (fetched 25 Nov 2026; file sha256 `99af021d6f34a1a2b8def660f9b7bd6d219c910c3dfd84a9db9591e5a73b18c1`). The three quotations on the page (`QUOTES` in `incident.mjs`) were checked as verbatim substrings of that file by script; `incident.test.mjs` pins their hashes. Official page: <https://www.acquisition.gov/dfars/252.204-7012-safeguarding-covered-defense-information-and-cyber-incident-reporting.>; `acquisition.gov`, `ecfr.gov` and `dibnet.dod.mil` were not reachable from the building session. |
| The list of elements a DIBNet report must contain | **Not reproduced.** The clause points to dibnet.dod.mil for them and that host was not reachable, so the page sends the reader there rather than listing them. |
| 3.6.1 and 3.6.2 are 5-point requirements, 3.6.3 is 1 point | `sprs-data.mjs` (Annex A transcription, rows above) |
| The 72-hour and 90-day arithmetic | Ours: 72 elapsed hours from the typed discovery time; 90 calendar days from the typed report time, on the same local wall clock. "At least" in (e) means the date is a floor. |

## RFQ review checklist (added 25 November 2026)

| Fact | Source |
|---|---|
| The 13 clause numbers and titles in `CLAUSES` (`rfq.mjs`) | GSA's published FAR and DFARS source, the `.dita` file per clause in <https://github.com/GSA/GSA-Acquisition-FAR/tree/master/dita> and <https://github.com/GSA/GSA-Acquisition-DFARS/tree/master/dita>, fetched 25 Nov 2026 through raw.githubusercontent.com (`acquisition.gov` refused by the session's proxy). A script compared each title in `rfq.mjs` with the `<title>` of its file: 13 of 13 identical apart from whitespace. `rfq.test.mjs` pins the list (sha256 of the "id title" lines, first 16 hex: `3dc38d8abfae03ba`). |
| File hashes (sha256, first 16 hex) | 52.204-21 `5d9ff06ba3d51199` (same file as the Level 1 row above), 252.204-7012 `99af021d6f34a1a2`, 252.204-7019 `81ce994c4a52db16`, 252.204-7020 `9d410f5f46854f10`, 252.204-7021 `c5bcbb3f0836e8ef`, 252.225-7009 `f3b9821785f34dbb`, 252.225-7048 `04d84acec4fd7b5c`, 252.246-7007 `6b3a5a5899ebbbbc`, 252.246-7008 `c4c6081beea1072f`, 52.246-2 `1ab5bb386198b76d`, 52.246-11 `09573e4e085e39e2`, 52.246-15 `4992431fd3c44e62`, 52.211-15 `67ef6e27ab9e7cbe` |
| "Rapidly report" means within 72 hours of discovery (7012); SPRS score not more than 3 years old unless the solicitation says less (7019); specialty metals melted or produced in the US, its outlying areas or a qualifying country (7009(b)); export-controlled means EAR (15 CFR 730-774) or ITAR (22 CFR 120-130) (7048); government right to inspect at all places and times, including during manufacture (52.246-2(c)); comply with the listed higher-level quality standards and flow them down (52.246-11(a)-(b)); C of C in place of source inspection when the CAO authorizes it in writing (52.246-15); "This is a rated order" and follow 15 CFR 700 (52.211-15) | Read in the same `.dita` files. The `why` lines in `rfq.mjs` are our plain-language summaries, not clause text. |
| Manufacturing ITAR defense articles generally requires DDTC registration (22 CFR part 122) | Not re-read this session (`ecfr.gov` not reached); stated with "generally". Re-check against 22 CFR 122.1. |
| What the other patterns look for (AS9102, NADCAP, PPAP, MIL-PRF-8625, MIL-DTL-5541, AMS 2700, ASTM A967, MIL-STD-130 for IUID marking) | Spec names only, used as search patterns and in questions to the buyer; no requirement from those specs is restated. |
| ISO 9001:2015 and AS9100D clause 8.2.3, "review of the requirements for products and services" (named on `rfq-review.html`) | Not re-read: both standards are paywalled. Clause number and title from the published standards' tables of contents as commonly cited; re-check against a licensed copy. |
| AS9102 (rev C) form structure, Form 1/2/3 contents, FAI triggers and the Form 3 column names (`first-article-inspection.html`, `faiCsv` in `fai.mjs`) | Not read: AS9102 is sold by SAE. Taken from customer supplier guides found by search on 25 Nov 2026: GroundControl's "how to fill out AS9102 forms", GD-OTS AS9102 training (2016, 2019), Sonaca FAI_STD-001, and GKN Aerospace's "AS9102 FAIR common mistakes" (linked on the page). The page summarises, never quotes. Re-check against a licensed copy. |
| Full FAI after a production lapse of more than two years | Lockheed Martin Q2A rev 12, <https://www.lockheedmartin.com/content/dam/lockheed-martin/aero/documents/scm/Quality-Requirements/Clauses/q2a_rev12.pdf>, fetched 25 Nov 2026 (6 pages, "Revision 12"): "Seller shall complete a full FAI when a lapse in production for over two (2) years". The page attributes the rule to that customer clause, not to AS9102. |

## CMMC scoping worksheet (added 25 November 2026)

| Fact | Source |
|---|---|
| The five Level 2 asset categories, their descriptions, what the OSA documents and how each is assessed (table 3 to 170.19(c)(1)); ESP scoping by CUI / SPD and CSP / not (table 4 to (c)(2)(i)); SSP and customer responsibility matrix for an ESP ((c)(2)(ii)); Level 1 scope, Specialized Assets outside it, no documentation for out-of-scope assets ((b)) | 32 CFR 170.19, **read in full** from the eCFR versioner API, <https://www.ecfr.gov/api/versioner/v1/full/2026-11-20/title-32.xml?part=170&section=170.19> (fetched 25 Nov 2026; one content version, amended 16 Dec 2024; file sha256 `69465e2bd4fc5a15247db28a15728a36aa2988ad32c1d3c08ad6299de084f197`). The 17 strings in `QUOTES` (`scope.mjs`) were checked as verbatim substrings of that file by script; `scope.test.mjs` pins their hash, and `page.test.mjs` checks every `<q>` on the page is one of them. Official page: <https://www.ecfr.gov/current/title-32/subtitle-A/chapter-I/subchapter-G/part-170/subpart-D/section-170.19>. |
| Definitions of External Service Provider, Security Protection Data (log data, configuration data), Cloud Service Provider, Operational Technology, Test Equipment, GFE | 32 CFR 170.4, same API (file sha256 `0eecffcfcd034dfe52728d1ad2705e1bc303989cf77bc9af4909cf1e564994d4`), used for the wording of the page's prompts; not quoted. |
| A CSP holding CDI must meet "security requirements equivalent to those established by the Government for the Federal Risk and Authorization Management Program (FedRAMP) Moderate baseline" | DFARS 252.204-7012(b)(2)(ii)(D), GSA DFARS source (same file as the incident row above), re-read 25 Nov 2026. |
| The questions, their order and the tie-breaks (a security tool that holds CUI is a CUI Asset; a security tool is never out of scope; an asset that could reach CUI with no written policy is "not resolved", not a CRMA; unanswered counts in scope) | Ours, read from table 3 ("Assets that fall into any in-scope asset category cannot be considered an Out-of-Scope Asset"; the CRMA definition's "because of security policy, procedures, and practices in place"). The rule gives categories, not a decision tree. |
| DoD's CMMC Level 2 Scoping Guide (appendix A to part 170, paragraph (f)) | **Not read** in the building session; the page says it adds detail the page does not reproduce. |
| Which shop assets usually fall where (CNC controllers as OT, CMM as test equipment) | Our reading of the rule's list, phrased "most" and left to the shop: the "Cannot be fully secured" box decides, and unticking it makes a controller an ordinary CUI Asset. |
