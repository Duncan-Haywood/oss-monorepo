---
title: "Quality audit round 109: 1 of 3 sampled at the bar; CMMC scoring is exact but under-tested"
seo_title: "Quality audit 109: 1 of 3 sampled at the bar, CMMC under-tested"
date: 2026-11-26
tags: [quality-audit, evaluation, testing]
description: "1 of 3 sampled subjects meet the bar. The CMMC flagship matched hand SPRS scores and all 110 NIST texts but left its POA&M rules untested."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). This round's evidence is four `2026-11-26-*` files with seed `2026-11-26-c-40a7` in [`portfolio/quality/audits/`](../../portfolio/quality/audits/): `cmmc`, `gitconfig-include-check`, `portable-restroom-event-quote` and `billing`. Each file lists every check and every bug seeded by hand. Every score was set before any fix.

The round ran in mode `sample`. It drew one flagship (`cmmc`, bet 4 in [`bets.md`](../../portfolio/monetization/bets.md), whose app lives in the private product repository), two ventures and one platform directory. None of the four had been audited before.

Before accepting each auditor's file, I reran one of its checks myself:

- **cmmc:** scenario A. Everything is met except 3.1.1 (−5), 3.5.3 MFA partial (−3), 3.13.11 non-FIPS crypto (−3), 3.1.3 (−1), 3.4.9 (−1) and 3.8.8 (−3), with 3.10.6 not applicable. 110 − 16 = 94, and the app's `scoreLevel2` returned 94.
- **gitconfig-include-check:** case c12. `~/.gitconfig` sets `me@home`, then includes a work file under `[includeIf "hasconfig:remote.*.url:https://github.com/acme/"]`. The repository's origin is `https://github.com/acme/api.git`. Git 2.43 printed `me@home`. The tool printed `me@acme` and marked the include READ.
- **portable-restroom-event-quote:** the comparison page's worked example. Rental 336 + service 150 + haul 422 + consumables 40 = 948. Adding 12% overhead gives 1,061.76, and dividing by 0.75 gives 1,415.68. The engine agreed.
- **platform/billing:** I ran the auditor's Paddle recomputation script. A webhook signed with HMAC-SHA256 over `ts:body` verified. The key expiry was 1715509127 + 7 × 86,400 = 1716113927. Three duplicate deliveries left one row.

I overruled one auditor's call. Gitconfig's correctness went from 3 to 2. That makes 26 of 28 runs agreeing with git. But the two that disagreed gave the wrong email for a pattern the tool's own page lists, and which email git uses is the question the tool exists to answer.

## The number

**1 of 3 randomly sampled subjects meet the bar.** Across every sampled audit, 39 of 433 now meet it (Wilson 95% interval 7% to 12%). The flagship is chosen rather than sampled, so it is reported apart. It does not meet the bar: 6 of the 16 flagships audited so far do.

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/cmmc (flagship) | 3 | 3 | 2 | 3 | 3 | 2 | 3 | no |
| ventures/gitconfig-include-check | 2 | 3 | 3 | 3 | 3 | 3 | 3 | no |
| ventures/portable-restroom-event-quote | 2 | 3 | 3 | 3 | 2 | 2 | 2 | no |
| platform/billing | 3 | 3 | 3 | 3 | 3 | 2 | 3 | yes |

Against the code as it was audited, the tests caught 16 of 25 bugs seeded by hand:

| subject | seeded bugs caught |
|---|---|
| cmmc | 6 of 9 |
| gitconfig-include-check | 2 of 4 |
| portable-restroom-event-quote | 5 of 7 (one survivor changes nothing) |
| billing | 3 of 5 |

## Each subject

**cmmc (flagship).** The reviewer is a CMMC Registered Practitioner or a certified assessor at an accredited assessment body (a C3PAO). The auditor parsed NIST's own files with its own scripts. All 110 requirement texts match NIST SP 800-171 Rev. 2, and all 320 assessment objectives match SP 800-171A. All 110 point values match the DoD Assessment Methodology v1.2.1 and the 5- and 3-point lists in 32 CFR 170.24, giving a minimum of −203.

Five scenarios matched hand arithmetic. No SSP gives no score. Everything unmet except the SSP gives −203. The 88-point boundary works for a Conditional status. A lone 3.10.3 gap scores 109 but is blocked, because 3.10.3 can never go on a POA&M. A conditional date plus 180 days lands on the right day.

Unit tests passed 258 of 258 and worker tests 81 of 81. Claims are clean. Nothing says the product certifies anyone, and the "do not upload CUI" warning appears in four places and is enforced by the server. The gaps:

- **Medium:** a requirement's status is scored apart from its objectives. A requirement marked Implemented with one objective marked Not met still scores full points. Under 32 CFR 170.24(b)(1), MET means every applicable objective is met, so the SPRS score can be overstated.
- **Medium:** the two Conditional-status rules have no test, which is why verification is 2. Letting any 3-point item onto a POA&M (`scoring.ts:183`) and rejecting a score of exactly 88 (`:217`) both survived every test.
- **Medium:** there is no way to record enduring exceptions or temporary deficiencies, which 170.24(b)(1)(i)–(ii) assess as MET.
- **Low:** the POA&M reason strings cite the wrong paragraphs of 170.21. The Level 1 library is retyped instead of imported from the free page's `l1-data.mjs`; the two copies agree today. `flagships.yaml` still lists milestones 1, 2 and 4 as to do, though they are done.

This is close. The arithmetic and source texts are exact. What keeps it off the bar is two untested rules and one scoring rule an assessor would query. Fitness is 2 because the app is not deployed yet and billing is off. The fixes belong in the private repository and are not part of this PR.

**gitconfig-include-check.** The reviewer is a senior developer-tooling engineer who owns git onboarding. The auditor ran 28 cases against real git 2.43, 26 of which agreed. They covered trailing slashes, `gitdir/i:`, relative and chained includes, `onbranch:` on a detached HEAD, symlinks and linked worktrees. The author's own 600-tree comparison against `git config --list --show-origin` also passed. The gaps:

- **High:** `hasconfig:remote.*.url:` patterns ending in `/` had `**` appended. Git does that only for `gitdir:` and `onbranch:`, so the tool reported the work email where git uses the home one. **Fixed in this PR**, with a test that fails when the old rule is put back.
- **Medium:** `--verify` ran git from the current folder rather than the repository's top. From a subfolder, every run falsely reported "DIFFERS from git". **Fixed in this PR**, and the fix was checked by hand from a subfolder ("matches git (8 values)"). No automated test covers it yet.
- **Low:** the random comparison generator never produces a detached HEAD or a `hasconfig` pattern ending in `/`, and that is how the high shipped.

**portable-restroom-event-quote.** The reviewer is an estimator at a portable sanitation company. The pricing engine is exact. Margin is taken on price, the 33% deposit and 30-day hold check out, and every figure on the flat-rate comparison page reproduces. The accessible-unit rule (at least 5%, never fewer than one) matches the 2010 ADA Standards. The gaps:

- **High:** the people-per-unit table has no source and suggests 2 to 4 times the units in the PSAI special-event chart. For 500 people over 4 hours it suggests 10 units against PSAI's 5. For 1,000 people over 8 hours it suggests 34 against 12. As a result, the "fleet looks light" warning fires on a fleet sized by the PSAI chart. Re-basing the table changes numbers the pages pin, so it is now listed as a known gap in the README, linked to the audit, rather than fixed here.
- **Medium:** extra service visits add no truck mileage, yet the FAQ said a service run was "an additional round trip". **The FAQ now says what the code does (fixed in this PR).** The mileage itself is a known gap.
- **Low:** the alcohol note said "about 20% more restrooms", but the 0.8 factor gives 25% more. **Fixed in this PR.** Other low issues: restroom rows are recognised by their typed name, the handwash ratio has no source, and the ServiceCore founding year (2017) is disputed by PitchBook and CB Insights, which say 2015.

There is no automated test for the two corrected sentences.

**platform/billing.** The reviewer is a payments engineer. Webhook signatures were recomputed with openssl from Paddle's documented scheme. Licence keys verify both ways against openssl Ed25519, duplicate webhooks are idempotent in the real schema, and the product comes from the price paid, never from `custom_data`. Tests passed 19 of 19. The gaps:

- **Medium:** no test covered the length check in the constant-time compare. With the check deleted, a one-digit `h1` would match after about 16 forged tries, and every test still passed. **A test that catches it is in this PR** (`quality_mutate.py`: caught).
- **Medium:** `keygen.mjs` told the owner to put the signing key on `platform/edge/`. That is the public site's Worker, which must never hold a billing secret. **Corrected in this PR.**
- **Low:** refunds and chargebacks are acknowledged and ignored, so a refunded subscription key works until the paid period ends plus 7 days. A test claims Paddle's replay window is five minutes, but Paddle documents five seconds; the 300 s window is defensible, but the citation is wrong. A transaction with two catalogue prices mints one key.

It meets the bar. Fitness is 2 only because nothing is priced or deployed yet, and that step waits on the owner.

## What changed this round

- Fixes in this PR: the gitconfig hasconfig rule and `--verify` folder, the billing compare test and keygen comment, and the restroom FAQ and alcohol wording.
- The restroom fleet table is recorded as a known gap in its README, linked to the audit.
- The cmmc defects are listed in the audit file for the next private-repository run.

Not at the bar: the CMMC app scores correctly but leaves its POA&M rules untested and ignores objective results. The restroom tool's suggested fleet sizes have no source and run far above the industry chart. The git checker was wrong on one documented pattern until this round's fix.
