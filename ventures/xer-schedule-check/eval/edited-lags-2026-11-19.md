# Lags edited after the last schedule run, 2026-11-19

> **Correction, 2026-11-20** (`eval/relationship-dates-2026-11-20.md`): the
> 608 h lag below was *not* edited after P6's run. The relationship date P6
> stores on that link (`arls`, 2012-04-01 10:00) is exactly the 608 h less the
> 408 h spent before the data date back from the successor's late start, so P6's
> backward pass used 608 h at that run. The 440 h room is P6's own forward pass,
> by a rule not yet found. The broken-link check stays; the assessment now says
> this on the item, and lists lags changed after the run (longer or shorter)
> from the relationship dates with the lag P6 used.

**Question.** After five CPM passes the engine matched P6's stored dates on
19,820 of 19,822 open activities (`eval/cpm-vs-p6-2026-11-19.md`). The two
left, in CCA (P6 6.0), are a finish milestone BAFT2305509C1 and its successor
SAFT2305509C0. P6 puts them 24 days earlier than a 608 h FS lag from a finished
milestone allows, and no calendar or start point reproduced that. Is the engine
wrong, or did the file change after P6 scheduled it?

**Data.** The six P6 files of `eval/cpm-vs-p6-2026-11-19.md` and Harbour
Pointe (P6 17.12) of `eval/edited-durations-2026-11-19.md`, fetched for this
check and not committed.

**The finding.** Turn the question round: how much lag do P6's stored dates
leave room for? The predecessor BAFT1005509C1 finished 2011-07-31 08:00. The
milestone's stored early date is 2011-10-05 08:00. Between them, on the
predecessor's calendar (the file's lag calendar setting is
`rcal_Predecessor`), there are **exactly 440 working hours, 55 days of 8 h**.
P6 meets every link when it schedules. A stored date 168 h short of the lag
therefore means the lag (or the predecessor's actual finish) changed after
P6's last run, and the file was exported without rescheduling. The round 55
days points to the lag. Two siblings off the same predecessor, with FS lags of
760 h and 24 h, match P6 to the minute.

Rescheduled with 440 h: SAFT2305509C0 agrees on early finish, late finish and
total float. BAFT2305509C1 agrees on late finish and float. Its early date is
2011-10-04 17:00 where P6 wrote 2011-10-05 08:00, with no working time between
the two. The 760 h sibling, a finish milestone on the same calendar, gets
17:00 from P6 as well. So the 08:00 is a P6 detail this file does not explain:
a lag of 440 h gives 17:00 in both P6 and the engine, and any other lag gives
a different working instant.

**The check.** `brokenLinks` in `dcma.mjs` tests every link into an unstarted
activity against the stored dates:

- *early side:* the successor's stored early start (finish, for FF and SF) is
  at least the lag after the predecessor's actual date when it is finished, or
  its stored early date when it is not. Start links from an in-progress
  predecessor are skipped, because their lag is partly spent.
- *late side:* when the predecessor is unfinished, its stored late finish
  (start, for SS and SF) is at least the lag before the successor's stored late
  start (finish). A lengthened lag on a link with slack moves no early date but
  still eats the predecessor's float.

A link with less room than its lag goes on "Lags edited after the last schedule
run", with the room the dates leave. If the room is negative, the dates break
the link even with no lag, and the link is reported as added or changed. When
the stored dates differ from the logic anywhere, the assessment reschedules
with each listed link's lag set to its room. It then counts how many of the
differing activities agree, and how many agree but for a gap with no working
time in it. The written review lists the links as a medium correction.

**As found** (every link, whether or not the file's dates differ):

| File | P6 | Links checked | Broken by the stored dates |
|---|---|---|---|
| CCA | 6.0 | 37,211 | 1 (BAFT1005509C1 -> BAFT2305509C1, FS 608 h, room 440 h) |
| Expressway | 7.0 | 1,094 | 0 |
| Harbour Pointe | 17.12 | 193 | 0 |
| example | 24.12 | 518 | 0 |
| hotel | 6.0 | 7,586 | 0 |
| sample | 20.12 | 41 | 0 |
| terminal | 5.0 | 84 | 0 |
| **Total** | | **46,727** | **1** |

On CCA the list explains 1 of its 2 differing activities exactly and the other
but for the overnight gap.

**Planted.** `node eval/edited-lags.mjs <dir> --json eval/edited-lags-2026-11-19.json`.
Ten seeds per file, each lengthening the lag of 5 random links into unstarted
activities by 1 to 20 working days (8 h) without rescheduling. A planted lag
"moves a stored date" when, applied alone, it makes more of the file's
activities differ from the logic; the others fit in slack the link already had
and change nothing a check could see.

| File | Planted | Move a stored date | Found | Extra | Differences caused | Explained |
|---|---|---|---|---|---|---|
| CCA | 50 | 22 | 22 | 0 | 401 | 401 |
| Expressway | 50 | 48 | 48 | 0 | 1,170 | 1,170 |
| Harbour Pointe | 50 | 25 | 25 | 0 | 412 | 412 |
| example | 50 | 47 | 47 | 0 | 1,155 | 1,155 |
| hotel | 50 | 42 | 42 | 0 | 3,621 | 3,621 |
| sample | 50 | 50 | 50 | 0 | 353 | 353 |
| terminal | 50 | 46 | 46 | 0 | 440 | 440 |
| **Total** | **350** | **280** | **280** | **0** | **7,552** | **7,552** |

A first version that tested only the early side missed 5 of 38 date-moving
lags in a smaller trial (2 seeds of 3 per file). All five had moved only a
predecessor's late dates and float. The late side found them.

Run time on CCA: the link test takes 0.27 s over its 37,211 links, and the
whole assessment, including the reschedule with the implied lag, 2.3 s. The 245-file converter corpus (`node eval/converter-corpus.mjs`) still
gives 0 crashes and 0 stray NaN/undefined/Infinity. Unit tests:
`edited-lags.test.mjs`.

**Limits.** A shortened lag breaks no link, so this check cannot name it; it
shows up only as stored dates that differ. A link from an in-progress
predecessor that counts its lag from the start is skipped. A stored date typed
by hand can also break a link. It is listed with "the stored dates break it
even with no lag" (unit test), not as a lag. An edit that fits in slack the link
already had is invisible, and changes nothing. Seven P6 files are still a small
sample, and the one real finding is a single link.
