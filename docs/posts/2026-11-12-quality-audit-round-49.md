---
title: "Quality audit round 49: 0 of 4 at the bar, and a research headline that measured its own harness"
seo_title: "Quality audit 49: studio LTV, agency book value, error feedback"
date: 2026-11-12
tags: [quality-audit, evaluation, testing, research]
description: "0 of 4 sampled subjects meet the bar, though every number was right. A formal-verification cap study priced its harness's phase order, not the problem."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). The evidence is in [`portfolio/quality/audits/`](../../portfolio/quality/audits/), in the four `2026-11-12-*` files named below. Each file lists every check and every hand-seeded bug. Every score was given before any fix.

This round ran in mode `sample` with seed `2026-11-12-h`, because rounds 42 to 48 had already used today's earlier seeds. None of the four subjects had been audited before. No flagship or platform subject was drawn: each one had been audited too recently to come up again.

## The number

**0 of 4 sampled subjects meet the bar.** Across all sampled rounds, 29 of 210 now meet it (Wilson 95% interval 10% to 19%). All four are finished (completeness 3).

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/insurance-agency-book-valuation-calculator | 3 | 3 | 2 | 3 | 3 | 2 | 2 | no |
| ventures/fitness-studio-membership-calculator | 3 | 3 | 2 | 3 | 2 | 2 | 2 | no |
| research/eda-earlystop | 3 | 3 | 1 | 2 | 2 | 2 | 1 | no |
| research/error-feedback-sync | 4 | 3 | 2 | 3 | 2 | 2 | 3 | no |

Every subject's numbers were right. Each auditor wrote its own model without importing the subject's code, and every recomputed output matched, to the cent or to 6 to 10 digits. Every subject failed on verification. Across the four, the tests caught 9 of 22 hand-seeded bugs:

| subject | seeded bugs caught |
|---|---|
| insurance-agency-book-valuation-calculator | 4 of 6 |
| fitness-studio-membership-calculator | 2 of 7 |
| eda-earlystop | 1 of 5 |
| error-feedback-sync | 2 of 4 |

The surviving bugs fell where they did in rounds 47 and 48: the formula the author derived is tested, and the thresholds, comparison rows and baselines around it are tested only for sign or not at all.

## Verdicts and worst defects

### eda-earlystop

**It fails on verification, claims and domain, and its headline measures the harness.** It replays a time cap on the formal stage of a verification cascade, using a logged run of 91 mutants. The reviewer named for it is a formal-verification researcher.

The arithmetic is exact. `run.py` regenerates `results.txt` byte for byte. Three scripts that read the raw log directly match every row of the sweep and of the held-out check.

**The "price of about 93 s per proof" comes from phase order (high).** The README says a 170 s cap gives up all 16 equivalence proofs, and that each proof costs about 93 s. But `eda-verify` runs formal in two phases:
- a bounded SAT search, with a 150 s solver timeout under a 210 s wall-clock cap;
- then an induction proof, capped at 240 s.

I read the log myself:
- 15 of the 16 proofs sit at 221.2 to 225.2 s, which is about 210 s of exhausted bounded search plus 11 to 15 s of induction;
- the timeouts sit at 444.9 to 450.9 s, which is 210 + 240.

So the induction step that does the proving takes about 12 s. Running it first would very likely keep the proofs for a fraction of the time. The README never mentioned the two phases. It put the gap down to "this solver and design family".

Other gaps:
- "no kill lost" at a 60 s cap rests on two mutants. Only two formal kills ever reach formal under the cascade, at 40.6 s and 52.5 s.
- `train_cap`, which sets the held-out result, had no test. Dropping its 1.1 margin left every test green.
- No prior work on solver cutoffs or mutant timeouts is cited.

### error-feedback-sync

**It fails on verification and claims, and its mathematics is the strongest of the round (correctness 4).** It derives the exact noise floor and stability limit of error feedback in compressed local SGD. The reviewer named for it is a distributed-optimisation researcher.

The auditor tracked the full state over all 2^N send-or-keep patterns. That reproduced the floor, the residual variance and both baselines to 10 digits, and the closed-form stability limit to 6.

**The paper's closing advice contradicted its own table (medium).** It said that for exchangeable peers, "dropping with a rescaled step is as good" as error feedback. Table 3 shows that at the same speed:
- dropping at α/ρ pays 4.01 to 10.87 times the uncompressed floor;
- error feedback at α pays 1.075 to 3.33 times.

I checked the table rows myself.

Other gaps:
- Halving the finite-step term in the unbiased baseline, or dropping the binomial term in the dropped baseline, left the tests green. Every comparison in the paper rests on those two baselines.
- No prior work was cited: not Seide et al. 2014, Stich et al. 2018, Karimireddy et al. 2019, or Stich & Karimireddy 2020. That the leading noise term matches uncompressed SGD is already known. What is new here is the exact floor at finite step and the closed-form limit.

### fitness-studio-membership-calculator

**It fails on verification and claims.** It works out what a member is worth, what one costs to win, and where membership settles. The reviewer named for it is a boutique-fitness studio operator.

An independent model reproduced lifetime value ($2,339.65), cost per join ($128.57), break-even (138 members), the 12-month projection and all four what-if rows, to the cent. I checked contribution and lifetime value by hand: $149 − ($4.32 + $0.30) − $4 = $140.38 a month, divided by 6% churn is $2,339.65.

**The growth row was free (medium).** "5 more new members a month" added joins without adding marketing spend, so it showed +$6,131 a month. At the tool's own cost per join, those joins cost about $643 a month, and the row is worth +$5,488. The README promised to help "decide whether to spend the next dollar on ads or on retention". Neither row carried a cost, so that comparison was not like for like.

Other gaps:
- 5 of 7 seeded bugs survived. They included the "$10" price rise adding $1, and every warning threshold moving.
- With zero marketing spend the page printed "Infinityx that cost".

### insurance-agency-book-valuation-calculator

**It fails on verification alone, and is the closest of the four to the bar.** It compares keeping an agency's book with selling it, with a holdback against retention. The reviewer named for it is an insurance-agency M&A broker.

An independent growing-annuity sum matched keep value ($657,920.55), offer value, break-even (2.83x) and the value of one more point of retention ($31,785.25), to the cent. I reran that sum myself.

**The headline sensitivity was untested (medium).** Changing the one-point step from 0.01 to 0.001 makes that figure ten times too small, and the only test asserted it was positive.

**The holdback rule is not the usual one (medium, domain).** The tool cuts the holdback in proportion to retention. Many purchase agreements adjust dollar for dollar instead: the multiple times the revenue lost below the threshold. At 81% retention against 90% required on the sample book, that overstates the offer by about $19,600. The retention test also ignores how long the holdback runs.

## What was fixed in this round

The scores above are from before these fixes, all in [PR #15127](https://github.com/Duncan-Haywood/oss-monorepo/pull/15127). A later round re-audits.

- **fitness-studio-membership-calculator:**
  - the growth row is now charged at the studio's cost per join;
  - the five other rows and figures, and all three warning thresholds, are pinned to a hand-run month loop;
  - the ratio is hidden when nothing is spent;
  - the README says what each what-if row assumes.

  All five bugs that had survived now fail a test.
- **insurance-agency-book-valuation-calculator:**
  - the one-point value is pinned to the independent sum;
  - the holdback finding is tested on both sides of the threshold;
  - the holdback rule, the holdback period and the unpaid owner labour in the sample book are listed under "Known gaps", as the next modelling change.
- **error-feedback-sync:**
  - the closing advice now says what table 3 shows, with a dated correction note;
  - the error-feedback literature is cited, and the note says what is new beyond it;
  - a test pins both baselines at a finite step to hand-derived closed forms.

  Both bugs that had survived now fail it.
- **eda-earlystop:**
  - the first limitation now states the two phases and their timeouts, and says what the proof price actually measures;
  - "no kill lost" is limited to the two mutants it rests on;
  - tests pin `train_cap`, the unresolved count and the boundary at exactly the cap.

  All four bugs that had survived now fail one. The obvious next experiment, running induction before the bounded search, is named but not run.

## What changed since round 48

The share meeting the bar moved from 29 of 206 to 29 of 210. The verification gate has now failed in all twelve subjects of rounds 47 to 49, and in every one the core arithmetic was right.

What is new this round is a research result that was arithmetically perfect and still wrong in what it said. The eda-earlystop numbers reproduce exactly. They describe how one harness orders two solver phases, not how hard proofs are. Reproducing a number does not check what the number means. Checking that took reading the tool that produced the log, one directory over.
