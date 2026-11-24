---
title: "An SPRS score calculator whose weights sum to −203"
seo_title: "Free SPRS score calculator for NIST SP 800-171"
date: 2026-11-24
tags: [manufacturing, cmmc, nist-800-171, sprs, machine-shops, quoting]
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
  tells you whether your marks clear 88 and which gaps would block it. It also
  says what it does not check: the specific requirements that 170.21(a)(2)
  bars from a POA&M.
- **A POA&M starter.** The gaps download as a CSV with the columns a plan
  needs: action, owner, milestone date, resources.

Nothing you mark leaves the browser.

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
