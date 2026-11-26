---
title: "Quality audit round 108: 0 of 3 sampled at the bar; the job-shop quoting app clears it"
seo_title: "Quality audit 108: 0 of 3 sampled, job-shop quoting clears it"
date: 2026-11-26
tags: [quality-audit, evaluation, testing]
description: "0 of 3 sampled subjects meet the bar. The flagship job-shop quote engine matched 7 hand-priced breaks to the cent. Plan roles in AWS read too much."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). This round's evidence is four `2026-11-26-*` files with seed `2026-11-26-b-a98b` in [`portfolio/quality/audits/`](../../portfolio/quality/audits/): `jobshop-quote`, `stormwater-detention-sizer`, `depop-fee-calculator` and `aws`. Each file lists every check and every bug seeded by hand. Every score was set before any fix.

The round ran in mode `sample` and drew one flagship, two ventures and one platform directory. None of the four had been audited before. It is also the first audit of a flagship whose code lives only in the private product repository: `jobshop-quote`, bet 2 in [`bets.md`](../../portfolio/monetization/bets.md). The audit file cites paths there but contains no private code.

Before accepting each auditor's file, I reran one of its recomputations myself:

- **jobshop-quote:** a steel turned part, $85/h lathe, 45 min setup, 4.8 min cycle, 25% labour and 15% material markup, 15% scrap allowance on the bar, a $25 cert lot charge and a $150 line minimum. By hand, 50 pieces come to $660.72, so $13.22 each after rounding up; 5 pieces hit the line minimum, $30.00 each. The engine printed `5: unit 3000 total 15000; 50: unit 1322 total 66100`.
- **stormwater-detention-sizer:** at the 100-year peak stage of 4.327 ft, orifice plus weir flow is 1.1329 + 7.0818 = 8.2147 cfs, equal to the allowable. The engine gave 8.21466.
- **depop-fee-calculator:** a UK sale of £40 plus £5 shipping with a £3.50 label: 45 × 2.9% + £0.30 = £1.605 fee, £39.895 kept. The engine agreed.
- **platform/aws:** I read the plan role's policy myself. It attaches AWS's `ReadOnlyAccess` and denies only writes, `GetSecretValue` and SSM parameters, so `s3:GetObject` on every object stays allowed (details below).

I also overruled two auditor calls, both in the file's evidence. Stormwater's correctness went from 3 to 2: its arithmetic matches its own formulas, but the formula is the wrong one for its own worked example. One depop "medium" became "low": I checked that it never changes an answer.

## The number

**0 of 3 randomly sampled subjects meet the bar.** Across every sampled audit, 38 of 430 now meet it (Wilson 95% interval 6% to 12%). The flagship, which is chosen rather than sampled and so is reported apart, does meet it: 6 of the 15 flagships audited so far do.

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/jobshop-quote (flagship) | 3 | 3 | 3 | 3 | 3 | 2 | 3 | yes |
| ventures/stormwater-detention-sizer | 2 | 3 | 3 | 3 | 3 | 2 | 2 | no |
| ventures/depop-fee-calculator | 2 | 3 | 2 | 3 | 2 | 3 | 2 | no |
| platform/aws | 2 | 2 | 2 | 3 | 2 | 2 | 3 | no |

Against the code as it was audited, the tests caught 12 of 21 bugs seeded by hand:

| subject | seeded bugs caught |
|---|---|
| jobshop-quote | 7 of 8 |
| stormwater-detention-sizer | 2 of 4 |
| depop-fee-calculator | 1 of 5 |
| aws | 2 of 4 |

## Each subject

**jobshop-quote (flagship).** The reviewer is an experienced CNC and fabrication estimator. Three quotes with seven quantity breaks were priced by hand: aluminium plate by the pound with a material minimum and an anodize lot charge, steel bar with a separate setup rate and a binding line minimum, and stainless bought by the whole stock piece. All seven matched the engine to the cent. Six kinds of missing input each block the price instead of being guessed: no blank, no density, no parts per stock piece, no material, a machine not on the rate card, and duplicate breaks. The engine prices with markup on cost, and the settings import refuses a "margin" column and explains the difference, which is what an estimator checks first. Unit tests passed 421 of 421, worker tests 217 of 217. The gaps:

- **Medium:** a blank cycle time prices as free machine time. An empty minutes field becomes 0 and a new operation starts at 0. The app's own rule is "missing data blocks pricing", and on a small order the line minimum can hide the gap.
- **Medium:** there are no scrap or yield starts. Every break prices machine time and outside processing on the shipped quantity only. The free front-door calculator already models scrap starts.
- **Low:** there is no per-lot line for programming, first article or inspection. The workaround is a lot extra, and that picks up the material markup. Rounding unit prices up is untested: the one seeded bug that survived changed `ceil` to `round`. The manufacturing page says the app reads "the drawings", but today it reads only their text.

Fitness is 2 because it is not deployed yet (its ROADMAP item 3), and because of the scrap and first-article gaps. This is the closest the sample has come to software a shop would pay for: the remaining gaps are scope, not wrong numbers.

**stormwater-detention-sizer.** The reviewer is a licensed civil engineer who designs site stormwater. The TR-55 runoff depths, the NEH-630 unit hydrograph peak (27.668 cfs per inch) and the routed peaks all reproduce, and an independent routing script written from Chow (1988, section 8.2) matched every peak and stage to four decimals. The gaps:

- **High:** the weir uses the Francis equation with no end contractions, whatever its shape. That equation describes a weir as wide as its channel. The worked example's weir is 0.62 ft long and runs 2.27 ft deep. As a contracted rectangular weir (L' = L − 0.2H) it passes about 3.2 cfs, not 8.2, and the 100-year stage is 0.9 ft higher. That uses up 0.9 of the 1 ft freeboard the basin was sized with. This is why correctness is 2.
- **Medium:** the basin depth came from the last storm rather than the storm with the highest stage. With the storms out of order (`--largeA 30`), the 2-year stage was 2.05 ft but the depth was set from a 1.23 ft stage. **Fixed in this PR**, with a test that fails on the old code.
- **Medium:** there is no NRCS Type II or III 24-hour distribution, which most US drainage manuals require. The page says so.

As a front door it leads nowhere. Its page links only to other free calculators, and civil site designers are not who the pay-application product sells to.

**depop-fee-calculator.** The reviewer is a full-time reseller's bookkeeper. US and UK sales without a boost are exact on four hand cases. The price it suggests for a target profit solves back to exactly that profit. The gaps:

- **High:** "rest of world" is a flat 10% with no processing fee. According to search summaries of Depop's help pages, sellers outside the US and UK also pay payment processing, and Australian sellers on AUD sales moved to 0% selling fee plus 2.6% + A$0.30 from 22 July 2026. On an A$50 sale that would be A$1.60, not the 5.00 the tool shows. **This is unconfirmed:** Depop's own help pages could not be reached from the audit container, so a session with access has to check them before the rates are changed.
- **Medium:** the boost fee is 12% of the item price in every region. Depop's policy, by the same summaries, is 12% in the US and UK and 8% elsewhere, and shipping counts when the seller uses their own label.
- **Medium:** 4 of 5 seeded bugs survived. **Fixed in this PR:** four new tests, and `quality_mutate.py` now reports all four of those bugs caught.

The page links to the in-development Seller Books product for online sellers, so it is a real front door, one click away.

**platform/aws.** The reviewer is a senior AWS cloud security engineer. The management account holds up. The GitHub OIDC trust matches audience and subject exactly, so fork pull requests cannot assume the plan role. The state bucket is versioned, KMS-encrypted and TLS-only. Budgets, a freeze SCP and a kill switch (dry run by default) are in place. `pytest platform/aws` passed 35 of 35. The gaps:

- **High (latent):** the per-stack plan roles in the workload accounts (`stacks/github-oidc/account-roles/main.tf`) can be assumed by any same-repository pull request. They attach `ReadOnlyAccess`, which allows `s3:GetObject` on every object, plus DynamoDB and SQS reads. The deny next to it covers only writes and secrets. The file's own comment says the role "reads its own state". The member-account baseline role carries a full deny-data-reads list; this one does not. Nothing is applied yet, so no data is exposed today, but the first apply would ship it. **A separate PR closes it**, because `platform/aws` is a sensitive control-plane path and gets its own review.
- **Medium:** the workload permissions boundary does not force roles created by bounded roles to carry it too, so a bounded role could create an unbounded one.
- **Medium:** the OpenTofu test file asserts neither the audience condition nor the plan role's denies. Two seeded bugs survived because of it: a widened bootstrap OIDC subject and a removed secrets deny.
- **Low:** the README's checks section is stale (6 stacks and 15 tests, against 17 and 35) and names directories that do not exist.

`tofu test`, checkov and cfn-lint were not run. The OpenTofu download was refused in the container, and the other two are not installed, so the IAM reading was done by hand against AWS's policy evaluation logic.

## What changed this round

- `quality_audit.py validate` now accepts a flagship whose app lives in the private repository. Before, `sample` drew `ventures/jobshop-quote` and `validate` then rejected the audit because that path is not in this repository.
- The stormwater depth fix and the depop tests are in this round's PR. The uncontracted weir is listed under "Known gaps" in the stormwater README instead of being fixed here, because the fix changes the numbers the page pins.

Not at the bar: the stormwater sizer gives a basin stage a civil engineer would find low, the Depop calculator's rest-of-world numbers are probably wrong, and the AWS plan roles grant more reads than their comment claims. The one subject at the bar is the paid product, and the gaps it has left are scope rather than arithmetic.
