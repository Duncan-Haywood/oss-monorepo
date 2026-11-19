# One informative wheel, counted by drill (2026-11-19, firmware/esp32/README.md, same title)

## The item

README "The take survey's verdict needs two informative wheels" left `host.TAKE_SURVEY_MIN_KEPT` at 0 after its
held-out set, and ended: "Counted by drill, the design evidence was two wrong drills of 14 (prefixes of one drill are
near-repeats), and held out two right of two, so whether one informative wheel is too few is not settled by these
sets; a minimum would need drill-level counts over more fresh sets." This is that check.

## A scorer fix first

`tests/take_survey_kept.py` rescored every stored row on `controller.TAKE_SURVEY_GRID_US`. That grid became nine
points on 2026-11-19 ("Short takes on a second held-out set"), so the script raised an IndexError on every stored set,
whose board rows carry seven candidates. It now takes each row's grid from the length of its board rows (`GRIDS`: 7,
8 or 9 candidates, the three frames `protocol.OLDER_FORMATS` decodes). With the fix it reproduces
`eval/take-survey-kept-heldout-2026-11-18.txt` line for line.

## Counting by drill

`--drills` adds a count by drill. For each drill, its advised verdicts (from `host.ESC_SURVEY_MIN_WHEELS` wheels on,
and at the drill's end; pick-0 verdicts left out as before) are split by how many kept wheels they rest on. A drill is
a one-wheel drill when some advised verdict rests on exactly one kept wheel, and wrong there when any of those
verdicts is off by more than 1 ms or names a time for an instant build; the same for two or more. Two more counts say
what a minimum of two would do to a drill: it *spares* a drill that told a wrong time at some point with no minimum
and never with the minimum, and it *silences* a drill that advised a right time with no minimum and no time at all
with it.

## Design (the thirteen stored sets, all seen before)

The twelve sets of the kept design file plus the earlier held-out set (lag 0.7 s, seed 23):

| | drills | wrong |
| --- | --- | --- |
| with a verdict on one kept wheel | 16 | 2 (12%) |
| with a verdict on two or more | 528 | 10 (2%) |

A minimum of two spares 2 drills and silences 6. Every one-wheel drill is on a jittery-tach set (the board's
default tach); the MCPWM capture sets keep three or more wheels a drill. On the five jittery sets alone: 2 of 15 and
3 of 100. Sixteen drills is too few to tell 12% from 2%.

## Pre-registration (written and committed before any fresh set is captured)

Held out: six fresh jittery-tach sets, the board's default (`tests/take_survey_jitter.py --capture`, no
`--tach-capture`), 72 drills each (4 takes x 6 jitters x 3 launchers), on the current tree (nine-point grid,
`TAKE_SURVEY_BLIND` 1.5, `TAKE_SURVEY_TRIM` 0), wheel lags and seeds no earlier run used:

| set | lag (s) | seed |
| --- | --- | --- |
| Q | 0.34 | 401 |
| R | 0.42 | 409 |
| S | 0.50 | 419 |
| T | 0.58 | 421 |
| U | 0.66 | 431 |
| V | 0.74 | 433 |

Scored pooled with `tests/take_survey_kept.py <six files> --ks 0,2 --by-kept --drills`.

PREDICTION, pooled over the six sets:

- (a) Drills with a one-kept-wheel verdict are wrong there at least three times as often (as a share) as drills
  with a verdict on two or more kept wheels are wrong on those, and at least 2 such drills are wrong. Void if fewer
  than 8 drills have a one-kept-wheel verdict.
- (b) A minimum of two silences at most three times as many drills as it spares. (A silenced drill costs a builder
  one more drill of balls before the Pi advises; a spared one is a wrong `TAKE_US` the builder would have flashed, a
  config error that persists until another survey. Three to one is the trade this rule accepts.)
- (c) At the drill's end, a minimum of two names and advises right at least as many builds as no minimum, less 3.
- (d) A minimum of two invents no take that no minimum does not (it can only hold verdicts back; checked anyway).

DECISION RULE: `host.TAKE_SURVEY_MIN_KEPT = 2` ships if (a), (b), (c) and (d) all hold. If any fails, or (a) is void,
it stays at 0 and the item closes for simulated sets: on the simulator one informative wheel is no worse a basis for
advice than two, and the question reopens only on a real wheel's logs (a real tach's blind rows will not tie as
exactly as the simulator's).

## Held-out result (captured after the pre-registration was committed, a9af0c377)

`tests/take_survey_jitter.py --capture ... --lag <lag> --seed <seed> --procs 4` for the six sets, 432 drills, none
aborted; rows `eval/take-survey-kept-drills-{q,r,s,t,u,v}-2026-11-19.jsonl.gz`, scored output
`eval/take-survey-kept-drills-heldout-2026-11-19.txt`.

| pooled, six fresh sets | drills | wrong |
| --- | --- | --- |
| with a verdict on one kept wheel | 6 | 1 (17%) |
| with a verdict on two or more | 149 | 1 (1%) |

| | min kept 0 (today) | min kept 2 |
| --- | --- | --- |
| end of drill: right / wrong / invented / held | 134 / 1 / 0 / 0 | 134 / 1 / 0 / 0 |
| prefixes: right / wrong / invented / held | 948 / 10 / 0 / 0 | 933 / 6 / 0 / 19 |

A minimum of two spares 1 drill and silences none. Advised prefix verdicts by kept wheels: 1, 15 right and 4 wrong;
2, 56 and 0; 3, 112 and 0; 4, 137 and 0; 5, 125 and 6; 6 or more, 503 and 0.

- (a) **void**: 6 drills had a verdict on one kept wheel, fewer than the 8 the rule asked for. (Had it counted, 17%
  against 1% with two wrong drills asked and one seen, it would have failed on the count.)
- (b) held: 0 silenced, 1 spared.
- (c) held: 134 right at the drill's end either way.
- (d) held: neither invents a take.

**Decision, by the rule: `host.TAKE_SURVEY_MIN_KEPT` stays 0, and the item closes for simulated sets.**

## What the six drills were

All six are half-sine takes (four 6 ms, one 3 ms) on the jittery tach at 1-3 us. Five read within 1 ms on their one
wheel (3 ms read 2.5; 6 ms read 5.0-6.0) and were advised right or kept quiet at the end. The wrong one is set U's
6 ms build at 3 us of jitter, launcher 2: its one kept wheel read 8 ms from the 16th to the 19th wheel, and by the
drill's end (3 kept wheels) the pick was 3.5 ms at a share over 0.6, so the Pi said nothing. A builder whose drill
stopped at 16-19 balls would have been told 8 ms for a 6 ms take.

## What it means

Over all nineteen sets (thirteen seen, six fresh) a one-kept-wheel verdict was wrong in 3 of 22 drills (14%) and a
verdict on two or more in 11 of 677 (2%). The direction is the one the minimum assumes, but a one-wheel verdict turns
up in about one drill in sixty (22 of 1,365), and over all 1,365 drills a minimum of two would have spared 3 and
silenced 6. That is too rare to settle on the simulator, and too rare to matter much for a builder either way: the
16-wheel minimum and the 0.6 share bar already keep most single-wheel reads quiet. Reopen it with a real wheel's logs,
whose blind rows will not tie as exactly as the simulator's, so the kept count, and how often it is one, may differ.
