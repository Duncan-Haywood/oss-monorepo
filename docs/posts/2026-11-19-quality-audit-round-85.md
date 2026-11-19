---
title: "Quality audit round 85: 0 of 5 at the bar, and a robot-crowd result that reverses on a matched clock"
seo_title: "Quality audit 85: 0 of 5 at the bar, a result that reverses"
date: 2026-11-19
tags: [quality-audit, evaluation, testing]
description: "None of 5 subjects meets the bar; tests caught 8 of 21 seeded bugs. A crowd result reverses on a matched horizon; a PPF tool gave circular advice."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). The evidence is in the five `2026-11-19-*` files with seed `2026-11-19-l-c250` in [`portfolio/quality/audits/`](../../portfolio/quality/audits/). Each file lists every check and every bug the auditor seeded by hand. Every score was set before any fix.

This round ran in mode `sample`. It drew the flagship `ventures/photo-editing`, two ventures and two research projects. No platform directory was drawn, because every one has been audited in the last 90 days. Only the flagship had been audited before, last on 2026-11-09. Before accepting each auditor's file I reran one of its checks myself, and every one reproduced:

- **photo-editing:** the XYZ(D50)→sRGB matrix's first row came out as `3.1338, -1.6171, -0.4906`, close to Lindbloom's published 3.1338561 / −1.6168667 / −0.4906146. The sRGB curve gave 0.18 → `0.4613561`; by hand, 1.055 × 0.18^(1/2.4) − 0.055 = 0.4613561. Illuminant A's chromaticity read `2855.8` K against the published 2856 K.
- **appointment-no-show-analyzer:** the built-in sample gave `39 197 19.80 2430 1263.5 5012.8`. By hand: 39/197 = 19.80%. The deposit what-if is (2,430 + 230) × 0.30 + 2,660 × 0.70 × 0.25 = 1,263.50, and × 365/92 = 5,012.80 a year.
- **ppf-ceramic-coating-price-calculator:** the sample sedan job printed cost `2364.01`, price `3940.02` and 5 bay days. By hand: film 24 × 1.15 × 1.15 × $24 = $761.76, labour 24.15 h × $35 = $845.25, overhead $600, redo $27, coating $90, consumables $40, total $2,364.01; divided by 0.6 that is $3,940.02. Every package's profit per bay day equalled its cost per bay day × 0.4/0.6 to the cent, which is the defect below.
- **hanger-foldrate:** 4 fold tables at 120 s gave `137.3` garments an hour timed over one 25-item load and `166.8` over a 250-item load. The single-load rule also gives 3600 / (120 × 17/25) = 44.1 an hour for the one-table headline, which matches the reported 44.2.
- **society-ringnoise:** the imported mean-field fixed point at ρ = 0.22, block 4, k = 2 settled at `0.4443` with its 1/1000 lookup table. The same map with the exact binomial reached `0.9101`, over the 0.9 tipping line.

## The number

**0 of 5 subjects meets the bar.** Across every sampled audit, 35 of 351 now meet it (Wilson 95% interval 7% to 14%). Four of the five are finished (completeness 3). society-ringnoise is not.

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/photo-editing (flagship) | 3 | 3 | 2 | 2 | 3 | 2 | 2 | no |
| ventures/appointment-no-show-analyzer | 2 | 3 | 2 | 3 | 3 | 2 | 2 | no |
| ventures/ppf-ceramic-coating-price-calculator | 3 | 3 | 2 | 3 | 2 | 2 | 2 | no |
| research/hanger-foldrate | 3 | 3 | 1 | 2 | 2 | 2 | 2 | no |
| research/society-ringnoise | 1 | 2 | 1 | 2 | 1 | 1 | 1 | no |

Of 21 bugs seeded by hand, the tests caught 8: photo-editing 2 of 4, the no-show analyzer 2 of 6, the PPF calculator 3 of 5, hanger-foldrate 0 of 3 and society-ringnoise 1 of 3. As in round 84, verification is the gate all five fail.

## Each subject

**photo-editing (flagship).** Two reviewers: a colour scientist who knows the DNG SDK pipeline, and a working photographer who culls shoots. Since round 3 the source grew from about 23,000 to 49,655 lines, mostly a camera-raw developer. That half is strong:

- The colour matrix, the CIE 1931 table at four wavelengths, the D65 and illuminant A colour temperatures, and the sRGB curve all match their published values.
- The lossless-JPEG decoder reproduced files from ffmpeg's encoder with 0 mismatches over 17,751 samples, for predictors 1, 2 and 3.
- The full suite ran green: 1,445 passed, 9 skipped, 0 failed. Round 3's two failures are gone, and so is its high defect, a page claim the tool did not back.

What is not at the bar is the cull, the product's main job:

- The exposure grey target (120) and the sharpness half-point (60) survived mutation for the fourth round running.
- Exposure is read as BT.601 luma, not BT.709, and neither the code nor the README says which.
- Frames are judged at 320 × 180, so a 1200 × 800 frame blurred at sigma 6 scored sharpness 0.28 and was kept as a 2-star alternate.
- The core colour tests take their expected values from the module's own matrix.
- ruff reports 301 errors.

The LibRaw-agreement claims for real camera files could not be rerun here (raw.pixls.us returned a proxy 403), so every recomputation is on synthetic input.

**appointment-no-show-analyzer.** The reviewer is a salon or clinic practice manager. An independent recount of the 197-booking sample matched every figure the page shows, and the deployed copy is clean. Three medium defects:

- A row the booking system already marked "Late Cancel" counted as an ordinary cancellation when the file had no cancelled-at column, so late cancels read 0 and $0 at risk.
- An "Amount Paid" column was read as the price. A no-show pays nothing, so revenue lost came out as $0, with no warning.
- The no-show rate's denominator includes cancellations made with notice. With 10 kept, 2 no-shows and 8 early cancels it shows 10.0%, where the usual practice-management rate, no-shows over kept plus no-shows, is 16.7%.

Four of six seeded bugs survived.

**ppf-ceramic-coating-price-calculator.** The reviewer is a detailing-shop owner who installs film and coatings. The arithmetic matched an independent script to the cent on four jobs, and it uses margin, not markup. The worst defect is high severity: the page said which package "earns the most per bay day ... sell that one first". But every package is priced at the same margin m, so profit per bay day is cost per bay day × m/(1−m). The ranking only says which job is biggest, and full body always wins. Other defects:

- The film-footage and hours table is uncited. A full-body sedan comes to 80.5 ft cut, where a film supplier's guide suggests about 60 to 65 ft.
- Blank cost fields silently become $0.
- The FAQ claimed the table shows each package with the coating on and off. It shows only the coating choice the user picked.

**hanger-foldrate.** The reviewer is an industrial engineer who models robot cells. The experiment reproduces byte for byte in 2.4 s, and every headline number matches an independent bottleneck calculation within 2%. Two medium defects:

- Section C times one 25-item load until its last fold, so with several fold tables it counts the drain. Over a long run, 4 tables reach 167 garments an hour, not 137, and 8 tables with 2 arms reach 319, not 232. The claim that extra tables "recover throughput only slowly" came from the measurement, not the cell.
- The tests never run the experiment, and all 3 seeded bugs survived.

It is one parameter changed in an earlier model. It is a useful note, not a paper.

**society-ringnoise.** The reviewer is a statistical physicist who works on conventions with committed minorities. The table reproduces, and the noisy memoryless column is right for its model. The conclusion does not hold:

- **Horizon confound (high).** The `resampled` model runs 300 sweeps, each refreshing all 9 memory slots, against about 56 full refreshes in the simulation's 500 rounds. At 56 sweeps its thresholds sit at or above the simulation in 6 of 6 cells, not below it. So "noise pulls the threshold down, memory pushes it back up" is not supported.
- **Mean-field artefact (high).** In 3 of 6 cells the mean-field column comes from the 1/1000 lookup table in the `society-ringmf` code it imports. The exact map tips the block cells at 0.22, 0.34, 0.16 and 0.26, not 0.26, 0.38, 0.20 and 0.34. "The simulation lies between the other two in 6 of 6 cells" becomes 2 of 6.

The paper is a 6-line pointer to the README, and the nearest prior work (Ellison 1993, Young 1993, Mobilia 2003) is not cited.

## What was fixed in this PR

The scores above are from before these fixes. A later round re-audits. Each audit file marks the defects fixed with `fixed_by`.

- **ppf-ceramic-coating-price-calculator:** the ranking line and the FAQ (page and structured data) now say profit per bay day follows cost per bay day at one margin, and that choosing what to sell needs the shop's own menu prices. The on/off coating claim is corrected. Two tests pin both. 27 of 27 tests pass.
- **appointment-no-show-analyzer:** a "Late Cancel" status counts as late when there is no cancelled-at date, and "Paid" and "Amount Paid" are no longer read as the price. Three tests were added, and one of them also catches the service-average mutant that had survived. 66 of 66 tests pass. The denominator is a choice about how the rate is defined, so it stays open.
- **photo-editing:** two new tests pin the cull's exposure target and sharpness half-point. Both mutants that survived four rounds are now caught: `60 → 600` and `120 → 100` each fail. The raw-format counts now agree at 15 across the home page, llms.txt and the formats page, checked against the formats table by a test. The page no longer shows a `shootflow cull` command that is not installed.
- **hanger-foldrate:** the README and summary state the single-load limitation and the long-run figures. A test now checks section A against the bottleneck formula.
- **society-ringnoise:** the README, lede, summary and paper carry an audit correction with the matched-horizon and exact-map numbers, and a test checks one sweep against the exact binomial. `society-ringmf`'s README records the lookup-table rounding as a known gap. Rerunning both studies on a matched clock with an exact mean-field is real research work, left to a research run.

Still open: the PPF film table's sources, blank fields read as $0, the no-show denominator, the cull's BT.601 luma and its 320 × 180 focus check, and both society-ringnoise high defects.

## Since the last round

Round 84 put 1 of 5 at the bar, the shift-roster flagship, with tests catching 15 of 34 seeded bugs. Round 85 puts 0 of 5 at the bar, with tests catching 8 of 21. The sampled share holds at 35 of 351.

photo-editing has now been audited four times. Its correctness and claims reached 3, and the test that pins its cull constants landed only in this round's fix. The pattern from round 84 repeats: the arithmetic is usually right, and the tests rarely check that it stays right.
