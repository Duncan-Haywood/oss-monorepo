---
title: "The subtitle fixer refused the minus sign its own page printed"
seo_title: "Mutation testing a subtitle resync tool: 11 of 20 bugs escaped"
date: 2026-11-21
tags: [redteam, testing, mutation-testing, subtitles, subtitle-resync]
description: "A red-team run seeded 20 bugs into the new subtitle resync tool. 11 got past its tests, and reading the code found two real defects, one a minus sign."
---

[Subtitle Resync](/ventures/subtitle-resync/) shipped this week. It fixes
SRT and WebVTT files that are early, late or drifting, by a typed shift, a
frame-rate fix, two sync points, or automatic alignment to a correctly timed
subtitle in another language. Today's red-team run turned on it while it was
still new.

## Seeded bugs

The run made 20 small changes to the code, one at a time, and ran the
tests after each (12 in `engine.mjs`, the logic, and 8 in `resync.mjs`, the
command line). The tests caught 9 of the 20. The 11 that escaped showed where
the suite was thin:

- **`--offset-only` was never tested.** Breaking the median that sets its
  shift (dividing by 3 instead of 2) passed every test.
- **The automatic alignment's edges were loose.** The width of the vote
  window, a reference line exactly at the 15-minute search limit, and the
  rule that 10 matched lines over a minute are enough to fit a stretch could
  all change without a test noticing. For the final 0.4-second refinement
  window, a random search over small noisy cases found one where 401 ms
  instead of 400 admits a seventh line and moves the shift by 14 ms. That
  case is now a test.
- **The command line accepted mistakes quietly.** With `-o` as the last
  word, the file went to the screen instead of an error. An unknown option
  typed after the file name came back as "only one input file".
- **The help text could drift from the code.** A test now checks that its
  two `--offset` examples mean the same shift, and that the exit code it
  lists for a usage error is the one the tool returns.

Eleven new tests later, `rerun` re-applied all 11 escaped bugs and every one
now fails the suite: 45% caught before, 100% after.

## Two real defects

**The minus sign.** The page's shift box is labelled
"Shift (seconds, or −00:00:02,500)". That dash is U+2212, the typographic
minus, and the error message printed "seconds (−2.5)" the same way. The
parser accepted only the ASCII hyphen. So a person who copied the example
from the label got "The shift must be seconds", and so did a phone or word
processor that turns `-` into an en dash. A leading U+2212 or en dash now
reads as a minus. An em dash is still refused, since nobody means it as one.

**Standard input.** The command line deliberately let `-` through as a file
name, the usual way of saying "read from the pipe", but then tried to open a
file called `-`. `cat movie.srt | node resync.mjs - --offset 1.2` failed
with "no such file". It now reads standard input, and the help and README
say so.

Both fixes started as failing tests. The record is
`prompts/runs/2026-11-21-session_01EhTJVPh2U8Djp1MhsEbS4v.json`.
