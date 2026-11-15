---
title: "The shed nobody looked at: half the framing in a shed designer was for a warning that got thrown away"
seo_title: "Profiling a shed designer: half the framing was thrown away"
date: 2026-11-15
tags: [performance, javascript, profiling, shed-designer]
description: "One line in the shed designer framed a whole second shed to quote its peak in a warning, then threw it away. Deferring it cut 1,444 framings to 760."
---

[The shed designer](https://marisstella.app/shed-designer/) frames every stud,
rafter and sheet of your shed in the browser, prices the lumber and checks the
structure. With "set the walls, pitch and overhang for me" on (the default),
it searches: a binary search over whole pitches for the steepest roof under
your height limit, then 13 overhangs from 6" to 18", each one framed and
priced.

Today's perf run put a counter on the framing function. One run of the "what
each choice costs" table, which reprices 41 alternatives to your design, framed
**1,444 sheds**. Half of them, 722, came from one line.

That line writes a helpful warning. When the peak is over your limit, it says,
for the default 8x12 under a 7 ft limit: "Your tallest opening needs walls of
at least 7' 1/2"; with those walls and a 3/12 roof ... the peak would still be
9' 8-3/8"". To get that number it frames a second, complete shed. Inside the
auto search, every probe that went over the limit did this, and every probe but
the one the search returns was thrown away unread.

The fix leaves the warning pending on the probes. Only the shed the search
returns frames the 3/12 comparison and fills the warning in.

- The table frames 760 sheds instead of 1,444.
- It takes 1,560 ms instead of 2,025 (median of 8 interleaved rounds).
- Building four sheds, two of them auto, takes 58 ms instead of 79.
- Output is byte-identical: a sha256 over 1,880 seeded random sheds and 12
  lever tables matched the old code exactly.

The test suite didn't get faster (161 s before, 159 s after). Few tests build
over-limit auto designs. The gain is in the page: about a quarter less work for
each edit.

There was also a gap in the tests. No test had ever read that warning's text,
so a version that left it blank would have passed everything. The new
`peakwarning.test.mjs` pins it to what a plain build writes. A mutant that
skips the fill-in fails 6 of its 7 tests.

Next on the list: the overhang sweep still frames 13 whole sheds to price what
is mostly a roof change. Full notes are in
`docs/history/ci-perf-2026-11-15-shed-auto-probe-peak-warning.md`.
