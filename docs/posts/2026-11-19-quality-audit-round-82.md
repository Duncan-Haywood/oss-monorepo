---
title: "Quality audit round 82: 2 of 5 at the bar, and a ReDoS checker that passed the email regex that hangs V8"
seo_title: "Quality audit 82: a ReDoS checker missed the classic email regex"
date: 2026-11-19
tags: [quality-audit, evaluation, testing]
description: "2 of 5 subjects meet the bar. A ReDoS checker called a common email regex safe, though V8 took 11.7 s on it, and a MAUVE study's headline held only on means."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). The evidence is in the five `2026-11-19-*` files with seed `2026-11-19-i-58b7` in [`portfolio/quality/audits/`](../../portfolio/quality/audits/). Each file lists every check and every bug the auditor seeded by hand. Every score was set before any fix.

This round ran in mode `sample`. It drew the flagship `ventures/changepoint-detector`, two ventures and two research projects. No platform directory was drawn, because every one has been audited in the last 90 days. The four non-flagship subjects had never been audited. Before accepting each auditor's file I reran one of its checks myself, and every one reproduced:

- **changepoint-detector:** on the Nile series (change in mean), a brute-force optimal partitioning written from scratch gives the change at index 28 (1899) with cost 129.332896. The engine gives the same. The mean-and-variance model gives 1265.2911 in both. On the coal-mining disasters, the count (Poisson) model gives breaks at 1892 and 1948 in both.
- **greenhouse-bench-planner:** for the example's tomatoes the sow date is 2027-05-08 minus 8 weeks, which is 2027-03-13. Seeds are ceil(300 / 0.92) = 327, bench space is 300 / 2.2 = 136.36 sq ft and the margin is $720. The tool prints `2027-03-13 327 136.36 5.45 720`.
- **regex-redos-check:** `node cli.mjs check '^(a|a?)+$'` printed "no backtracking risk found". This pattern is on OWASP's list of evil regexes. In V8 it took 390 ms at 20 a's and 480 ms at 24.
- **multiclass-tangent-log:** an independent rebuild of the score gives a curvature-per-range ratio of 1.341 at ρ = 0.5 only with ε capped at 0.2. At ε = ρ, which is what the paper says it used, the ratio is 1.181.
- **mimic-mauve:** an independent divergence frontier gives MAUVE 1 for identical distributions. For disjoint supports with 5 buckets it gives 0.0039683, against a closed form of 1/252.

## The number

**2 of 5 subjects meet the bar**: 1 of the 4 sampled, plus the flagship. Across every sampled audit, 34 of 343 now meet it (Wilson 95% interval 7% to 14%). All five are finished (completeness 3).

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/changepoint-detector (flagship) | 3 | 3 | 3 | 2 | 3 | 3 | 3 | yes |
| ventures/greenhouse-bench-planner | 3 | 3 | 3 | 3 | 3 | 3 | 2 | yes |
| ventures/regex-redos-check | 2 | 3 | 2 | 2 | 3 | 2 | 2 | no |
| research/mimic-mauve | 3 | 3 | 2 | 3 | 2 | 2 | 2 | no |
| research/multiclass-tangent-log | 3 | 3 | 3 | 3 | 2 | 2 | 2 | no |

Claims bound both research projects: their numbers recompute, but their write-ups say more than the numbers do. Of 25 bugs seeded by hand, the tests caught 16. One of the 9 that survived was in mimic-mauve and changed no output, so no test could have caught it.

## Each subject

**changepoint-detector (flagship).** The reviewer is a statistician who uses changepoint methods (PELT, BOCPD). Beyond the three exact matches above:

- `ruptures` 1.1.10 agreed with the engine on 120 of 120 fresh seeded series.
- An independent Adams and MacKay online detector gave P(change at 1899) = 0.786189 on the Nile. The engine agrees to within 1.04e-11 at every point.
- All 979 tests pass, in 9 minutes 16 seconds.

The scores match the 2026-11-09 audit, which this auditor reached independently. The worst defect is an old one: no test pinned the default BIC penalty. The fast core tests stayed green when it was changed from k ln n to (k + 0.5) ln n. Craft stays at 2, because `engine.mjs` has grown from 2,243 lines to 3,004. Out of 5 seeded bugs that changed the output, the tests caught 4. The `--ar1` false-alarm and power figures came from a single seed set. On fresh seeds the auditor got 8 of 40 false alarms and 32 of 40 changes found, against the README's 4 and 35.

**greenhouse-bench-planner.** The reviewer is a commercial greenhouse grower who plans bench space for spring crops. The auditor rebuilt the planner's model with an independent mixed-integer solver:

- On the example, it found the same best plan: $4,548.10 and 1,723 units.
- On 25 random crop lists, the tool came within 0.39% of that optimum and never went over bench or germination capacity.
- The page says it tries the best of all 5,040 booking orders. That holds.

Domain is 2 because the model is simpler than a grower's plan. One germination density covers every crop, though plug trays per square foot differ two to four times between crops. Plants are never spaced out on the bench, and every loss is taken at seeding. The worst defect: units typed as an unquoted `1,200` shifted every column. The tool then planned a 1-unit crop sown in 2023 and showed no error.

**regex-redos-check.** The reviewer is an application-security engineer who triages ReDoS reports. The tool catches the textbook shapes (`(a+)+$`, `(a|aa)+$`, `(\w+\s?)*$`) and the polynomial CVE patterns, and it does not flag safe patterns. Its gaps are in other shapes:

- **Worst defect (high):** a bounded count inside an unbounded repeat was never flagged. The common email validator ending `([a-zA-Z0-9]{2,4})+$` came back "no backtracking risk found". In V8 it takes 1.4 s at a 50-character tail and 11.7 s at 56.
- **More missed patterns:** `^(a|a?)+$` and `^((ab)*)+$`.
- **False positive:** `^(?:\s|#.*)*$` is reported as exponential and fails CI, though nothing the auditor tried slowed it down.
- **Seeded bugs:** 2 of 4 survived. One raised the timing probe's growth threshold from 4 to 40, and no test noticed.

**mimic-mauve.** The reviewer is a researcher who evaluates text generators with MAUVE. The experiment rebuilds byte for byte, and all 200 MAUVE calls match an independent frontier to within 2.2e-16. The headline said "every cell is far from its null… in all 20 cells". That is true of the cell means, but in single draws two cells overlap their human-vs-human null:

- wiki/mistral-chat: two draws at 0.918 and 0.901, level with their own nulls of 0.919 and 0.902.
- recipes/mpt-chat: one draw at 0.978, above 4 of its 5 null draws.

The disagreements between MAUVE and the detector, which the write-up calls "where it is interesting", sit inside the draw-to-draw noise. The p-values treat 20 cells as independent, though the cells share 7 human pools. The closest prior work (Pillutla et al., JMLR 2023; Pimentel et al., ICLR 2023) was not cited.

**multiclass-tangent-log.** The field is proper scoring rules, not online classification. The reviewer is a referee for a venue such as ACM EC or *Decision Analysis*. The maths holds:

- The range 1 − ln ε, the 63× and 490× ratios against Brier, the dropped-class formula and the best cutoff in E4 all recompute from an independent Gneiting–Raftery construction.
- The range proof checks by hand.

The paper had no reference list. It did not cite the work on scoring rules optimised for a bounded payment range (Neyman, Noarov and Weinberg, EC 2021; Li, Hartline, Shan and Wu, EC 2022). It also stated "the best cutoff is ε = p_min" generally, but that holds only within its one-parameter family, for a known truth, and not for every truth: at K = 2, ρ = 0.45 it fails. The ρ = 0.5 row of E3 was computed at ε = 0.2, not at ε = ρ as stated.

## What was fixed in this PR

The scores above are from before these fixes. A later round re-audits.

- **regex-redos-check:**
  - Two narrow rules: a flexible bounded count of one character class directly under a repeat, and a branch that is a bounded repeat of another branch's characters.
  - The email validator, `^(a{2,4})+$` and `^(a|a?)+$` are now errors, and new tests keep `^(a{3})+$`, `^(?:ab{2,4})+$` and `(a|b?)+c` clean.
  - The repository's own sweep, 25,439 regexes, still finds no new errors.
  - The README lists what is still missed.
- **greenhouse-bench-planner:**
  - A line with more than ten columns is now rejected with "write 1200, not 1,200".
  - A new test checks the survival factor in the germination limit. The bug that survived before is now caught.
- **changepoint-detector:**
  - A test pins BIC (k ln n) and AIC (2k) for all five models, so the BIC change that survived is now caught.
  - The README test count is updated from 581 to 979.
- **multiclass-tangent-log:**
  - E3 is rerun at ε = ρ: 1.18, not 1.34, with a dated correction.
  - The paper has a reference list.
  - "63×" and "ε = p_min" are now qualified as results within this family that assume the truth is known.
  - Tests cover the Brier denominator and the clipping floor, and both bugs that survived are now caught.
- **mimic-mauve:**
  - The headline now says the separation holds on cell means and names the two cells that overlap in single draws.
  - "And the reverse", which no cell backed, is withdrawn.
  - The prior work is cited, and the shared human pools and the separate SVD fits are listed as limits.
  - A test checks that the null compares two disjoint human draws. The bug that survived before is now caught.

Still open:

- changepoint-detector: the size of `engine.mjs`, and the `--ar1` figures with no interval.
- greenhouse-bench-planner: one germination density for every crop, and no spacing stage on the bench.
- regex-redos-check: `^((ab)*)+$`, the `^(?:\s|#.*)*$` false positive, and a probe that cannot confirm the bounded-count shape.
- mimic-mauve: a sample size far below what MAUVE was validated at, and per-draw values not saved.
- multiclass-tangent-log: no comparison with optimised bounded scoring rules.
