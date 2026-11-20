# Margin 3 with the fast drill against margin 2 with the long drill, on fresh seeds with a random release (2026-11-20)

Item from `ventures/open-tennis-robots/NEXT.md` ("Buildable here", the take-straddle line's last sentence): "margin 3
with the fast drill against margin 2 with the long drill, pre-registered on fresh seeds with `--feed-jitter 26`".

## Why this test

eval/feed-phase-2026-11-20.md found that every take-survey verdict before it had been measured on a simulator whose
ball met the wheel at the same point of its revolution, and that with a random release (`--feed-jitter 26`) the
shipped survey (drill.survey-long.json, `host.TAKE_STRADDLE_MARGIN = 2`) names 21 of 36 short (1.3-2.1 ms) takes
and tells 1 of 36 instant builds to set 1.5 ms. On those same 192 builds, explored after the fact
(eval/feed-phase-margins-exploratory-2026-11-20.txt), margin 3 on the 1.5 ms vote stopped both false alarms; the long
drill then named only 11 short takes and the fast drill (eval/feed-phase-drill-fast-2026-11-20.json, 34-40 m/s, about
1.4 times the straddling balls) 18. So the candidate is the pair "fast drill, margin 3" against the shipped pair
"long drill, margin 2". Those 192 builds are design data now; this test uses seeds no stored set has used.

The margin is the 1.5 ms vote's only (`TAKE_STRADDLE_MARGIN`); the 2.5 ms vote stays at margin 2 in both arms, as in
the exploratory numbers (`take_straddle_scaled.verdict(sv, "margin", k)`).

## Sets (fresh seeds; three times the instant builds of the design set, since a false alarm is the cost being bought down)

Jittery tach (`--tach 1`), lag 0.5 s, three launchers, `--feed-jitter 26`, for each drill:

- spread: takes 1.3, 1.6, 2.0, 2.4, 2.8 ms on seeds 9301-9323 odd (12 seeds, 180 builds: 108 short, at 1.3, 1.6
  and 2.0 ms, and 72 at 2.4-2.8 ms)
- instant (take 0): seeds 9401-9471 odd (36 seeds, 108 builds)

Both drills on the same seeds. Scored with `tests/take_straddle_count.py` (labels `long@2` and `fast@3`), a spread
take named when the advised TAKE_US is within 1 ms of the true take, an instant build misadvised when told to set one.

## Prediction (written and committed before either capture ran)

(a) fast@3 misadvises fewer instant builds than long@2 (the design set: 0 against 1 of 36; here about 0-1 against
2-4 of 108); (b) fast@3 names a few fewer short takes than long@2 (design: 18 against 21 of 36, so about 50 against
60 of 108); (c) both name nearly all 2.4-2.8 ms takes (design 24 and 23 of 24; out of 72 here); (d) at 1.3 ms both are weak (design
1 and 5 of 12).

## Rule (written with the prediction)

The pair ships, i.e. `drill.survey-fast.json` becomes the README's recommended survey drill and
`host.TAKE_STRADDLE_MARGIN` moves from 2 to 3, only if on these sets fast@3:

1. misadvises at most 1 of 108 instant builds, and fewer than long@2 does;
2. names at least long@2's short takes minus 10% of the band (i.e. >= long@2's count - 11 of 108);
3. names at least as many 2.4-2.8 ms takes as long@2, less one.

Otherwise both stay as shipped (long drill, margin 2) and the fast drill stays a measured option in eval/. If
long@2 misadvises 0 of 108, clause 1 cannot pass and the shipped pair stands: there is no false alarm to buy down.

Simulated only, as every take-survey result is: one lag, one tach model, a uniform 0-26 ms release hold.

## Result

(Filled in after the captures.)
