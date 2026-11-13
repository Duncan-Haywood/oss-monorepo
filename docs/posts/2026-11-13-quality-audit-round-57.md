---
title: "Quality audit round 57: 0 of 4 at the bar, and a drone that needs nobody watching it"
seo_title: "Quality audit 57: drone pilot time, planogram caps, rate tool"
date: 2026-11-13
tags: [quality-audit, evaluation, testing, research]
description: "0 of 4 sampled subjects meet the bar. A drone weed-scout cost model left out the pilot, and a planogram tool capped a blank field at 8 coils."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). The evidence is in [`portfolio/quality/audits/`](../../portfolio/quality/audits/), in the four `2026-11-13-*` files with seed `2026-11-13-c`. Each file lists every check and every hand-seeded bug. All scores were set before any fix.

This round ran in mode `sample` with seed `2026-11-13-c`, because seeds `2026-11-13` and `2026-11-13-b` were already taken by rounds 55 and 56. None of the four subjects had been audited before. No flagship or platform subject was drawn, because each had been audited too recently.

## The number

**0 of 4 sampled subjects meet the bar.** Across every sampled audit, 31 of 242 meet it (Wilson 95% interval 9% to 18%). All four subjects are finished (completeness 3). Each one fails on verification, and three also fail on correctness.

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/freelance-writer-rate-calculator | 2 | 3 | 2 | 2 | 1 | 2 | 2 | no |
| ventures/vending-machine-planogram-optimizer | 2 | 3 | 1 | 3 | 2 | 2 | 2 | no |
| research/osrobot-pairprice | 2 | 3 | 2 | 2 | 2 | 1 | 1 | no |
| research/eda-equivpredict | 3 | 3 | 1 | 2 | 2 | 1 | 1 | no |

| subject | seeded bugs caught | recomputed outputs right |
|---|---|---|
| freelance-writer-rate-calculator | 4 of 6 | 3 of 7 |
| vending-machine-planogram-optimizer | 1 of 7 | 6 of 8 |
| osrobot-pairprice | 2 of 4 | 4 of 6 |
| eda-equivpredict | 2 of 5 | 4 of 5 |

The tests caught 9 of 22 seeded bugs. The core arithmetic of all four subjects recomputes correctly. The failures are in what that arithmetic leaves out, and in what the pages claim it shows.

## Verdicts and worst defects

### research/osrobot-pairprice (fitness 1, domain 1)

The reviewer is an agricultural robotics researcher who costs field machines. The project asks whether a drone scout plus a ground treater beats one inline weeding robot on cost per hectare. Its cost arithmetic reproduces: the auditor refitted the sweep with numpy and matched every row, and a full re-run gives `results.txt` byte for byte.

**The worst defect (high):** the drone's flight time is charged to no one. The code says "supervision is not charged" (`econ.py:15`), but FAA Part 107 (14 CFR 107.31) requires a remote pilot to keep the drone in sight. Charge its 56.8 flight minutes per hectare at the project's own 20 USD/h, and the pair costs 2.46 times the inline robot at 0.72 ha and 2.32 times at 20 ha. There is no break-even at any field size.

Second (medium): each battery swap adds a step to the pair's cost, so the cost difference zig-zags and crosses zero 3 to 9 times. The bisection returns whichever crossing it lands on. I re-ran the auditor's root scan on the project's own `econ.py`. For a 6,000 USD scout, the crossings are at 1.03, 1.05, 1.28, 1.40, 1.52, 1.75 and 1.77 ha, and the reported break-even is 1.28. Also, the comparison is made at about 34% weed kill, and the README cites no prior work.

### ventures/freelance-writer-rate-calculator (claims 1)

The reviewer is a senior freelance writer who coaches others on rates. Its effective-hourly arithmetic is right; I re-ran the auditor's script and got its five worked-example lines (9 h, 33.33 and 55.56 USD/h, a 675 USD fee, 0.45 USD/word).

**The worst defect (high):** the page promises to show "which one actually pays more, not just which headline number looks bigger". For a single job, both prices divide by the same hours. So the verdict is always the bigger total: it matched that in 144 of 144 grid cases. The site's own comparison page says as much in its FAQ.

Second: with 0.50 USD/word against a 400 USD flat fee, the tool said per-word pays 38.89 USD/h more. It then said a flat fee "typically pays a higher effective hourly rate". **Fixed in this PR**, with a test that fails on the old code. Still open: a blank writing speed silently drops all writing time, solved per-word rates round to cents (0.0125 shows as 0.01), and two source claims overstate how many surveys agree.

### ventures/vending-machine-planogram-optimizer (verification 1)

The reviewer is a vending route operator who sets planograms. The optimiser is right: an independent greedy and a brute force over every split on 40 random machines match it exactly.

**The worst defect (high):** a blank "Max coils" field silently became 8. Take a 40-coil drink machine with soda selling 400 a week. The tool recommended 8 soda coils and left 28 coils empty. It showed soda sold out in every interval, and said an extra coil was worth 0.00 USD. **Fixed in this PR** (a blank now means no cap, and the page says so), with a test that fails on the old code.

Second (high): the README and page said ignoring substitution "can only understate" the gain. With 30% of customers switching, the recommended split earned 70.27 USD a week less than the layout it was compared with. **The wording is corrected in this PR.** 6 of 7 seeded bugs passed every test, including one that cut every weekly dollar figure by 12.5%. Fresh food can only be loaded in whole coils: a par of 5 earns 9.15 USD a week against 6.47 USD for a full 8-unit coil.

### research/eda-equivpredict (verification 1, domain 1)

The reviewer is a formal-verification researcher. Every number reproduces from the raw `eda-verify` log, using a script that does not import the project. I re-ran it and got the 3,298 CPU-s, the 25/27 accuracy and a Wilson interval of 0.77 to 0.98 that the README never states.

**The worst defect (medium):** the README says "the smoother rules do worse once twins are held out". For the one-split rule, that comes from tie-breaking. It cuts at training values and keeps the lowest tied cut, which gives 20/27. With midpoint cuts, the usual practice, it scores 25/27, the same as nearest-line. Two later projects reuse this score. The README's guess at the mechanism ("deep arithmetic cones") was also wrong. The eight line-151 equivalents are in a branch that is dead at P=8, and the undecided mutants change reset values, which the induction proof cannot prove. Both README passages are corrected in this PR, and a new test pins the headline row. Before that test, 3 of 5 seeded bugs survived.

## What this round says

Three of four subjects compute what they say they compute. They still miss the bar on what a professional would ask about first: the pilot, the blank field, the tie-break, or what the comparison can show at all. That matches the earlier rounds: verification and domain are the weakest dimensions (94 and 47 of 256 audited subjects at 3 or more).

Fixed in this PR: the contradictory rate advice, the 8-coil cap and the substitution wording, plus the eda headline pins and README corrections. The pilot-time and break-even defects are listed in that project's README under "Known gaps". So are the writer tool's remaining ones. A later round re-audits.
