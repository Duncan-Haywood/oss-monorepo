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

## Result (captured after the pre-registration, commit 2c35c8f6f)

    for s in 9301 9303 ... 9323; do   # and the same with --drill eval/feed-phase-drill-fast-2026-11-20.json
      PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_survey_pick.py --capture long-spread-$s.jsonl --lag 0.5 \
        --seed $s --takes 1.3,1.6,2.0,2.4,2.8 --tach 1 --procs 4 --drill drill.survey-long.json --feed-jitter 26; done
    for s in 9401 9403 ... 9471; do
      PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_survey_pick.py --capture long-inst-$s.jsonl --lag 0.5 \
        --seed $s --takes 0 --tach 1 --procs 3 --drill drill.survey-long.json --feed-jitter 26; done
    E=eval/feed-phase-margin
    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_straddle_count.py --procs 4 \
      long@2=$E-long-spread-2026-11-20.jsonl.gz,$E-long-inst-2026-11-20.jsonl.gz \
      fast@3=$E-fast-spread-2026-11-20.jsonl.gz,$E-fast-inst-2026-11-20.jsonl.gz \
      long@3=... fast@2=...     # the same files; these two rows are exploratory, not part of the rule

Output in eval/feed-phase-margin-score-2026-11-20.txt. 576 builds, none aborted. Captures (per-seed files
concatenated): eval/feed-phase-margin-{long,fast}-{spread,inst}-2026-11-20.jsonl.gz. Before capturing, the scorer's
new `@N` label reproduced the design set's exploratory margins exactly (long@2 21 of 36 short, 1 of 36 instant).

| arm (288 builds each) | straddling at 1.5 ms per build: instant / short / long | short named (of 108) | 1.3 / 1.6 / 2.0 ms (of 36) | 2.4-2.8 ms named (of 72) | instant misadvised (of 108) |
| --- | --- | --- | --- | --- | --- |
| **long@2 (shipped)** | 2.51 / 2.45 / 2.14 | 66 | 18 / 23 / 25 | 61 | 2 |
| **fast@3 (candidate)** | 3.63 / 3.24 / 2.99 | 48 | 7 / 15 / 26 | 65 | 2 |
| long@3 (exploratory) | same | 37 | 6 / 13 / 18 | 61 | 0 |
| fast@2 (exploratory) | same | 75 | 19 / 26 / 30 | 67 | 2 |

| clause | needed | got | |
| --- | --- | --- | --- |
| 1. fast@3 misadvises at most 1 of 108 and fewer than long@2 | <= 1 and < 2 | 2 | **failed** |
| 2. fast@3 short takes >= long@2's - 11 | >= 55 | 48 | **failed** |
| 3. fast@3 2.4-2.8 ms takes >= long@2's - 1 | >= 60 | 65 | held |

Prediction: (a) failed (2 against 2, not fewer); (b) held in direction, larger than predicted (48 against 66, not
about 50 against 60); (c) failed: neither arm names nearly all long takes on fresh seeds (61 and 65 of 72 against the
design set's 23-24 of 24); (d) held at 1.3 ms for the candidate (7 of 36), not for the shipped arm (18 of 36).

**Decision.** The rule failed on two clauses, so nothing ships: the long drill stays the recommended survey drill and
`host.TAKE_STRADDLE_MARGIN` stays 2. The fast drill stays a measured option in eval/.

**Why margin 3 did not buy the false alarms down here.** The four misadvised instant builds (each instant build's
board frame through `tests/take_misadvised_instant.py`, which prints the votes and `host.take_survey_advice`'s line):

- long@2: a 2-0 vote at 1.5 ms (10 kept wheels) and a 3-1 vote (19 kept). Margin 3 stops both; that is long@3's 0.
- fast@3 (and fast@2, the same two builds): a 3-0 vote at 1.5 ms (14 kept wheels), which margin 3 lets through, and a
  4-1 vote in the **2.5 ms** vote (`TAKE_STRADDLE_LONG_MARGIN = 2`, untouched by this test), so no 1.5 ms margin could
  stop it.

So the fast drill's extra straddling balls raise the size of a chance run of "for" votes as well as the true ones: on
instant builds it had 3.63 straddling balls a build against the long drill's 2.51, and the false alarms moved from 2-0
and 3-1 to 3-0 and 4-1. A fixed margin trades named takes for false alarms on any drill; on 108 instant builds each, both the shipped
and the candidate pair sit near 2% (eval/feed-phase-margin-misadvised-2026-11-20.txt has the four builds' lines).

**Exploratory, not a decision** (these 576 builds are design data from here on): fast@2, the fast drill at the shipped
margin, names 9 more short takes (75 against 66 of 108) and 6 more long ones (67 against 61 of 72) than the shipped
pair with the same false alarms (2 and 2 of 108). That is the next pre-registered test, on fresh seeds: swap the drill
alone and keep both margins. Also open: a 2.5 ms vote margin of 3 alongside, since one of the fast drill's two false
alarms came from that vote.

**What changed in the numbers people read.** On fresh seeds with a random release the shipped survey names 66 of 108
short takes (61%; the design set said 21 of 36, 58%) and 61 of 72 at 2.4-2.8 ms (85%, not 23 of 24), and tells 2 of
108 instant builds (1.9%) to set a take. The README's earlier "all of the 2.4-2.8 ms takes" figures were fixed-phase.
