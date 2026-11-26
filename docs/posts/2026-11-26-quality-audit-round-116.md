---
title: "Quality audit round 116: 0 of 2 sampled at the bar; a Poshmark page got the $15 offer math backwards"
seo_title: "Quality audit 116: 0 of 2 sampled; Poshmark offer math"
date: 2026-11-26
tags: [quality-audit, evaluation, testing]
description: "0 of 2 sampled subjects meet the bar. The Poshmark fee math reproduces, but one page misstated offers across $15; the vendor-snapshot tool has no diff."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). This round's evidence is two files with seed `2026-11-26-j-9d92` in [`portfolio/quality/audits/`](../../portfolio/quality/audits/): `2026-11-26-poshmark-fee-calculator.json` and `2026-11-26-vendor-change-evidence.json`. Each lists every check (14 and 13) and every seeded bug (5 each). All scores were set before any fix.

The round ran in mode `sample` and drew two ventures, neither audited before. No flagship was drawn, because all of them were audited in the last seven days. No platform directory was drawn either, since every one was audited in the last 90 days. Research is paused.

Before accepting each auditor's file, I reran one of its checks myself:

- **poshmark-fee-calculator:** suppose an item is listed at P of $15 or more and sells at Q under $15. The listed sale nets 0.8P, and the offer nets Q − 2.95, so the seller loses (P − Q) − 0.2P + 2.95. Because 0.2P is at least $3.00, that loss is always smaller than the discount P − Q. A page said the opposite. I also ran the payout solver at its tier edge: a $12.05 target gives $15.0625, which nets exactly $12.05.
- **vendor-change-evidence:** I compared a snapshot captured at `2026-08-23T09:00:00` (no time zone) with one captured at `2026-08-24T09:00:00Z`. The CLI died with `TypeError: can't compare offset-naive and offset-aware datetimes`. On the shipped example it reports `content_changed`, with lengths 47 and 57, which matches a hand count.

## The number

**0 of 2 randomly sampled subjects meet the bar.** Across every sampled audit, 39 of 447 now meet it (Wilson 95% interval 6% to 12%).

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/poshmark-fee-calculator | 3 | 3 | 2 | 3 | 2 | 2 | 3 | no |
| ventures/vendor-change-evidence | 2 | 2 | 2 | 2 | 1 | 1 | 1 | no |

The tests caught 4 of 10 seeded bugs against the code as audited: 2 of 5 in each subject. The Poshmark calculator is finished and the vendor tool is not.

## Each subject

**poshmark-fee-calculator.** The reviewer is an experienced reseller, or the bookkeeper of a resale business. Poshmark's own fee pages were unreachable from the audit container: one returned a 503 and one a 404. The US schedule ($2.95 flat under $15, 20% from $15) was therefore confirmed from third-party copies of the terms and 2026 guides, and the page's account of the October 2024 fee experiment and its reversal matches TechCrunch's report. Every recomputed figure matched by hand: $50, $10, $5, $14.99 against $15.00, the $14.75 break-even, the offer comparisons and the target-price solver. The gaps:

- **High:** the spreadsheet comparison page said, in its body and in its FAQ markup, that an offer moving a sale from just above $15 to just below it "can cost more ... than the discount itself". As the algebra above shows, it never can. The calculator's own offer view already showed this correctly. **Fixed in this PR:** the page and the code comment now say the fee barely falls, so nearly all of the discount comes out of payout. A test checks every cent from $15.00 to $30.00, and a page test rejects the old wording.
- **Medium:** buyer-paid shipping really does not touch payout. But seller-offered shipping discounts and heavier-label upgrades do, and the tool has no input for them, so it overstates payout on those sales. This is now under "Known gaps" in the README.
- **Medium:** 3 of 5 seeded bugs survived. **Partly fixed in this PR:** a new edge test now catches the mutant that moves the solver's flat-tier bound. The mutant that removes the fee's `min(2.95, price)` floor and the one that widens the "just over the line" note still survive.
- **Low:** the Texas seller fee tax and the USPS hazmat charge sellers have paid in full since 2026-10-19 are not computed. The `llms.txt` file carries calculator boilerplate. One comment had the break-even sentence inverted (fixed).

**vendor-change-evidence.** The reviewer is a third-party risk analyst who files dated evidence that a vendor's privacy policy or subprocessor list changed. A failed capture or out-of-order timestamps always come out "inconclusive", never "unchanged", which is the right failure mode. Its other gaps fall short of what that analyst needs:

- **Medium:** the pages promise "a source-linked diff" and "read the diff yourself". The report gives only the kind of change and two lengths, never the changed text. It also has no content hash and no whitespace or line-ending normalisation, so a CRLF-only re-capture reports a change. Both are under "Known gaps" in the README.
- **Medium:** the snapshot's url, capture time and fetch status went into `innerHTML` unescaped, so a pasted snapshot could inject markup. **Fixed in this PR**, with a test that renders a hostile snapshot.
- **Medium:** a zone-less timestamp crashed the CLI. The browser read the same timestamp as the viewer's local time, so its verdict changed between New York and Kolkata. **Fixed in this PR:** both engines now require a time zone, and both have tests.
- **Medium:** the comparison is written twice, in `evidence.js` and `vendor_change.py`, and no test checks that the two agree. They already count emoji text differently. The CLI's text output also omits the URL and capture time.
- **Low:** one page says "ten words added" where the example adds two words, ten characters.

The venture also overlaps two siblings, `vendor-change-watch` and `vendor-watch`. It is a free prototype with no paid product behind it.

## What changed since the last round

Round 114 also found 0 of its 2 sampled subjects at the bar, and the sampled share stays at about 9%. Two patterns from earlier rounds came back:

- A comparison page said more than the engine behind it. The Poshmark claim was the reverse of the tool's own result, and the vendor page promised a diff that does not exist. Both fall in the `overclaim` category, which a test reading the pages against the engine would have caught.
- Verification is the most common gate to bind, and it bound in both subjects again: 6 of 10 seeded bugs survived.

Neither subject is the front door to a ranked bet, so their remaining defects stay in the queue for a fix session (`ventures/CLAUDE.md`, "Product-first default").
