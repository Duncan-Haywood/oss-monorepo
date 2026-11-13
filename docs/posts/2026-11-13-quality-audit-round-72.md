---
title: "Quality audit round 72: 0 of 4 at the bar, and a payout tool that still said Patreon"
seo_title: "Quality audit 72: Lemon Squeezy, Meta ads, sharesign, occupancy"
date: 2026-11-13
tags: [quality-audit, evaluation, testing]
description: "0 of 4 sampled subjects meets the bar. A Lemon Squeezy tool copied from Patreon rejects the real export; a chip study's headline claim is contradicted by its data."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). The evidence is in the four `2026-11-13-*` files with seed `2026-11-13-r-1b81` in [`portfolio/quality/audits/`](../../portfolio/quality/audits/). Each file lists every check and every hand-seeded bug. All scores were set before any fix.

This round ran in mode `sample`, seed `2026-11-13-r-1b81`. None of the four subjects had been audited before. No flagship or platform subject was drawn, because each had been audited within its re-audit window.

## The number

**0 of 4 sampled subjects meets the bar.** Across every sampled audit, 33 of 302 now meet it (Wilson 95% interval 8% to 15%). Three of the four are finished (completeness 3).

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/lemonsqueezy-payout-to-journal | 1 | 1 | 1 | 2 | 0 | 1 | 1 | no |
| ventures/meta-ads-fatigue-analyzer | 2 | 3 | 2 | 3 | 2 | 2 | 2 | no |
| research/chip-sharesign | 3 | 3 | 1 | 2 | 1 | 1 | 2 | no |
| research/occupancy-twin | 3 | 3 | 2 | 3 | 3 | 2 | 2 | no |

The subjects' own tests caught 9 of 22 seeded bugs: 2 of 4 (Lemon Squeezy), 3 of 7 (Meta ads), 2 of 7 (sharesign) and 2 of 4 (occupancy). Verification is below 3 in all four, which on its own keeps every subject under the bar.

## The subjects

**lemonsqueezy-payout-to-journal.** The reviewer is a bookkeeper who reconciles Lemon Squeezy payouts into Xero or QuickBooks through a clearing account. Their first check is whether the tool reads the file Lemon Squeezy actually sends. It does not. `calc.mjs` is a find-and-replace copy of the Patreon payout tool: about 20 lines differ once the platform names are normalised. Lemon Squeezy's documented Orders export ([docs.lemonsqueezy.com](https://docs.lemonsqueezy.com/help/orders/exporting-orders)) gives amounts in cents and has no fee, net or payout columns, so the tool refuses it, with directions to Patreon's menu. The served page was headed "PATREON PAYOUT TO JOURNAL", and its paste box showed Patreon's columns. It promised to split out "tax you collected", but Lemon Squeezy is the merchant of record, so the seller collects none. On input built by hand the arithmetic is right: Lemon Squeezy's own worked example ($20 plus 20% VAT, fee $2.06, net $17.94) journals to the cent. That is why correctness scores 1, not 0.

**meta-ads-fatigue-analyzer.** The reviewer is a senior paid-social media buyer. On the standard 28-day export, every per-ad figure matched an independent recompute to four decimal places across 13 ads: frequency, link CTR, cost per result, ROAS, both medians, and the 79-click threshold. The worst defect is in the feature the page advertises most. With a Day breakdown, each row's frequency is that day's figure, usually 1 to 1.5. The tool averages those, then requires frequency of at least 3 before any fatigue signal can fire. On a realistic daily export, an ad whose CTR fell 42% shows frequency 1.18 and is not flagged. Its one test uses a daily frequency of 3.5, which real exports don't produce. Four seeded changes to the fatigue thresholds left every test green.

**chip-sharesign.** The reviewer is a logic-synthesis researcher. The numbers reproduce: the experiment reruns byte-identical, and an independent harness matched every unshared score exactly over 50 netlists. Its gate-level simulation found 0 mismatches. The headline claim is the problem. The README said the sign flip found in `chip-abc-orderpass` "does not generalise" and that "no design shows it under `dch_map`/`resyn2_map`". But orderpass measured that flip in cells × depth. On that metric, this project's own `results.txt` shows shared larger in 3 of 11 designs under both scripts, up to 1.27x. A one-line awk over `results.txt` shows it, and I reran it. Sharing common subexpressions to save area is textbook (De Micheli 1994), and none of that literature was cited. Dropping `-verify` from the equivalence miter, which then passes anything, left the tests green.

**occupancy-twin.** The reviewer is a robotics mapping researcher. Every number checked recomputes from sources the author did not write: θ* for all five rates against Wald's 1947 closed form, plus the exact error and the tempered threshold, cross-checked by a 2-million-path simulation. The experiment reruns byte-identical. Verification is the gap: no test checked the expected time to commit a cell, though the paper's 1.4x to 16x latency results rest on it. The research design is the other gap. θ* is the root Wald used for a sequential test run on the wrong model, but the paper credits risk theory and cites no work on misspecified sequential tests. The twin's rates are unsourced, and the result assumes a cell commits for good at ±6.9, where OctoMap clamps its log-odds.

## Fixed in this round

All in [PR #15600](https://github.com/Duncan-Haywood/oss-monorepo/pull/15600). Each fix comes with a test that fails on the old code:

- **Lemon Squeezy:** the Patreon heading and paste example are gone, and the deposit box now reads "1,262.00" as 1,262.00 rather than 1.26. The `date_utc` column is accepted. The page, README and llms.txt now say plainly that the real export is not read yet. Reading it is a rewrite, listed under "Known gaps".
- **Meta ads:** tab exports with decimal commas now read 512,40 as 512.40, not 51240. New boundary tests catch all four surviving threshold mutants, plus a fifth. The daily-frequency gap and the single median pooled across campaigns are listed under "Known gaps".
- **chip-sharesign:** the claim and the title are corrected. A negative test now proves the miter rejects a wrong design (it catches the `-verify` mutant), and `run.py` refuses to score a pair whose equivalence is unproved. The `$macc`/`$alu` confound and the k = 4 control that still shares are listed under limitations.
- **occupancy-twin:** a one-step test pins the expected commit time and catches the surviving mutant.

## What changed since the last round

Round 71 found 1 of 4 at the bar, and its misses were about tests and disclosure, not arithmetic. This round has the same pattern plus two claims failures: one product whose page described another platform, and one research headline contradicted by its own results file. Both came from copying. The Lemon Squeezy tool was cloned from Patreon with the names swapped, and sharesign changed the metric from the study it was answering without saying so. The copies changed names and metrics, and no test checked either against the real format or the original study.
