# Resource levelling on six public P6 files, 2026-11-19

**Question.** Does `level.mjs` produce a valid levelled schedule on real P6
exports? No public XER stores P6's own levelled dates, so the dates cannot be
compared with P6's yet. What can be checked is what makes a levelled schedule
valid, and that the levelling machinery changes nothing when there is nothing
to level.

**Data.** The six public XER files of `eval/cpm-vs-p6-2026-11-19.md` (fetched
for the check, not committed). Four carry resource limits (RSRCRATE
`max_qty_per_hr` above 0); two have none.

**Method.** `node eval/level-check.mjs <dir> --json eval/level-check-2026-11-19.json`,
defaults (all resource types, the file's levelling settings). Per file:

1. **Self-check:** hours in which a resource is over its limit while an
   activity the levelling placed (not started, not listed as unfittable) is
   using it. Must be 0.
2. **Links:** every zero-lag FS, SS and FF link between two not-started
   activities still holds in the levelled dates, checked by the script
   (not by `cpm.mjs`).
3. **Nothing starts earlier** than its unlevelled early start.
4. **Limits x 1e6:** the levelled dates equal the CPM dates on every open
   activity (the levelling path itself moves nothing).
5. Finish with limits x2 and x4 (the page's crew-size box).

**Result.**

| File | Resources levelled | Finish -> levelled | Moved | Left | Self-check | Links hold | Earlier | x1e6 = CPM | x2 | x4 | Time |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CCA (6.0) | 104 | 2013-06-22 -> 2042-10-12 | 9,943 | 3,368 | 0 h | 29,879 / 29,879 | 0 | 14,270 / 14,270 | 2043-03-18 | 2043-02-07 | 188 s |
| Expressway (7.0) | 322 | 2016-08-28 -> 2045-05-01 | 562 | 473 | 0 h | 990 / 990 | 0 | 823 / 823 | 2040-11-29 | 2030-06-24 | 2.7 s |
| hotel (6.0) | 6 | 2014-07-23 -> 2021-03-15 | 1,119 | 55 | 0 h | 6,250 / 6,250 | 0 | 4,236 / 4,236 | 2017-03-29 | 2015-07-06 | 11.7 s |
| example (24.12) | 26 | 2027-05-06 -> 2027-06-16 | 297 | 16 | 0 h | 454 / 454 | 0 | 404 / 404 | 2027-06-16 | 2027-05-06 | 0.09 s |
| terminal (5.0) | 0 (no limits) | unchanged | 0 | 0 | 0 h | 56 / 56 | 0 | 66 / 66 | | | |
| sample (20.12) | 0 (no resources) | unchanged | 0 | 0 | 0 h | 41 / 41 | 0 | 42 / 42 | | | |

"Moved" counts every activity whose dates changed, those delayed for a
resource and those their logic carried along. "Left": activities that alone
need more of a resource than its limit (started work is never moved either),
or that would start more than 30 years after the data date.

**Reading.** The levelling holds every limit it can hold and every link on
all six files. The finish dates are a finding about the files, not the
method:

- **hotel**: three labour and equipment resources at limits of 1 to 1.5 per
  hour are used at up to 10.5 at once. Levelled, the 2014 finish moves to
  2021; the resource bound (R-7's remaining work at its limit) is 2019-02.
  With crews 4 times larger the finish is 2015-07.
- **Expressway** and **CCA**: every labour resource has a limit of 1 per hour
  (P6's default for a new resource) and is used at up to 43 at once, and CCA
  loads quantities (`QTY ...`) as resources with the same default limit.
  Levelling runs into the 30-year horizon on both. The page warns about the
  default limit for exactly this case.
- On CCA and Expressway, hours over the limit after levelling can exceed the
  figure before: the activities left over-allocated are spread over decades
  instead of overlapping at once. The self-check (0 h) is the figure that
  measures the levelling itself.

**Bugs found by this check and fixed before it passed.** The first run gave
6,629 self-check hours on CCA: a started activity tied on start time with
not-started ones was placed after them, so they were placed without seeing
its use (started work is now placed first; unit test "started work that
alone passes the limit"). Also fixed: an activity's own second assignment on
the same resource now counts against it, and as-late-as-possible activities
are re-placed after the full run (20 on CCA).

**Not checked.** P6's own levelled dates (no public file stores a levelled
run); resource curves, overtime, splitting and resource calendars are not
modelled; two activities on different shift calendars whose spans overlap
count as overlapping.
