# The take survey skips take-blind wheels (2026-11-18, firmware/esp32/README.md "The take survey skips take-blind wheels")

## Design (on the ten stored capture sets, all seen before)

README "Take-blind rows traced" found that a contact-time candidate whose parts all land inside one revolution fits
exactly as the step does, so most wheels give every candidate the same residual. Such a wheel adds the same amount to
every candidate's sum: it cannot move the pick, but it pulls the best / step share toward 1 and so hides the advice.

The change: `ResidualSurvey(grid, trim, blind)` leaves a wheel out of the sums when its worst candidate's squared rms
is at most `blind` times its best's (the wheel cannot tell the candidates apart). It is a rule on the wheel's own row,
needs no memory, and on the board costs one min and max per wheel.

Rescored with tests/take_survey_blind.py from the stored `board_scores` of every take-survey capture set (each set 72
survey drills: 54 spread takes, 18 instant builds), at `blind` 1 (off, today's board), 1.0001, 1.001, 1.01, 1.05,
1.1, 1.2, 1.5 and 2. The sweep was looked at on all ten sets before the value was chosen, so these are design numbers,
not a held-out result. At 1.5 (the chosen value), against off:

| set | named and advised, off | at 1.5 | instant advised, off | at 1.5 |
| --- | --- | --- | --- | --- |
| capture sub 1, design (0.3 s, seed 7) | 25 | 35 | 0 | 0 |
| capture sub 1, held out (0.45 s, seed 11) | 43 | 46 | 0 | 0 |
| capture sub 1, fresh (0.38 s, seed 13) | 30 | 43 | 0 | 0 |
| capture sub 1, third (0.52 s, seed 17) | 40 | 43 | 0 | 0 |
| capture sub 8, design | 44 | 44 | 0 | 0 |
| capture sub 8, held out | 42 | 42 | 1 | 0 |
| capture sub 8, fresh | 45 | 54 | 0 | 0 |
| capture sub 8, third | 42 | 47 | 0 | 0 |
| jittery tach (no capture), design | 10 | 17 | 0 | 0 |
| jittery tach (no capture), held out | 9 | 27 | 0 | 0 |

On the jittery held-out set 3 of 72 builds had every wheel left out (no survey verdict; the board then reports
nothing, as before its first wheel).

## Pre-registration (written and committed before the held-out captures are run)

Held out: two fresh sets of the same 72 builds at wheel lag 0.6 s, seed 19, never run before: (A) the MCPWM capture at
1/8 us (`--tach-capture --sub 8`, the capture's shipped clock) and (B) the jittery tach with no capture (the board's
default, `TACH_CAPTURE` off). Each is captured once with tests/take_survey_jitter.py and scored with
tests/take_survey_blind.py at `blind` 1 (off) and 1.5.

PREDICTION, on each set: (a) spread takes named within 1 ms and advised at 1.5 at least as many as off; (b) instant
builds advised at 1.5 no more than off; (c) picks within 1 ms at 1.5 no fewer than off minus 2.
DECISION RULE: if (a), (b) and (c) hold on both sets, `controller.TAKE_SURVEY_BLIND = 1.5` ships as the take survey's
default. If (b) fails on either set, it ships off (1), whatever (a) says: the filter must not invent takes. If (b)
holds and (a) or (c) fails, it ships off and the README reports the miss.

## Held out (run after the pre-registration was committed, 5314d04f5)

Captured with tests/take_survey_jitter.py from a frozen copy of 5314d04f5's tree (the capture's workers re-import the
code per drill, so the working tree's edits could not leak in), lag 0.6 s, seed 19, 72 drills each; scored with
tests/take_survey_blind.py --blinds 1,1.5. Rows: eval/take-survey-blind-heldout-capture-sub8-2026-11-18.jsonl.gz (A)
and eval/take-survey-blind-heldout-jitter-2026-11-18.jsonl.gz (B).

| set | blind | named and advised (of 54) | instant advised (of 18) | within 1 ms (of 72) | mean share | wheels left out |
| --- | --- | --- | --- | --- | --- | --- |
| A capture 1/8 us | 1 (off) | 54 | 0 | 72 | 0.20 | 0 of 1584 |
| A capture 1/8 us | 1.5 | 54 | 0 | 72 | 0.20 | 200 of 1584 |
| B jittery tach | 1 (off) | 12 | 0 | 68 | 0.75 | 0 of 1584 |
| B jittery tach | 1.5 | 26 | 0 | 68 | 0.59 | 1149 of 1584 |

B per jitter (0, 0.5, 1, 1.5, 2, 3 us; named and advised of 9, off -> 1.5): 8 -> 9, 3 -> 8, 1 -> 6, 0 -> 1, 0 -> 1,
0 -> 1. No instant build advised at any jitter either way.

Verdict by the rule: (a) holds on both (54 = 54, 26 > 12), (b) holds on both (0 and 0), (c) holds on both (72 = 72,
68 = 68). `controller.TAKE_SURVEY_BLIND = 1.5` ships. Set A sat at its ceiling (every spread take named and advised
without the filter, the easiest set yet at the longest lag), so it shows the filter does no harm there and nothing more;
the gain is set B's, the board's default tach, and it is at 0.5 to 1 us of jitter: at 1.5 us and above the survey is
still close to blind (1 of 9 per jitter).

Simulated only: the simulator's first-order wheel, one seed per set, an assumed take profile.
