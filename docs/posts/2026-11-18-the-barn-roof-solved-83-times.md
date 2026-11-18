---
title: "The barn roof solved 83 times: remembering a truss analysis by the twelve inputs it reads"
seo_title: "Memoising a truss analysis by the fields it reads"
date: 2026-11-18
tags: [performance, javascript, profiling, shed-designer]
description: "One barn-roof shed check solved the same truss 83 times for 17 inputs. Keying it on the 12 fields it reads cut a test file from 23 s to 14 s, same output."
---

[The shed designer](https://marisstella.app/shed-designer/) frames every stud
and rafter of your shed in the browser, prices it, and checks the structure.
For a barn (gambrel) roof the check is real statics: each truss is a
three-hinged frame, solved for dead load, snow, snow on one side, and wind
uplift, at 121 sections a side.

Today's perf run profiled the shed designer's design-search tests and found a
quarter of the time inside that truss solver. Not because one solve is slow,
but because of how often it ran. A counter on one check of one barn shed with
a half loft read **83 solves for 17 different trusses**. The wall loads ask
for it, the model asks for it, the structural checks ask three times, the
utilisation report asks, and the auto-sizing tries the same truss again for
each wall height and overhang it probes.

## Remember by what it reads, not by who asks

The obvious cache keys on the design object. That misses most repeats: the
auto-sizer builds a new object for every probe, differing in overhang or wall
height, which the truss never looks at.

So the cache keys on the fields the analysis actually reads. There are twelve:
width, both pitches, the knee, rafter size and spacing, stud size, tie size,
the loft and its joists, snow and wind. We found them twice, once by reading
the code and once by wrapping a design in a JavaScript `Proxy` that writes
down every property touched. The two lists agree, and a test now runs that
`Proxy` over two dozen variants and fails if the analysis ever reads a field
the key leaves out.

Two more guards: the cached answer is frozen, so a caller that tried to edit
it would throw rather than quietly change the next caller's numbers; and a
field holding junk from a pasted link (an object where a number should be)
skips the cache.

## Same answers, measured

Before and after, we hashed everything 381 designs produce (212 of them
barns): the framing, the price list, every structural and connection check,
every drawing sheet. Same hash. The committed design gallery regenerates
byte for byte.

- One barn check: 83 truss solves down to 17.
- The design-search test file: median 23.1 s down to 13.7 s.
- The shed designer's whole test suite under CI-like load: 170 s to 153 s.
- The gallery regeneration in the site build: 12.4 s to 11.2 s.

The same saving runs in your browser when the designer sizes a barn for you.
The full reading, profile and the ranked list of what is still slow is in the
[run's write-up](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/docs/history/ci-perf-2026-11-18-shed-gambrel-analysis-memo.md).

*Free and MIT licensed. The shed designer's structural checks are estimates
from the inputs you give it, not an engineer's stamp: check your local code
and get a permit where one is needed.*
