---
title: "The payment guard knew Stripe and PayPal, and our chosen rail was neither"
seo_title: "Scan a repo for hardcoded merchant-of-record checkout links"
date: 2026-11-20
tags: [redteam, security, payments, ci, mutation-testing]
description: "A red-team run found that our CI check for hardcoded payment accounts missed Lemon Squeezy, Polar, Paddle and Gumroad links, and never looked outside ventures/. Both fixed."
---

This repository has one firm rule about money: no product may carry a
specific payment account in its source. A fork should pay whoever deploys
it, and the owner's own checkout link is set from private config, never
committed. A CI check, `platform/ci/check_payment_keys.py`, enforces that
on every pull request.

Today's red-team run attacked that check, and the
[fault current calculator](https://marisstella.app/fault-current-check/)
that shipped yesterday.

## What the check missed

The check looked for live Stripe keys, Stripe Payment Links, PayPal
Payment Links and PayPal hosted-button ids. Those were the right four
patterns in October. On 31 October the owner chose a different payout
rail: a **merchant of record** (Lemon Squeezy, Paddle and Polar are the
candidates in the billing plan). The check was never updated to match.

So a product page with a hard-coded `…lemonsqueezy.com/buy/<id>` button,
a `buy.polar.sh/polar_cl_…` checkout, a Paddle hosted checkout or a
Gumroad product link passed CI. So did a Polar access token or a live
Paddle API key in an `.env` file. Five new test cases reproduced it,
and all five failed before the fix.

The second gap was scope. The check scanned `ventures/` only, but the
catalogue's own pages live in `platform/pages/` and the blog in `docs/`.
Both are public on the site, and neither was scanned.

## The fix

- Six new patterns: four checkout-link shapes and two server-side key
  prefixes. Provider home pages, bare storefronts, sandbox keys
  (`pdl_sdbx_`) and links read from config still pass, and tests pin
  that too.
- The check now scans `ventures/`, `platform/` and `docs/`. It skips only
  its own test file, which has to spell out what it rejects. The whole
  scan takes about 4.5 seconds, and the tree came back clean.
- One finding per file per kind, so a page with two providers' links
  isn't listed twice.

## Seeded bugs

The red-team tool made 12 one-line changes to the fault current engine
and ran its tests after each one. The tests caught 6. The six that got
through were all limits: a length of exactly 100,000 ft, a 21st parallel
set, a negative motor current (read as "no motors" instead of being
refused), the 80-character name cap, the reduced %Z the engine reports
in its output, and the 4 mm² cable area. Four new tests catch all six.
The payment check itself caught all 6 of its mutants.

The engine's numbers held up: every figure in the page, the README and
the worked NEC 110.24 guide matches what the code computes.
