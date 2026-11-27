---
title: "An SPRS score calculator whose weights sum to −203"
seo_title: "Free SPRS score calculator for NIST SP 800-171"
date: 2026-11-24
tags: [for-customers, machine-shop-guides, manufacturing, cmmc, nist-800-171, sprs, machine-shops, quoting]
description: "A free SPRS score calculator for machine shops, every weight checked against the 5- and 3-point lists in 32 CFR 170.24, and the FCI rule for Level 1."
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

The session that built the page could not open the official .gov hosts, so
the weights were transcribed and then checked against that sum. A sum only
catches so much: swap a 5 and a 3 between two requirements and it still comes
to 313.

## Checked against the regulation, 25 November 2026

The eCFR answered the next day, and the regulation turns out to be a better
check than the sum.
[32 CFR 170.24(c)(2)(i)(B)](https://www.ecfr.gov/current/title-32/subtitle-A/chapter-I/subchapter-G/part-170/subpart-D/section-170.24)
names every requirement worth more than 1 point:

| Points | Requirements | Count |
|---|---|---|
| 5 | 3.1.1, 3.1.2, 3.2.1, 3.2.2, 3.3.1, 3.4.1, 3.4.2, 3.5.1, 3.5.2, 3.6.1, 3.6.2, 3.7.2, 3.8.3, 3.9.2, 3.10.1, 3.10.2, 3.12.1, 3.12.3, 3.13.1, 3.13.2, 3.14.1, 3.14.2, 3.14.3 (basic); 3.1.12, 3.1.13, 3.1.16, 3.1.17, 3.1.18, 3.3.5, 3.4.5, 3.4.6, 3.4.7, 3.4.8, 3.5.10, 3.7.5, 3.8.7, 3.11.2, 3.13.5, 3.13.6, 3.13.15, 3.14.4, 3.14.6 (derived) | 42 |
| 5, or 3 if partial | 3.5.3 (MFA), 3.13.11 (FIPS-validated encryption) | 2 |
| 3 | 3.3.2, 3.7.1, 3.8.1, 3.8.2, 3.9.1, 3.11.1, 3.12.2 (basic); 3.1.5, 3.1.19, 3.7.4, 3.8.8, 3.13.8, 3.14.5, 3.14.7 (derived) | 14 |
| none | 3.12.4 (the SSP) | 1 |
| 1 | everything else | 51 |

All 110 weights in the calculator match, and the test suite now checks each
one against these lists, not just the total. The same day we read
[170.21](https://www.ecfr.gov/current/title-32/subtitle-A/chapter-I/subchapter-G/part-170/subpart-D/section-170.21)
directly: the six requirements it bars from a POA&M are the six below, and
the 80% line is 88 of 110.

One trap turned up in the regulation, and it matters for Level 1 shops.
[170.15(c)(1)(i)](https://www.ecfr.gov/current/title-32/subtitle-A/chapter-I/subchapter-G/part-170/subpart-C/section-170.15)
says a Level 1 self-assessment uses the NIST SP 800-171A objectives, and "in
any case where an objective addresses CUI, FCI should be substituted for CUI
in the objective." Five Level 1 objectives are affected: three on public
websites (3.1.22) and two on wiping or destroying media (3.8.3). A shop that
only holds federal contract information should read those as FCI. Our
[Level 1 checklist](https://marisstella.app/machine-shop-guides/cmmc-level-1-self-assessment.html)
already does.

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

The list was first read through search excerpts of the eCFR page, then
read directly on 25 November 2026; it matches. Re-read the section before an
assessment, since rules change.

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

Both tools are the free front door to two products for the same shops: an
RFQ-to-quote app and a CMMC/ISO 9001 workspace. Neither certifies anyone.
Only an authorized C3PAO or the government can do that.

## Keeping the score instead of recalculating it (updated 27 Nov 2026)

A calculator gives you a number once. The number then goes stale as the shop
closes items, adds a laptop or changes its MSP. The
[CMMC workspace](https://marisstella.app/cmmc/) keeps each requirement's status,
owner and evidence next to the SSP and the POA&M, so the score moves as you
close items. Since 27 November 2026 anyone can sign up, at
[cmmc.marisstella.app](https://cmmc.marisstella.app/signup?from=cmmc-site%2Fpost-sprs).

- **Level 1 is free:** the 15 FAR 52.204-21 safeguards, evidence, the SSP and
  the pass/fail result, for one user.
- **Level 2** (110 requirements, 320 assessment objectives, the SPRS score, SSP
  and POA&M with the conditional-status checks) will cost $249 a month, and
  **Level 2 + Quality** (adding the ISO 9001:2015 clause checklist) $399. Both
  are not on sale yet. The
  [pricing page](https://marisstella.app/cmmc/pricing) compares them with
  FutureFeed, PreVeil Pass and consultant fees.
- AI drafting of implementation statements is built but switched off for now.
  Until it is on, you write each statement yourself.

The workspace's site has its own
[SPRS calculator](https://marisstella.app/cmmc/sprs-score-calculator). It uses
the same weights and the same −203 floor, and adds the POA&M rules of
32 CFR 170.21: whether the open items could support a Conditional Level 2
(Self) status. It works out the score in your browser, and nothing you tick
is sent anywhere.
