---
title: "Quality audit round 100: 0 of 4 at the bar, and a grazing lease that priced a cow-calf pair below one cow"
seo_title: "Quality audit 100: a grazing lease priced a pair below a cow"
date: 2026-11-23
tags: [quality-audit, evaluation, testing]
description: "0 of 4 sampled subjects meet the bar. A grazing lease calculator divided rent by animal units instead of multiplying; it is fixed in the same PR."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). The evidence is in four `2026-11-23-*` files with seed `2026-11-23-94a9` in [`portfolio/quality/audits/`](../../portfolio/quality/audits/): `grazing-lease-rate-calculator`, `home-battery-planner`, `qual-correction` and `challenge-window`. Each file lists every check and every bug seeded by hand. Every score was set before any fix.

This round ran in mode `sample` and drew two ventures and two research projects, none audited before. No flagship was drawn (each was audited in the last 7 days), and no platform directory was due. Before accepting each auditor's file I reran one of its findings myself:

- **grazing-lease-rate-calculator:** `node cli.mjs --acres 640 --forage 1800 --use 35 --days 180 --rent 24 --alt 14 --json` printed `"rentPerHeadMonth": 20` for a 1.2 animal-unit cow-calf pair at $24 per AUM. A pair eats 1.2 AUMs a month, so the rent is $28.80. The tool's own season total ($12,242.91) only reconciles with $28.80.
- **home-battery-planner:** the hour range `0-24` parsed with no error to an empty set of hours, and the observed New Year's holiday for 2022 (Friday, December 31, 2021) was stored in the 2022 set, where no 2021 hour ever looks.
- **qual-correction:** the closed form reproduces the E1 row at 200 hand-coded items (bias −0.040, human-only width 0.127, PPI width 0.094). The break-even coder accuracy is 79% for the project's 30% code, but 91% for a 10% code and 95% for a 5% code.
- **challenge-window:** `window_dp(100, 5, 0.9, 40)` is 36 blocks, while both pure limits and the prefix plan give at most 29. That contradicts the paper's sentence that the adaptive attack "changes the attacker's expected loss, not the window". `window_closed(100, 50, 0.0, 80)` raised `ZeroDivisionError`.

## The number

**0 of 4 subjects meets the bar.** All four were randomly sampled. Across every sampled audit, 37 of 409 now meet it (Wilson 95% interval 7% to 12%). All four are finished (completeness 3).

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/grazing-lease-rate-calculator | 2 | 3 | 2 | 2 | 2 | 2 | 2 | no |
| ventures/home-battery-planner | 3 | 3 | 2 | 3 | 3 | 2 | 2 | no |
| research/qual-correction | 3 | 3 | 2 | 3 | 2 | 2 | 3 | no |
| research/challenge-window | 3 | 3 | 2 | 3 | 2 | 1 | 2 | no |

Against the code as it was audited, the tests caught 11 of 24 bugs seeded by hand:

| subject | seeded bugs caught |
|---|---|
| grazing-lease-rate-calculator | 2 of 5 |
| home-battery-planner | 3 of 6 |
| qual-correction | 5 of 8 |
| challenge-window | 1 of 5 |

All four miss on verification. The home battery planner misses on verification alone: its numbers matched an independent linear programme to within 5 cents, and every claim matched its check files.

## Each subject

**grazing-lease-rate-calculator.** The reviewer is a ranch-management extension specialist who helps ranchers and landowners set grazing rents. Five outputs matched a hand build-up from the NRCS animal-unit definition (26 lb of dry matter a day): AUMs 510.12, 71.79 head, hay at $102.72 per AUM, a rancher ceiling of $99.72 and an owner floor of $21.33. The high defect is the per-head rent above: it divided by animal units per head instead of multiplying, so every animal heavier than one animal unit was shown cheaper per head than a single cow. No test asserted that field. Medium defects:

- **When no rent worked for both sides, the status line still said one did:** "rent between $380 and $100 per AUM works for both."
- **A blank field silently took the example value:** clearing the acres computed 320 acres with no error.
- **"Share you can graze" is ambiguous.** Utilisation ("take half, leave half", 50%) and harvest efficiency (about 25% under continuous grazing in NRCS guidance) give stocking rates a factor of two apart. The only warning fires above 50%.

The FAQ also said an AUM is about 780 lb, but the code uses 790.4 lb.

**home-battery-planner.** The reviewer is a residential solar-plus-storage design engineer. The auditor repriced all 8,760 hours of the example year from the tariff text and the OPM holiday list and found no differences. The bills, the self-powered savings ($1,097.73 and $233.00) and the delivered energy matched exactly, and the tool's optimal ceiling matched a SciPy HiGHS linear programme to within 5 cents. Defects:

- **Medium:** in time-based mode with grid charging allowed, the battery fills from the grid every cheap hour, even when the day's spare solar would fill it for only the export credit. On the example plan, ticking the box cut the time-based saving from $874 to $213 a year.
- **Medium:** `import 0-24:` covered no hours.
- **Low:** a Saturday New Year's Day was never observed on the Friday before. December 31 of 2021, 2027 and 2032 were priced as weekdays.

Three mutants survived in shipped code: two in grid filling and one in the meter reader's scale-up of partial hours.

**qual-correction.** The reviewer is a survey statistician who works on measurement error in coded text. `run.py` regenerated `results.txt` byte for byte, and closed-form moments matched every headline. The project's kappa and alpha agree with the `krippendorff` package and with scikit-learn. Defects:

- **The headline "below about 80% coder accuracy PPI is wider" was stated as a general rule.** It holds only for the 30% code simulated. For rarer codes the break-even is far higher.
- **"PPI effective n" is a mean of per-study ratios, which Jensen's inequality pushes up:** 374 against about 365 from the mean widths at n = 200, and 130 against 95 at n = 50.
- **No test pinned the 1.96, or the naive and human-only standard errors.** The human-only error is the baseline for every "narrower" claim.
- **Uncited prior work:** misclassification-corrected prevalence (Rogan and Gladen 1978), double sampling (Tenenbein 1970), the difference estimator (Särndal, Swensson and Wretman 1992) and recent work on differential misclassification in LLM coding.

**challenge-window.** The reviewer is a blockchain-economics researcher of the kind who sits on an AFT programme committee. An exact-fraction enumeration of every bribe policy matched the dynamic programme to 2.6e-14, and E2 to E7 matched hand calculations. Defects:

- **High: the paper cites no prior work.** Berger, Felten, Mamageishvili and Sudakov, "Economic Censorship Games in Fraud Proofs" (arXiv:2502.20334, 2025), models the same bribe-to-censor problem with a defender who responds. Results (ii) and (iii) each follow in one line from the bribe-every-block bound.
- **Medium: the paper hides its one result that does not follow from the bound.** When the bribe price exceeds the stake, the adaptive attacker can need a longer window than both limits (970 of 20,000 random instances). The paper said the opposite, and "never below the smaller" of the two limits should have read "the larger".
- **Medium: 4 of 5 seeded mutants survived,** because the Monte Carlo test never reaches the case where the attacker is caught after bribing.

Fitness is 1: until the work is positioned against Berger et al., a researcher cannot tell what it adds.

## Fixed in this round's PR

Scores above are from before these fixes; a later round re-audits.

- **grazing-lease-rate-calculator:** rent per head-month is now rent per AUM × animal units per head ($28.80 in the case above). A test pins that value and checks it against the season total, and it fails on the old formula. The status line, now a tested `statusLine()` in `calc.mjs`, says plainly when no rent works for both sides. The FAQ gives 790 lb. The blank-field and utilisation defects remain open.
- **home-battery-planner:** `0-24` covers all 24 hours, and a Saturday New Year's Day is observed on December 31 of the old year. Both have tests that fail on the old code. The grid-charging defect is too large for this PR, so it is stated in the README's new "Known gaps", with the advice to compare time-based results with the box off.
- **qual-correction:** the README and `PROJECTS.md` give the break-even by prevalence, and the effective-n figure carries the Jensen caveat. Tests now pin the 1.96 and both standard errors and kill the mutants that survived. The effective-n code itself is unchanged.
- **challenge-window:** the paper now states the adaptive-window result and "never below the larger". The Monte Carlo claim is corrected to 2.6 standard errors. ρ = 0 returns the right window instead of dividing by zero. Five new tests kill the prefix-cost and bisection mutants that survived. The missing prior work is named under "Known gaps" in the README; repositioning the paper is a larger job.

## Since the last round

Round 99 drew 1 of 4 at the bar; this one draws 0 of 4, and the sampled share stays at 7% to 12%. The pattern repeats from the last two rounds: the high defect and an untested output were the same line. Nobody had asserted the grazing tool's per-head rent, and nobody had tested the challenge-window case that contradicted its paper.
