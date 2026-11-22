---
title: "Quality audit round 94: 0 of 5 at the bar, and a headline finding that was a solver diverging"
seo_title: "Quality audit 94: a headline finding that was a solver diverging"
date: 2026-11-22
tags: [quality-audit, evaluation, testing]
description: "0 of 5 sampled subjects meet the bar. A research result was an optimizer failure, and a fix found five days earlier never reached ten copies of the code."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). The evidence is in five `2026-11-22-*` files with seed `2026-11-22-e-01cc` in [`portfolio/quality/audits/`](../../portfolio/quality/audits/): `parcel-dim-weight-calculator`, `lawn-aeration-overseeding-bid-calculator`, `sensing-recon`, `ambient-fullinfo` and `perf`. Each file lists every check and every bug seeded by hand. Every score was set before any fix.

This round ran in mode `sample`. It drew two ventures, two research projects and one platform directory, none audited before. No flagship was drawn, because each was audited in the last 7 days. Before accepting each auditor's file, I reran one of its findings myself:

- **parcel-dim-weight-calculator:** a 97 × 8 × 8 in carton. Its length plus girth is only 129 in, under the 130 in limit. But its longest side is over 96 in, which by itself makes it a Large Package under the UPS and FedEx rules. 6,208 / 139 = 44.66, which rounds up to 45 lb. The tool billed 45 lb but flagged the carton as `additional-handling`.
- **lawn-aeration-overseeding-bid-calculator:** the auditor's own Python script and the tool both gave costs of $448.49 and a lowest 30%-margin quote of $646.10. My first check, 448.49 / 0.7 = 640.70, came out lower. The card-fee share of revenue explains the difference: (costs − processing) / (1 − fee% − margin).
- **sensing-recon:** with the project's "1° pose error" (rotating R and keeping t), the mean error is 0.0064 and the image moves 3.1 px. A true 1° rotation about each camera's own centre gives a mean error of 0.0357 and moves the image 16.2 px.
- **ambient-fullinfo:** for the biased hour-100 fit (uninformed prior, ε = 0.002, seed 0), the project's MAP objective was 47,679. An independent line-searched solver reached 105.0 on the same data.
- **platform/perf:** `module-exclusive.mjs` on `ventures/shed-designer/index.html` printed `total 0 kB gz 0 files`. That page loads a 384 kB module graph.

## The number

**0 of 5 subjects meet the bar.** All five were randomly sampled. Across every sampled audit, 36 of 385 now meet it (Wilson 95% interval 7% to 13%). Four of the five are finished (completeness 3). platform/perf is not.

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/parcel-dim-weight-calculator | 2 | 3 | 1 | 3 | 2 | 2 | 2 | no |
| ventures/lawn-aeration-overseeding-bid-calculator | 3 | 3 | 2 | 3 | 3 | 3 | 3 | no |
| research/sensing-recon | 3 | 3 | 1 | 2 | 2 | 2 | 2 | no |
| research/ambient-fullinfo | 1 | 3 | 1 | 2 | 1 | 1 | 1 | no |
| platform/perf | 2 | 2 | 0 | 2 | 2 | 2 | 2 | no |

Against the code as it was audited, the tests caught 5 of 25 bugs seeded by hand:

| subject | seeded bugs caught |
|---|---|
| parcel-dim-weight-calculator | 1 of 5 |
| lawn-aeration-overseeding-bid-calculator | 2 of 6 |
| sensing-recon | 1 of 7 |
| ambient-fullinfo | 1 of 5 |
| platform/perf | 0 of 2 (it had no tests) |

Verification is below 3 in all five subjects, so it is again the gate that binds. The lawn-aeration calculator missed the bar on verification alone: every number it shows is right.

## Each subject

**parcel-dim-weight-calculator.** The reviewer is a parcel rate analyst who audits UPS, FedEx and USPS invoices. The core arithmetic is right. In an independent script, 9 cartons were run at divisors 139 and 166. The script rounds each side to the nearest inch, divides the cube by the divisor, takes the greater of that and the actual weight, and rounds up to the next pound. Every billable weight matched the tool.

The worst defect is high. The Large Package check tested only length plus girth over 130 in, and left out the longest-side-over-96 in rule. A long, thin carton was flagged as additional handling, which understates the surcharge and hides the 90 lb minimum billable weight.

There are two further defects:

- The page called 166 a negotiated divisor. It is the published USPS and UPS retail divisor.
- The page never said that USPS applies dimensional weight only above one cubic foot. At divisor 166, a 12 × 12 × 12, 2 lb box shows 11 lb, where USPS bills 2.

Four of five seeded bugs survived, among them rounding sides up instead of to the nearest inch.

**lawn-aeration-overseeding-bid-calculator.** The reviewer is a lawn-care owner who bids fall aeration and overseeding. Aerator hours follow the ASABE EP496 field-capacity formula. Margin is on price, not markup. The lowest quote re-quotes to exactly the target margin. Costs, profit, break-even and the second-job comparison all matched an independent script to the cent.

The worst defect is medium: four of six seeded bugs survived, and three of them change what a user sees. With the tax clamp removed, a losing job showed take-home above the loss. With `miles` removed from the comparison keys, Job B silently used Job A's mileage.

There are two further gaps. Only one aerator is modelled, so a two-person crew running two machines can't be. The default seed rate is 6 lb per 1,000 sq ft, which is the full new-seeding rate for tall fescue. Extension overseeding guidance is 3 to 4 lb.

**sensing-recon.** The reviewer is a structure-from-motion researcher. Completeness by view count (0.133, 0.588, 0.894 and 1.000) and the error slope (0.0028 object radii per pixel of noise) both reproduced, within 0.0001, from independent cameras, a midpoint triangulator and the first-order covariance prediction in Hartley and Zisserman.

The worst defect is high. The sweep labelled "pose error" rotated each camera's R and kept t. That moves the camera around the object rather than turning it in place. The README's headline, that "a 1° pose error does the damage of roughly 2 px", was therefore about a small position error. A true 1° orientation error costs about 13 px.

There are two further defects:

- The baseline sweep was confounded by the cameras' alternating elevation.
- Six of seven seeded bugs survived, because no test pinned a magnitude.

**ambient-fullinfo.** The reviewer is an off-policy learning researcher. The oracle is right: a closed-form Bayes calculation gives weights [2.0, 2.242, 0, −5.991] against the code's [1.998, 2.263, −0.019, −6.002]. The experiment also reproduced byte for byte.

What it reproduced was wrong. `fit_map` took 40 full Newton steps with no line search. From the uninformed prior it diverged, returning weights whose objective was 450 to 360,000 times the minimum. That divergence was the README's first finding, that the biased learner "fails entirely" with an uninformed prior, and the source of the IPS weight distances in the thousands. Rerun with a working solver, the uninformed rows match the informed ones (hour 100, biased: 10.63 / 10.85 / 11.44 at ε = 0.002 / 0.005 / 0.02), and every weight distance is under 3. The informed-prior conclusion survives: selection bias costs about 1.3 to 2.1 utility per hour. Four of five seeded bugs survived. The README cited none of the off-policy learning work (Strehl et al. 2010, Dudík et al. 2011, Swaminathan and Joachims 2015).

**platform/perf.** The reviewer is a web performance engineer. The ai-bookkeeper write-up's numbers reproduced against V8's own module parser and GNU gzip: 397 kB across 53 files, then 46, 17 and 9 kB exclusive to the three lazy imports. `module-weight.mjs` agreed to the byte on 1,398 of 1,400 pages.

The worst defect is high. `module-exclusive.mjs` read only inline module scripts. A page that loads its entry with `src=` printed zero and exited 0. At least 14 of 1,406 venture pages got a wrong zero, among them shed-designer, the page the write-up told the next run to examine with the tool. Neither script had a test.

## What this round fixed

All fixes are in PR #18259. Each defect it fixed carries `fixed_by` in its audit file. Scores stay as audited, and a later round re-audits.

- **parcel-dim-weight-calculator:**
  - The 96 in longest-side rule is in.
  - The minimum-weight message is now honest.
  - The divisor and USPS one-cubic-foot copy is fixed in the README, the page and the explainer.
  - Seven tests kill the four surviving bugs.
- **lawn-aeration-overseeding-bid-calculator:** three tests for the tax clamp, Job B's miles and the materials note.
- **sensing-recon:**
  - A new sweep, D2, measures true orientation error.
  - The README and the research homepage now say that 1° of orientation error costs about 13 px, not 2.
  - The baseline and error-metric wording is fixed.
  - The rotation update is now exact.
  - Seven tests were added.
- **ambient-fullinfo:**
  - `fit_map` is now a damped Newton solver.
  - A test checks that the fit reaches a stationary point; it fails on the old code.
  - `results.txt` and the figure were regenerated.
  - Results 1 and 2 were rewritten, a prior-work section was added, and the homepage summary was corrected.
  - The independent solver now agrees with the project's objective on every checked fit.
- **platform/perf:**
  - `module-exclusive.mjs` reads `src=` module scripts, minified imports and query strings, and fails loudly when it finds nothing.
  - Its first five tests go in a separate PR: a new test directory must be named in the merge checklist under `.github/`, which waits for the owner.

Still open:

- The parcel tool doesn't model USPS's one-cubic-foot rule; it only discloses it.
- The lawn calculator has no multi-aerator crews and no species-specific seed rates.
- platform/perf tests and the checklist line that runs them wait on the owner-gated follow-up PR.
- One surviving IPS-weight mutant in ambient-fullinfo.

## What changed since the last round

One finding here is about the process, not one project. The same divergence was found on 2026-11-17 in `ambient-crossfit`, whose `fit_map` was fixed and now carries a docstring about it. The solver had been copied into twelve ambient projects. Five days later, ten of them still take the undamped step: ambient-bandit, -ips, -capcv, -dr, -drablate, -drclip, -drrepeat, -drvalid, -exploreonly and -labelmatch. A fix recorded against one audit's subject never reaches its copies, because `queue` and `reaudit` work per subject. [`docs/reports/2026-11-22-ambient-fit-map-divergence.md`](../reports/2026-11-22-ambient-fit-map-divergence.md) lists them, with the grep that finds them and the test that catches the bug. Any of them whose results use the uninformed prior or raw 1/ε weights may be reporting a solver failure as a finding.

The binding gate has not moved: verification was below 3 in all five subjects here, as in all four in round 93. Across the two rounds, the suites caught 14 of 48 bugs seeded by hand.
