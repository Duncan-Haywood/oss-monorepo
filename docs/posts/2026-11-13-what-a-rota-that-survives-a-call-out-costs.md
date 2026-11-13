---
title: "What a rota that survives a call-out costs: $5.82, one shift changing hands"
seo_title: "Pricing call-out slack into a staff schedule: measured on five teams"
date: 2026-11-13
tags: [ventures, shift-roster-builder, scheduling, optimization]
description: "Pricing call-out risk inside the roster search: on one team it removed every open hour a week of sick calls left, for $5.82; on three of five, nothing paid."
---

A weekly staff roster is usually scored on one week: the pay, the overtime,
the fairness, the shifts it leaves open. Then on Tuesday someone calls out
sick and the manager finds out whether the roster they posted was a good one.

The shift roster builder could already pick between rosters that tie at the
best score, posting the one a single call-out hurts least. That tie-break
costs nothing, which is also its ceiling: on four of five test teams the first
roster found was already the steadiest, so it changed nothing. The open
question was the other half — what could a manager buy by *giving something
up*?

**The quantity has to be cheap to ask.** Measuring a roster's real exposure
means playing every person-day as a call-out and rebuilding the week each
time: about 20 seconds on a seven-person café. Nothing like that can sit
inside a search. So the search gets the quickest version of the question:
for each person-day, if this person called out, could someone else take each
of their shifts that day with every hard rule holding and nobody else moved?
If not, the day is "at risk" and its hours are counted. That check is
milliseconds, and it is a strict over-count — it ignores the hand-over chains
and rebuilds the real measurement tries.

**Then put a price on it.** `--cover-price 100` means "I will pay up to $100
of pay and fairness for each hour of risk you clear." The build hill-climbs on
score plus price times risk hours, one hand-over or swap at a time. Open hours
cost $100,000 an hour inside the same score, so no sane price trades coverage
away; what it trades is money and evenness.

On the retail template one shift changed hands. It cost $5.82 of score —
$3 *less* payroll, the rest in the fairness penalty — and took the roster's
measured call-out exposure from 24 hours to 0. Played through 20 seeded weeks
of call-outs at the rates one real firm's timesheet export showed, the priced
roster left **no** open hours where the default left 6 (sick-only rate, 1.0%
of person-days) and 18 instead of 30 at the all-leave rate (8.4%), with fewer
changes to other people and lower short-notice premiums at the lower rate.

**On three of five teams, nothing paid for itself.** On the café every single
person-day is at risk and no one hand-over or swap changes that: nobody is
free behind anybody. The salon and clinic the same. And on the fifth team the
move the price bought cleared 3 risk hours, cost $15 of payroll, and changed
the measured exposure not at all — the honest reading of a surrogate that
over-counts. A move can clear risk hours that no call-out would ever have
opened.

That is why the price is the manager's to set and off by default. The tool's
job is not to decide that steadiness is worth $100 an hour; it is to say what
the roster it is about to post would cost at that price, and to show, in the
notice under the grid, exactly what it bought: "1 shift changed hands to cut
the hours at risk from 81 to 54, at $5.82 of score."

The measurements, the sweep from $0 to $200 an hour at risk, and what is
*not* claimed are in the
[README](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/shift-roster-builder#paying-for-call-out-slack-exposure-priced-inside-the-build-2026-11-13),
with the harness in `eval/cover-price.mjs`. The tool is free, MIT, runs in the
browser with nothing uploaded: [Shift Roster Builder](https://marisstella.app/shift-roster-builder/).
