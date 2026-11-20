---
title: "Where a regex starts decides how fast it scans: four tree checks, 48 s to 18 s"
seo_title: "Python regex speed: why a leading lookbehind scans every character"
date: 2026-11-20
tags: [performance, python, regex, ci]
description: "Four CI tree scans were slow for one reason: Python's re only skips ahead to a literal or a character class. Same output, a third of the time."
---

Every pull request here that touches a venture also runs a pool of
repository-wide checks: nobody slips hidden Unicode into a file, no
third-party licence comes in unrecorded, no copied IRS tax table has one
figure wrong, no form button hides `form.reset()`. Each one reads most of
the 74,000 tracked files. Timed one at a time, four of them and their test suites took about 48
seconds between them, much of it on every run of the job.

They were slow for the same reason, and it is a detail of Python's `re`
worth knowing.

## What `re` can skip

When you call `pattern.search(text)`, the engine has to try a match at each
position until one works. It does that in a fast C loop only when it knows
what the first character of a match must be: a literal (`Copyright`) or a
character class (`[\d$]`). Then it jumps from candidate to candidate without
running the full matcher. Lead with anything else and the engine runs its
general matcher at every single character. That includes a lookbehind like
`(?<![\w.$])`, or a case-insensitive alternation like `(?i)(?:Copyright|©)`.

Three of the four checks led with one of those.

- **The IRS figure check** pulled numbers out of 148 MB of venture code with
  `(?<![\w.$])\$?(\d{1,3}(?:[,_]\d{3})+|\d{4,9})(?!\w)`. Moving the class
  to the front, `[\d$](?<![\w.$].)...`, asks the same question about the
  character before the match. It took 5.8 s before and 1.7 s after. The two
  patterns gave the same numbers on all 10,620 files and on 200,000 random
  strings.
- **The third-party licence check** ran nine searches on each of 3.6 million
  lines of code. None of those patterns can match across a line break, so one
  search of the whole file tells you which ones can match any line at all.
  The costly one was the case-insensitive copyright pattern, at 2.6 s for the
  whole tree. It now runs only on files where the plain word `copyright`
  (1.1 s) or `©` appears. 11.6 s became 4.3 s, and the output is the same
  44 signals.
- **The hidden-Unicode check** looks for bidi controls, zero-width
  characters and Tag characters. Tag characters are the ones used to hide
  instructions for coding agents. Its character class was fine, but it ran
  over 225 million characters of text. These were the files that are not
  plain ASCII: mostly em dashes and accents. Only 46 files contain any match.
  The fix works on bytes. Every byte of a multi-byte UTF-8 character is 0x80
  or above, so if you delete the ASCII bytes, each remaining character is
  still whole and in order. A bytes pattern for the same characters then
  searches what is left, usually a few hundred bytes per file. A test checks
  that pattern against the original on every Unicode code point. 5.1 s
  became 1.6 s.

The fourth was plainer still. **The form check** read every page's script
files before it knew whether the page had a button named `reset` or
`submit`. Now it reads them only when it does. 2.6 s became 0.8 s.

## How to check your own

Look at the first thing in the pattern. If it is a lookbehind, a `(?i)`
alternation, or a group whose branches start differently, it is tried at
every character. Fixes that keep the answer the same:

1. lead with the class the match must start with, then assert the context
   with a lookbehind that includes that character;
2. search once for a cheap necessary condition (a plain literal, found with
   `in`) and run the expensive pattern only where it holds;
3. throw away the bytes that cannot be part of a match before you search.

Before any of this goes in, compare the old output with the new one byte for
byte. Every change here was checked with `cmp` against `main`'s output, and
each has a test that runs the old pattern against the new one. The full
write-up, with profiles and the next candidates, is in
[docs/history/ci-perf-2026-11-20-four-tree-scans.md](../history/ci-perf-2026-11-20-four-tree-scans.md).
