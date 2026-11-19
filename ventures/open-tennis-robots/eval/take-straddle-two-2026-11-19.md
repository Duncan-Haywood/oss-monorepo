# A second straddle vote at 2.5 ms (2026-11-19, firmware/esp32/README.md, same title)

Item from `portfolio/flagships.yaml` (open-tennis-robots `buildable:`) and NEXT.md: "a vote at 2.5 ms for the 2.4-3 ms
builds still read 0". The 1.5 ms straddle vote (`host.TAKE_STRADDLE_MARGIN = 2`, eval/take-straddle-vote-2026-11-19.md,
held out twice) names 1.3-2 ms takes the sums read as instant. Builds with longer takes still read 0 when the sums
miss them, and the 1.5 ms vote rarely reaches them: a 2.8 ms take's parts placed at 1.5 ms are the wrong shape.

## The second vote

The same count at the grid's 2.5 ms candidate (`controller.TAKE_STRADDLE2_US = 2500`): on a kept wheel whose fit at
2.5 ms puts the take's parts across a revolution's edge (the fit's `edge` field at that candidate), 2.5 ms fitting
better than the step is a vote for it, worse a vote against.

- `ResidualSurvey.add(got, edge, edge2)` counts `straddle2_for` / `straddle2_against` on kept wheels;
  `LaunchCheck._take_survey` takes `edge2` from the 2.5 ms fit it already runs (no extra fit on the board).
- The TAKE_SURVEY frame (0x84) carries the two counts as two more bytes; the Pi decodes the older frames with `None`.
- `host.take_survey_advice`: when the sums say TAKE_US = 0, a vote that reaches its margin
  (`TAKE_STRADDLE_MARGIN` for 1.5 ms, `TAKE_STRADDLE2_MARGIN` for 2.5 ms) advises its candidate; when both reach
  theirs, the larger lead (for - against) wins, 1.5 ms on a tie. `TAKE_STRADDLE2_MARGIN = 0` turns the second vote off.
- `tests/take_straddle_vote.py --margins2 0,1,2,3` scores it (judged as before: a spread take is named when the advised
  TAKE_US is within 1 ms of the true take; an instant build is bad when told to set a take above 0), counting gains and
  losses against the 1.5 ms vote alone, and asserts that a capture's own board counts equal the rebuild's.

## Design (every stored set with wheel inputs: fifteen files, 636 builds; eval/take-straddle-two-design-2026-11-19.txt)

Sets O, P, W, X, Y, Z, AA-AD and AE-AH plus the instant-only file of eval/take-straddle-margin-one-2026-11-19.md,
refitted at 2.5 ms from their stored wheel inputs. Straddling wheels at 2.5 ms, all builds:

| take | for 2.5 ms | against |
| --- | --- | --- |
| instant (96 builds) | 13 | 172 |
| 0.1-0.9 ms (144) | 15 | 289 |
| 1.3-2.1 ms (204) | 142 | 278 |
| 2.4 ms and up (192) | 337 | 23 |

With the 1.5 ms vote at its shipped margin 2:

| 2.5 ms margin | named (of 540 spread) | instant told to set a take (of 96) | right that the 1.5 ms vote alone was not | wrong that it got right |
| --- | --- | --- | --- | --- |
| 0 (off) | 333 | 0 | - | - |
| 1 | 406 | 5 | 74 | 6 |
| 2 | 355 | 0 | 22 | 0 |
| 3 | 342 | 0 | 9 | 0 |

Margin 1 tells 5 of 96 instant builds to set 2.5 ms (each a 1-0 split), the harm that closed margin 1 at 1.5 ms. Margin
2 is the least margin with no harm on the design, so it is the candidate. Taking the larger lead when both votes fire
won 2 builds over "1.5 ms first" (353 named) and lost none.

## Prediction and rule (written and committed before any of the sets below was captured)

Fresh sets on this tree, jittery tach (`--tach 1`), three launchers. None of the seeds was used by an earlier capture
(stored ones: 7-181, 191-199, 211-271, 401-443).

Standard sets, the same 11 takes as AA-AH (33 drills each, 30 spread and 3 instant):

| set | lag (s) | seed |
| --- | --- | --- |
| AI | 0.48 | 277 |
| AJ | 0.56 | 281 |
| AK | 0.40 | 283 |
| AL | 0.64 | 293 |
| AM | 0.46 | 307 |
| AN | 0.60 | 311 |

Instant-only sets, `--takes 0`, lag 0.52 s, 24 seeds (72 instant builds): 313, 317, 331, 337, 347, 349, 353, 359, 367,
373, 379, 383, 389, 397, 449, 457, 461, 463, 467, 479, 487, 491, 499, 503.

    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_survey_pick.py --capture ai.jsonl --lag 0.48 --seed 277 --procs 4 --takes "0.1,0.5,0.9,1.3,1.6,2.0,2.4,2.8,3.5,5.0,0" --tach 1
    (AJ-AN the same with their lag and seed)
    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_survey_pick.py --capture inst-S.jsonl --lag 0.52 --seed S --procs 4 --takes 0 --tach 1
    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_straddle_vote.py --procs 4 --margins2 0,1,2,3 ai.jsonl ... an.jsonl inst-*.jsonl

PREDICTION, pooled over all thirty captures (180 spread builds, 90 instant): with the 1.5 ms vote at margin 2,
(a) the 2.5 ms vote at margin 2 names more spread takes than the 1.5 ms vote alone; (b) it tells no instant build to
set a take; (c) it makes fewer than one build wrong that the 1.5 ms vote alone got right per five it makes right that
the 1.5 ms vote alone did not; (d) every frame's board counts for both votes equal the rebuild's (the scorer asserts it).

DECISION RULE: `host.TAKE_STRADDLE2_MARGIN` ships at 2 only if (a), (b), (c) and (d) all hold. Otherwise it stays 0
(off), the board still sends the counts, and the item goes back to NEXT.md with these numbers. Margins 1 and 3 are
reported, not decided on.

## Result

(Filled in after the captures.)
