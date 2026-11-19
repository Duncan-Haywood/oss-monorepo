# Straddle vote at margin 1, on a fresh pre-registered set (2026-11-19, firmware/esp32/README.md, "Straddling wheels vote on the short takes")

Item from `portfolio/flagships.yaml` (open-tennis-robots `buildable:`): "margin 1 on a fresh pre-registered pair (86 of
120 on AA-AD)". The vote shipped at `host.TAKE_STRADDLE_MARGIN = 2` (eval/take-straddle-vote-2026-11-19.md). Held out on
AA-AD, margin 1 named 86 of 120 spread takes against margin 2's 71 and told no instant build to set a take, but it was
looked at there after the fact, un-named two 0.1 ms builds, and on the design it told one instant build of 36 to set
1.5 ms. AA-AD can no longer judge it, so this test uses sets no earlier run has captured or scored.

## Why more instant builds this time

Each standard set has 3 instant builds (one per launcher), so a pair gives 6: too few to see a harm the design showed at
1 in 36. A take list that repeats 0 does not help (two builds with the same launcher, lag and seed run the same drill and
give the same frame, checked in a scratch capture), so the extra instant builds come from fresh seeds, one capture each
with `--takes 0`.

## Sets (written and committed before any of them was captured)

Standard sets, jittery tach (`--tach 1`), three launchers, the same 11 takes as AA-AD (33 drills each):

| set | lag (s) | seed |
| --- | --- | --- |
| AE | 0.50 | 191 |
| AF | 0.58 | 193 |
| AG | 0.44 | 197 |
| AH | 0.66 | 199 |

Instant-only sets, `--takes 0`, jittery tach, three launchers, lag 0.52 s: seeds 211, 223, 227, 229, 233, 239, 241, 251,
257, 263, 269, 271 (12 captures, 36 instant builds). None of these seeds was used by an earlier capture (stored ones:
7-181 and 401-443).

    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_survey_pick.py --capture ae.jsonl --lag 0.50 --seed 191 --procs 4 --takes "0.1,0.5,0.9,1.3,1.6,2.0,2.4,2.8,3.5,5.0,0" --tach 1
    (AF, AG, AH the same with their lag and seed)
    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_survey_pick.py --capture inst.jsonl --lag 0.52 --seed S --procs 4 --takes 0 --tach 1
    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_straddle_vote.py --procs 4 --margins 0,1,2,3 --base 2 ae.jsonl af.jsonl ag.jsonl ah.jsonl inst.jsonl

`--base 2` (added to tests/take_straddle_vote.py for this test) counts "right that the base was not" and "wrong that the
base got right" against the shipped margin 2 instead of off.

## Prediction and decision rule

PREDICTION, pooled over all sixteen captures (132 standard drills, 48 instant builds in all): (a) margin 1 names more
spread takes than margin 2; (b) margin 1 tells no instant build to set a take; (c) margin 1 makes fewer than one build
wrong that margin 2 got right per five it makes right that margin 2 did not; (d) the board's own counts in every frame
equal the rebuild's (the scorer asserts it).

DECISION RULE: `host.TAKE_STRADDLE_MARGIN` moves to 1 only if (a), (b), (c) and (d) all hold. Otherwise it stays at 2
and this note records why. Margins 0 and 3 are reported, not decided on.

## Result

Pre-registration committed in e4d48d9f3; all sixteen captures then made on that tree (132 standard drills and 36
instant ones, none aborted; stored as eval/take-straddle-margin-one-{ae,af,ag,ah,inst}-2026-11-19.jsonl.gz) and scored
(eval/take-straddle-margin-one-2026-11-19.txt):

| margin | named (of 120 spread) | instant told to set a take (of 48) | right that margin 2 was not | wrong that margin 2 got right |
| --- | --- | --- | --- | --- |
| 0 (off) | 62 | 0 | 0 | 10 |
| **1 (tested)** | **85** | **3** | **14** | **4** |
| 2 (shipped) | 72 | 0 | - | - |
| 3 | 63 | 0 | 0 | 9 |

- (a) held: 85 against 72.
- (b) **failed**: 3 of the 48 instant builds were told to set TAKE_US = 1500 (AF launcher 0; the instant-only seeds 229
  and 271, launcher 0). All three had two straddling wheels for 1.5 ms and one against, the smallest split margin 1
  acts on.
- (c) **failed**: 4 builds wrong that margin 2 got right (the 3 instant ones and a 0.1 ms one) against 14 newly right, a
  ratio of 1 to 3.5, not under 1 to 5.
- (d) held: every frame's counts equalled the rebuild's (the scorer's assert did not fire).

So **`host.TAKE_STRADDLE_MARGIN` stays at 2.** Margin 1 is closed on simulated sets.

**What this adds for margin 2.** This is margin 2's second held-out reading and its first with enough instant builds to
see a rare harm: 72 of 120 named against off's 62, 0 of 48 instant builds told to set a take (with AA-AD: 0 of 60), 10
builds right that off gets wrong and none the other way.

**Where the vote's signal sits.** Pooled straddling wheels at 1.5 ms: instant builds 11 for and 44 against, 0.1-0.9 ms
14 and 43, 1.3-2.1 ms 39 and 4, 2.4 ms and up 36 and 0. An instant build sees a "for" about one straddling wheel in five,
so a 2-1 split on an instant build is not rare when a drill has only three straddling wheels; margin 2 needs at least two
more for than against, which no instant build reached in 48. Most 1.3-2.1 ms builds still read 0 at margin 2 (22 of 36
here): they have too few straddling wheels, the limit eval/take-straddle-vote-2026-11-19.md named.

**Not known.** Simulated only, one jittery tach model, three launchers. A real wheel's straddle counts come in the
TAKE_SURVEY frame's last two bytes.
