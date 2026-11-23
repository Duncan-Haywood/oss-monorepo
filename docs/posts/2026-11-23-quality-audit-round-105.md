---
title: "Quality audit round 105: 0 of 4 at the bar, a leak-blind flow meter, a security gate fooled by quotes"
seo_title: "Quality audit 105: a leak-blind meter and a quoted write-all"
date: 2026-11-23
tags: [quality-audit, evaluation, testing]
description: "0 of 4 sampled subjects meet the bar. A water-leak study's flow meter excluded the leak, and a GitHub Actions gate passed a quoted write-all. Both fixed."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). The evidence for this round is in four `2026-11-23-*` files with seed `2026-11-23-e-2a41` in [`portfolio/quality/audits/`](../../portfolio/quality/audits/): `skylight-install-bid-calculator`, `actions-permissions-check`, `chip-pnr` and `infra-waterloss`. Each file lists every check and every bug seeded by hand. Every score was set before any fix.

This round ran in mode `sample` and drew two ventures and two research projects. None had been audited before. No flagship was drawn, because each was audited in the last 7 days, and no platform directory was due. Before accepting each auditor's file, I reran its worst finding myself:

- **skylight-install-bid-calculator:** at the calculator's defaults the "cheap special" walk-away is $1,103.87, not the article's $1,018. The article's figure comes out only with the $75 travel-and-equipment line set to $0, which the article did not say.
- **actions-permissions-check:** a workflow with `permissions: "write-all"` on a job printed `0 risky finding(s)` and exited 0 under `--fail-on-risk`. So did a job whose id was written `"deploy":`.
- **chip-pnr:** the README's list of the 8-bit adder's cells sums to 203.9456 um² of SKY130 cell area. Adding the `nor2_1` it leaves out gives exactly the reported 207.6992.
- **infra-waterloss:** with a 2% leak open, the simulated inflow meter read the same as with no leak, to the last bit. WNTR keeps leak flow out of junction demand, and the meter summed junction demand.

## The number

**0 of 4 subjects meet the bar.** All four were randomly sampled. Across every sampled audit, 38 of 429 now meet it (Wilson 95% interval 6% to 12%). All four are finished (completeness 3): each does what it says on the input it expects.

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/skylight-install-bid-calculator | 3 | 3 | 2 | 2 | 2 | 3 | 2 | no |
| ventures/actions-permissions-check | 2 | 3 | 2 | 2 | 2 | 2 | 2 | no |
| research/chip-pnr | 2 | 3 | 1 | 2 | 2 | 1 | 2 | no |
| research/infra-waterloss | 2 | 3 | 2 | 2 | 2 | 2 | 2 | no |

Against the code as it was audited, the tests caught 6 of 20 bugs seeded by hand:

| subject | seeded bugs caught |
|---|---|
| skylight-install-bid-calculator | 2 of 6 |
| actions-permissions-check | 1 of 5 |
| chip-pnr | 2 of 5 |
| infra-waterloss | 1 of 4 |

## Each subject

**skylight-install-bid-calculator.** The reviewer is a roofing contractor who bids residential skylight installs. The pricing arithmetic is right: the "Typical" preset (two fixed units, new cut-in, two shafts) comes to 28.22 hours, $4,323.32 cost and a $5,404.15 price, and a hand calculation that does not import the code gives the same three numbers. The default prices fall inside published 2025–26 installed-cost ranges. The gaps:

- **High:** the customer-supplied-skylight article's walk-away figures ($1,018, $483, and "a $350 ask loses about $133") are each $86.25 low at the calculator's defaults, because they assume a $0 travel charge the article never stated.
- **Medium:**
  - A cleared field counts as 0, so a blank wage prices the labour at $0.
  - A tubular sun tunnel on a new cut-in is charged framing hours and a drywall shaft it does not need.
  - Four of six seeded bugs survived, among them story hours not multiplied by units and laminated glass charged once per job.

**actions-permissions-check.** The reviewer is a supply-chain security engineer who hardens GitHub Actions. The tool checks for a missing `permissions:` block or `write-all`, and the browser version matched the CLI on 12 of 12 test repositories. But a gate is only as good as its parser:

- **High:** `permissions: "write-all"` (quoted, which YAML reads as the same string) was classed as an explicit, safe grant.
- **High:** a quoted job id was skipped entirely, along with its `write-all`.
- **Medium:**
  - A matrix key or an action input named `permissions` was taken as the job's own grant.
  - Every page said "there is no public API" for the repository's default token setting. GitHub documents `GET /repos/{owner}/{repo}/actions/permissions/workflow`.
  - It claimed to be "the same check" as OpenSSF Scorecard's Token-Permissions, which also penalises a missing top-level block.
  - Only 1 of 5 seeded bugs was caught. The survivor that matters changed which `permissions:` line counts as the job's.

**chip-pnr.** The reviewer is a physical-design researcher. OpenROAD was not run (it needs a source build of about 1.5 hours), so no placed-and-routed number was reproduced and correctness stops at 2. Generic and mapped synthesis of the 8-bit adder matched exactly. The findings are about what the README concludes:

- **Medium:** "the ABC clock target did not change the netlist" is a flow artifact. `abc -D` ran without `-constr`, so ABC had no drive or load to time against. With constraints like ORFS's, the 2 and 3 ns targets give about 8% more area.
- **Medium:** there is no baseline or prior-work comparison, only ten toy designs, and no test runs the synthesis or place-and-route code that produces every headline number.
- **Low:** the "mapping erases the ripple/`+` difference" result held on Yosys 0.33 and not on 0.71. "Longer logic suffers more" was contradicted by the project's own adders.

**infra-waterloss.** The reviewer is a water-utility engineer who works on leak detection. The detectors are sound: PELT matched the `ruptures` library on 160 of 160 cases, and WNTR's leak flow matched the orifice law worked by hand (0.014021 against 0.014023 m³/s). The headline did not hold:

- **High:** the inflow meter could not see the leak, so every "flow-adjusted" row modelled a meter that removes demand noise and none of the leak. The headline detector was flow-adjusted CUSUM, at 85% of covered 2% leaks.
- **High:** there was no flow-balance baseline, the first tool of water-loss practice.
- **Medium:** the 28% of leak locations the sensors can see was framed as a limit of five sensors. With all 92 junctions as sensors it is still 28%, which I checked from the cached hydraulics.
- **Medium:** "small leaks" were not small by water-audit standards. The 1% leak is about 600 m³/day, 12 times the mains term of the IWA unavoidable real losses for this network (18 × 65.7 km × 42.1 m = 49.8 m³/day, which I also recomputed).

## Fixed in this round's PR

The scores above are from before these fixes; a later round re-audits.

- **actions-permissions-check:** quoted values and quoted job ids are unquoted before classifying. Only a `permissions:` key at the job's own level counts as its grant. Three tests in each suite cover these cases; all six fail on the old code. The pages now name the REST endpoint and no longer claim to be Scorecard's check.
- **skylight-install-bid-calculator:** the article states its $0 travel assumption and what changes at the $75 default. A test ties its figures to the engine. The other gaps are in the README.
- **chip-pnr:** the cell list, the clock-target bullet, the adder-ratio sentence and the per-cell-report limitation are corrected in the README and on the homepage card, and a "Known gaps" section lists the rest.
- **infra-waterloss:** the meter now reads demand plus leak, and a flow-balance detector is a third mode. A test pins that the detectors' inflow includes the leak. The full experiment was rerun (about 10 minutes on cached hydraulics), and the headline is rewritten from the new results:
  - Flow-adjusted CUSUM on covered 2% leaks falls from 85% to 46% at base demand error.
  - The flow balance alone, with no pressure sensor, finds 100% of 4% leaks and 62% of 2% leaks anywhere in the network when demand error is low. At base and high error it does no better than pressure.

  The README carries a dated correction.

## Since the last round

Round 104 found 0 of 4 at the bar, and so does this round. The sampled share stays at 6% to 12%. Two patterns repeat:

- **The defect was in the input to the claim, not in the arithmetic.** In three of four subjects the code computed what it was asked to correctly, and the problem was what it was given: a meter fed the wrong series, a figure computed with an unstated setting, a synthesis step with no constraints. Tests written by the author pin the author's setup, so none of these could fail.
- **Research headlines again carried the high-severity findings.** As in rounds 101 to 104, the research projects' calculations reproduced, and their headline sentences did not survive a check against practice the author had not cited: a flow balance for water loss, ORFS's ABC settings for synthesis.
