# The look-ahead against P6's own stored dates, 2026-11-19

**Question.** A superintendent's weekly meeting runs on a look-ahead: the
next one to six weeks of work, by area, with a bar per day and a note of
what each activity still waits on. Field teams usually make it by hand from
a P6 layout or a PDF. `lookahead.mjs` builds it from the XER with the
recomputed CPM. Does it put the same activities in the window that P6's own
dates would, are the bars on the right days, and are the "waits on" notes
consistent with P6's dates?

**Data.** The seven public P6 exports used by `eval/cpm-vs-p6-2026-11-19.md`
and `eval/edited-durations-2026-11-19.md` (CCA 6.0, Expressway 7.0, hotel 6.0,
terminal 5.0, the 24.12 example, the 20.12 sample and Harbour Pointe 17.12),
fetched again from the same repositories and not committed.

**Method.** `node eval/lookahead-check.mjs <dir> --weeks N --json ...` for
N = 1, 3 and 6 (outputs `lookahead-check-2026-11-19-w{1,3,6}.{txt,json}`).

1. *Membership.* An activity is in P6's window when P6's stored remaining
   start (`restart_date` for started work, else `early_start_date`) is
   before the window's end and its stored `early_end_date` after the data
   date (a milestone: its date in the window). Compared with the look-ahead's
   list, built from the recomputed dates, in both directions.
2. *Bars.* The first worked day is the day of the remaining start (or the
   next working day when the start falls at a day's end), the last is the
   finish's day when it finishes in the window, and no bar sits on a day the
   activity's calendar does not work.
3. *Waits.* For each activity the look-ahead says waits on look-ahead work,
   every gating predecessor's stored early finish (FS) or start (SS), plus
   the link's lag on the lag calendar, is at or before the activity's stored
   early start. P6's dates meet the logic by construction, so this checks
   that the gate was read from the right link, not the dates themselves.

Two files have no work in the first window: the hotel project's planned
start is 25 days after its data date, and Expressway's first work is two
weeks out. For those the check (and the tool, which says so in a warning)
reads the window from the day the first open work starts; the page and CLI
take that start date as an input.

## Result

| Window | Activities in P6's window | In both | Only the look-ahead | Only P6's | Bars wrong | Waits consistent with P6 |
|---|---|---|---|---|---|---|
| 1 week | 1,468 | 1,467 | 0 | 1 | 0 | 142 / 142 |
| 3 weeks | 2,071 | 2,069 | 0 | 2 | 0 | 359 / 359 |
| 6 weeks | 2,940 | 2,940 | 0 | 0 | 0 | 758 / 758 |

The two activities only P6 puts in the window are CCA's BAFT2305509C1 and
SAFT2305509C0, the pair behind a 608 h lag the file's own dates leave only
440 h for (`eval/edited-lags-2026-11-19.md`): P6's stored dates predate the
lag edit, so the look-ahead, which reschedules with the file as it is, puts
them 24 days later. At six weeks both dates fall inside and the lists agree.

The first reading had one "waits" that P6's dates seemed to contradict (hotel
HCESCN000 after HMMOAZ030, FS): the link carries a lead, and the check had not
applied the lag. With the lag it agrees; the tool's own reading was right.

## What the make-ready check finds on real files

Three-week window, per file:

| File | In window | In progress | Ready | Waits (look-ahead work) | No predecessor | Out of sequence |
|---|---|---|---|---|---|---|
| CCA (6.0) | 1,887 | 1,465 | 148 | 264 | 10 | 592 |
| Expressway (7.0) | 87 | 0 | 0 | 40 | 47 | 0 |
| Harbour Pointe (17.12) | 9 | 5 | 0 | 4 | 0 | 0 |
| example (24.12) | 46 | 21 | 0 | 24 | 1 | 1 |
| hotel (6.0), from its first work | 32 | 0 | 0 | 31 | 1 | 0 |
| sample (20.12) | 5 | 0 | 0 | 4 | 1 | 0 |
| terminal (5.0) | 3 | 0 | 0 | 2 | 1 | 0 |

Two of those are things a site meeting would want to hear:

- **Expressway**: 47 of the 87 activities in the first three weeks have no
  predecessor at all; their dates come only from the project's planned start.
  On a look-ahead that reads as "all start on 16 July", which is the
  schedule's open-start problem (DCMA point 1) showing up as a planning one.
- **CCA**: 592 of the 1,465 activities in progress in the window started
  before a predecessor finished (FS) or started (SS). Under retained logic
  their remaining work waits for that predecessor, so their bars show the
  wait, not the crew that is on site; the look-ahead names the predecessor.

## Not checked

- "Ready" is from the logic alone. Crews, materials, information, permits and
  inspections are what a make-ready meeting actually checks, and none of
  them is in a P6 file; the page and the printed sheet say so.
- No public file stores a P6 look-ahead layout to compare the grouping or the
  bars with; WBS order here is the WBS path in text order, not P6's
  `seq_num`.
- Seven files from seven sources, as in the CPM check.
