---
title: "A dollar sign dropped the student: red-teaming a tutoring scheduler and a robots.txt checker"
seo_title: "Tutoring group scheduler: '$25' prices were skipped (fixed)"
date: 2026-11-19
tags: [redteam, testing, tutoring, robots-txt]
description: "20 faults seeded in two tools, 10 caught at first; five guard tests added, and a fix for a price typed as $25 making the scheduler skip the student."
---

This red-team run seeded 20 small faults (flipped comparisons, off-by-one
indexes) into two tools that people paste their own data into: the
[tutoring group schedule optimizer](https://marisstella.app/tutoring-group-schedule-optimizer/),
which picks which group sessions to run and who sits in each, and the
[AI crawler access checker](https://marisstella.app/ai-crawler-access-check/),
which reads a robots.txt the way Google's parser does and says which AI
crawlers it lets in.

## The real bug: "$25" was not a price

The scheduler asks for each student's price per session. People type
prices the way they write them, so a row like `Ann,$25,Mon 4pm` is normal
input. The parser ran `Number("$25")`, got `NaN`, and skipped the row with a
warning. One student gone means the plan is built on a smaller class list
than the centre really has, and a session that needed that student to reach
its minimum stays closed. Type the cost to run a slot as `$40` on every row
and the tool refused the lot: "No usable slot rows".

The fix drops one leading `$`, `£` or `€` before reading the number, for
prices and slot costs. A sign with no number after it is still treated as
missing. The test was written first and failed on the old code.

## What the tests missed, and the guards added

Of 20 seeded faults, the existing tests caught 10. Five of the other ten
cannot change anything a user sees (dead code, a bit index that is never
set, a fast path that falls through to the same answer), and each has a note
in the run record saying why. The remaining five were real gaps, and each now
has a test that fails with the fault and passes without it:

- **Scheduler, minimum column first.** A slots header that lists `min`
  before `slot` was read with the default minimum instead of the user's.
- **Scheduler, blank first slot cell.** `Ann,25,,Mon 4pm`, which a
  spreadsheet export produces when a column is empty, would have dropped Ann.
- **Scheduler, the page's sample text.** The page says its sample holds "34
  invented students and 9 slots". A test now checks that sentence against
  the generated sample, so the two cannot drift apart.
- **Crawler checker, the DEL character.** 0x7F is US-ASCII, so it must stay
  raw in a pattern, as Google's `MaybeEscapePattern` leaves it. If it were
  percent-encoded, `Disallow: /a<DEL>` would stop matching the path it names.
- **Crawler checker, ties.** When two equally long rules of the same kind
  match, Google's matcher keeps the first line. The report names the rule
  it used, so a test now pins that to the first line too.

Catch rate on these two files: 10 of 15 faults that can change behaviour
before (0.667), 15 of 15 after.
