---
title: "Quality audit round 53: 0 of 4 at the bar, and a tender checker that missed the FAR's own words"
seo_title: "Quality audit 53: tender checker, horse barn, friction twin"
date: 2026-11-12
tags: [quality-audit, evaluation, testing, research]
description: "0 of 4 sampled subjects meet the bar. A bid checker scored FAR 52.228-1 as having no bond; a research headline of 7.6x was really about 34x."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). The evidence is in [`portfolio/quality/audits/`](../../portfolio/quality/audits/), in the four `2026-11-12-*` files named below. Each file lists every check and every hand-seeded bug. Every score was given before any fix.

This round ran in mode `sample` with seed `2026-11-12-l`. Seed `-k` was taken by round 52 ([PR #15193](https://github.com/Duncan-Haywood/oss-monorepo/pull/15193)), which was still open when this round started. None of the four subjects had been audited before. No flagship or platform subject was drawn: each one had been audited too recently to come up again.

## The number

**0 of 4 sampled subjects meet the bar.** Across all sampled rounds on `main` plus this one, 31 of 222 meet it (Wilson 95% interval 10% to 19%). Three of the four are finished (completeness 3); qual-hypothesis is not.

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/horse-boarding-stall-profit-calculator | 3 | 3 | 2 | 3 | 3 | 2 | 2 | no |
| ventures/tender-bid-readiness | 1 | 3 | 1 | 2 | 2 | 2 | 2 | no |
| research/qual-hypothesis | 3 | 2 | 1 | 3 | 2 | 2 | 2 | no |
| research/friction-twin | 3 | 3 | 2 | 3 | 2 | 2 | 2 | no |

All four subjects failed on verification. The tests caught 7 of 25 hand-seeded bugs:

| subject | seeded bugs caught | recomputed outputs right |
|---|---|---|
| horse-boarding-stall-profit-calculator | 2 of 6 | 4 of 5 |
| tender-bid-readiness | 2 of 6 | 3 of 9 |
| qual-hypothesis | 2 of 7 | 5 of 6 |
| friction-twin | 1 of 6 | 6 of 6 |

Three of the four get their arithmetic right. The tests just don't check most of it.

## Verdicts and worst defects

### tender-bid-readiness

**It is the furthest from the bar (correctness 1).** It is a browser checker: you paste a solicitation and it looks for seven readiness signals, such as the deadline, the bond, insurance and a mandatory site visit. The reviewer named for it is a senior capture and proposal manager working on US federal and state construction bids.

The auditor fetched six FAR clauses from acquisition.gov and ran them through the checker. Of nine recomputed outputs, 3 passed, 1 partly passed and 5 failed.

**Worst defect: it missed the FAR's own wording (high).** FAR 52.228-1 calls the requirement a "bid guarantee", not a "bid bond". I reran the auditor's input, paragraphs (a) and (c) of that clause, and it scored 0 with nothing found. The checker also missed:
- "must be received no later than" and "publicly opened at" as deadlines;
- amendment acknowledgement on SF 30.

It also found things that are not there:
- "coinsurance" counted as insurance;
- "certified check" and "certified payroll" counted as certifications;
- "Due to site constraints" counted as a deadline;
- "A bid bond is not required" counted as a bond requirement.

When the question deadline came first in the text, it was shown as the bid deadline. The project's own guide page warns about exactly that ("two deadlines, not one").

The comparison page also understated GovWin IQ. It said reading a solicitation "is not that platform's job". Deltek's page advertises AI document summaries, fit scores and help with go/no-go decisions.

### horse-boarding-stall-profit-calculator

**It is close to the bar and misses on verification (2).** It works out monthly profit, break-even occupancy and break-even board for a boarding barn, with the owner's own care time priced at a wage. The reviewer named for it is a boarding-barn manager working from an extension-service budget.

I recomputed the built-in example by hand, and it matched exactly:
- 17 horses, each bringing in $590 × 0.97 = $572.30;
- labour of 20 min × 30.4 days ÷ 60 × $15 = $152 per horse;
- a profit of 17 × $205.30 − $3,000 = **$490.10**;
- break-even board of **$520.28** and target board of **$641.56**.

**Worst defect: the occupancy table and the hourly-pay finding were untested (medium).** Four of six seeded bugs survived. Two examples: dropping unpaid board from the table's profit, and computing the owner's hourly pay from profit alone.

Other gaps:
- one board price only, with no mix of full, partial and pasture board;
- no depreciation or interest on the barn;
- an occupancy typed as 0.85 was silently read as 0.85%.

### qual-hypothesis

**It reproduces, but its headline ratio was the wrong measure (claims 2, verification 1).** It tests whether word-level hypotheses mined from a small sample of GoEmotions comments hold up on held-out comments. The reviewer named for it is a statistician or NLP researcher reviewing for a workshop.

The auditor's own pipeline matched every table entry within Monte Carlo error:
- its own CSV loader, with statsmodels for the z-test and Benjamini-Hochberg;
- the E3 split, word for word: "sorry", +0.060 and +0.054, p = 2.1e-21, with 11 hypotheses replicated;
- the author's Benjamini-Hochberg code against statsmodels on 20,000 random p-vectors, with 0 disagreements.

**Worst defect: the "7.6 times" overstatement was measured on absolute values (medium).** The held-out effect averages |d|, and |d| has a noise floor. With shuffled labels, where the true effect is 0, it still reads 0.009. Measured in the direction the discovery sample found, the held-out effect at 100 comments is 0.0028. So the inflation there is about 34 times, not 7.6.

Other problems:
- the nearest prior work was not cited (Zhong et al. 2022; Monroe et al. 2008; the winner's-curse literature). The result is the textbook winner's curse;
- five of seven seeded bugs survived, including replacing Benjamini-Hochberg with Bonferroni;
- the research index marked the milestone done, but the LLM proposer it names was never built.

### friction-twin

**It is right to many digits and is textbook material.** It compares a viscous-only "digital twin" with a coast-down that has dry (Coulomb) friction as well. The reviewer named for it is a controls or system-identification engineer.

Every headline number reproduced in the auditor's own stdlib script, which does not import the package:
- the stopping distance 3 − 0.5 ln 7 = 2.027045. I recomputed this one too;
- the fitted gains, such as 16/13 = 1.230769 on [1, 3];
- the crossover speed, 7.3395;
- all four minimax gains, from an equal-end-error solve.

**Worst defects (medium):**
- The paper presented known results as findings, including one labelled a "negative result". It did not cite the SAE coast-down standards (J1263 and J2263), which fit the same constant-plus-speed road load.
- Its claim that viscous-only friction is "the default in many simulators" had no source.
- Five of six seeded bugs survived. Every test used m = 1, so dropping the mass from the fitted intercept went unseen.

## What was fixed in this round

The scores above are from before these fixes, all in [PR #15198](https://github.com/Duncan-Haywood/oss-monorepo/pull/15198). A later round re-audits.

- **tender-bid-readiness:**
  - the checker now matches FAR wording: bid guarantee and bid security, received no later than, time set for opening, publicly opened, SF 30 and amendments;
  - it matches whole words only, so "coinsurance" and "due to" no longer count;
  - "certified check" and "certified payroll" no longer count as certifications;
  - a waived requirement is reported as "stated as not required";
  - the bid deadline is preferred over the question deadline;
  - the GovWin IQ page now states what Deltek advertises;
  - six new tests.
- **horse-boarding-stall-profit-calculator:**
  - tests now pin the occupancy table, the hourly-pay finding and both warning thresholds; all four bugs that had survived now fail a test;
  - an occupancy under 1% is rejected with a hint;
  - the "no network calls" test now scans every module the page loads, as its FAQ says.
- **qual-hypothesis:**
  - a dated correction gives the sign-aligned held-out effect (about 34 times at 100 comments) and the noise floor;
  - five prior works are cited;
  - five new tests catch the Bonferroni, sign-check and ranking bugs;
  - the research index now says the milestone is only partly built.
- **friction-twin:**
  - the b = 0 and c = 0 limits no longer divide by zero;
  - tests now use m ≠ 1 and pin the results-file and minimax values;
  - the paper has a "What is known" section citing SAE J1263 and J2263;
  - the simulator claim is qualified.

Not fixed, and listed in each audit file:
- set-aside and NAICS size eligibility, bid acceptance period and wage determinations in the tender checker;
- a mix of board types and barn depreciation in the horse calculator;
- an LLM proposer and a real restatement check in qual-hypothesis;
- time-uniform rather than speed-uniform sampling in friction-twin's gain table.

## What changed since round 51

The share meeting the bar moved from 31 of 214 to 31 of 222, because none of this round's four met it. Round 51 had two ventures clear verification; this round neither did.

Every subject failed verification, ventures and research alike. Across the four, 18 of 25 seeded bugs survived. In three of the four, the recomputed outputs were right and the tests checked only a few of them. The pattern the last few rounds keep finding holds: the author tests the headline number and leaves the table, the threshold and the second output untested.

The tender checker is the other kind of failure. It was finished and tested, but against the author's own phrasing. Its four tests used sentences like "Bid bond 5%", so it had never seen the words a federal solicitation actually uses. Testing against an external source would have caught it on the first clause.
