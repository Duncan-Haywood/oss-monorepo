# Free float on activities with an expected finish, 2026-11-20

**Question.** After the four free-float rules of `eval/free-float-2026-11-19.md`,
9 open activities in the P6 24.12 file still disagreed: P6 stores free float 0
where the file's own dates leave a positive gap to every successor (A10590
finishes 2026-11-11 16:12, its only successor A10600 starts 2026-11-20 08:00,
P6 says 0, the engine said 48.8 h). That note left them "as they are rather
than fitted". What do the 9 have in common?

**Data.** The six public XER files of `eval/cpm-vs-p6-2026-11-19.md`, fetched
again from the same commits (not committed). Only the 24.12 example
(Badr1600/p6-analyzer @ ec457f3, `tests/fixtures/`, MIT) stores expected
finishes; its project turns "use expected end dates" on
(`SCHEDOPTIONS.sched_use_expect_end_flag = Y`).

**Finding.** All 9 have an expected finish (`TASK.expect_end_date`): A10380,
A10590, A15450, A15460 and A10810.1 to .5. Nothing else sets them apart: 5 are
started and 4 not, their links are FS, SS and FF, one (A10380) is an open end,
and none was edited after P6's last schedule run (`update_date` before
`last_schedule_date` on all 9).

| 24.12 file, open activities | Count | P6 stores |
|---|---|---|
| with an expected finish | 23 | 0 on all 23 |
| ... of them with a positive gap in the file's dates | 9 | 0 on all 9 |
| without one, with a positive gap | 72 | the gap, on all 72 |

So on this file the expected finish separates the two cases exactly. The rule
(`cpm.mjs`, variant `ffExpected`, on by default): an open activity with an
expected finish, in a project that uses them, has free float 0. A plausible
reading is that P6 treats the expected date as the activity's planned finish
"just in time", but Oracle's documentation does not say so that we found;
the rule is measured, from one file.

**Method.** `node eval/free-float-expected.mjs <file.xer>` counts the table
above with the rule on and off; `eval/free-float-expected-2026-11-20.json`
holds its output on all six files. `node eval/cpm-vs-p6.mjs <dir>` gives the
totals.

## Result

| File | Free float, rule off | Rule on |
|---|---|---|
| CCA (6.0) | 14,268 / 14,270 | 14,268 |
| Expressway (7.0) | 823 / 823 | 823 |
| hotel (6.0) | 4,217 / 4,217 | 4,217 |
| terminal (5.0) | 66 / 66 | 66 |
| example (24.12) | 395 / 404 | **404** |
| sample (20.12) | 42 / 42 | 42 |
| **Total** | **19,810 / 19,822 (99.94%)** | **19,820 / 19,822 (99.99%)** |

Early finish, late finish and total float are unchanged (19,820 of 19,822;
total float is still the plain late-minus-early gap, so A10590 keeps P6's
120.8 h). The two left are CCA activities whose early dates already differ
(`eval/cpm-vs-p6-2026-11-19.md`, "What is left").

## Limits

- One file, one P6 version (24.12 Web). The five other files store no
  expected finish, so the rule is untested on them; a file from P6 8 to 23
  could show it began in a later version.
- The engine's as-late-as-possible step uses free float, so an ALAP activity
  with an expected finish now stays put. No file here has one; P6's own
  behaviour there is unchecked.
- With `schedule(xer, { expectedFinish: false })` (the what-if without
  expected finishes) the rule is off too and the plain gap comes back.

## Where it shows

The schedule CSV (`scheduleCsv`, the page's download, `cli.mjs --schedule`)
now gives 0 free float on these activities, as P6 does. Free float feeds no
DCMA point.
