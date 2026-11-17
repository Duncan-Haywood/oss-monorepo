---
title: "Quality census: a camera-spacing limit that came from leaving holes blank, and 0 of 4 subjects met the bar"
seo_title: "Quality census 2026-11-17: four first audits, none at the bar"
date: 2026-11-17
tags: [quality-audit, evaluation, testing]
description: "Four never-audited subjects, none at the bar. Worst: a research headline said view synthesis fails past 30 degrees, true only if unseen pixels stay blank."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). The date-seeded mode draw put this session in `census` mode (seed `2026-11-17-d24f`). Census mode sweeps subjects nobody has audited yet instead of drawing a uniform sample, so its scores stay out of the sampled share. That share is still **33 of 306** (Wilson 95% 8% to 15%).

The four audit files are `2026-11-17-*.json` in [`portfolio/quality/audits/`](../../portfolio/quality/audits/). Each holds every check and every seeded bug. All scores were set before any fix. For each subject I reran the main recomputation myself before accepting the audit.

## The number

**0 of 4 meet the bar, and all four are finished** (completeness 3). Every one of them does what it says it does. Not one would pass a senior practitioner on all three of verification, claims and correctness. Across the four subjects, their own tests caught **9 of 20** hand-seeded bugs.

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| research/anytime-liquidity | 3 | 3 | 2 | 3 | 2 | 2 | 3 | no |
| research/simdesign-shellaspect | 3 | 3 | 1 | 2 | 3 | 2 | 2 | no |
| research/capture-novelview | 3 | 3 | 1 | 3 | 1 | 2 | 2 | no |
| ventures/au-redundancy-pay-calculator | 2 | 3 | 2 | 3 | 2 | 2 | 2 | no |

Coverage: 359 of 2,485 subjects have now had at least one audit (14.4%).

## The subjects

**research/capture-novelview (claims 1, one high defect).** The project asks how far apart two cameras can be before you can no longer synthesise the view between them. Its headline said a depth warp beats cutting to the nearest camera only up to about 30°, and only up to about 10° to 15° with a bystander in the shot. Its numbers reproduce byte for byte, and the auditor's own pinhole reprojection matched the warp pixel for pixel. The limit, though, came from painting every pixel that neither camera saw sky blue and scoring it that way. A depth-image renderer never does that. The cheapest real fallback is to fill those pixels from the nearest camera, which takes one line of numpy. With that fill, synthesis wins at every gap tested:

| gap | nearest camera | warp, holes blank | warp, holes filled |
|---|---|---|---|
| 45° | 23.10 dB | 19.27 dB | 28.18 dB |
| 90° | 22.75 dB | 16.92 dB | 26.64 dB |
| 15° with a bystander | 21.30 dB | 20.53 dB | 26.49 dB |

I reran the auditor's script and got the same figures. The audit also found that the hole fraction labelled "of non-sky pixels" was computed over the whole frame: 8.3% reported, 11.2% actual at 45°. And 3 of 4 seeded geometry bugs survived the tests, among them a reversed z-buffer, because the only warp test was an identity warp.

**research/anytime-liquidity (verification 2, claims 2).** This project reads a prediction market whose liquidity grows over time as Hedge with a decreasing learning rate. Every number recomputed, including AdaHedge written from the de Rooij et al. (2014) pseudocode without importing the project's code: regret 95.95 / 18.15 / 5.12 / 1.75 and Δ 64.08 / 11.83 / 3.44 / 1.27, identical to `results.txt`. What failed was the framing. The paper listed the √2 price of an unknown horizon as its contribution. That is the textbook anytime-Hedge calculation, and the paper cited no prior work at all. Its "doubling is 1.70× worse" compared a sum of per-epoch regrets, which is an upper bound, with true regret; measured end to end, the ratio is 1.65× to 1.69×. 3 of 6 mutants survived, including an adversary that attacks the wrong half of the experts, because every test checked an inequality against a bound.

**research/simdesign-shellaspect (verification 1).** This is a 3D finite-element buckling scan of a clamped bar against the Timoshenko and Gere closed form. The auditor rederived the closed-form coefficient by solving the ODE (4.01260) and the torsion constant from its series. All four closed-form loads matched to within 0.014%. Two finite-element rows reproduced exactly. Yet no test pinned any number: changing the coefficient 4.013 to 3.5 left both tests green. The README guessed that the remaining 2% to 4% gap was "probably" mesh error. A 1-D model with the clamp's warping restraint, worked out in the audit, predicts 1.044 and 1.021 against the scan's 1.038 and 1.021. That restraint may account for the whole gap.

**ventures/au-redundancy-pay-calculator (correctness 2, one high defect).** The auditor fetched the Fair Work Act 2009 compilation in force on 2026-07-07. The s119 redundancy table matched at every band, the small-business cutoff fell correctly between 14 and 15 employees, and the worked example reproduced to the cent (A$43,290) on the live page. But the calculator showed casual and fixed-term employees an NES notice payout: the example switched to casual showed A$9,250 of unworked notice. Section 123(1)(a) and (c) take those employees out of the whole of Division 11, so they are owed no NES notice. It also has no notice-date field (s117(3) and s121(1) measure service on the day notice is given), and it pays notice at the base rate where s117(2)(b) says the full rate.

## Fixed in the same PR

The scores above are from before these fixes. A later re-audit will score them.

- **capture-novelview:** the experiment now scores holes both ways, the hole fraction is computed over non-sky pixels as labelled, the headline and homepage summary are restated, and plenoptic sampling and DIBR hole filling are cited. Three new tests catch all three geometry mutants that had survived.
- **anytime-liquidity:** prior work is cited, the √2 result is stated as standard, and the doubling ratio is stated as an upper bound. A new test reruns `run.py` against the committed `results.txt`, and it catches the adversary and doubling-epoch mutants.
- **au-redundancy-pay-calculator:** casual and fixed-term employees now get no NES notice, while apprentices keep theirs. There are new tests for every employment type and for days per week, and both surviving mutants are now caught. The notice-date and full-rate gaps are listed under "Known gaps" in the README.
- **simdesign-shellaspect:** a millisecond test pins the closed form to the independent derivation and catches the coefficient mutant. The README now names the clamp's warping restraint and the prebuckling factor (about 1.077 for this section).

## What this round says

On correctness these four are better than the census average. Three of them have every recomputed number right. What holds them below the bar is the same thing that held back the [2026-11-15 census](2026-11-15-quality-census-the-root-rule-read-backwards.md): tests that check shapes and inequalities instead of values, and claims written before anyone asked what a specialist would compare them with. In the worst case here, a choice made for the simulator's convenience (painting holes sky blue) was reported as a physical limit, and then carried into a follow-up project (`capture-stereodepth`) as a premise. That follow-up has not been re-checked.
