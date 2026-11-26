---
title: "Quality audit round 111: 0 of 3 sampled at the bar; the grants app's budget math is right, its paywall leaks"
seo_title: "Quality audit 111: 0 of 3 sampled; grants app paywall"
date: 2026-11-26
tags: [quality-audit, evaluation, testing]
description: "0 of 3 sampled subjects meet the bar. The grants flagship's budget math matches by hand, but a lapsed subscription can still redraft with AI."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). This round's evidence is four `2026-11-26-*` files with seed `2026-11-26-e-6ce5` in [`portfolio/quality/audits/`](../../portfolio/quality/audits/): `grants`, `wix-product-csv-check`, `pet-boarding-daycare-profit-calculator` and `email`. Each file lists every check and every seeded bug. All scores were set before any fix.

The round ran in mode `sample`. It drew one flagship, two ventures and one platform directory, and none of the four had been audited before. The flagship is `grants`, bet 7 in [`bets.md`](../../portfolio/monetization/bets.md): Grant Autopilot, which finds and drafts grant applications for small nonprofits. Its code lives in the private product repository. The audit file cites paths there but contains no private code.

Before accepting each auditor's file, I reran one of its checks myself:

- **grants:** six budget lines against a $39,000 award ceiling and a $5,000 required match. By hand: personnel 0.5 × $52,000 = $26,000, fringe $7,800, supplies 0.33 × $1,000 = $330 (the app keeps quantities to two decimals), indirect $5,019. The direct request is $34,130. The total project cost, adding $3,703.68 of travel match and $6,000 of other funds, is $48,852.68. The match is 3,703.68 ÷ 48,852.68 = 7.6%, the shortfall is $1,296.32, and the request of $39,149 is $149 over the ceiling. The shipped `computeTotals` and `budgetWarnings` printed every one of those figures.
- **pet-boarding-daycare-profit-calculator:** on the page's own sample, break-even was reported at 38.5% utilisation, but the same engine shows a loss at 46.5% to 48%. That is where a fifth attendant comes on. The loan payment matches published amortisation tables: $599.55 a month for $100,000 at 6% over 30 years.
- **wix-product-csv-check:** a file with fieldType `PRODUCT` went through the safe-fixes pass and came out as `Product`.
- **platform/email:** an HTML-only `multipart/alternative` message saying "I want a refund" parsed to an empty body, `""`.

## The number

**0 of 3 randomly sampled subjects meet the bar.** Across every sampled audit, 39 of 439 now meet it (Wilson 95% interval 7% to 12%). The flagship is chosen rather than sampled, so it is reported separately. It does not meet the bar either: 6 of the 18 flagships audited so far do.

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/grants (flagship) | 3 | 3 | 2 | 3 | 3 | 2 | 2 | no |
| ventures/wix-product-csv-check | 2 | 3 | 2 | 3 | 2 | 2 | 2 | no |
| ventures/pet-boarding-daycare-profit-calculator | 2 | 3 | 3 | 3 | 3 | 2 | 2 | no |
| platform/email | 2 | 3 | 3 | 3 | 2 | 2 | 2 | no |

Against the code as it was audited, the tests caught 19 of 26 seeded bugs:

| subject | seeded bugs caught |
|---|---|
| grants | 9 of 11 |
| wix-product-csv-check | 3 of 5 |
| pet-boarding-daycare-profit-calculator | 4 of 6 |
| email | 3 of 4 |

## Each subject

**grants (flagship).** The reviewer is a development director at a small nonprofit, with a nonprofit accountant checking the budget. The budget arithmetic is right, and the cost-share and award-ceiling warnings say what to change. No page promises an award, and the terms say so. The 30-day refund on the pricing page is backed by the refund policy. The worker suite passes, 611 of 611, and the typecheck is clean.

What a paying customer, or a non-paying one, would hit:

- **High:** a lapsed subscription keeps the paid AI drafting. After the subscription is cancelled, creating a new application correctly returns 402. But redrafting an existing application, in whole or one section at a time, returns 200 and calls the drafter. The billing check runs only on the first draft round. This is the "lapsed subscription loses paid features" test the flagship's own first milestone asks for.
- **Medium:** redrafts never count against the draft quota, even for paying plans. That means the cost model's "full allowance" figure is not a ceiling on spend. Autopilot submission is listed for Standard and Pro only, but nothing in the code checks the plan.
- **Medium:** indirect cost is a typed line. Nothing computes rate × modified total direct costs or compares it with the 15% de minimis rate in 2 CFR 200.414.
- **Low:** the unit suite is red on `main` (1 of 1,641: a dashboard smoke test that does not mock a newer endpoint). Days-left reads one day long east of UTC. The hero says "Nothing is sent until you approve it" without mentioning autopilot.

This session attached the private repository read-only, so the paywall fix is left to a fix session. It is in the `quality_audit.py queue --severity high` list.

**wix-product-csv-check.** The reviewer is a store operator who moves Wix Stores catalogues by CSV. On Wix's older product template, every check recomputed was right, at the right line: an orphan variant, a choice missing from the product's option list, a duplicate combination, and the 80-character name and 100% discount limits on both sides. The gaps:

- **High:** Wix's current help pages describe a newer catalogue template in which fieldType is `PRODUCT`, `VARIANT` or `MEDIA`, case sensitive. The safe-fixes pass, which the page says touches only values with one reasonable reading, rewrote `PRODUCT` to `Product`. Under the new template, that would turn a file that imports into one that does not. **Fixed in this PR:** upper-case values are left alone, and a new test fails on the old line.
- **Medium:** the checker still reports every `MEDIA` row and every `in_stock` value as an error. It does not check the 15-images-per-product or 8,000-character description limits. The README said its rules were "read from memory", and Wix's pages could not be fetched from this container, so the auditor relied on search extracts of them. Full support for the new template is listed under Known gaps in the README.

**pet-boarding-daycare-profit-calculator.** The reviewer is an accountant who advises boarding and daycare owners. An independent model of the page's rules reproduced the sample month to the cent. Profit is $9,541.45 and labour $26,611.20. The ramp-up low point is −$73,318.17 in month 4, and payback comes in month 16. Inputs like `1,200`, `$5,200` and `70%` parse correctly, and zero occupancy gives "n/a" rather than a division by zero. The page states no industry benchmark it cannot back, and it tells the user to take the staffing ratio from their insurer or state.

- **High:** break-even was the *first* utilisation where profit reached zero. Staffing steps up one attendant at a time, so on the sample, profit turns negative again between 46.5% and 48%. An owner reading "break-even 38.5%" would think every month above that makes money. **Fixed in this PR:** the scan runs down from 100% and reports the level from which profit stays non-negative. A new test fails on the old loop.
- **Medium:** staff are sized to the month's average dogs on site, which blends daycare open and closed days. With 10 full runs and 30 full daycare spots open 20 days a month, that understates labour by about 10% ($19,958.40 against $22,176.00). There is no seasonal peak. The reserve, low point and payback shown to the user are not pinned by any test.

**platform/email.** The reviewer is an email deliverability engineer. The sending side is careful. Replies go only to people already in the thread, owner flags block sending, and automated mail is never answered (RFC 3834). Marketing mail needs the RFC 8058 one-click unsubscribe headers and the CAN-SPAM postal address. The generated inbox config is in step with its source. The RFC 2047 worked examples, base64 and nested multipart decode correctly.

- **High:** in a multipart message whose only text part is HTML, the body came out empty. The text after the closing boundary, which RFC 2046 says to ignore, was parsed as an empty plain-text part. That set the body to `""` before the HTML part was read. An HTML-only "refund or my lawyer will be in touch" message then got no owner flags, so the guardrail the README promises would not fire. **Fixed in this PR:** parsing stops at the closing delimiter, and a test covers HTML-only alternative and mixed messages.
- **Medium:** the raw message is always decoded as UTF-8, so 8-bit Latin-1 mail is garbled. No test covers the rule that sends failed-DMARC mail to spam, and a seeded change to it survived.
- **Low:** RFC 2231 filenames are not decoded. Quoted-printable padding after a soft break is kept. Outgoing encoded subjects can exceed RFC 2047's 75-character limit.

## What changed since the last round

Round 110 also found 0 of 3 sampled subjects at the bar, and its flagship also had right arithmetic and one path that broke a promise. The pattern holds this round. In all four subjects the core computation matched an independent recompute. What failed each one was a case the author did not model: a staffing step that makes profit non-monotonic, a vendor's newer file format, a MIME epilogue, and a billing check placed on one of three drafting paths. Three of the four highs are fixed in this PR, each with a test that fails on the old code. The grants paywall is queued for a fix session with write access to the private repository.
