# Progress override: SS and SF successors of work under way start at the data date, 2026-11-24

**Question.** Under progress override, where does P6 put a not-started
activity that follows work under way by a start-to-start (SS) or
start-to-finish (SF) link? The engine laid it from the predecessor's
restart, the next working instant after the data date on the predecessor's
calendar. The P6 23.12 probe set (`danafitkowski/cpp-cpm-engine` at
`f4554cb`, `validation/p6-probes`, P6 Professional 23.12.1 values read from
its database) disagreed on 16 of 24 rows of `h3s-pe24` alone, the item
flagships.yaml named "(b) SS on a 24-hour lag calendar", and on the same rows
of `h3s-pe`, `h3s-pa` and `h3s-pw`.

**Data.** `bash eval/corpus-fetch.sh DIR --probes` (338 probe XERs, 5,199
rows with P6's four dates and two floats), and the six public real P6 files
of `eval/cpm-vs-p6-2026-11-19.md` for the check that nothing else moved.
Neither set is committed.

## What P6 does (the probe rows)

The `h3s-p*` projects hold pairs: A, a Mon-Fri activity started Wed
2026-03-11 08:00 with 16 h left, and B, an 8 h activity on a 24-hour
calendar, linked A to B by SS or SF with lags of 0, 8 (spent), 40 and 72 h
(part spent), a lead, and A on a Mon-Thu calendar. The data date is Fri
2026-03-13 17:00, the end of A's working day, so A restarts Mon 08:00.

| Row | Link | P6 B start | Engine before | Engine now |
|---|---|---|---|---|
| P1B | SS, no lag | Fri 03-13 17:00 | Mon 03-16 08:00 | Fri 03-13 17:00 |
| P3B | SS, 8 h (spent) | Fri 03-13 17:00 | Mon 03-16 08:00 | Fri 03-13 17:00 |
| P4B | SS, 40 h (16 h left) | Tue 03-17 17:00 | Tue 03-17 17:00 | Tue 03-17 17:00 |
| P5B | SF, no lag | Fri 03-13 17:00 | Fri 03-13 17:00 | Fri 03-13 17:00 |
| P12B | SS, A on Mon-Thu | Sat 03-14 08:00 (pe24) | Mon 03-16 23:00 | Sat 03-14 08:00 |

The rule, the same under "lag from Early Start" (`pe`, `pe24`, `pw`) and
"lag from Actual Start" (`pa`): **the successor is laid from the data date
itself, with the part of the lag not yet spent at the data date run on from
there on the lag calendar.** The predecessor's restart does not enter. And
since B no longer depends on when A's remaining work runs, A's free float is
not limited by B: P6 prints 384 h (to the project finish) on every A row,
where the engine printed 0.

Under retained logic (`h3s-re`) the successor waits for the restart, as the
engine already did (P1B Mon 08:00 in P6 and here).

## What changed in `cpm.mjs`

Two rules, each a `variant` switch, on by default:

- `poDataDate`: in the forward pass, an SS or SF link out of an activity
  under way in a progress-override project floors the successor's start (SS)
  or finish (SF) at the data date plus the unspent lag (a lead is applied
  from the data date as it stands).
- `poFreeFloat`: in free float, such an activity skips its SS and SF
  successors.

A third candidate, `reSFRestart` (under retained logic an SF link counts
from the restart, which `h3s-re` P5B suggests: P6 Mon 00:00, engine Fri
17:00), fixed that row but made 9 others worse on the whole set (3,813 with
it against 3,822 without), so it ships **off**.

## Results

`node eval/p6-probes.mjs DIR/p6-probes --rows new.json`, against the same
run with `--variant '{"poDataDate":false,"reSFRestart":false,"poFreeFloat":false}'`:

| | Before | After |
|---|---|---|
| All rows, all six values | 3,730 / 5,199 | **3,822 / 5,199** |
| Rows fixed / made worse | | **92 / 0** |
| SS off the predecessor's calendar | 75 / 131 | 90 / 131 |
| Free float | 4,442 | 4,546 |
| `h3-situations` | 328 / 537 | 376 / 537 |
| Six real P6 files (EF, LF, TF) | 19,908 / 19,935 | 19,908 / 19,935 |

Each rule alone: without `poDataDate` 3,788; without `poFreeFloat` 3,746.

Rows fixed, by file:

| File | Rows |
|---|---|
| `h1-situations-2026-10-13/h1s-o.xer` | 12 |
| `h2-situations-2026-10-13/h2s-ro.xer` | 15 |
| `h3-situations-2026-10-14/h3s-pa.xer` | 12 |
| `h3-situations-2026-10-14/h3s-pe.xer` | 12 |
| `h3-situations-2026-10-14/h3s-pe24.xer` | 16 |
| `h3-situations-2026-10-14/h3s-pw.xer` | 7 |
| `susp-lag-rb-break-2026-10-18/splo.xer` | 7 |
| `h15-followups-2026-10-18/sbng.xer` | 2 |
| `h17-followups-2026-10-18/rzf{a,b,c,d,g,s}.xer` | 6 |
| `h10 rd2l`, `h23 aru`, `h4s-a` | 1 each |

`po-data-date.test.mjs` pins the rule on a small hand-made file with the
probe's calendars and dates (three of its six tests fail on the old engine).

## What is left on these files

- `h3s-pe/-pa/-pw/-re` P4A, P12A and P9A: the late start of the started
  predecessor of a lagged SS link (P6 05-20 09:00 against 05-21 08:00 for
  P4A). A backward-pass question, the same on retained logic, so a separate
  rule.
- `h2s-ro` R*Q rows: free float 0 against P6's 196 h on As Late As Possible
  work under progress override (item (d) in NEXT.md).
- `h3s-re` P5B, the retained-logic SF row above.

## Limits

- The rules were fitted on these probes, so the score is not held out.
- No public real file uses progress override with an SS or SF link out of
  work under way at a data date off working time, so the real-file count
  could not move; it did not.
