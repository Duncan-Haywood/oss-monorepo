# As-planned vs as-built check, 2026-11-23

`node eval/asplanned-check.mjs <xer dir> --plants 10 --seed 2 --json eval/asplanned-check-2026-11-23.json`
on the six public XERs of `eval/corpus-fetch.sh` (P6 5.0 to 24.12, 21,422 activities). What each
check means is in the script's header: each file is the plan, and status.mjs finishes it as
planned, with and without planted delays, so the answer is known.

| File | Own planned dates: steps add up | Null (built to plan) | Planted slips | Planted waits (on the path) |
|---|---|---|---|---|
| CCA_R03_dt_24Oct11SC | yes (path 70) | ok | 10/10 | 10/10 (1) |
| Expressway_Project | yes (path 7) | ok | 10/10 | 10/10 (0) |
| example_xer_file | yes (path 17) | ok | 10/10 | 10/10 (4) |
| hotel-project | yes (path 79) | ok | 9/10 | 10/10 (1) |
| sample | yes (path 42) | ok | 10/10 | 10/10 (10) |
| terminal-building-airport | yes (path 19) | ok | 10/10 | 10/10 (9) |
| **Total** | **6/6** | **6/6** | **59/60**, steps add up 60/60 | **60/60** (25 on the path: step = planted days) |

Seed 1 on the five smaller files: null 5/5, slips 50/50 (steps add up 50/50), waits 50/50 (26 on
the path, each step exactly its planted days).

A slip passes when every positive step on the as-built critical path is on a slipped activity, a
step the tool names as held by a finish-to-finish link, or a calendar step. A wait passes when, on
the path, its late-start step equals the planted days and is the only positive step; off the path,
when the delay is no more than the planted days and no late start appears elsewhere.

## The one miss

Hotel, seed 2, data date 2013-03-30 12:23: three slips off the as-built path, delay 0.1 working
day, shown as a 0.1-day longer duration on HCSW6FZ1070 (steel columns). Under an hour of working
time; not traced. The data dates in this check fall mid-day, and status.mjs splits remaining work at
that minute.

## What the misses taught (before the fixes)

The first full run had 57/60 slips and 58/60 waits; seed 1 had 48/50. Each fix is a rule in
`asplanned.mjs`:

1. **Expressway, six-day predecessor into a Sunday-to-Thursday milestone over FS-1d:** the step
   read as a 1-day late start on the project calendar. Waits are measured as the link sees them
   (past the earliest the link allowed, on the successor's calendar) and the remainder is a
   calendar step.
2. **Hotel, an 08:00-17:00 crew starting at 16:00 after an 08:00-16:00 predecessor:** 1-2 day
   "longer durations" down a chain of electrical wiring. Duration steps are measured on the
   activity's own calendar, remainder to a calendar step.
3. **CCA and hotel, SS and FF pairs:** the walk took a tight SS link where an FF link held the
   finish. It now takes a link into the point that drives the rest of the path; a longer duration
   or late start that a finish-to-finish link explains on the actual dates names that predecessor.
4. **Ties:** of several tight links, the predecessor that slipped most against the plan.
5. **Hotel, as-late-as-possible activities:** an ALAP predecessor (crane removal) looked tight to
   its successor, and the walk stopped at an ALAP activity (no link into it is tight). ALAP
   predecessors are passed over when another link is tight, and through an ALAP activity the walk
   follows the predecessor with least slack. The cpm.mjs driving path also stopped at the hotel's
   ALAP finish milestone after 1 activity; every activity finishing on the finish date is now tried
   and the longest chain kept (79).

## Limits

The planted delays were made by the tool's own statusing, so this checks the method against a known
answer, not against a consultant's exhibit. Next: a real baseline and final update with the claim's
own delay list.
