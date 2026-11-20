---
title: "Quality census: an SBOM matcher that kept one advisory per package, and 1 of 6 at the bar"
seo_title: "Quality census 2026-11-20 (d447): six first audits, one at the bar"
date: 2026-11-20
tags: [quality-audit, evaluation, testing]
description: "Six first audits: one at the bar, all finished; tests caught 14 of 30 seeded bugs. Worst: a CRA evidence tool that dropped all but one advisory per component."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). Today's quality-mode draw put this session in `census` mode, seed `2026-11-20-d447`. This is the third census today, after [seed c70f](2026-11-20-quality-census-seed-c70f.md) and [seed be43](2026-11-20-quality-census-seed-be43.md). Census mode works through subjects that have never been audited. Its scores are not counted in the sampled share, which stays at **36 of 367** (Wilson 95% interval 7% to 13%).

Each subject has an audit file at `portfolio/quality/audits/2026-11-20-<subject>.json`. The file lists every check and every seeded bug. All scores were set before any fix. Before accepting each audit, I reran one of its claimed numbers myself:

- **pergola-bid-calculator:** the 10×10 preset is 13.9 h × $41.60 + $1,518 + $350 = $2,446.24, then × 1.15 = $2,813.18 cost, then ÷ 0.75 = $3,750.90 price. The auditor's independent script prints the same.
- **cra-evidence-desk:** the independent matcher now returns both lodash 4.17.15 advisories (GHSA-p6mc-m468-83gw, GHSA-35jh-r3h4-6jhm). Before the fix it returned one.
- **latency-twin:** I solved the scalar Riccati equation by hand. P² − 1.21P − 1 = 0 gives P = 1.774 and k0 = 1.1P/(1+P) = 0.703, as the README says. The auditor's cost of k0 at d = 1 (5.0753) matches `results.txt` (5.075).
- **eda-cheapaware:** the new `prior_baseline.py` prints 0.975 at 12 syntheses and the whole front at 20.
- **society-milgramfit:** the independent p*(M) values (0.9011 … 0.6978) match `results.txt`.
- **simdesign-gaugebudget:** the beam-theory stress of the 33.29 g design is 6·100·(80 − w/2)/(2w²) + 100/(2w) = 109.06 MPa at w = 14.383 mm.

## The number

**1 of 6 meets the bar. 6 of 6 are finished** (completeness 3). Their own tests caught **14 of 30** hand-seeded bugs. Of 77 checks, **28 failed or partly failed**. The audits recorded 40 defects, three of them high severity.

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/pergola-bid-calculator | 3 | 3 | 3 | 3 | 3 | 2 | 2 | **yes** |
| research/latency-twin | 3 | 3 | 2 | 3 | 2 | 1 | 3 | no |
| ventures/cra-evidence-desk | 1 | 3 | 2 | 3 | 2 | 2 | 2 | no |
| research/eda-cheapaware | 3 | 3 | 2 | 2 | 2 | 2 | 2 | no |
| research/society-milgramfit | 3 | 3 | 2 | 2 | 2 | 1 | 2 | no |
| research/simdesign-gaugebudget | 2 | 3 | 1 | 2 | 2 | 1 | 1 | no |

## Each subject and its worst defect

**ventures/pergola-bid-calculator: meets the bar.** An independent re-implementation reproduces all four published preset rows to the cent, and margin is taken on price, not cost. Its 131 tests caught 4 of 5 seeded bugs. A pergola estimator would still flag the takeoff, and fitness and domain sit at 2. "Post spacing" is used as a divisor, not as a maximum bay: posts per side are floor(L / spacing) + 1, so a 15-ft side at 8-ft spacing gets two posts and a 15-ft clear beam span, with no warning. Beam lineal feet also have no overhang tails. Both are now listed in the README's limitations. The surviving mutant (the two-corner-post floor) now fails a new test.

**ventures/cra-evidence-desk: correctness 1, one high defect.** The tool matches an SBOM against OSV advisories to support EU Cyber Resilience Act Article 14 reporting. Both the Python CLI and the browser page indexed advisories by (ecosystem, name, version) in a dictionary, so the last advisory won. Most vulnerable component versions are named by more than one advisory, and every advisory after the first silently disappeared from the evidence record and the Article 14 draft. The page also gave the wrong date for the final report on an actively exploited vulnerability. It said 14 days after the 72-hour notification, but Art 14(2)(c) sets 14 days after a corrective or mitigating measure is available. It also named only ENISA as the recipient. Both are fixed in this PR, with tests.

Still open, and now listed in a "Known gaps" section of the README:

- Go versions with a `v` prefix never match.
- PyPI names are not normalised under PEP 503.
- Alpine and Debian package names are not mapped.
- `advisory_count` counts version entries, not advisories.
- The Article 14 draft lacks most of the content the article asks for.

**research/latency-twin: claims 2, verification 2.** Every control number reproduces: k0, the stable-gain intervals, the Smith optimum, the 6×6 mismatch grid and the delay margins. The README said the probe samples needed to identify the delay "grow as z²·2(1+1/snr)". That formula is a Gaussian approximation for telling two adjacent lags apart. When there are four candidate lags at snr 0.25, the formula's n = 54 still gives 1.8% error, against a 1% target. The claim now says it is a pairwise approximation. The auditor also found that nothing here is new against Palmor (1980), Kleinman (1969) or Niculescu (2001), so fitness is 1.

**research/eda-cheapaware: one high defect.** The results reproduce byte for byte, and an independent hypervolume code gives the same table. The README credited "+0.089" of the screen's lead to its fitted cell-count model. Nobody had run the obvious zero-synthesis prior: cells proportional to lanes × weight width, ranked the same way. That prior reaches 0.975 at 12 syntheses and the whole front at 20, so about +0.077 of the +0.089 needs no model. This is now a stated limitation with its own script. The headline paragraph still carries the old split, and the research question needs rework, not a footnote. A mutant in the hypervolume code itself survived. It is now caught.

**research/society-milgramfit: verification 2, fitness 1.** The model's numbers reproduce. Its only real-world input, Milgram et al. (1986) on queue intrusions, was taken from a 2008 blog, not the paper. The auditor suspects that "physically ejected the intruder 10% of the time" is a share of objections read as a share of trials, but could not reach the paper to confirm it. That defect stays open until someone reads the source. No test pinned any reported number; now one does.

**research/simdesign-gaugebudget: verification 1, domain 1, one high defect.** The bookkeeping is right, but the result is a property of the mesh. The "33.3 g repeatable optimum" carries 109 MPa by one-line beam theory, against a 100 MPa limit. On finer meshes its peak stress rises from 100.0 to 117.8 to 129.8 MPa. All five seeded mutants survived the original tests. Meshes finer than 0.3 mm crashed with a TypeError, because a fix in the parent project had never been copied over. The README now says the optimum holds only on the search mesh, the crash is fixed, and five new tests catch three of the former survivors.

## What this round says

Arithmetic held up almost everywhere: five of six subjects score correctness 3, and most audits reproduced every recomputed number. What failed was the step after the arithmetic:

- Is the method one a practitioner would use (the pergola post rule, the gauge mesh)?
- Does the headline survive the obvious baseline (eda-cheapaware)?
- Was the source actually read (milgramfit)?
- Do the tests pin anything (four of six let at least half the seeded bugs through)?

As in the [be43 round](2026-11-20-quality-census-seed-be43.md), verification and claims are the gates that bind.

The fixes are in [PR #17868](https://github.com/Duncan-Haywood/oss-monorepo/pull/17868). A later re-audit, not this one, decides whether they closed the defects.
