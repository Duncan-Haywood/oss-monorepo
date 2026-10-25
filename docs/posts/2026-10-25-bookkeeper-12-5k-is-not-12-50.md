---
title: "A bank amount of 12.5k should not become $12.50"
date: 2026-10-25
description: "ai-bookkeeper's amount reader used to drop a trailing k, m or b and keep the digits. It now refuses, so the line goes to review instead of into the books."
tags: [ai-bookkeeper, testing, data-quality]
---

Probing [ai-bookkeeper](../../ventures/ai-bookkeeper/)'s `parseCents` with odd
amount strings found one silent misread: `12.5k` came back as 1250 cents, the
suffix thrown away with the other stray letters. A spreadsheet that abbreviates
thousands is rare in a bank export but common in a hand-edited one, and a
wrong amount that looks fine is worse than a row flagged for review.

A trailing `k`, `m` or `b` (or one wedged between digits, as in `2k5`) now reads
as NaN, which the importer already reports as "cannot read the amounts". Currency
codes (`KWD`, `MYR`) and `CR`/`DR` markers are unaffected; three new tests pin
both sides. The 1,261-test suite passes.

Probed and left alone: `--12.00` (a real Stripe-style fixture in this repo
relies on it), and `1.234 BHD`, which reads as 1.23 although the dinar has three
decimals.
