# Expected finish dates against P6's own dates, 2026-11-19

**Question.** P6's "use expected end dates" schedule option
(`SCHEDOPTIONS.sched_use_expect_end_flag`) lets a scheduler type an
expected finish on an activity (`TASK.expect_end_date`); P6 then sets the
remaining duration so the activity ends there. The engine used the stored
remaining duration only, which reproduces P6's dates on an unchanged file but
not in any what-if (critical path test, half-step, risk, levelling), where
P6 would hold the expected finish and shrink or grow the duration instead.
What rule reproduces P6, and what does it hide from a reviewer?

**Data.** The six public XER files of `eval/cpm-vs-p6-2026-11-19.md`
(fetched, not committed). Five turn the option on (CCA, hotel, terminal,
sample, the 24.12 example); Expressway turns it off. Only the P6 24.12
example (Badr1600/p6-analyzer @ ec457f3, `tests/fixtures/`, MIT) stores
expected finishes: 23 open activities.

**Method.** `node eval/expected-finish.mjs <dir> --json eval/expected-finish-2026-11-19.json`.

**Rule (cpm.mjs).** Forward pass, for an unfinished activity with an
expected finish when its project has the option on: remaining duration =
working time on its own calendar from where its remaining work starts to the
expected finish. When the expected finish is at or before that start, it is
ignored and the stored remaining duration stands. The critical path test's
added delay goes on top. The backward pass and as-late-as-possible step use
the same duration.

**Result (24.12 file).**

| Check | Result |
|---|---|
| Activities the rule sets (expected finish after remaining start) | 21 |
| ... whose stored remaining duration equals the time to the expected finish | 21 of 21 |
| Activities whose expected finish is already behind their start (A10500, A10510; both before the data date) | 2; P6 kept their stored 39.6 h and 40 h, and the engine's dates equal P6's on both |
| Open activities matching P6 (EF, LF, TF), file as stored | 404 / 404 (unchanged from before the rule) |
| ... after adding 80 h to each of the 21 stored durations, rule on | 404 / 404 |
| ... same planted error, rule off | 0 / 404 |
| All six files, `eval/cpm-vs-p6.mjs` | 19,820 / 19,822, unchanged |

One expected finish (A10820, 2026-07-19 08:02) falls on a Sunday; the
working time to it ends Friday 17:00, which is the finish P6 stored.

**What it hides.** For each of the 21, its latest-finishing open predecessor
was delayed 10 working days:

| Predecessor +10 d | Activity | Its finish moves (rule on / off) | Project finish moves (on / off) |
|---|---|---|---|
| A10360 | A10370 | 0 / 0 d | 0 / 0 d |
| A10370 | A10380 | **0 / 10 d** | 0 / 0 d |
| A10520 | A10590 | **0 / 10 d** | **0 / 0.9 d** |
| A10210 | A10210.1 | 0 / 0 d | 10 / 10 d |

The other 17 have no open predecessor with a duration. Two activities absorb
the whole slip, and on this file 0.9 day of project finish movement
disappears. The reviewer finding (`dcma.mjs`, "Expected finish dates setting
durations", medium in the written review) lists every one; for started
activities with a physical % complete it adds the time left at the rate so
far: on this file 7 activities are 1-3% done after 18-22 working days with
expected finishes leaving 0.8 to 209.7 days (A12730: 2% in 22 d, so 1,078 d
at that rate, against 6.4 d set), and A14110 is 0% done after 21 days with
16.6 days set. (Physical % complete may be entered loosely; the finding says
"at the rate so far", not a forecast.)

**Risk runs.** With the option on, an activity with an expected finish keeps
its date in every Monte Carlo run, as P6 would schedule it, so its sampled
duration has no effect. That is P6's behaviour, but a risk analyst usually
wants the range to count; a switch to sample them anyway (run with
`expectedFinish: false`) is not on the page yet.

**What is left.** One file is thin evidence: a second P6 file with expected
finishes (ideally two updates of one job, so the half-step can be checked
against P6), and the rule for an expected finish on a not-started activity
with a start constraint, which no file here has.
