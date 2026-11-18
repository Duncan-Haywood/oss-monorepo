# The take survey's verdict needs two informative wheels: failed held out (2026-11-18, firmware/esp32/README.md, same title)

## The item

README "The take survey skips take-blind wheels" left the board's take survey summing only the wheels that tell the
contact-time candidates apart (`controller.TAKE_SURVEY_BLIND` = 1.5), and named next: "count only the kept wheels
toward the 16-wheel minimum (a frame field)". The Pi advises a `TAKE_US` once the TAKE_SURVEY frame's wheel count
reaches `host.ESC_SURVEY_MIN_WHEELS` (16), and that count includes the wheels left out. On the jittery tach (the
board's default) about three wheels in four are left out, so a 16-wheel verdict can rest on one wheel.

## Design (the twelve stored take-survey sets, all seen before)

`tests/take_survey_kept.py` rescores each stored drill's `board_scores` with the board's `ResidualSurvey` and, for a
minimum K on the kept (informative) wheels, counts what the Pi would advise at the drill's end (22 wheels) and at
every prefix of the drill from 16 wheels on (a shorter drill; prefixes of one drill are not independent). Full output:
eval/take-survey-kept-design-2026-11-18.txt. Over all twelve sets:

| min kept wheels | end of drill: right / wrong / held | prefixes: right / wrong / held |
| --- | --- | --- |
| 0 (today) | 478 / 3 / 0 | 3194 / 45 / 0 |
| 1 | 478 / 3 / 0 | 3194 / 45 / 0 |
| 2 | 474 / 2 / 5 | 3169 / 33 / 37 |
| 3 | 467 / 2 / 12 | 3105 / 30 / 104 |
| 4 | 454 / 1 / 26 | 2977 / 27 / 235 |

No set advised a nonzero time for an instant build at any K. By the number of kept wheels a prefix verdict rested on:
1 kept wheel, 25 right and 12 wrong (32% wrong); 2, 64 and 3; 3, 128 and 3; 4, 269 and 0; 5, 420 and 0; 6 or more,
2288 and 27 (all 27 on one capture set, sub 8 held out, at 9-12 kept wheels, so no minimum reaches them). Only the
two jittery-tach sets and the jittery held-out set of the last section ever reach a verdict on fewer than two kept
wheels; the MCPWM capture sets keep 3-12 a drill.

**The literal item would silence the survey.** Counting only kept wheels toward 16 (K = 16) advises none of the 72
right end-of-drill verdicts on the three jittery-tach sets (all 72 held; over all twelve sets 136 right, 345 held),
because those drills keep a median of 3, 5 and 6 wheels of 22. Even K = 8 holds 52 of the jittery sets' 72. The
16-wheel minimum stays as it is, on every wheel surveyed (it guards a verdict on a handful of balls, which take-blind
wheels still are). What the kept count needs is its own, small minimum.

**The rule.** `host.TAKE_SURVEY_MIN_KEPT = 2`: the Pi advises a `TAKE_US` only once at least two wheels were summed;
with fewer it says how many told the contact times apart and to run more balls. The board sends the count in a new
last byte of the TAKE_SURVEY frame (`ResidualSurvey.kept_n`, to 255); the Pi still reads the older, shorter frame and
then applies only the 16-wheel minimum. Chosen as the smallest K that removes the one-wheel verdicts (a third of them
wrong) and costs 4 of 478 end-of-drill right verdicts on these sets.

## Pre-registration (written and committed before the held-out set is captured)

Held out: one fresh jittery-tach set (`tests/take_survey_jitter.py --capture`, no `--tach-capture`, the board's
default), wheel lag 0.7 s, seed 23, the same 72 builds (4 takes x 3 launchers x 6 jitters), never run before.
Scored with `tests/take_survey_kept.py --ks 0,2 --by-kept`.

PREDICTION: (a) among the fresh set's advised prefix verdicts, those resting on exactly one kept wheel are wrong at
least three times as often (as a share) as those resting on two or more; if fewer than 5 advised prefix verdicts rest
on one kept wheel, (a) is void. (b) At the drill's end, K = 2 names and advises right at least K = 0's count minus 3
(of 54 spread takes). (c) K = 2 invents no take K = 0 does not (it can only hold verdicts back; checked anyway).

DECISION RULE: `host.TAKE_SURVEY_MIN_KEPT = 2` ships if (b) and (c) hold and (a) holds or is void (void: the design
sets' evidence stands alone, and the README says so). If (a) fails or (b) fails, it ships at 0 (off; the frame field
still goes out) and the README reports the miss.

## Held-out result (captured after the pre-registration was committed, 759a4aafd)

`tests/take_survey_jitter.py --capture ... --lag 0.7 --seed 23 --procs 4`, 72 drills, none aborted; rows
eval/take-survey-kept-heldout-2026-11-18.jsonl.gz, scored output eval/take-survey-kept-heldout-2026-11-18.txt.

| | min kept 0 (today) | min kept 2 |
| --- | --- | --- |
| end of drill: right / wrong / invented / held | 21 / 1 / 0 / 0 | 21 / 1 / 0 / 0 |
| prefixes: right / wrong / invented / held | 146 / 6 / 0 / 0 | 140 / 6 / 0 / 6 |

Advised prefix verdicts by kept wheels: 1, 6 right and 0 wrong; 2, 10 and 0; 3, 18 and 6; 4, 45 and 0; 5, 23 and 0;
6 or more, 44 and 0.

- (a) **failed.** Six prefix verdicts rested on one kept wheel (not void), and none was wrong; those on two or more
  were wrong 6 times in 140. The one-wheel share is not three times the rest's; it is zero.
- (b) held: 21 right at the drill's end either way (of 54 spread takes).
- (c) held: neither invents a take.

**Decision, by the rule: `host.TAKE_SURVEY_MIN_KEPT = 0`.** The board's new frame byte (wheels summed) still ships and
the Pi still reads it into the survey and the shot log, so a later minimum needs no firmware change; the hold is code
that runs only with the constant raised.

**What the miss says.** Counted by drill rather than by prefix the evidence was thin from the start: on the twelve
design sets the 37 one-wheel prefix verdicts come from 14 drills, 12 right and 2 wrong (the 12 wrong prefixes were two
drills read at 16-22 wheels each); held out, the 6 come from two drills (half-sine 6 ms, 0.5 and 3 us of jitter, both
5.5 ms, right), and the 6 wrong ones from one drill (half-sine 6 ms at 2 us, 8 ms on three kept wheels). Prefixes of a
drill are near-repeats, so the decision rule's shares weighed each drill by how early it reached a verdict. One wheel
in 16 is wrong about one drill in seven on the design sets and none in two held out: no minimum on the kept count has
shown it pays. The firmer finding is the negative one above: the literal item, 16 kept wheels, would have silenced every
jittery-tach verdict.
