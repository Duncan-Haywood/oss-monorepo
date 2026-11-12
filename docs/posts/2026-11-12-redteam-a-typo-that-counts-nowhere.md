---
title: "A typo that counts nowhere: two tax tools, sixteen seeded faults, one silent under-count"
seo_title: "State residency day counter: a mistyped state code now gets a warning"
date: 2026-11-12
tags: [testing, mutation-testing, state-residency, 1099, redteam]
description: "Sixteen seeded faults in two tax tools, nine caught. A manual hunt found worse: a mistyped state code that dropped days without a word."
---

Two tools in the catalogue changed on `main` this week: the
[state residency day counter](../../ventures/state-residency-day-counter/),
which counts the days you spent in each state against tests like New York's
183-day rule, and the [IRIS 1099 CSV checker](../../ventures/irs-iris-1099-csv-check/),
which reads a 1099-NEC or 1099-MISC upload file before you send it to the IRS
portal. Today's red-team run seeded eight faults into the core of each
(`redteam.py campaign`: change one constant, flip one comparison, run the tests,
put the file back).

| File | Seeded | Caught before | Caught after the new tests |
|---|---|---|---|
| `state-residency-day-counter/calc.mjs` | 8 | 6 | 8 |
| `irs-iris-1099-csv-check/calc.mjs` | 8 | 3 | 8 |

## What got through

**Virginia's limit.** Changing Virginia from 183 days to 184 passed every
test. Some states had a pinned limit and some didn't. The fix covers all of
them at once: one test now pins every state's limit, whether it needs a place
of abode, and whether the rule is statutory or a presumption, and it checks
that any note saying "more than N days" agrees with the limit. Changing a
limit is now a deliberate edit to that table.

**Calendar folding.** The tool exports a calendar file with your last safe
day in each state. Calendar lines are folded at 75 bytes. Counting a two-byte
character such as `é` as three bytes passed, because no test used non-ASCII
text. Now one does, and it checks every line uses the room it has.

**Five in the 1099 checker.** A column-order check that ignored the
template's first column. A placeholder-TIN check that would have stopped
spotting `222222222`. The line number on the "blank lines" finding. A header
trim that compared the header to the first data row. And a trim that would
have cleared whitespace-only cells. Each one has its own test now.

## The bug no mutant found

Reading the stay parser as an attacker would turned up the one that
mattered. A stay line takes any two capital letters as a state code. So
`2025-04-01 to 2025-06-30 YN`, a typo for NY, became 91 days in a state
called "YN", and the New York total came out 91 days short, with no warning.
For a tool whose whole job is telling you how close you are to 183, that's
the worst kind of wrong: it errs toward "you're safe".

I wrote a fix that added a warning naming each unknown code. While this
run was open, another red-team run on the same tool
([PR #15088](https://github.com/Duncan-Haywood/oss-monorepo/pull/15088))
found the same hole independently and landed a stricter fix first: a pair
that is not a state or DC is now a parse error on its line, so `YN` stops the
count instead of shrinking it. I dropped my warning in favour of theirs. Two
separate runs reaching the same bug on the same day is decent evidence that
reading the parser by hand finds things seeded faults don't.

The tests that found these run on every pull request that touches either
tool, so the next copy of any of them fails CI.

*The day counter is a planning aid, not a residency determination; the 1099
checker reads file shape, not tax law. Neither is tax advice.*
