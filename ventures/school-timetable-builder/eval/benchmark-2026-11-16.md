# Solver benchmark, 2026-11-16

`node eval/bench.mjs 4,8,12,16,24,32,40 3` on Node 22.23.4, one core of a
2.1 GHz Intel Xeon (cloud container). Default solver settings (iterations =
4000 per unit, capped at 2,000,000).

Instances come from `eval/generate.mjs`: synthetic secondary schools where
**every class is fully booked** (30 lessons in 5 days x 6 periods), breaks
after periods 2 and 4, a 12-subject curriculum with science as 2 doubles in a
lab, art and PE as a double in an art room or gym, computing in an ICT room,
teachers given at most 24 periods, a few teachers with a day off, and
specialist rooms sized to about 80% use. They are synthetic, not real schools;
real timetables have constraints these do not (split sites, part-timers on odd
periods, option blocks).

"hard" is the solver's own count; "valid" is the independent `validate()`
re-check from the placements alone. Fully booked classes cannot have gaps, so
class gaps are 0 by construction.

```
classes | units | seed | ms | hard | class gaps | teacher gaps | repeats | valid
4 | 104 | 1 | 208 | 0 | 0 | 0 | 0 | true
4 | 104 | 2 | 277 | 0 | 0 | 0 | 0 | true
4 | 104 | 3 | 401 | 0 | 0 | 0 | 4 | true
8 | 208 | 1 | 762 | 0 | 0 | 3 | 8 | true
8 | 208 | 2 | 845 | 0 | 0 | 12 | 2 | true
8 | 208 | 3 | 893 | 0 | 0 | 9 | 6 | true
12 | 312 | 1 | 1455 | 0 | 0 | 33 | 0 | true
12 | 312 | 2 | 1432 | 0 | 0 | 20 | 9 | true
12 | 312 | 3 | 1396 | 0 | 0 | 20 | 8 | true
16 | 416 | 1 | 1821 | 0 | 0 | 31 | 6 | true
16 | 416 | 2 | 1694 | 0 | 0 | 34 | 8 | true
16 | 416 | 3 | 1624 | 0 | 0 | 29 | 4 | true
24 | 624 | 1 | 1866 | 0 | 0 | 57 | 12 | true
24 | 624 | 2 | 2204 | 0 | 0 | 56 | 11 | true
24 | 624 | 3 | 2058 | 0 | 0 | 66 | 12 | true
32 | 832 | 1 | 1715 | 0 | 0 | 83 | 12 | true
32 | 832 | 2 | 1947 | 0 | 0 | 77 | 8 | true
32 | 832 | 3 | 2276 | 0 | 0 | 81 | 9 | true
40 | 1040 | 1 | 2001 | 0 | 0 | 89 | 16 | true
40 | 1040 | 2 | 2277 | 0 | 0 | 82 | 20 | true
40 | 1040 | 3 | 2209 | 0 | 0 | 94 | 22 | true
```

Result: 21 of 21 instances, 4 to 40 classes (104 to 1,040 schedulable units),
placed every lesson with no clash, confirmed by the validator, in 0.2 to 2.3 s.
Same-subject repeats and teacher gaps are not proven optimal; the "Keep
improving" button continues the search from the current timetable.

Also checked by hand on 2026-11-16: 24 and 40 classes with teacher loads up to
28 of 30 periods (seeds 1 and 2) solved with 0 hard problems in about 2 s.

Not yet measured: the ITC 2011 high-school timetabling archive (XHSTT), which
uses an XML format this tool does not read. That is the next honest yardstick.
