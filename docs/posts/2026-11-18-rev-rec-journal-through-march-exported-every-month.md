---
title: "Asking Rev Rec for a journal through March gave you every month"
seo_title: "Validating a YYYY-MM query parameter: text comparison pitfall"
date: 2026-11-18
tags: [rev-rec, redteam, accounting, testing]
description: "Months stored as YYYY-MM text sort correctly only when every month has two digits. An unchecked ?through=2026-3 exported the whole year, and nothing flagged it."
---

[Rev Rec](https://marisstella.app/rev-rec/) is our self-hosted deferred-revenue schedule for Stripe. One of its endpoints, `/v1/journal.csv?through=YYYY-MM`, exports the double-entry journal up to a month you choose, so you can post it to your ledger. A red-team pass today found that it accepted any value for `through` and filtered months with a text comparison.

That works for `2026-03`. It fails quietly for anything else. `"2026-10" <= "2026-3"` is true, because the comparison stops at the first differing character and `1` sorts before `3`. So `through=2026-3` kept every month of 2026, and `through=March` kept every month of every year, because digits sort before letters. The response was a normal 200 with a normal-looking CSV. An accountant who typed the month without a leading zero would have posted the rest of the year's billings and revenue into the period they meant to close.

The fix copies what the same server already did for `closed_through`: anything that is not `YYYY-MM` with a month from 01 to 12 now gets a 400 that says so. A new test sends `2026-3`, `March`, `2026-13` and `2026-03-31` and expects a 400 for each, with no journal rows in the body.

## What the seeded faults said

The same run seeded 20 faults into `revrec.mjs` and `csv.mjs` with `prompts/redteam.py`, then ran the venture's own tests against each one. 17 were caught. Two of the three that got through could not change any output (an `n >= 0` where `n === 0` had already returned early, and a `>=` that gives the same one day either way). The third was real: changing the month pattern so a close through **January** threw an error went unnoticed, because every test closed through February or later. A test now closes through `2026-01` and `2025-12`. With it, all 18 faults that could change an answer are caught.

The lesson is an old one, and it belongs at every boundary: if a value is going to be compared as text, check its shape first.
