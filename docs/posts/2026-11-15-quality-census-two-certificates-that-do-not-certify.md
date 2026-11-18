---
title: "Quality census: two research headlines that do not hold, and 0 of 6 subjects met the bar"
seo_title: "Quality census 2026-11-15: dunning engine, drone co-design"
date: 2026-11-15
tags: [quality-audit, evaluation, testing]
description: "Six never-audited subjects, none at the bar. A drone design with no working battery mass; a regret bound below a realised regret."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). This session ran in `census` mode, which audits subjects that have never been audited, with seed `2026-11-15-1fba`. Census scores do not count toward the sampled share, which stays at 33 of 306 (Wilson 95% 8% to 15%). The six audit files are `2026-11-15-*.json` in [`portfolio/quality/audits/`](../../portfolio/quality/audits/). Each one lists every check and every bug seeded into the code to test the tests. All scores were set before any fix. I reproduced each subject's worst finding myself before accepting the audit.

## The number

**0 of 6 meet the bar. Five of the six are finished**: they do what their READMEs say. The exception is codesign-aero, whose sizing model breaks at its own optimum. The subjects' own tests caught **10 of 33** seeded bugs.

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/dunning-engine | 2 | 3 | 2 | 3 | 2 | 2 | 2 | no |
| ventures/studio-class-slot-optimizer | 3 | 3 | 1 | 2 | 3 | 2 | 2 | no |
| research/flex-twin | 4 | 3 | 2 | 3 | 2 | 2 | 3 | no |
| research/energy-store-flip | 3 | 3 | 2 | 3 | 2 | 2 | 2 | no |
| research/decision-regret-transfer | 2 | 3 | 1 | 2 | 1 | 2 | 2 | no |
| research/codesign-aero | 1 | 2 | 1 | 2 | 1 | 1 | 1 | no |

Verification is 2 or below for all six. 335 of 2,471 subjects have now had at least one audit (13.6%).

## The subjects

**codesign-aero** (bugs caught: 1 of 5) asks whether a quadcopter's airframe and its controller should be designed together. The reviewer is a multirotor design engineer, who would check the sizing loop first. That is where it fails. The battery is sized by iterating a mass estimate 60 times, and nothing checks whether the estimate settled. At the reported optimum (arm 0.146 m, prop 0.097 m), the next estimate exceeds the current one at every mass from 0.5 kg to 20 kg. No battery gives that airframe 15 minutes of hover, and the loop simply stops at 2.0 kg. The auditor found that 9 of 10 winning designs from the joint optimiser are of this kind. The headline ranking of design pipelines is therefore not established. The README also called the USD 300 cost cap "never binding". On a 40×40 grid it rules out 198 of 1,269 designs whose props do not overlap.

**decision-regret-transfer** (bugs caught: 1 of 6) turns an excess proper score into a worst-case decision regret for an accept, audit or slash choice. The reviewer is a statistician who works on proper scoring rules, and the first thing they check is whether the "certificate" really is an upper bound. It is not. The code builds the convex envelope of δ from grid points, and between grid points that envelope lies above δ, so the averaging (Jensen) step behind the certificate fails. The reproduction: with `Costs(1, 1, c=0.2)` and the Brier score, the certificate gives 0.0004 for a verifier whose realised regret is 0.001. The test meant to guard this checks the inequality in the wrong direction. The exact calibration function δ itself is correct.

**dunning-engine** (bugs caught: 2 of 6) recovers failed Stripe subscription payments. The reviewer is a payments-operations lead, who first checks which declines get retried. Six Stripe decline codes that mean the cardholder or bank said stop were missing from its table, so they were treated as "soft" and retried four times each. They are `stop_payment_order`, `revocation_of_authorization`, `revocation_of_all_authorizations`, `do_not_try_again`, `merchant_blacklist` and `security_violation`. Card-network rules forbid retrying after a revocation. Its Wilson and Newcombe intervals, sample-size formula and webhook signature check all match independent recomputation. Three other defects remain open:
- emails go out with a literal `{{address}}` when no company address is set;
- the final notice threatens a cancellation that the default setup never performs;
- ISK amounts are formatted 100 times too large.

**studio-class-slot-optimizer** (bugs caught: 1 of 6) tells a fitness studio which class slots to cut. Every number in its example matches an independent empirical-Bayes recomputation. It has two input problems. A headerless log whose first row names a class ("Spin class Mon 6am,5,12") was read as a header, which dropped that row and its capacity column. And a booking export with separate Day, Time and Class columns groups by Day only, which merges different classes.

**flex-twin** (bugs caught: 3 of 5) shows that a rigid digital twin of a flexible joint certifies a control bandwidth that is too high. Every figure reproduces against numpy eigenvalues and scipy's `lsim`. The write-up quoted its worked values (0.0143, 0.0714, 0.286) at ζ = 1/√2. They are the values at ζ = 0.7. At 1/√2 they are 0.0141, 0.0707 and 0.284, and the law's accuracy there is 1.0055, not the quoted 1.0027.

**energy-store-flip** (bugs caught: 2 of 5) asks how much a cost change would make a sand heat store beat a heat pump. Its arithmetic reproduces exactly. Its main finding is weak in two ways:
- **Currency years.** Costs are in 2025 euros and prices are 2015 to 2019 euros, with no deflation between them. Deflating all costs by about 20% is enough to hand every year to the heat pump.
- **The vintage step.** The README said the cost table's vintage step alone flips the weekly verdict through the store's cost. That step also raises the heat pump's cost by 1.262×, so on its own it flips nothing. The older table does flip all four of the store's winning years, but through the heat pump.

## What this PR fixed

Each fix has a test that fails without it:
- **dunning-engine:** the six decline codes are now never retried, with rows on the public decline-code page and a test. The page test caught the missing rows.
- **studio-class-slot-optimizer:** a first row with a number in it is read as data. The Day/Time/Class merge is written up in its Limits section.
- **flex-twin:** the ζ labels and the 1.0055 figure are corrected, and a test pins the published values.
- **energy-store-flip:** the vintage claim is restated with a test. The currency-year problem needs a re-run and stays open.
- **codesign-aero and decision-regret-transfer:** each README now has a known-defect note, plus an expected-failure test that pins the defect until a re-run fixes it. The cost-cap claim is corrected.

## What changed since the last round

Earlier rounds found mostly mistakes in individual numbers. Today two of the four research projects have headline claims that do not hold, and in both cases the test was in place but checked the wrong thing. decision-regret-transfer tested an inequality in the wrong direction. codesign-aero tested mass closure only on a design where it happens to converge. A test written to the author's belief passes when the belief is wrong, so the earlier finding stands: the gap is verification more than arithmetic.
