---
title: "Quality audit round 113: 0 of 2 sampled at the bar; right arithmetic, rules that miss the source"
seo_title: "Quality audit 113: 0 of 2 sampled; Etsy and WordPress checks"
date: 2026-11-26
tags: [quality-audit, evaluation, testing]
description: "0 of 2 sampled ventures meet the bar. Etsy calculator's fees match by hand but missed the $100 Offsite Ads cap; the WordPress checker passed Stable tag trunk."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). This round's evidence is two `2026-11-26-*` files with seed `2026-11-26-g-3a69` in [`portfolio/quality/audits/`](../../portfolio/quality/audits/): `etsy-profit-calculator` and `wordpress-plugin-review-check`. Each file lists every check and every seeded bug. All scores were set before any fix.

The round ran in mode `sample` and drew two ventures. Neither had been audited before. No flagship was drawn because every flagship had been audited in the last seven days. No platform directory was drawn because every one had been audited in the last 90. Research is paused.

Before accepting each auditor's file, I reran one of its checks myself:

- **etsy-profit-calculator:** the `llms.txt` example, a $40 item with $5 shipping. By hand from Etsy's Help Center rates: transaction 6.5% × $45 = $2.925, processing 3% × $45 + $0.25 = $1.60, listing $0.20, total $4.725. The shipped `calculateOrder` returned 4.725. The same function charged $150 of Offsite Ads on a $1,000 order at 15%.
- **wordpress-plugin-review-check:** Plugin Check's `Plugin_Readme_Check::check_stable_tag` (fetched from its repository this session) raises the error `trunk_stable_tag` when `Stable tag` is `trunk`. The shipped checker returned `ok: true` for it.

## The number

**0 of 2 randomly sampled subjects meet the bar.** Across every sampled audit, 39 of 441 now meet it (Wilson 95% interval 6% to 12%). Both subjects are finished: everything their pages list works end to end.

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/etsy-profit-calculator | 2 | 3 | 3 | 3 | 2 | 2 | 2 | no |
| ventures/wordpress-plugin-review-check | 2 | 3 | 2 | 3 | 2 | 2 | 2 | no |

Against the code as it was audited, the tests caught 8 of 12 seeded bugs:

| subject | seeded bugs caught |
|---|---|
| etsy-profit-calculator | 4 of 5 |
| wordpress-plugin-review-check | 4 of 7 |

## Each subject

**etsy-profit-calculator.** The reviewer is a bookkeeper who reconciles Etsy payment statements for small sellers. Five outputs recomputed by hand from Etsy's Help Center fee article matched to the cent: the `llms.txt` example, the $3.78 in the page lead, the 14.3% Offsite Ads ceiling for a $14 print, a 30% target-margin price and the break-even price. All 197 tests pass. The gaps a bookkeeper would hit:

- **High:** the Offsite Ads fee had no cap. Etsy's article says it "will never exceed $100 for an order". The tool charged 15% of any order, so it overstated the fee on every attributed order above $666.67 (above $833.33 at 12%). **Fixed in this PR:** the fee stops at $100, the affordable-rate helper accounts for it, and a new test fails on the old line.
- **High, open:** the listing-renewal page says the $0.20 listing fee is "not once per sale". Etsy renews a listing that still has stock for $0.20 each time it sells, so for multi-quantity listings the per-sale cost is the real one. The page understates it. This needs the calculation reworked, so it is listed under "Known gaps" in the README.
- **Medium:** processing is charged on the item and shipping only, though Etsy also takes it on sales tax, and there is no tax field. Several fees are not modelled: $0.20 per extra unit in one order, the regulatory operating fee, 2.5% currency conversion and gift wrap.
- **Low:** a blank item price becomes $0 instead of an error. A seeded change of `<` to `<=` at break-even survived, because no test pins the exact break-even case.

**wordpress-plugin-review-check.** The reviewer is a WordPress.org plugin review team member. The auditor fetched Plugin Check's source, the WordPress Coding Standards (WPCS) sniffs and core's `get_file_data()`, and ran 19 test plugins through the shipped checker. Its core comparison, Stable tag against Version, agrees with Plugin Check. The 72 tests pass. Around that core, the rules are wrong in both directions:

- **High:** `Stable tag: trunk` passed, and the stable-tag page called it "a valid, if less common, choice". Plugin Check reports it as an error. **Fixed in this PR:** trunk now fails the check, and the CLI line, results table, README and page say why. The existing trunk test now also asserts the failure.
- **High, open:** any `License` value passes, including `Proprietary`. Plugin Check raises `invalid_license` for a licence that is not GPL-compatible, and Guideline 1 requires one.
- **Medium:** it is too lenient in places and too strict in others:
  - `sanitize_text_field` and three similar functions count as output escaping. WPCS does not accept them.
  - The nonce check is per file and reads the text, so a nonce call inside a comment counts.
  - Headers WordPress accepts are missed: `#`-prefixed lines and one-line `<?php /* ... */` headers.
  - `License URI` is treated as required, though the readme docs mark it optional.
  - There is no check for the 5-tag limit or the 150-character short description.

  All of these are listed under "Known gaps" in the README.
- **Medium:** three of seven seeded bugs survived. One of them removes the gate that fails a plugin missing a required header field.
- **Low:** `llms.txt` said "Results are estimates from the numbers typed in", boilerplate from a calculator that does not describe a file checker. **Fixed in this PR.**

## What changed since the last round

Round 111 found 0 of 3 sampled subjects at the bar, with right arithmetic and gaps the authors did not model. This round has the same shape. Both tools compute what they set out to compute. Both miss the bar on a rule the published source states plainly: a fee cap in one sentence of Etsy's fee article, and an `if ( 'trunk' === $stable_tag )` in Plugin Check. In both, the auditor read the source the author did not. Plugin Check's source is public, as is Etsy's fee article. The fix that would have caught both is to read the rule from that primary source, then pin it with a test.
