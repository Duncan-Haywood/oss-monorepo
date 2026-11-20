# Where the ball lands in a revolution: the survey's straddles were set by the drill (2026-11-20, firmware/esp32/README.md, same title)

Item from `ventures/open-tennis-robots/NEXT.md` ("Buildable here", 2026-11-19, last line): "1.3 ms takes, by a survey
drill whose wheel speeds put a 1.3 ms contact across a revolution's edge (a different shot mix, not more of the same
shots)".

## What the stored captures show first (read before anything below was designed)

A wheel tells the take survey something only when its ball's contact, at the 1.5 ms candidate's offsets
(`controller.take_offsets(1500)`, 307-1192 us after first contact: a 0.885 ms span), falls across a tach edge
(`drop_from_commands_steps`'s last field). If the ball met the wheel at a random point of its revolution, a wheel of
period P would straddle about 0.885 / P of the time: 3.5% at 25 ms, 9% at 10 ms.

Refitting every wheel of the long drill's 96 stored builds (eval/take-straddle-count-spread-long-2026-11-20.jsonl.gz and
...-inst-long-...; 4 spread seeds, 12 instant seeds, three launchers, six takes) and counting by the wheel's place in
the survey:

    wheel 2, 3, 6, 7, 8, 15, 17, 18, 21, 23, 26, 28, 29, 31, 38, 41, 42, 44: 0 of 96 straddled (1 of 96 on 27, 36, 45)
    wheel 40: 28 of 96 (period 10.4 ms), wheel 43: 21 of 96 (10.9 ms), wheel 10: 16 (11.5 ms), wheel 11: 16 (23.9 ms)
    the same shot on its second pass: wheel 4 straddled 14 of 96, wheel 28 (its repeat) 0; wheel 20 13, wheel 44 0

So whether a wheel straddles was fixed by where it sits in the drill, nearly the same on every seed, launcher and take:
in `tests/feeder_sim.py` the ball leaves the moment the shuttle reaches the wheels, on the millisecond, and nothing
random moves that against the wheels' angle (the seed drives only the tach's noise). Summed over the drill the rate is
about what a random phase gives (6.3% observed against about 6.1% for 0.885 / P over these periods), but the same
wheels carry it on every build, which is why the triple drill's repeat of the same twelve shots added so little
(eval/take-straddle-triple-2026-11-20.md). A real gutter and shuttle do not place a ball to a tenth of a millisecond
in a 10-25 ms revolution, so a shot mix tuned to this simulator's phase would be tuned to nothing on a machine.

Two consequences, and this run's test:

1. The simulator gets an opt-in random release (`SimFeeder(feed_jitter_ms=)`: each ball held a further uniform
   0..feed_jitter_ms ms, from its own random stream; 0, the default, is the old simulator, so every stored result
   reproduces). `tests/take_survey_pick.py --feed-jitter MS` passes it to a capture. 26 ms is used below: more than
   the slowest survey wheel's period (25.3 ms), so every contact lands at a near-uniform point of its revolution.
2. With a random phase the expected straddles of one shot are 0.885 ms times the sum of its two wheels' revolution
   rates, i.e. proportional to the summed wheel speed (topspin moves speed from one wheel to the other but not the
   sum). The lever for the short takes is therefore faster shots, not a particular set of speeds.

## Candidate drill

`eval/feed-phase-drill-fast-2026-11-20.json`: 24 shots, twelve twice, the long drill's targets and layout with speeds
34-40 m/s (mean 36.1 against 25.25) and topspin within the 7,000 rpm wheel limit; the plan's mean summed wheel speed
is 10,810 rpm against the long drill's 7,565, so 1.43 times the expected straddles for the same 24 balls. Only the
shot mix differs. (Fast balls: the survey drill fires at an empty court and a backstop, as the long drill does.)

## Sets

Jittery tach (`--tach 1`), lag 0.5 s, three launchers, `--feed-jitter 26`, for each of two drills (long =
drill.survey-long.json, fast = the candidate): spread takes 1.3, 1.6, 2.0, 2.4, 2.8 ms on seeds 9101, 9103, 9107, 9109
(60 builds) and instant (take 0) on seeds 9201-9223 odd (36 builds): the seeds the stored long sets used.

## Prediction and rule (written and committed before either capture below ran)

Prediction: (a) with the random release the long drill no longer has wheels that straddle on 0 of the builds
(per-place rates spread around 0.885 / P), and its straddles per build at 1.5 ms stay near the stored 2.3-3.2;
(b) the fast drill's straddles per build are about 1.4 times the long drill's on each band; (c) the fast drill names
more 1.3-2.1 ms takes than the long drill, and more 1.3 ms takes than the long drill's (whatever it scores here);
(d) 0 instant builds misadvised on either drill.

Rule: the README names the fast drill as the survey drill to run before the long one (and it ships as
`drill.survey-fast.json`) only if, on these sets with the random release, it misadvises 0 of 36 instant builds, names
at least 4 more of the 36 1.3-2.1 ms takes than the long drill does on the same sets, and all 24 of the 2.4-2.8 ms
takes. Nothing on the board or in `host.py` changes either way. Otherwise the long drill stays the recommendation and
the fast drill stays a measured option in eval/. Either way the README says the stored survey verdicts were measured
on a simulator whose ball always met the wheel at the same point of its revolution.

## Result

(Captured after the pre-registration commit; filled in below.)
