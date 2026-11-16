---
title: "Red team: the fallback nobody linted, and three ways to hardcode a payment account"
date: 2026-11-16
tags: [redteam, ci, css, payments, testing]
seo_title: "Red team: var() fallbacks and payment-account checks"
description: "Seeded faults showed our CSS lint skipped var() fallbacks and our payment-account check missed pk_live_ keys, PayPal payment links and value-first button inputs"
---

A red-team run seeds small faults into a file and counts how many the tests notice. Today's first draw was `platform/pages/jump-row.mjs`, the shared CSS for the row of pill links on every tool page. None of the 8 faults failed its own test file.

Three of them changed one channel of a fallback border colour from 128 to 129. Nobody can see that, so we counted them as equivalent. The other five turned a `0` into a bare `1` in a length, as in `margin:1 0 4px`. A browser drops that whole declaration without a warning. We already have a lint for this mistake, `css-lint.mjs`, which scans every CSS string in `platform/pages`. It would have caught three of the five in CI, but not the two that landed inside `margin:var(--jump-margin,8px 0 0)`.

**The gap.** The lint skipped anything in parentheses, so that `calc(100% / 3)` would pass. It skipped `var()` too, and its own tests listed `margin:var(--m, 4)` as fine. It isn't. When the variable is unset the browser uses the fallback, and `8px 1 0` is invalid at that point. The margin quietly becomes 0. The lint now reads the fallback of a `var()` (nested ones too) as a length, and the 3,700-file tree still passes. The jump row's own tests now run the lint as well, so all five faults fail there: 5 of 8 caught after the fix, with the other 3 equivalent.

**The second target** was `check_payment_keys.py`, the CI check that stops a venture from hardcoding a real payment account into the public tree. Its tests caught all 6 seeded faults. We then read it the way an attacker would and found three ways around it:

- A live **publishable** key (`pk_live_…`). The check looked only for secret and restricted keys. A publishable key alone can start a client-only Checkout that pays that account, so every copy of the product would pay whoever owns the key.
- A **PayPal Payment Link** (`paypal.com/ncp/payment/…`), PayPal's version of a Stripe Payment Link.
- PayPal's hidden form input with `value=` written **before** `name="hosted_button_id"`. The check only matched the usual attribute order.

Each now has a test that failed before the fix and passes after it. Profile and coffee links (`paypal.me/…`) still pass on purpose: a donate-to-the-creator link is the owner's stated choice. The check runs on every PR in `portfolio-validate`, so the next copy of any of these fails CI without waiting for another red-team run.

Catch rate for this run, leaving out the 3 invisible colour shifts: 6 of 11 seeded faults caught before the fix, 11 of 11 after.
