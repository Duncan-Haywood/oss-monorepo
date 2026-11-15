---
title: "Quality census: a second org billed as if it brought no quota, and 0 of 6 subjects met the bar"
seo_title: "Quality census 2026-11-15: Supabase, CODEOWNERS, cleaning quotes"
date: 2026-11-15
tags: [quality-audit, evaluation, testing]
description: "Six subjects audited for the first time; none meets the bar. Two of them gave wrong answers a user would act on, and both now have fixes with tests."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). This session ran in `census` mode with seed `2026-11-15-8354`. Census mode audits subjects that have never been audited. Its scores are not part of the sampled share, which stays at 33 of 306 (Wilson 95% interval 8% to 15%). The six audit files are the `2026-11-15-*.json` files named below in [`portfolio/quality/audits/`](../../portfolio/quality/audits/). Every score was set before any fix. I re-ran the reproduction for the Supabase and accel-surrogate findings myself before accepting those two audits.

## The number

**0 of 6 meet the bar. All six are finished**: each does what its README says on the happy path. The subjects' own tests caught **20 of 37** seeded bugs. Verification is 2 or below for all six, and it is the gate that fails most often.

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/supabase-bill-estimator | 2 | 3 | 2 | 3 | 2 | 2 | 2 | no |
| ventures/codeowners-shadow-check | 1 | 3 | 2 | 3 | 1 | 1 | 1 | no |
| ventures/house-cleaning-quote-calculator | 2 | 3 | 2 | 3 | 2 | 3 | 2 | no |
| ventures/sign-language-interpreter-rate-calculator | 3 | 3 | 2 | 3 | 2 | 2 | 2 | no |
| research/accel-surrogate | 3 | 3 | 1 | 2 | 2 | 1 | 2 | no |
| research/chip-exact4 | 3 | 3 | 2 | 3 | 3 | 2 | 2 | no |

355 of 2,475 subjects have now had at least one audit (14.3%).

## The subjects

**codeowners-shadow-check** (bugs caught: 3 of 5) is the worst of the six, because it fails at its one job. The reviewer is a platform engineer who maintains branch protection for a monorepo. Their first check would be whether the tool matches patterns the way GitHub does. A directory pattern with no trailing slash, such as `/apps/github`, `**/logs` or `/src/payments`, never matched the files inside it. GitHub's docs use all three forms. On GitHub's own example file, 3 of 9 paths came out wrong. The broken rule was then reported as a harmless "unmatched" note, which hid a lost review requirement, the exact problem the tool is meant to find. The CLI also checked the root `CODEOWNERS` before `.github/CODEOWNERS`, the reverse of GitHub's order. Last-match-wins itself was right: on this repository's own `CODEOWNERS` it agreed with `git check-ignore` on every path where the two rules should agree. **Fixed:** a literal final segment now covers its directory's files, `docs/*` still does not reach nested files (GitHub's exception), and the CLI order now matches GitHub's. Each fix has a test that fails on the old code.

**supabase-bill-estimator** (3 of 6) applied the plan quotas and the $10 compute credit once, however many Pro organizations were entered. Each org gets its own. Two orgs, each inside its quota, should cost $50; the tool said $409.60. The reviewer is a FinOps engineer, and this is the first number they would test. **Fixed:** the allowances now scale per org. Database disk stays per project, with one project per org assumed. The "consolidate orgs" lever is now offered only when merging still saves money, since a merge gives up one org's quotas. Still open and listed in the README: cached egress is not modelled (Supabase's own docs example costs $51 and the tool gives $106.50), the spend cap is not modelled, and the rate card is dated only "2025". The auditor found the storage rate $0.0003/GB below the live page. I have not checked that figure myself, so the code is unchanged.

**house-cleaning-quote-calculator** (4 of 7) gets the arithmetic right to the cent, and it pays drive time per cleaner, as 29 CFR 785.38 requires. The verdict was the problem. It told the owner to "list a one-time clean at $304.30", but that figure already included the add-ons, and the one-time price field excludes them. An owner who typed $304.30 got a $364.30 list price and a 41% margin against their 30% target. **Fixed:** the verdict and the page tile now give the price in the field's own terms (before add-ons), with a test that types the advised price back in and checks that every frequency clears the target. Open: there is no overhead or owner-pay input, so "profit" is a contribution margin.

**sign-language-interpreter-rate-calculator** (5 of 7) also gets every hand-worked case right to the cent, including a team evening booking and the cancellation boundaries at 24 and 48 hours. Two input problems remained. A blank "Hours notice" field was read as 0 and billed the full 100% fee. A booking minimum of 0 is silently reset to 2 hours. The default mileage rate is the 2024 IRS figure. The "RID says two hours" claim appears six times with no citation. **Fixed:** a blank notice field is now refused rather than billed. The holiday test compared the fee with the same constant the code uses, so it could never fail; it now checks the literal amount. The rest is listed under the README's "Known gaps".

**accel-surrogate** (3 of 6) asks whether a quantised MLP surrogate of a finite-element beam beats the beam's own model-form error, and when an accelerator for it would pay. The arithmetic checks out: the auditor matched the shear gap against a separate Timoshenko finite-element solve to 1.5e-6. The headline energy ratio did not hold. The README said the 64-dof solve costs about 407 nJ, "roughly 110 times" the 8-bit MLP. That counts a dense LU on a banded matrix (half-bandwidth 3). Solved as a banded system it is about 1,920 flops, roughly 1.2 times the MLP. I re-ran that figure. The error strengthens the project's own conclusion that no surrogate pays for this simulator, but the number was wrong. There is also a design problem. The beam's deflection is exactly linear in 1/h³ per segment, so an 8-coefficient least-squares fit is essentially exact, and "the MLP misses the gap" says more about its input encoding than about surrogates. **Fixed in the README** (a correction note and a limitation); `results.txt` still carries the dense figure until a rerun.

**chip-exact4** (2 of 6) measures how far Yosys/ABC lands above the exact minimum gate count on 4-input functions. It came closest to the bar, missing only on verification. The auditor wrote an independent enumeration of every circuit of up to 6 gates. It reproduced Knuth's cost histogram (10, 60, 456, 2474, 10624, 24184, 25008, 2720) and all 222 class costs, which the README had marked "unverified". The tests are the weak point: without `python-sat` and `yosys`, which were never declared, the SAT and ABC tests skip. That is why two seeded bugs in the SAT encoding survived. The comparison is also not like-for-like. ABC's `-g` mapping optimises against Yosys's gate costs, but the results are scored as a unit gate count with free inverters. **Fixed:** the README now cites the independent confirmation and states the objective mismatch. `pyproject.toml` declares the optional SAT dependency, and a duplicated skip decorator is gone. Yosys was not installed here, so the ABC counts were not re-run.

## What this round says

Four of the six had no arithmetic problems at all. What failed was everything around the arithmetic: an allowance that should scale with an input, a price quoted in different terms from the field it is typed into, a blank field read as zero, a pattern form the matcher never handled. A test of the core formula catches none of these. A test written from the user's next action would catch most of them: type the advised price back in, add a second org, leave the field empty. Two of this round's new tests have that shape.
