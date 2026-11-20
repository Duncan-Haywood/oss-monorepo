# The fast survey drill against the long one, both at the shipped margins, on fresh seeds (2026-11-20)

Item from `ventures/open-tennis-robots/NEXT.md` ("Buildable here", the take-straddle line): "the fast drill against
the long drill, both at the shipped margins, pre-registered on fresh seeds".

## Why this test

eval/feed-phase-margin-2026-11-20.md tested the pair "fast drill, margin 3" against the shipped "long drill, margin 2"
and failed it. On the same 576 builds, explored after the fact, the fast drill at the shipped margins (fast@2) named
75 of 108 short (1.3-2.1 ms) takes against the long drill's 66, 67 of 72 long (2.4-2.8 ms) takes against 61, and
misadvised 2 of 108 instant builds against 2. Both drills are 24 shots at a 4 s interval
(`eval/feed-phase-drill-fast-2026-11-20.json` is drill.survey-long.json's placement at 34-40 m/s instead of 16-26), so
the swap costs no balls and no time on court; the only change is how hard the machine hits during the survey. Those
576 builds are design data now; this test uses seeds no stored set has used.

Both margins stay at the shipped values in both arms (`host.TAKE_STRADDLE_MARGIN = 2`,
`host.TAKE_STRADDLE_LONG_MARGIN = 2`). One exploratory row, not part of the rule: the fast drill with the 2.5 ms vote
at margin 3 (`fast@2/3`, the new `@N/L` label in `tests/take_straddle_count.py`), since one of the fast drill's two
design-set false alarms was a 4-1 in that vote.

## Sets (fresh seeds; the same design as the margin test)

Jittery tach (`--tach 1`), lag 0.5 s, three launchers, `--feed-jitter 26`, for each drill:

- spread: takes 1.3, 1.6, 2.0, 2.4, 2.8 ms on seeds 9501-9523 odd (12 seeds, 180 builds: 108 short, at 1.3, 1.6
  and 2.0 ms, and 72 at 2.4-2.8 ms)
- instant (take 0): seeds 9601-9671 odd (36 seeds, 108 builds)

Both drills on the same seeds. Scored with `tests/take_straddle_count.py` (labels `long` and `fast`), a spread take
named when the advised TAKE_US is within 1 ms of the true take, an instant build misadvised when told to set one.

## Prediction (written and committed before either capture ran)

(a) the fast drill names more short takes than the long one (design: 75 against 66 of 108; here about 70-78 against
60-68); (b) it names at least as many 2.4-2.8 ms takes (design 67 against 61 of 72); (c) its false alarms are about
the same, 1-4 of 108 in each arm, since its larger straddle counts make chance runs of "for" votes longer too
(the margin test's finding); (d) its gain is largest at 1.3 and 1.6 ms, where the long drill has fewest straddling
balls.

## Rule (written with the prediction)

The fast drill ships, i.e. becomes the README's recommended survey drill (`drill.survey-fast.json` at the repository's
venture root, the calibration placement at 34-40 m/s), only if on these sets, at the shipped margins:

1. it names at least 4 more of the 108 short takes than the long drill (half the design set's gain of 9);
2. it names at least as many 2.4-2.8 ms takes as the long drill, less one;
3. it misadvises no more than one instant build more than the long drill, and at most 3 of 108.

Otherwise the long drill stays the recommended survey drill and the fast drill stays a measured option in eval/.
The `fast@2/3` row decides nothing: a 2.5 ms margin change would need its own pre-registered test.

Simulated only, as every take-survey result is: one lag, one tach model, a uniform 0-26 ms release hold. A drill at
34-40 m/s is within what ball machines throw, but the survey would be run with the court clear.

## Result (captured after the pre-registration, commit b23266baf)

    S=<scratch dir>; export PYTHONPATH=src:tests:firmware/esp32
    for s in 9501 9503 ... 9523; do   # and the same with --drill eval/feed-phase-drill-fast-2026-11-20.json
      python3 tests/take_survey_pick.py --capture $S/long-spread-$s.jsonl --lag 0.5 --seed $s \
        --takes 1.3,1.6,2.0,2.4,2.8 --tach 1 --procs 4 --drill drill.survey-long.json --feed-jitter 26; done
    for s in 9601 9603 ... 9671; do
      python3 tests/take_survey_pick.py --capture $S/long-inst-$s.jsonl --lag 0.5 --seed $s --takes 0 --tach 1 \
        --procs 3 --drill drill.survey-long.json --feed-jitter 26; done
    E=eval/feed-phase-drill
    python3 tests/take_straddle_count.py --procs 4 \
      long=$E-long-spread-2026-11-20.jsonl.gz,$E-long-inst-2026-11-20.jsonl.gz \
      fast=$E-fast-spread-2026-11-20.jsonl.gz,$E-fast-inst-2026-11-20.jsonl.gz \
      fast@2/3=... long@2/3=...   # the same files; exploratory rows, not part of the rule

Output in eval/feed-phase-drill-score-2026-11-20.txt. 576 builds, none aborted (the per-seed files concatenated:
eval/feed-phase-drill-{long,fast}-{spread,inst}-2026-11-20.jsonl.gz). About 45 minutes on 4 cores.

| arm (288 builds each) | straddling at 1.5 ms per build: instant / short / long | short named (of 108) | 1.3 / 1.6 / 2.0 ms (of 36) | 2.4-2.8 ms named (of 72) | instant misadvised (of 108) |
| --- | --- | --- | --- | --- | --- |
| **long (shipped)** | 2.35 / 2.70 / 2.04 | 65 | 15 / 21 / 29 | 62 | 0 |
| **fast (candidate)** | 3.26 / 3.53 / 3.32 | 72 | 17 / 25 / 30 | 68 | 2 |
| fast@2/3 (exploratory) | same | 72 | same | 66 | 2 |
| long@2/3 (exploratory) | same | 63 | 15 / 21 / 27 | 58 | 0 |

| clause | needed | got | |
| --- | --- | --- | --- |
| 1. fast names >= long's short takes + 4 | >= 69 | 72 | held |
| 2. fast's 2.4-2.8 ms takes >= long's - 1 | >= 61 | 68 | held |
| 3. fast misadvises <= long's + 1, and <= 3 of 108 | <= 1 | 2 | **failed** |

Prediction: (a) held, inside the predicted range (72 against 65; predicted about 70-78 against 60-68); (b) held (68
against 62 of 72); (c) half held: the fast drill's 2 of 108 was in range, but the long drill had none, below the
predicted 1-4; (d) half held: the gain was largest at 1.6 ms (+4), but 1.3 ms gained only 2, against 1 at 2.0 ms.

**Decision.** Clause 3 failed, so nothing ships: the long drill stays the recommended survey drill and both margins stay
at 2. The fast drill stays a measured option in eval/.

**The two false alarms** (eval/feed-phase-drill-misadvised-2026-11-20.txt, from `tests/take_misadvised_instant.py`):
both are in the 1.5 ms vote, a 3-1 (15 kept wheels) and a 2-0 (22 kept), the same small-count shapes as the long
drill's two on the margin test's seeds. Neither came from the 2.5 ms vote, so the `fast@2/3` row stops neither and only
costs 2 long takes; the design set's 4-1 in that vote was not repeated.

**Both test sets together** (the margin test's seeds 9301-9471 and these, 432 builds per drill, both at the shipped
margins; pooled after the fact, not a decision): short takes named 147 of 216 (fast) against 131 (long), 2.4-2.8 ms
135 of 144 against 123, instant builds misadvised 4 of 216 (1.9%) against 2 of 216 (0.9%). So the fast drill's extra
straddling balls (about 1.4 times the long drill's) name about 7 more of every 100 short takes and 8 more of every 100
long ones, and roughly double the chance a build with an instant contact is told to set 1.5 ms. With 2 and 4 false
alarms in 216 that doubling is itself uncertain; it would take several hundred more instant builds per drill to pin
down, which is a lot of simulator time for a trade that a person should make knowing their wheels.

**What this means for a user.** The long drill stays the default because a false 1.5 ms take on a machine with an
instant contact is the costlier mistake (it shifts every shot's timing), and on these seeds it made none. A user who
already suspects a short contact (a worn or soft ball, a wide wheel gap) loses little by running the survey at
34-40 m/s instead: on the simulator, over both test sets, it names 68 of every 100 short takes instead of 61.
