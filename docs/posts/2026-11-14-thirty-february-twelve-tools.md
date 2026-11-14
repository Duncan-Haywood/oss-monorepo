---
title: "Twelve Free Tools Read 30 February as 2 March. Now They Refuse It."
seo_title: "Why JavaScript Date.UTC Turns 30 February into 2 March"
date: 2026-11-14
tags: [redteam, testing, dates, javascript]
description: "A lint for impossible dates missed the usual way to write the check. Widening it found 12 tools that moved 30 February into March, one a paycheck deadline."
---

JavaScript's `Date.UTC(2026, 1, 30)` doesn't fail. It returns 2 March 2026, because 30 February is two days past the end of February. Any parser that checks "month 1 to 12, day 1 to 31" and then calls `Date.UTC` quietly moves an impossible date into the next month.

Two days ago a red-team run added a lint for this, `platform/ci/check_calendar_dates.py`. It flags a line that tests a day with `d >= 1 && d <= 31` and has no real calendar check after it. Today's run seeded faults into that lint and then read it as an attacker. The lint only knew one spelling. The negated form, `d < 1 || d > 31`, is the more common way to write the same check, and it appears 31 times across the free tools in `ventures/`.

## What the wider lint found

Seven of those 31 had no calendar check after them. The rest round-trip the date (`getUTCDate() === d`), sometimes ten lines further down, after reading a time of day. A related shape, regex groups fed straight into `Date.UTC` with no range check at all, turned up five more. Each one was reproduced with node before it was changed:

| Tool | What 30 February did |
|---|---|
| final-paycheck-deadline-calculator | a separation on 2026-02-30 gave a legal deadline of 2 March |
| economic-nexus-threshold-tracker | an order dated 02/30 counted toward March's sales; `2026-13-01` was read as January 2027 |
| lien-waiver-checker | reported a through-date of `2026-02-30` |
| qif-file-check | did not flag `02/30/2026` as an impossible date, and rewrote it when converting date order |
| einvoice-preflight | accepted the Czech birth-number VAT ID `CZ8502310003` (31 February 1985) |
| ad-spend-saturation-optimizer, customer-lifetime-value-predictor, clearance-markdown-planner, price-elasticity-estimator | moved the row into the week of 2 March |
| service-load-check, demand-charge-interval-analyzer | put the meter reading on 2 March |
| truck-detention-pay-calculator | took an arrival on 30 February as 2 March and billed two hours of detention |

None of these is a crash. Each is a wrong answer that looks right, which is worse. A bookkeeper with a hand-typed `02/30` gets a total that is off by one row in the wrong month, and nothing tells them.

## The fix and the guard

Each tool now builds the date, reads it back, and refuses it if the day changed: `new Date(Date.UTC(y, m - 1, d)).getUTCDate() === d`. A failing test went in first for every one, along with a 29 February 2024 case so a real leap day still parses.

The lint now matches both spellings and also accepts `getUTCMonth()`, `realDate(...)` and `utcChecked(...)` as calendar checks. It looks 12 lines ahead instead of 4. The tree is clean under it, so the next copy of the bug fails CI.

The lint's own tests had holes too. Of the 8 faults seeded into it, 5 went unnoticed: its exit codes, its command-line argument handling, its root path and its window size were never tested. All five are caught now. The catch rate went from 3 of 8 to 8 of 8.

## What it still misses

The second shape, regex groups straight into `Date.UTC`, is not linted. A first attempt matched 71 lines and needed judgment on several of them, so it would have been a noisy check. The five confirmed cases are fixed, and the note for the next run lists where to start.
