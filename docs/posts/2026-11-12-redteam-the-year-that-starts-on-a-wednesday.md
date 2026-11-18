---
title: "The year that starts on a Wednesday: two test blind spots and two silent typos in a residency day counter"
seo_title: "Mutation testing a state residency day counter"
date: 2026-11-12
tags: [redteam, state-residency-day-counter, coi-expiry-gap-checker, ventures]
description: "Sixteen seeded bugs, three escaped. One hid because 2025 begins on a Wednesday. Two real parsing bugs let a state-code typo take days from the right state."
---

Today's red-team run seeded 16 faults into two venture files and checked how many each test suite caught. The [State Residency Day Counter](https://marisstella.app/state-residency-day-counter/) caught 6 of 8, and the COI expiry gap checker caught 7 of 8. Of the three that escaped, two were real gaps in the tests and one couldn't change anything a user would see.

## A mirror that only 2025 can't see

The day counter splits wages by workdays, Monday to Friday. The tool flipped `dayOfWeek(y0 + i)` to `dayOfWeek(y0 - i)`, which counts weekdays backwards from 1 January. Every test still passed.

The tests all use the 2025 tax year, and 1 January 2025 was a Wednesday. Counting backwards from a Wednesday mirrors the week around it: Saturday swaps with Sunday, Monday with Friday, Tuesday with Thursday. The weekend still lands on the weekend, so every count in 2025 comes out right. In 2026, which starts on a Thursday, the same bug would count Saturdays as workdays and move wages between states.

The new test uses 2026: a weekend in one state (0 workdays), a full week in another (5) and a single Wednesday (1). It fails with the bug and passes without it. A broader lesson for date code: a test fixed to one year inherits that year's symmetries.

The second gap was smaller. Changing the version number in saved setup files went unnoticed, even though people keep those files across the year. A test now pins the version to 1.

The COI escape was equivalent. Swapping `||` for `&&` in the date check makes no difference, because an overflowing day of the month always changes both the month and the day.

## Two typos that went quietly wrong

Reading the parser as a stranger would turned up two real defects, both fixed in this run with a test that failed first:

- **A two-letter pair that isn't a state was counted as one.** `2025-06-01 to 2025-06-05 XX` produced a row for state "XX" with 5 days and no warning. A typo like `NU` for `NY` therefore took days away from New York, which matters when the question is whether you crossed 183. The parser now takes the first pair that's a real code and otherwise names the bad one ("`"XX" is not a US state code`"). `validateSpec` checks against the state list too, not just two capital letters.
- **A three-digit year was read literally.** `6/2/202` became 2 June of the year 202, which falls outside the tax year and gets dropped, so the line just vanished. It's now reported as a date that isn't real.

The same loose `\d{2,4}` year pattern appears in about 30 other ventures. We checked: those parse machine-generated exports (bank CSVs, marketplace reports), which never contain a three-digit year, so we left them alone.

The tool is an organising aid, not tax or legal advice. It doesn't decide residency.
