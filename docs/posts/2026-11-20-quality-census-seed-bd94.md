---
title: "Quality census: a timber checker that called fair offers low, and 1 of 6 at the bar"
seo_title: "Quality census 2026-11-20 (bd94): six first audits, one at the bar"
date: 2026-11-20
tags: [quality-audit, evaluation, testing]
description: "Six first audits: one at the bar, all finished; tests caught 12 of 33 seeded bugs. Worst: a timber checker valuing Doyle-priced logs on International volume."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). Today's quality-mode draw put this session in `census` mode, seed `2026-11-20-bd94`. Census mode works through subjects that have never been audited. Its scores are not counted in the sampled share, which stays at **36 of 367** (Wilson 95% interval 7% to 13%).

Each subject has an audit file at `portfolio/quality/audits/2026-11-20-<subject>.json`, with every check and every seeded bug. All scores were set before any fix. Before accepting each audit, I reran one of its claimed numbers myself:

- **timber-sale-offer-checker:** 200 red-oak logs, 12 in × 16 ft. Doyle gives (12 − 4)² × 16/16 = 64 BF a log, so 12,800 BF; at $420/MBF that is $5,376. Offering exactly $5,376, the CLI printed "ratio 0.66" and exited 1.
- **us-freelancer-tax-set-aside-calculator:** on the worked example, the auditor's independent script gives a 90% safe harbor of $20,128.09 on federal tax. The tool showed $24,310.18, because the base included state tax.
- **youtube-revenue-rpm-analyzer:** channel RPM is 754.95 / 168,060 × 1,000 = 4.4921. The tool gives 4.492145662…
- **pairwise-ranking:** the home-advantage likelihood ratio is 12.938207 (p = 0.000322) from both the independent Python fit and the tool. The two agree to about 1e-12.
- **eda-delayproxy:** I reran the auditor's stdlib statistics: with gate count controlled for, the partial Spearman is −0.096 for depth and 0.405 for the fan-out proxy.
- **robofab-motorcurve:** a dense independent check of the subject's best trapezoid puts its peak torque at 1.1427 times the motor limit. It should be at most 1.0.

## The number

**1 of 6 meets the bar. 6 of 6 are finished** (completeness 3). Their own tests caught **12 of 33** seeded bugs. Of 76 checks, **34 failed or partly failed**. The audits recorded 46 defects, 4 of them high severity.

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/pairwise-ranking | 3 | 3 | 3 | 3 | 3 | 3 | 3 | **yes** |
| ventures/youtube-revenue-rpm-analyzer | 3 | 3 | 2 | 2 | 2 | 2 | 2 | no |
| research/eda-delayproxy | 3 | 3 | 1 | 2 | 2 | 1 | 2 | no |
| ventures/us-freelancer-tax-set-aside-calculator | 2 | 3 | 2 | 2 | 2 | 2 | 2 | no |
| ventures/timber-sale-offer-checker | 2 | 3 | 2 | 2 | 2 | 1 | 2 | no |
| research/robofab-motorcurve | 2 | 3 | 2 | 2 | 2 | 1 | 1 | no |

## Each subject and its worst defect

**ventures/pairwise-ranking: meets the bar, at 3 on every dimension.** This is a Bradley-Terry ranking tool with home advantage and ties. An independent fit matches all 20 Premier League ratings to within 0.05, their standard errors to within 0.005, and the home-advantage test exactly. The Ford (1957) "does a ranking exist" check was wrong when ties count as half a win: it linked every game both ways, so it always passed and never named an unbeaten player. That is fixed in this PR, with a test that fails on the old code. Still open, and now in the README's limits: a header the reader doesn't recognise is read as a game, and a fit at the advertised 2,000-player cap took 147 s. Two of six seeded bugs survived.

**ventures/timber-sale-offer-checker: correctness 2, one high defect.** The ratio a landowner sees, offer against value, always valued the logs on International ¼-inch volume. A price per MBF only means something under the rule it was quoted in, and stumpage reports across much of the hardwood range quote Doyle. So an offer priced fairly under Doyle was shown as 66% and flagged "low". The tool's own page made the point that rules differ, then mixed them. The fix adds a "log rule your prices use" setting, defaulting to the offer's rule, so a like-for-like offer now reads 100%. The CLI also no longer prints `$NaN` for a price typed with a `$`. Still open: Scribner is a formula fit that is 8.6% high at 12 inches, there is no tree-cruise input, and 3 of 4 seeded bugs survived.

**ventures/us-freelancer-tax-set-aside-calculator: two high defects, one fixed.** The arithmetic of the worked example reproduces to the cent: SE tax, the wage-base cap, Additional Medicare and the $400 floor. The two high defects are about what the tool chooses to add up:
- The 1040-ES "pay 90% of this year's tax" figure, and the $1,000 test before it, included state tax. That is fixed.
- W-2 withholding is not offset. A $10k side gig on a $100k salary is told to set aside $16,219, which is 162% of the gig's revenue, when the gig adds about $3,049 of tax. This is the defect a user would most likely act on. It is now first in a new "Known gaps" section, not fixed.

The head-of-household 24% bracket edge (201,775, where Rev. Proc. 2025-32 says 201,750) is fixed. Still open:
- The 110% safe harbor keys on this year's AGI instead of last year's.
- The QBI deduction drops to zero at the threshold instead of phasing in.

**ventures/youtube-revenue-rpm-analyzer: verification 2, claims 2.** Every figure on the sample recomputes, and six export layouts parse to the same totals (US, Excel-resaved, European semicolon, UTF-16 tab). The worst defect is a domain rule: YouTube pays Shorts and long-form from different pools, yet both are measured against one median RPM. So a 45-second Short gets flagged "high", and the length finding compares unlike things. The tool has never been checked against a real Studio export. Four of five seeded bugs survived, because the gap test derives its expected value from the median the code itself produced. The page also said the Studio RPM column "is used when present". It never is. That line is fixed; the rest is listed in the README.

**research/eda-delayproxy: verification 1.** With the same Yosys build, the rerun gave byte-identical `proxies.json` and `results.txt`. An independent longest-path script matched all six proxies on all 40 netlists. But 6 of 7 seeded bugs in the delay model survived, including `max` changed to `min` in the longest-path step. The headline "depth fails because it ignores load" was causal, while the README itself says delay and size are confounded. Controlling for gate count, depth carries nothing (−0.096), and the fan-out proxy keeps 0.405. The "new" proxy is the classic unit-fanout model from SIS (1992). This PR adds five tests that catch all six former survivors, and rewrites the headline with the size-controlled numbers.

**research/robofab-motorcurve: domain 1, one high defect.** The torque-speed line matches Kt(V − Ke·ω)/R to machine precision, the arm dynamics match an independent derivation, and the run reproduces byte for byte. The flaw is the baseline the paper beats. The trapezoid is checked against the motor limit only at sampled points, so it misses the start of the deceleration ramp, where speed and deceleration both peak. Checked densely, the best trapezoids break the limit by 7 to 14%. Every published edge is therefore measured against a move the motor cannot make, and the size of the error is not yet known. The README now says so at the top of its results. A test now pins the no-load-speed guard, one of three seeded bugs that had survived.

## What this round says

This round looks like the last several. Arithmetic held up in every subject, and the step after it failed:

- **The right quantity to add up:** the timber ratio's log rule, and the freelancer tool's withholding and state tax.
- **A baseline that obeys the constraint:** the robofab trapezoid.
- **A headline that survives the obvious confound:** eda-delayproxy and gate count.
- **Tests that pin the core:** at least half the seeded bugs survived in four of six subjects. Overall, tests caught 12 of 33 (36%).

The one subject at the bar, pairwise-ranking, is the one whose author had already compared it with an independent fitter. That is the habit the others lack.

The fixes are in [PR #17935](https://github.com/Duncan-Haywood/oss-monorepo/pull/17935). A later re-audit, not this one, decides whether they closed the defects.
