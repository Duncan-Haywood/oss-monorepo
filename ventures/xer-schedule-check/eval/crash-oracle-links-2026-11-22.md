# Joint acceleration with SS, FF and SF links: brute-force oracle (2026-11-22)

`eval/crash-oracle.mjs` checked `crash.mjs` on finish-to-start networks only
(eval/crash-check-2026-11-22.md, "Not checked"). `eval/crash-oracle-links.mjs`
is the same method on networks with all four P6 relationship types and
whole-day lags, leads included:

- random networks on one Mon-Fri 8-hour calendar, each relationship FS, SS,
  FF or SF with equal odds and a lag drawn from a range (0 to 2 days unless
  stated); each activity 2 to 6 days, a room of 0 to N days (at most its
  duration less one day), a cost of 1 to 5 per day;
- the oracle enumerates every combination of whole-day shortenings and
  schedules each with its own forward pass from the data date (no code shared
  with `cpm.mjs`): start = max(data date, FS: pred finish + lag, SS: pred
  start + lag, FF: pred finish + lag - duration, SF: pred start + lag -
  duration);
- for every whole-day step the tool takes, its cumulative cost is compared
  with the least cost of at least that gain, and the tool's final gain with
  the most the oracle can win.

With FF and SF links an activity's start is pulled back from its finish, so
shortening it can push its own start later and, through an SS or SF
successor, push the project finish out (reverse drag). 3 to 8% of the random
networks have a combination that finishes later than doing nothing; the
oracle drops those, the tool must avoid them.

Replay: `node eval/crash-oracle-links.mjs SEEDS NMAX ROOMMAX DENSITY LAGMIN LAGMAX`.

## Two faults found, both fixed in crash.mjs

The event graph joins each activity's start and finish by its duration (the
edge a cut may buy) and adds an unbreakable finish-to-start edge where a
driven finish pulls the start back. Both faults were missing unbreakable
edges, so the minimum cut chose a set that wins nothing; the tool then set it
aside and, with its members fixed, often found no finite cut at all.

1. **A start held both by the data date and by its finish.** Seed 3: T0
   (4 d) FF+2 T1 (6 d). T1's finish is driven by T0's finish (day 6) and its
   start (6 - 6 = day 0) is also the data date. Shortening T0 alone moves
   nothing: T1 still starts on the data date and runs 6 days. The tool cut
   T0, won nothing, stopped at 0 days; the oracle wins a day by T0 + T1 for
   5. Now a start sitting on its floor (the data date, an external early
   start, a start-on-or-after date) is joined to the source too, and a finish
   sitting on a finish-on-or-after date likewise.
2. **A start driven by a link while its finish is driven by an SF/FF tie.**
   Seed 708 (8 activities, density 2.5): T4's start is driven by T1 (FS) and
   its finish by T2's start (SF+2). The pull-back edge was added only when
   no FS/SS link drove the start, so the cut stopped at T1 + T2 and missed
   that T2's start, held by T0, still holds T4. Now every driven finish pulls
   its start back, whatever else drives the start.

## Results

| Networks | Activities | Room (d) | Density | Lags (d) | Step points | At the optimum, before | Networks missed, before | At the optimum, after | Reached the oracle's most, after |
|---|---|---|---|---|---|---|---|---|---|
| 2,000 | 4-7 | 0-2 | 1.6 | 0 to 2 | 3,807 | 3,723 of 3,728 | 69 | 3,807 | 2,000 |
| 1,000 | 4-8 | 0-3 | 2.5 | 0 to 2 | 3,021 | 2,938 of 2,948 | 61 | 3,021 | 1,000 |
| 1,000 | 4-8 | 0-3 | 3 | -2 to 2 | 2,958 | 2,874 of 2,885 | 57 | 2,958 | 1,000 |
| 300 | 4-9 | 0-3 | 4 | -1 to 3 | 919 | 903 of 903 | 13 | 919 | 300 |
| 500 | 4-7 | 0-4 | 2 | 0 | 1,667 | 1,570 of 1,576 | 62 | 1,667 | 500 |
| 200 | 4-10 | 0-2 | 3 | -2 to 3 | 419 | 413 of 413 | 6 | 419 | 200 |
| **5,000** | | | | | **12,791** | | **268** | **12,791** | **5,000** |

"Networks missed, before" counts networks where the old tool stopped short of
the oracle's most or paid more than the optimum at some step (worst 150% over,
on the 1,000-network row with room 0-3). After the fix every step of every
network costs the least its gain can cost, no step undercuts the oracle, and
every run reaches the oracle's most. No random network needed time given back.

Unchanged by the fix:

- the FS oracle (`node eval/crash-oracle.mjs 1000 9 2 3`: 5,318 of 5,318 at
  the optimum, 1,000 of 1,000 reach);
- the bridge networks (`node eval/crash-bridge.mjs 3000`: 15,283 of 15,283
  with giving back, 69 over without, as before);
- the six public P6 files (`node eval/crash-check.mjs DIR/xer 20`): every
  gain, activity-day total, step count and reschedule count identical to
  crash-check-2026-11-22.json, every replay matches. Their driving networks
  into the finish run through FS links, so neither fault was reachable there.

`crash.test.mjs` runs 300 link networks (547 step points, all at the
optimum) and both found cases.

## Not checked

- Mixed calendars and lag calendars in the oracle (one calendar, lags on
  the predecessor's calendar, which is the same calendar here).
- Progress: every activity is not started; an in-progress activity's start
  is fixed, which the tool treats as on its floor, but no oracle covers it.
- Fractional shortenings: whole days only, as in the FS oracle.
