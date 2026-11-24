# P6's relationship dates on links with a started end, 2026-11-24

**Question.** `eval/relationship-dates-2026-11-20.md` decoded the two dates P6
writes on every link (TASKPRED `aref`, `arls`) between two unstarted
activities, and `arls` from a finished predecessor into an unstarted one
(FS and FF only). It left out every link touching an **in-progress**
activity ("Not checked: Started activities"). In a monthly update review
those are the links that matter most: the work under way is where a lag gets
trimmed to keep a date. What does P6 write on them, and can a lag changed
after the last schedule run be read back there too?

**Data.** The six P6 files that store relationship dates (the five of
`eval/cpm-vs-p6-2026-11-19.md` with them, fetched with `bash
eval/corpus-fetch.sh DIR`, and Harbour Pointe, P6 17.12, from
djouallah/Xer-Reader-PowerBI `xerfile/`, md5
f80412fd4851c0308ff5839d33b31dad). Not committed (their licences do not
cover redistribution). The P6 24.12 Web file writes no `aref`/`arls`.

**Method.** `node eval/relationship-dates.mjs DIR --json
eval/relationship-dates-started-2026-11-24.json` (section 5 is new; 10 seeds,
20 edits per seed per file; 12 s for all seven files). Sections 1 to 4 are
unchanged and reproduce the 2026-11-20 numbers exactly (40,476 of 40,476
`arls`, 1,200 of 1,200 planted edits, 1,545 of 1,549 finished nodes).

## One rule: the dates carry the lag still unspent at the data date

For every link whose successor is not finished and where either end has
started, read the dates with the same formulas as between unstarted
activities (a started activity's stored early and late dates are its
remaining ones), but against the **unspent lag**:

    unspent = max(0, lag - working time on the lag calendar from the
              predecessor's actual finish (FS, FF) or actual start (SS)
              to the data date)

A predecessor that has not finished spends none of an FS or FF lag; one that
has not started spends none of an SS lag. A finished predecessor has no early
dates, so `arls` is its only witness. This is the engine's rule 17 (finished
predecessors) extended to started SS predecessors, where P6 counts an SS lag
as running from the actual start.

| Predecessor, successor | FS | SS | FF |
|---|---|---|---|
| in progress, in progress | 1,595 / 1,595 | 1,074 / 1,074 | 282 / 282 |
| in progress, not started | 3,501 / 3,501 | 351 / 351 | 285 / 285 |
| finished, in progress | 1,961 / 1,961 | 118 / 118 | 31 / 31 |
| finished, not started | 1,861 / 1,861 | 50 / 50 | 33 / 33 |
| not started, in progress | 305 / 305 | 92 / 92 | 71 / 71 |
| **Total** | | | **11,610 of 11,610** |

(CCA, P6 6.0: 11,592; Harbour Pointe: 18. The other four files have no
started work with relationship dates.) `aref`, where both are read, agrees
as well except on 4 of Harbour Pointe's FS links, the same P6 17.12 drift of
a few minutes seen on unstarted links; `arls` is the witness there, as
before. Before this, 1,894 of these links were checked (finished
predecessor, FS and FF into unstarted work); now 11,610 are, so **9,716 more
links** can show a lag edited after the run.

The SS row is the one that needed the rule. Read with the whole lag, only 379
of 1,074 in-progress SS links agree; the dates carry no lag at all on 1,073 of
them, because the predecessor started long enough ago to spend it.

## What it gives the product

`reldates.mjs` (`relationshipLags`, now `started`; `finished` is kept as
the same object) lists a link whose stored dates carry a different unspent
lag than the current one:

- **some of the old lag was unspent** at the run, or none had been spent
  (an FS lag from an unfinished predecessor): the old lag reads back
  exactly, spent + the lag the dates carry;
- **none was left** at the run but the current lag leaves some: the old lag
  is only known to be **at most** the working time already spent. The
  assessment says exactly that ("the lag was at most 40 h (5 d), the working
  time already spent since A1050's actual start"), never an invented value,
  and the reschedule that puts lags back uses that bound, which gives P6's
  own dates (any lag up to it leaves nothing unspent).
- A change that leaves nothing unspent before and after (an SS lag of 24 h
  cut to 16 h on an activity that started 40 h ago) moves no date P6 would
  compute, cannot be seen in the file, and is not listed.

Planted lag changes on links P6's dates agree with, -10 to +20 working days of
8 h, without rescheduling:

| | Planted | Invisible (nothing unspent either way) | Visible | Old lag exact | "At most" bound holds | Wrong | Missed | Listed but not planted |
|---|---|---|---|---|---|---|---|---|
| CCA | 200 | 83 | 117 | 113 | 4 | 0 | 0 | 0 |
| Harbour Pointe | 180 | 112 | 68 | 60 | 8 | 0 | 0 | 0 |
| **Total** | **380** | **195** (0 listed) | **185** | **173** | **12** | **0** | **0** | **0** |

As found, the six files list no changed lag on a started link.

Harbour Pointe's 180 (not 200) is its 18 started links, each picked once per
seed. The invisible share is high because most real started links have a lag
of 0 or one already spent; that is the file, not the check.

## Not checked

SF links (none started in these files). An SS link whose lag calendar is not
the predecessor's (`arls` not decoded there, as before). A started
successor's FS link whose predecessor finished after the successor started
(out of sequence): those decode too here, but no planted test isolates them.
A P6 file statused by a scheduler and exported without a reschedule, with a
real lag edit on work in progress: the planted edits stand in for one.
