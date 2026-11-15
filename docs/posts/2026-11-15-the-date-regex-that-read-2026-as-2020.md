---
title: "The date regex that read 2026 as 2020"
date: 2026-11-15
tags: [redteam, testing, open-source, ventures]
description: "A shift importer read 01/05/2026 as 2020, and 37 parsers read 2025-03-091 as 9 March. One missing (?!\\d) in 178 regexes, now fixed and linted."
---

Today's red-team run seeded 16 faults into two tools that people paste broker
and payout files into: the wash-sale checker and the Gumroad sales fee
analyzer. Their own tests caught 8 of the 16. The eight that got through
pointed at the same thing three times: the code that reads a date.

## Two ways a regex stops early

A typical parser in this repository starts like this:

```js
let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
```

Give it `2025-03-091` and it answers 9 March 2025. The day group takes `09`,
nothing after it says the next character may not be a digit, and the stray
`1` is ignored. A typo becomes a different, valid date with no message. In the
wash-sale checker a date that moves can move a sale into or out of the 30-day
window, which changes how much of a loss is allowed.

The US form had a sharper version of the same gap. The shift-roster
importer, which turns a schedule export from a paid scheduler into a list of
weekly shifts, read slash dates with:

```js
/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2}|\d{4})/
```

A regex alternation tries its options left to right. For `01/05/2026` the
`\d{2}` option matches `20`, the pattern ends, and the year is 2020. Every
four-digit slash date was read in 2020. From March to December 2020 and 2026
share weekdays, so a November test file looked right; 5 January 2026 is a
Monday and 5 January 2020 a Sunday, so January shifts landed a day off, and
every date in 2025 or 2027 would have.

## How many copies

One lint, `platform/ci/check_date_digit_boundary.py`, looks for a regex
literal that starts with a numeric date and lets a digit follow the last date
group: the literal ends there, or carries on with `.*` or only optional
pieces. It found 178 such regexes in 100 files under `ventures/`, including
37 copies of the ISO form above and 41 of an unbounded `MM/DD/YYYY`.

The fix is the same everywhere: `(?!\d)` after the last date group, and the
four-digit year listed first in an alternation, `(\d{4}|\d{2})(?!\d)`. A real
date never has a digit straight after its day or year, so no file that read
correctly before reads differently now; a date with a stray digit is refused
instead of guessed. Every changed venture's suite passed after the sweep.

The lint is a `check_*.py` that no workflow names, so `unwired_checks.py`
runs it on every pull request that touches `ventures/`: the next parser
copied from an old one fails CI instead of waiting for a red-team run.

## The other five

The remaining escaped faults were plain test gaps, each now covered: a month
of 13 accepted by one guard, a summary line above the header taken for the
header, a refund booked to an "all products" row instead of its own product,
the repeat-buyer share multiplied instead of divided, and a wash under one
dollar not counted as washed. After the new tests, 16 of 16 seeded faults
are caught.
