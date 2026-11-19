# Straddling wheels vote on the short takes (2026-11-19, firmware/esp32/README.md, same title)

Item from `portfolio/flagships.yaml` (open-tennis-robots `buildable:`): "the 1.3-2 ms takes every blind reads as instant
(eval/take-blind-nine-2026-11-19.md): a per-wheel straddle count to separate them". The standard-error note
(eval/take-bound-floor-se-2026-11-19.md) closed on the same wall: an instant build and a 2 ms one are not told apart by
any spread of their 1.5 ms candidate's rms over the step's, and asked for "a per-wheel straddle count, say".

## Two straddle counts, read on the design sets

**From the rows alone (does not separate).** Counting, on the kept wheels of the 393 builds told TAKE_US = 0 in all nine
stored design sets (66 instant, 174 at 1.3-2.5 ms), how many fit 1.5 ms better than the step and how many worse (by
more than 0 to 30% of the step's squared rms) separated the two groups with an AUC of 0.65-0.84, worse than the summed
rms's own 0.92. Used to tighten the TAKE_US = 0 bound to 1.5 ms where the 2 ppm floor loosens it, the best such count won back 1
of the 7 instant builds without a miss. The 10 real takes that floor 0 misses have as many "worse at 1.5 ms" wheels as
the instant builds do. A wheel's row says how much its candidates differ, not why.

**From the fit (separates).** Sets O, P, W, X, Y and Z store each wheel's inputs as the board passed them, so each kept
wheel can be refitted at 1.5 ms through a copy of the fit that also returns t0 and the revolution edges
(tests/take_blind_trace.py's `_fit_with_t0`; the refit matched the board's rms on all 5,456 wheels). On a wheel where the
take's four parts, placed at the fitted t0, fall in two revolutions ("straddle"), 1.5 ms fitting better than the step is
a vote for it:

| builds told TAKE_US = 0 (248) | straddling wheels: 1.5 ms better / worse | non-straddling kept wheels: better / worse |
| --- | --- | --- |
| instant (36) | 6 / 45 | 56 / 57 |
| 1.3-2.5 ms (120) | 119 / 7 | 159 / 159 |
| other takes (92) | 21 / 95 | 126 / 133 |

The non-straddling wheels split evenly whatever the take: there 1.5 ms and the step differ by noise, and the sums carry
that noise along with the few wheels that see the take. The 8 builds floor 0 misses all had no straddling wheel at all.

## What was built

- `controller.drop_from_commands_steps` returns an eighth field, `edge`: whether the take's parts at the fitted t0 fall
  across a period's edge (one pass over the edges, after the fit).
- `ResidualSurvey.add(got, edge)` counts, on kept wheels only, `straddle_for` (the vote's candidate fits better than the
  step) and `straddle_against`; `controller.TAKE_STRADDLE_US = 1500` names the candidate. No extra rows are stored.
- The TAKE_SURVEY frame (0x84) carries both as two more bytes; the Pi decodes the older 15-value frame with `None`.
- `host.take_survey_advice`: when the sums' line (`take_survey_advice_sums`, the old function) says TAKE_US = 0 and
  for - against reaches `host.TAKE_STRADDLE_MARGIN`, the Pi advises 1.5 ms and says why. 0 turns it off.
- `tests/take_straddle_vote.py` rescores captures that carry wheel inputs at several margins, judged as
  tests/take_blind_nine.py judges (named: advised within 1 ms of the true take; bad: an instant build told to set one).

## Design (six stored jittery and capture-tach sets, 336 builds; eval/take-straddle-vote-design-2026-11-19.txt)

Run on the board's code path (the sim's frames carry the counts):

| margin | named (of 300 spread) | instant told to set a take (of 36) | right that off was not | wrong that off got right |
| --- | --- | --- | --- | --- |
| 0 (off) | 160 | 0 | - | - |
| 1 | 233 | 1 | 75 | 3 |
| 2 | 190 | 0 | 30 | 0 |
| 3 | 169 | 0 | 9 | 0 |

Margin 1 names the most but tells one instant build to set 1.5 ms and un-names three (0.1 ms takes advised 1.5). Margin
2 is the least margin with no harm on the design, so it is the candidate.

## Prediction and rule (written and committed before sets AC and AD were captured or AA and AB scored for the vote)

Sets: AA and AB as stored (jittery tach, lags 0.42 and 0.54 s, seeds 167 and 173; scored before only for the blind rule,
never for this vote), and two fresh ones on this tree: AC, lag 0.46 s, seed 179; AD, lag 0.62 s, seed 181 (neither seed
used by an earlier capture: the stored ones are 7-173 and 401-443). Jittery tach (`--tach 1`), three launchers, takes
0.1, 0.5, 0.9, 1.3, 1.6, 2.0, 2.4, 2.8, 3.5, 5.0 ms and 0, 33 drills a set:

    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_survey_pick.py --capture ac.jsonl --lag 0.46 --seed 179 --procs 4 --takes "0.1,0.5,0.9,1.3,1.6,2.0,2.4,2.8,3.5,5.0,0" --tach 1
    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_survey_pick.py --capture ad.jsonl --lag 0.62 --seed 181 --procs 4 --takes "0.1,0.5,0.9,1.3,1.6,2.0,2.4,2.8,3.5,5.0,0" --tach 1
    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_straddle_vote.py --procs 4 --margins 0,1,2,3 AA AB AC AD

PREDICTION, pooled over the four sets (132 drills): (a) margin 2 names more spread takes than off; (b) it tells no
instant build to set a take; (c) it un-names fewer than one build per five it newly names; (d) on AC and AD the board's
own counts in each frame equal the rebuild's (the scorer asserts it).

DECISION RULE: `host.TAKE_STRADDLE_MARGIN` ships at 2 only if (a), (b), (c) and (d) all hold. Otherwise it ships at 0
(off), the board still sends the counts, and the vote goes back to NEXT.md with these numbers. Margins 1 and 3 are
reported, not decided on.

## Result

(Filled in after the capture.)
