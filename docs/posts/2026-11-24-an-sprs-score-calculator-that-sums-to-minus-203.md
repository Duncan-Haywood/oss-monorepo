---
title: "An SPRS score calculator whose weights sum to −203"
seo_title: "Free SPRS score calculator for NIST SP 800-171"
date: 2026-11-24
tags: [for-customers, machine-shop-guides, manufacturing, cmmc, nist-800-171, sprs, machine-shops, quoting]
description: "A free SPRS score calculator for small machine shops, the one-line check that every weight is in place, and where CMMC Phase 2 stands on 24 November 2026."
---

A small machine shop that takes defense work usually has to post a NIST SP
800-171 score in the Supplier Performance Risk System (SPRS). The arithmetic
behind that score is simple. It comes from the
[DoD Assessment Methodology v1.2.1](https://www.acq.osd.mil/asda/dpc/cp/cyber/docs/safeguarding/NIST-SP-800-171-Assessment-Methodology-Version-1.2.1-6.24.2020.pdf)
(24 June 2020): start at 110 and subtract 5, 3 or 1 point for every one of
the 110 requirements you have not implemented. Two requirements earn partial
credit: multifactor authentication (3.5.3) and FIPS-validated cryptography
(3.13.11). The system security plan (3.12.4) has no point value at all,
because without one there is nothing to assess.

We built that arithmetic into a free page:
[SPRS score calculator](https://marisstella.app/machine-shop-guides/sprs-score-calculator.html).
It is part of a new set of
[machine shop guides](https://marisstella.app/machine-shop-guides/).

## The check that catches a wrong weight

A 110-row table of weights is easy to get wrong by one row. The DoD CIO's
[CMMC alignment briefing](https://dodcio.defense.gov/Portals/0/Documents/CMMC/CMMC-AlignmentNIST-Standards.pdf)
gives the score range as −203 to 110. So the 109 scored weights must add up to
313, and the test suite checks that they do. Ours come to 44 five-point
requirements, 14 three-point and 51 one-point: 220 + 42 + 51 = 313. One
mistyped weight breaks the sum, unless a second mistake happens to cancel it.

This session could not open the official .gov hosts directly (the container's
proxy refused them), so the weights were transcribed and then checked against
that sum. The venture's `SOURCES.md` says so, and names the first two things
a session with direct access should re-read.

## What the calculator does beyond the sum

- **Gaps, heaviest first.** Every 5- and 3-point gap is work that has to be
  finished before a CMMC Level 2 assessment. Under
  [32 CFR 170.21](https://www.ecfr.gov/current/title-32/subtitle-A/chapter-I/subchapter-G/part-170/subpart-D/section-170.21),
  a plan of action and milestones (POA&M) can generally carry only 1-point
  items, plus 3.13.11 at its partial value.
- **The 88 line.** Conditional status needs at least 80% of 110. The page
  tells you whether your marks clear 88 and which gaps would block it.
- **The six that can never wait.** Added 25 November 2026: the check now
  also covers the six requirements
  [170.21(a)(2)(iii)](https://www.ecfr.gov/current/title-32/subtitle-A/chapter-I/subchapter-G/part-170/subpart-D/section-170.21)
  bars from a POA&M whatever their points (see below).
- **A POA&M starter.** The gaps download as a CSV with the columns a plan
  needs: action, owner, milestone date, resources, and whether the rule lets
  that gap sit on a POA&M at all.

Nothing you mark leaves the browser.

## Six 1-point gaps that still block Conditional status

The general rule reads as "1-point gaps can wait". That is the trap. Section
170.21(a)(2)(iii) names six Level 2 requirements that may never be on a
POA&M, and five of them are worth only 1 point (the sixth, the SSP, is worth
none):

| Requirement | What it covers | Points |
|---|---|---|
| AC.L2-3.1.20 | Verify and control connections to external systems | 1 |
| AC.L2-3.1.22 | Control CUI posted on publicly accessible systems | 1 |
| CA.L2-3.12.4 | System security plan | none |
| PE.L2-3.10.3 | Escort and monitor visitors | 1 |
| PE.L2-3.10.4 | Keep physical access logs | 1 |
| PE.L2-3.10.5 | Control and manage physical access devices | 1 |

Three are about the shop floor: who walks in, whether anyone wrote it down,
and who holds the keys and badges. A shop scoring 108 with a missing visitor
log and one ordinary 1-point gap looks fine on the general rule. Under
(a)(2)(iii) it cannot end a Level 2 assessment in Conditional status until
the visitor log exists. The calculator now says so by name, the POA&M starter
marks each row "Yes" or "No" with the reason, and the
[SSP template](https://marisstella.app/machine-shop-guides/nist-800-171-ssp-template.html)
flags these rows in its review.

The list was read through search excerpts of the eCFR page, because the
session that added it could not reach ecfr.gov directly. The DoD CIO's
[CMMC FAQ](https://dodcio.defense.gov/Portals/0/Documents/CMMC/FAQsv6.pdf)
confirms there are six. Re-read the section before an assessment.

## Where CMMC stands, 24 November 2026

Phase 2 would have started requiring third-party Level 2 certification on
10 November 2026. The Department of War suspended it on
[13 July 2026](https://www.war.gov/News/Releases/Release/Article/4542329/forging-the-arsenal-of-freedom-department-of-war-suspends-cmmc-phase-ii-require/).
Level 1 and Level 2 self-assessments still apply, and so does DFARS
252.204-7012. We found no announced restart date. The
[Level 1 vs Level 2 guide](https://marisstella.app/machine-shop-guides/cmmc-level-1-vs-level-2.html)
carries this status box, dated so a reader can see how old it is.

## The quoting side

The same owner who posts the SPRS score usually writes the quotes. The
[job-shop quote calculator](https://marisstella.app/machine-shop-guides/job-shop-quote-calculator.html)
prices a part from your own material cost, setup, programming, cycle time,
other operations and markup. It recomputes the price at every quantity break.
It ships with no rates: a "typical" machine rate would describe someone
else's shop. The
[pricing guide](https://marisstella.app/machine-shop-guides/how-to-price-a-machined-part.html)
explains where to find each number in your own records.

Both tools are the free front door to two products in development for the
same shops: an RFQ-to-quote assistant and a CMMC/ISO 9001 workspace. Neither
certifies anyone. Only an authorized C3PAO or the government can do that.
