# Mobile Signing Agent Day Picker

Saying yes in the order the offers arrive, or taking the biggest fee first, fills a notary's day with the wrong signings. Paste
the day's requested signings (price, materials, minutes on site, the window the customer gives, where they are) and get
the exact set and order of signings with the highest profit for the day, the drive and idle time it implies, what each
signing it turns down would need to pay, and what first-come and highest-fee-first booking leave behind. Browser
page or zero-dependency CLI.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/mobile-signing-agent-day-picker/

```
node cli.mjs plan signings.csv --start 08:00 --end 17:00 --hourly 35 --per-mile 0.70 --json
cat signings.csv | node cli.mjs plan - --speed 25
```

Input: rows of `name,price,materials,service_min,earliest,latest_start,east_miles,north_miles[,note]`. See `fixtures/signings.csv`.

## How it decides

A signing earns fee less print and supply cost less your hourly cost of its appointment minutes. Each drive costs a
per-mile amount plus the hourly cost of the drive minutes; drive minutes are straight-line miles x circuity /
speed. Waiting for a window to open is free. You leaves the home base at shift start and must be home by shift
end. The best day is found exactly by dynamic programming over (set of signings done, last signing), keeping every
non-dominated (finish time, profit) pair per state; the tests check it against every ordering of every subset.
A declined signing's break-even price is exact: its price plus the gap between the best day and the best day forced to
include it.

## What it is not

Not a forecast and not a routing service: one signing agent, one home base, straight-line distance times your circuity factor,
up to 14 signings. Traffic, a second technician, signings that must follow each other and cancellations are not modelled.
Not financial or business advice, no warranty. It does not know about signing-service or title-company agreements, and a
borrower waiting on a closing comes before any optimum.

## Privacy

No network call, no account, no analytics vendor. The browser page analyses pasted text locally and never
uploads it.

## Licence

MIT, no warranty. Support is optional: <https://github.com/sponsors/Duncan-Haywood>.
