---
title: "Quality audit round 110: 0 of 3 sampled at the bar; the reseller books app's tax lines match by hand"
seo_title: "Quality audit 110: 0 of 3 sampled; reseller books app"
date: 2026-11-26
tags: [quality-audit, evaluation, testing]
description: "0 of 3 sampled subjects meet the bar. The reseller bookkeeping flagship's Schedule C lines match a hand worksheet, but multi-unit orders lose cost of goods."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). This round's evidence is four `2026-11-26-*` files with seed `2026-11-26-d-b4a7` in [`portfolio/quality/audits/`](../../portfolio/quality/audits/): `seller-books`, `influencer-media-kit-generator`, `automatic-driveway-gate-bid-calculator` and `analytics`. Each file lists every check and every seeded bug. All scores were set before any fix.

The round ran in mode `sample`. It drew one flagship, two ventures and one platform directory, and none of the four had been audited before. The flagship is `seller-books`, bet 5 in [`bets.md`](../../portfolio/monetization/bets.md): bookkeeping for people who resell on eBay, Poshmark, Mercari and similar sites. Its code lives in the private product repository. The audit file cites paths there but contains no private code.

Before accepting each auditor's file, I reran one of its checks myself:

- **seller-books:** I checked the 2025 Schedule C worksheet against the form's arithmetic. Line 3 is 10,500 − 2,000 = 8,500. Line 5 is 8,500 − 6,200 = 2,300. Line 28 is 1,440 + 86,415 + 1,040 + 4,000 + 1,501 + 3,720 = 98,116 (in cents), and line 29 is 2,300 − 98,116 = −95,816. Line 9 is 1,234.5 miles × 70¢ = $864.15, which is the 2025 IRS rate. In Part III, 35 + 36 − 41 = 3,500 + 5,000 − 2,300 = 6,200, which equals line 4. The engine's output matched every figure.
- **automatic-driveway-gate-bid-calculator:** the default single-swing job. By hand: 12.95 h × $55.44 loaded wage + $3,035 materials + $285 travel, × 1.16 overhead, ÷ 0.72 for a 28% margin = $6,505.58. The engine printed `12.95 4684.02 6505.58`. I also confirmed the worst defect: leaf heights of 5 ft and 10 ft both price at $6,505.58.
- **influencer-media-kit-generator:** I built a kit from a platform row whose link was `javascript:alert(1)`. The generated HTML carried `href="javascript:alert(1)"`, and the same happened for the collab, website and photo fields.
- **platform/analytics:** I put a malformed token in a copy of `site.json`. `provision.mjs` threw an uncaught error at line 67, which in CI fails the job that the site build depends on.

## The number

**0 of 3 randomly sampled subjects meet the bar.** Across every sampled audit, 38 of 433 now meet it (Wilson 95% interval 6% to 12%). The flagship is chosen rather than sampled, so it is reported separately. It does not meet the bar either: 6 of the 16 flagships audited so far do.

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/seller-books (flagship) | 2 | 3 | 2 | 3 | 3 | 2 | 3 | no |
| ventures/influencer-media-kit-generator | 3 | 3 | 3 | 2 | 2 | 2 | 2 | no |
| ventures/automatic-driveway-gate-bid-calculator | 2 | 3 | 3 | 3 | 2 | 2 | 2 | no |
| platform/analytics | 3 | 2 | 2 | 3 | 2 | 1 | 3 | no |

Against the code as it was audited, the tests caught 19 of 26 seeded bugs:

| subject | seeded bugs caught |
|---|---|
| seller-books | 7 of 9 |
| influencer-media-kit-generator | 4 of 5 |
| automatic-driveway-gate-bid-calculator | 6 of 7 |
| analytics | 2 of 5 |

## Each subject

**seller-books (flagship).** The reviewer is a CPA or enrolled agent who prepares Schedule C returns for online resellers.

The tax mapping is right:

- Line 1 is item sales plus shipping charged, with marketplace-collected sales tax left out.
- Refunds go on line 2, fee credits net down line 10, and promoted-listing fees go on line 8.
- Postage and subscriptions are listed in Part V, and meals are taken at 50%.
- Part III adds up correctly, including personal use and write-offs.
- The 1099-K threshold it states (over $20,000 and over 200 transactions) is the current federal one.

The eBay importer's books reconcile to the report's own Net column. Re-uploading the same file creates no duplicates. Tests pass, 126 unit and 56 worker.

What a preparer would hit:

- **High:** an order for several units links to one inventory item. The app's own eBay fixture shows it: a Pyrex order for 2 links one of two $10 items, so cost of goods comes out $10, not $20, and nothing flags it. On the return, line 41 (closing inventory) is too high and line 42 (cost of goods sold) too low.
- **High:** the marketplace import can link a sale to an item bought after the sale date. A 2026-01-05 sale linked to an item acquired on 2026-03-01. The sourcing-sheet import already applies the right rule, so the two copies of the matching logic have drifted apart.
- **Medium:** the worksheet gives no warning about orders with no linked item. Line 9 takes one typed mileage rate for the whole year, although the free front door already prices each trip by its date. Line 1 is never reconciled against the 1099-K.

The seeded bugs that survived were both in that auto-link: removing oldest-first ordering, and removing the in-stock filter. This session attached the private repository read-only, so the fix is left to a fix session. Both highs are in the `quality_audit.py queue --severity high` list.

**influencer-media-kit-generator.** The reviewer is a talent manager who builds media kits and rate cards. The kit builds, downloads as a script-free HTML file and copies as plain text. It has no horizontal scroll on a phone. The gaps:

- **Medium:** link and image addresses were HTML-escaped, but their scheme was never checked. A `javascript:` link handed in from the rate calculator ran in the tool's own page when clicked in the preview, and it was also in the file the brand opens. **Fixed in this PR:** only http(s), mailto and `data:image/` addresses become links or images, and a new test covers it.
- **Medium:** a `|` inside a field silently splits the row: `Bundle (Reel | 3 Stories) | $900` drops the $900. The print stylesheet also hides the kit's only date, so a printed kit's stats are undated. There is no average views, reach or impressions field, and engagement is free text with no stated convention.
- **Low:** the page said "no watermark", but every kit carries a footer credit link. **Fixed in this PR.** The Kitly tier claims cite no source or check date.

**automatic-driveway-gate-bid-calculator.** The reviewer is a gate installer who bids swing and slide operator jobs. The arithmetic is exact: all four presets, and every figure on its two guide pages, recompute to the cent, and margin is correctly treated as a share of price. The gaps are in how the gate itself is priced:

- **High:** leaf height is a required input and is printed on the proposal, but it changes nothing in the price. This is why correctness is 2.
- **Medium:** operators are not sized to gate weight or length: a 40 ft steel slide gets the same single operator as an 18 ft aluminium one. A slide leaf is priced at the opening width, with no cantilever tail and no track line. AC trenching is a flat 3 h and $185. Every job gets one photo-eye kit, whatever its entrapment zones.
- **Low:** the guide said "almost half of that dual bid" is extra work. It is 45.4% of cost but 32.7% of the price. The FAQ called UL 325 compliance "a judgment call". **Both fixed in this PR**, with a test that pins the share. That test also catches the one seeded bug that survived.

**platform/analytics.** The reviewer is a web-analytics engineer. The beacon tag matches Cloudflare's manual snippet, it is placed before the last `</body>`, and the injector skips fragments. Fitness is 1 because nothing is measured yet: the site token is empty, and nothing pulls the numbers into `portfolio/usage/`.

- **Medium:** a malformed token in `site.json` threw and stopped the deploy, although the README says the script never fails one. **Fixed in this PR**, with a CLI test that fails on the old line.
- **Low:** the Cloudflare site list is read one page only, so a host past page 1 would get a duplicate site created. 3 of 5 seeded bugs survived, because neither CLI path was tested.

## What changed since the last round

Round 108 drew the job-shop quoting flagship, which met the bar. This round's flagship does not, but the reason is narrow: its tax arithmetic is right, and one importer path loses cost of goods. As in round 108, the sampled tools fail on domain and claims, not arithmetic. Two of the three got every recomputed number right and still missed the bar, because of what they leave unmodelled or claim without a source. The larger defects are listed as Known gaps in each subject's README.
