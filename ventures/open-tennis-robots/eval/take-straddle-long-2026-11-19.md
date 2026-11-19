# A second straddle vote at 2.5 ms (2026-11-19, firmware/esp32/README.md, same title)

Item from `portfolio/flagships.yaml` (open-tennis-robots `buildable:`, NEXT.md): "a vote at 2.5 ms for the 2.4-3 ms
builds still read 0". The 1.5 ms straddle vote shipped at `host.TAKE_STRADDLE_MARGIN = 2`
(eval/take-straddle-vote-2026-11-19.md, held out twice). On AA-AD at margin 2, 7 of 12 builds at 2.4 ms, 6 of 12 at
2.8 ms and 7 of 12 at 3.5 ms still read TAKE_US = 0, and a 2.8 ms build the 1.5 ms vote named was advised 1.5 ms,
more than 1 ms off. The board already fits every wheel at 2.5 ms (the grid's third candidate), so the same count there
costs one more flag per wheel and two bytes in the frame.

## What was built

- `controller.TAKE_STRADDLE_LONG_US = 2500`; `ResidualSurvey.add(got, edge, edge_long)` counts `long_for` and
  `long_against` on kept wheels the way the 1.5 ms vote counts (the fit's `edge` flag at 2.5 ms, the step's row as the
  reference). `LaunchCheck._take_survey` takes the flag from the 2.5 ms fit it already makes; no new fit on the board.
- The TAKE_SURVEY frame (0x84) carries both as two more bytes; the Pi decodes the 1.5-ms-only frame with `None`.
- `host.take_survey_advice`: when the sums say TAKE_US = 0, the 2.5 ms vote is read first (lead of at least
  `host.TAKE_STRADDLE_LONG_MARGIN`: advise 2.5 ms), then the 1.5 ms vote as before. 0 turns the 2.5 ms vote off.
- `tests/take_straddle_vote.py --long 0,1,2,3` scores it, refitting the 2.5 ms flag from stored wheel inputs on older
  captures and asserting the board's own counts on new ones.

## Design (every stored set with wheel inputs: O, P, W, X, Y, Z, AA-AH and the 12 instant-only captures; 636 builds;
eval/take-straddle-long-design-2026-11-19.txt)

Straddling kept wheels, for / against each candidate:

| builds | 1.5 ms | 2.5 ms |
| --- | --- | --- |
| instant (96) | 20 / 102 | 13 / 172 |
| 0.1-0.9 ms (144) | 35 / 169 | 15 / 289 |
| 1.3-2.1 ms (192) | 217 / 14 | 142 / 278 |
| 2.4 ms and up (204) | 163 / 2 | 337 / 23 |

At 2.5 ms an instant build's straddling wheel votes "for" about 1 in 14 (1 in 5 at 1.5 ms): no instant or sub-1 ms
build reached a lead of 2 (the most was 1-0). With the 1.5 ms vote at its shipped 2:

| 2.5 ms margin | named (of 540 spread) | instant told to set a take (of 96) | right that off was not | wrong that off got right |
| --- | --- | --- | --- | --- |
| 0 (off) | 333 | 0 | - | - |
| 1 | 407 | 5 | 75 | 6 |
| 2 | 356 | 0 | 23 | 0 |
| 3 | 343 | 0 | 10 | 0 |

Order: three rules were compared at margin 2 (2.5 ms only where the 1.5 ms vote did not fire: 353; the larger lead
wins, ties to 1.5: 355; 2.5 ms first: 356). They differ only on five builds where both votes led by the same count
(2.0-2.8 ms takes), where 2.5 ms is named on all five and 1.5 ms on three. 2.5 ms first is the simplest and shipped
as the candidate. Margin 1 tells 5 of 96 instant builds to set 2.5 ms and is not a candidate. These sets were all
looked at for the 1.5 ms vote, so this is a design reading, not a test.

## Prediction and rule (written and committed before any of the sets below was captured)

Fresh sets on this tree, jittery tach (`--tach 1`), three launchers. None of these seeds was used by an earlier capture
(stored: 7-199, 211-271, 401-443).

| set | takes | lag (s) | seed |
| --- | --- | --- | --- |
| AI | the 11 of AA-AH (0.1-5 ms and 0) | 0.48 | 277 |
| AJ | same | 0.56 | 281 |
| AK | same | 0.40 | 283 |
| AL | same | 0.64 | 293 |
| instant-only | `--takes 0` | 0.52 | 307, 311, 313, 317, 331, 337, 347, 349, 353, 359, 367, 373 |

    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_survey_pick.py --capture ai.jsonl --lag 0.48 --seed 277 --procs 4 --takes "0.1,0.5,0.9,1.3,1.6,2.0,2.4,2.8,3.5,5.0,0" --tach 1
    (AJ, AK, AL the same with their lag and seed; each instant seed S with --lag 0.52 --seed S --takes 0)
    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_straddle_vote.py --procs 4 --base 2 --long 0,1,2,3 ai.jsonl aj.jsonl ak.jsonl al.jsonl inst.jsonl

PREDICTION, pooled (132 standard drills, 48 instant builds in all), with the 1.5 ms vote at its shipped 2: (a) the
2.5 ms vote at margin 2 names more spread takes than with it off; (b) it tells no instant build to set a take; (c) it
makes fewer than one build wrong that off got right per five it makes right that off did not; (d) the board's own
counts in every frame, both votes, equal the rebuild's (the scorer asserts it).

DECISION RULE: `host.TAKE_STRADDLE_LONG_MARGIN` ships at 2 only if (a), (b), (c) and (d) all hold. Otherwise it ships
at 0 (off), the board still sends the counts, and the vote goes back to NEXT.md with these numbers. Margins 1 and 3
are reported, not decided on.

## Result

Pre-registration committed in a08ca3779; all sixteen captures then made on that tree (132 standard drills and 36
instant ones, none aborted; stored as eval/take-straddle-long-{ai,aj,ak,al,inst}-2026-11-19.jsonl.gz) and scored
(eval/take-straddle-long-heldout-2026-11-19.txt), the 1.5 ms vote at its shipped 2:

| 2.5 ms margin | named (of 120 spread) | instant told to set a take (of 48) | right that off was not | wrong that off got right |
| --- | --- | --- | --- | --- |
| 0 (off) | 70 | 0 | - | - |
| 1 | 85 | 2 | 16 | 3 |
| **2 (pre-registered)** | **76** | **0** | **6** | **0** |
| 3 | 72 | 0 | 2 | 0 |

- (a) held: 76 against 70.
- (b) held: 0 of 48 instant builds told to set a take.
- (c) held: 0 un-named against 6 newly named.
- (d) held: every frame carried both votes' counts and each equalled the rebuild's (the scorer's asserts did not fire).

So **`host.TAKE_STRADDLE_LONG_MARGIN` ships at 2.**

Straddling wheels at 2.5 ms, pooled: instant builds 5 for and 70 against, 0.1-0.9 ms 3 and 60, 1.3-2.1 ms 24 and 53,
2.4 ms and up 76 and 6. As on the design, no instant or sub-1 ms build led by 2. Margin 1 again told instant builds
to set 2.5 ms (2 of 48; design 5 of 96) and is closed. Where margin 2 changed a verdict: a 2 ms build read 0 now reads
2.5, two 2.4 ms builds and two 2.8 ms builds 0 to 2.5 and a 3.5 ms build 0 to 2.5; three 2.4 ms builds the 1.5 ms vote
had named move to 2.5 (named either way).

**The size of it.** Six builds of 120 is a small gain, smaller than the design's 23 of 540 (4%, here 5%). Of the
14 of 36 builds at 2.4-3.5 ms that still read 0, 11 had one straddling kept wheel at 2.5 ms or none (6 none), the same limit the
1.5 ms vote hit: with one tach pulse a revolution, a drill of 22 balls has only a few whose contact crosses an edge.
Nothing at the board's end of the fit can see a take on a ball that did not straddle.

**Not known.** Simulated only, one jittery tach model, three launchers, four fresh seeds and twelve instant-only ones. A
real wheel's counts arrive in the TAKE_SURVEY frame's last two bytes.
