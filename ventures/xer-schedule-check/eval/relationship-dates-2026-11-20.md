# P6's own relationship dates: decoded, and what they say about the last residuals, 2026-11-20

**Question.** Every P6 export since at least 5.0 stores two dates on each
relationship in TASKPRED, `aref` and `arls`, which no P6 screen shows and
which this tool ignored until now. What are they, and can they settle the two
residuals `eval/cpm-vs-p6-2026-11-19.md` left open: the 5-node SS chain of
finished-node late dates at CFNS103317C0, and the 608 h lag that
`eval/edited-lags-2026-11-19.md` read as edited after the last run?

**Data.** The six P6 files of `eval/cpm-vs-p6-2026-11-19.md` and Harbour
Pointe (P6 17.12) of `eval/edited-durations-2026-11-19.md`, fetched for this
check and not committed. The P6 24.12 Web file (`example_xer_file.xer`) writes
no `aref`/`arls` columns at all.

**Method.** `node eval/relationship-dates.mjs <dir> --json
eval/relationship-dates-2026-11-20.json` (10 seeds, 20 edits per seed per file;
3.6 s for all seven files).

## What the two dates are

On a link between two unstarted activities, with the link's lag counted on
its lag calendar:

| Link | `aref`: the early start the link gives the successor | `arls`: the late date the link gives the predecessor |
|---|---|---|
| FS | pred early finish + lag | succ late start - lag |
| SS | pred early start + lag | succ late start - lag - pred duration |
| FF | pred early finish + lag, less succ duration | succ late finish - lag |

Measured on every such link of the six files that store them (SF: one link in
seven files, not decoded):

| File | P6 | Links | `aref` agrees | `arls` agrees |
|---|---|---|---|---|
| CCA | 6.0 | 31,491 | 31,491 | 31,491 |
| hotel | 6.0 | 7,585 | 7,578 | 7,585 |
| Expressway | 7.0 | 1,094 | 1,094 | 1,094 |
| terminal | 5.0 | 84 | 84 | 84 |
| sample | 20.12 | 41 | 41 | 41 |
| Harbour Pointe | 17.12 | 181 | 95 | 181 |
| **Total** | | **40,476** | **40,383** | **40,476 (100%)** |

`arls` is exact on every link. `aref` is off on 86 of Harbour Pointe's links
(an hour or a few minutes off, as if P6 17.12 snapped it to another calendar)
and on 7 FF links in the hotel file, so the check below treats `arls` as the
witness and `aref` as a second one where it agrees.

The SS row is not what the name suggests: P6 stores the predecessor's late
start bound *less its own duration*, not its late finish. It holds on all
2,366 SS links in CCA and all 1,083 in the hotel file.

Links from a finished predecessor (FS and FF) into an unstarted activity:
`arls` is the successor's late date less only the part of the lag still
unspent at the data date, `max(0, lag - working time from the actual finish
to the data date)`. That is the engine's rule 17, found on 2026-11-19 from the
finished nodes' late dates alone; here it holds on **1,894 of 1,894** such
links (1,889 in CCA, 5 in Harbour Pointe), an independent check of the rule.

## What it gives the product: lags changed after the last run, with the old value

Both dates are written in the same schedule run as the activities' stored
dates, so they carry the lag P6 used. A lag edited afterwards leaves them
pointing at the old one, and the old lag reads straight back: the working time
between the predecessor's stored date and `aref`, and between `arls` and the
successor's stored date. `reldates.mjs` (`relationshipLags`) does that for
every link between unstarted activities and, from finished predecessors, while
some lag is unspent. A link with neither date, in a file whose other links have
them, was added after the run.

| | Planted | Listed with the old lag exactly | Other value | Missed | Listed but not planted |
|---|---|---|---|---|---|
| Lag edits, -10 to +20 days | 1,200 | **1,200** | 0 | 0 | 0 |
| Links added | 1,200 | **1,200** | | 0 | 0 |

As found, the six files list no changed lag and no added link (40,476 links
checked; CCA's 39 links with neither date all start at finished activities
P6 stored no dates for, 37 of them at one milestone, so none is counted as added).

This finds what `brokenLinks` (the 2026-11-19 check) cannot: a **shortened**
lag breaks no stored date, so it was invisible before, and a lengthened one was
named only with the room the dates leave, not the lag P6 actually used. The
assessment's "Lags edited after the last schedule run" list now carries both
(`lagWas` on each item), and the "put back" reschedule uses the old lag where
P6's dates name it.

## The 608 h lag was not edited

`eval/edited-lags-2026-11-19.md` read CCA's FS link BAFT1005509C1 ->
BAFT2305509C1 (lag 608 h, stored dates leave room for 440 h) as a lag changed
after P6's run. Its `arls` says otherwise: it is 2012-04-01 10:00, exactly 200 h
before the successor's late start. The predecessor finished 2011-07-31 08:00,
408 working hours before the data date, and 608 - 408 = 200. So P6's backward
pass at that very run used 608 h. Had the lag been 440 h then, `arls` would sit
32 h back. P6's own forward pass left the 440 h gap itself, by a rule not yet
found (the predecessor is a finished milestone P6 stores no dates for). The
assessment now says so on that item, and the 440 h "put back" stays as a way
to reproduce P6's forward dates, no longer as a claim of an edit.

## The 5-node SS chain at CFNS103317C0: P6's dates contradict its own links

A finished activity is a zero-length node, so its stored late date should be
the earliest `arls` over its links to activities that are not level of effort.
It is on **1,545 of 1,549** finished nodes across the files (1,529 of 1,533 in
CCA, 16 of 16 in Harbour Pointe). Of the four that are not:

- two are rule 17's links *into* finished nodes (T20CO05305C0,
  PGLS103391C120): P6's node date takes the unspent lag off, the `arls` on
  that link does not. The engine matches P6's node dates on both.
- two are the chain. CFNS103317C0 stores a late date of 2011-10-26 17:36,
  but the `arls` P6 wrote on its SS link to CP3S105101C0 in the same run is
  2011-10-10 09:36: P6's own relationship record says the node must be done
  by 10-10 09:36, which is the date the engine gives it. Upstream,
  CFNS131203C0 stores 2011-10-28 01:36 against an `arls` of 2011-10-26 17:36
  on its only successor link. The other three nodes inherit the bad dates
  through links whose `arls` equal them.

Neither stored time is a working time on the nodes' calendar (8-12, 13-17,
Fridays off): 17:36 is after hours, and 2011-10-28 is a Friday. Neither time
appears anywhere in the 403,233-line file outside these nodes and their links. No rule over this file's links
can reach dates that P6's own link records contradict, so the item is closed
as out of reach: the engine agrees with P6's relationship dates on the root
link, and the residual is in P6's stored activity dates.

## Not checked

SF links (one in seven files). An SS link whose lag calendar is not the
predecessor's (`arls` is not decoded there, `aref` alone does not list). A
P6 export where a link and its activities were all edited together, which
leaves both witnesses consistent with the new lag. Started activities: their
`arls` depends on how much of an SS lag is spent, and the check leaves them
out. (Done 2026-11-24: eval/relationship-dates-started-2026-11-24.md,
11,610 of 11,610 links with a started end decode against the unspent lag.) The finished-predecessor path has no unit test of its own (the example
schedule's only such link has its lag fully spent); it rests on the 1,894 real
links above.

## The 608 h lag's forward gap: searched again, no rule (2026-11-20, later)

P6 put BAFT2305509C1 at 2011-10-05 08:00, 440 working hours after its
predecessor's actual finish (2011-07-31 08:00) on calendar 12845 (8 h days,
Fridays off), where the 608 h lag gives 2011-10-29 17:00. Checked and ruled
out, each against P6's own numbers in the file:

- **Another lag calendar.** The project's lag calendar is the predecessor's
  (`sched_calendar_on_relationship_lag` rcal_Predecessor); both ends use
  12845. On the 7-day calendar 12844 the gap is 528 h, on a 24-hour calendar
  the lag ends before the data date. Neither is 440.
- **The predecessor's other links.** The same finished milestone feeds
  BAFT2005509C1 by FS 760 h, same calendar: P6's early start there is
  2011-11-23 17:00, exactly 760 h after the actual finish, and the engine
  matches it. So P6 counted that link's lag the normal way in the same run.
- **Planned dates.** The predecessor's planned start (2011-09-01) gives 232 h
  to 10-05, not 608 or 440.
- **Holidays.** The calendar's exceptions between the actual finish and 10-05
  are two days (08-30, 08-31), 16 h, not 168 h.
- **External or out-of-project link.** Both ends are in project 8788; the
  successor has no external dates.
- **An edit after the run.** `arls` (200 h before the successor's late start
  = 608 - 408 h spent) says the backward pass used 608 h.

168 h is 21 of this calendar's days or exactly one 24-hour week; neither
leads to a rule that also leaves the 760 h link where P6 put it. One link of
46,727 into unstarted activities, with no second case, cannot pick between
rules, so the item is closed as an unexplained P6 forward date, listed in
the assessment as such.
