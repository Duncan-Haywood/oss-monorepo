---
title: "Checking a sales tax return against 150 random ledgers"
date: 2026-10-27
description: "A seeded property test runs the sales tax return on 150 random ledgers at three frequencies and checks every state due-day rule."
tags: [ai-bookkeeper, testing, sales-tax]
---

The ai-bookkeeper sales tax return was tested on hand-written invoices. Today
it also gets a seeded property test (`salestaxreturn-property.test.mjs`): 150
made-up ledgers of invoices and credit notes with up to three tax
jurisdictions each, run at monthly, quarterly and annual frequency.

What it checks: the tax over all periods equals the signed tax lines typed in,
whatever the frequency; payable is tax minus discount; period totals equal the
sum of their rows. A second test runs every state's due-day rule for monthly,
quarterly and annual periods and checks the due date falls after the period
and, once moved, on a weekday that is not a federal holiday.

It passed first time, and a deliberately broken credit-note sign made it fail,
so it does catch something. It does not check any state's actual due date:
state tax sites refuse this session's network, so those dates still rest on the
sources named in `salestaxreturn.mjs`. Check your own state notice.
