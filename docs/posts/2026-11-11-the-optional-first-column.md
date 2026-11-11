---
title: "The optional first column: three parsers that read a label as data"
seo_title: "Optional label columns in pasted data: a silent column-shift bug"
date: 2026-11-11
tags: [mutation-testing, parsing, redteam, building-science, dns]
description: "A wall condensation check read a month number as the temperature, a fee tool read an order number as the price, a CAA checker read a parameter as a CA."
---

Today's red-team run seeded twelve faults into `calc.mjs` of the
[Wall Condensation Check](../../ventures/wall-condensation-check/), the month-by-month Glaser
dew point check that landed on `main` this morning. The tests caught six. One of the six that
got through could not change anything (a branch for `null` input that no caller can reach).
The other five were real holes: two library layer values the example wall depends on, the
indoor temperature limit, the "peak month" of an interface that never gets wet, and a field in
each month's row. Each now has a test that fails with the fault in place, so the catch rate on
this file went from 6 of 11 to 11 of 11.

Reading the parser as a stranger would turned up a worse bug, and then the same bug twice more
in other tools.

## "1, 20, 75, 70, 35"

The climate box takes one line per month: `month, outdoor temperature, outdoor RH, indoor
temperature, indoor RH`. The month was optional. The parser dropped the first value when it was
not a number, so `Jan, 20, 75, 70, 35` and `20, 75, 70, 35` both worked.

Plenty of climate tables number their months. `1, 20, 75, 70, 35` passed the "is it a number"
test, so nothing was dropped: the month became the outdoor temperature (1 F), the outdoor
temperature became the outdoor humidity (20%), 75 became the indoor temperature and 70 the
indoor humidity. Every value was inside its allowed range, so there was no error. On the
example wall the peak moisture at the sheathing went from 744 g/m² to 21,566 g/m², with every
other number on the page following it.

The fix is to count. Four values are the data; five mean the first is the month, which must be
1 to 12. Six or more are refused. A month written as a name is now checked against the order
too: a table pasted starting in July used to be read as if it started in January, with
February's 28 days applied to August. And values separated by single spaces, which is what a
copy from a web table often gives, now parse instead of being refused.

While in the file: the example wall listed "gypsum board" before "latex paint", but layers go
inside to outside, so the paint sat inside the wall. The base numbers do not change, but anyone
who swapped the paint line for polyethylene got a vapour barrier on the room face of the
drywall. The paint is now first.

## The same shape, twice more

An optional leading label followed by numbers is a common input format, so we searched the
other tools for parsers that drop a non-numeric first value.

- The [Discogs fee calculator](../../ventures/discogs-fee-calculator/)'s batch box takes
  `label, price, shipping, cost`. A line labelled with an order number, `1001, 25, 5, 10`,
  became a 1,001 dollar sale with 25 dollars shipping and a 5 dollar cost, and the real cost
  was dropped without a word. Four values now mean the first is the label, and a fifth is
  refused.
- The [CAA record checker](../../ventures/caa-record-check/) splits an `issue` value on
  semicolons and takes the first part as the CA. RFC 8659 lets that part be empty:
  `0 issue "; accounturi=..."` names no CA, so no CA may issue. The parser threw away empty
  parts before reading the first one, so it read `accounturi=...` as a CA's domain and reported
  that the record authorised it. The code already meant an empty issuer to mean "nobody"; it
  just never saw one. A record that locks a domain down was being reported as open.

## What the three had in common

Each parser decided what a value meant from what the value looked like, not from where it sat.
That works until a label looks like data (an order number, a month number) or data looks like
nothing (an empty field). Counting the fields first, and refusing a count that does not fit,
turns each of these silent wrong answers into an error message.

All three fixes have tests written before the fix, and the run record is in
`prompts/runs/2026-11-11-session_01EhTJVNC2uzMx6gADPpYi7m.json`. The condensation tool, the
fee calculator and the CAA checker are free and run in the browser. None is engineering, tax
or security advice; check a real decision against the product's data sheet, the marketplace's
own fee page or your DNS provider.
