# The straddle vote in the take bound (2026-11-19, firmware/esp32/README.md, same title)

Item from `ventures/open-tennis-robots/NEXT.md` ("Buildable here", 2026-11-19): "whether the vote can tighten the
TAKE_US = 0 bound (on the design the 8 builds floor 0 misses had no straddling wheel at all, so 'no straddle, no 1.5 ms
bound' covered them; it won back 2 of 14 loosened instant bounds there, not yet held out)".

When the Pi tells a build TAKE_US = 0 it names a bound (`host.take_survey_bound`): the first grid contact time whose rms
is more than 2% and at least `host.TAKE_BOUND_FLOOR_PPM` (2 ppm) over the step's. The floor is needed (sets Y and Z:
the 2% bar alone missed 3 of 54 near-2 ms takes) but loosens the bound on some instant builds, and no floor built from
the step's noise separated the two (eval/take-bound-floor-se-2026-11-19.md). The straddle votes count, on kept wheels
whose fit put a 1.5 ms (or 2.5 ms) take across a revolution's edge, how many fit it better than the step and how many
worse. A wheel that straddles and fits 1.5 ms worse is evidence against a 1.5 ms take that the summed rms dilute.

## Design (every stored set with wheel inputs on the nine-point grid: O, P, W, X, Y, Z, AA-AN and the two instant-only files; 912 builds; eval/take-bound-vote-design-2026-11-19.txt)

`tests/take_bound_vote.py` rebuilds each frame with both counts (tests/take_straddle_vote.py's frames), asks the shipped
advice (both votes at margin 2) which builds it tells TAKE_US = 0 (641, 192 of them instant), and scores bound rules:
covered when the true take is at most the bound, tight when an instant build is bounded at 1.5 ms.

| rule | covered (of 641) | instant at 1.5 ms (of 192) | tighter than shipped | looser |
| --- | --- | --- | --- | --- |
| shipped (floor 2) | 641 | 89 | - | - |
| 2% bar alone (floor 0) | 632 | 93 | 39 | 0 |
| **drop 0: floor 0 where the 1.5 ms vote has a straddling wheel and against >= for** | **641** | **92** | **8** | **0** |
| drop any: floor 0 where any wheel straddles at 1.5 ms | 641 | 92 | 9 | 0 |
| drop 1 | 641 | 91 | 6 | 0 |
| cap 1: bound at most 1.5 ms where against - for >= 1, whatever the rms | 639 | 99 | 33 | 0 |
| cap 2 | 641 | 90 | 1 | 0 |
| long 2: floor 0 where the 2.5 ms vote leads against by 2 | 639 | 92 | 12 | 0 |

- The 9 real takes the 2% bar alone misses (1.6-3.5 ms, all bounded 1.5 ms) all had **no** straddling kept wheel at
  1.5 ms. So the claim in NEXT.md holds on every stored set: dropping the floor only where a wheel straddled covers
  everything the floor covers.
- **The ceiling is small.** The floor is not what keeps most instant builds loose: dropping it everywhere bounds 93 of
  192 at 1.5 ms against 89. The other 99 instant builds have a 1.5 ms rms within 2% of the step's, because few of their
  balls straddle at 1.5 ms. Drop 0 wins back 3 of the 4 the floor costs, with no miss.
- Rules that override the rms (cap) bound more instant builds at 1.5 ms (99 at cap 1) but miss two 1.6 ms takes each
  with one straddling wheel voting against; a lead of 2 (cap 2) wins 1. Not candidates.
- The 2.5 ms vote does not help the instant builds (92 at best) and misses 1.6-2.1 ms takes whose 2.5 ms vote leads
  against: a 2 ms take is shorter than 2.5 ms, so its straddling wheels fit 2.5 ms worse. Not a candidate.

Drop 0 is the candidate over drop any: they bound the same instant builds, and drop 0 leaves the floor in place where
the 1.5 ms vote favours a take (for > against), which is where a real short take is likeliest. These sets were all
looked at for the votes, so this is a design reading, not a test.

## What was built (before the held-out sets)

- `host.TAKE_BOUND_STRADDLE` (False until the rule below decides): when True, `take_survey_bound` uses no ppm floor
  where the frame's `straddle_for` + `straddle_against` >= 1 and `straddle_against` >= `straddle_for`. Older frames
  (no counts) keep the floor. tests/test_host.py `test_bound_floor_lifted_by_straddle_vote`.
- `tests/take_bound_vote.py` scores the rules; `--heldout` prints the verdict for `CANDIDATE = ("drop", 0)` and
  checks the host function names the candidate's bound on every frame.

## Prediction and rule (written and committed before any of the sets below was captured)

Fresh sets on this tree, jittery tach (`--tach 1`), three launchers. No seed below was used by an earlier capture
(stored: 7-199, 211-271, 277-373, 379-503). The instant-only pool is large because the design gain is about 1 instant
build in 64: 48 instant builds (the earlier held-out size) would expect under one.

| set | takes | lag (s) | seed |
| --- | --- | --- | --- |
| BA | the 11 of AA-AN (0.1-5 ms and 0) | 0.50 | 509 |
| BB | same | 0.58 | 521 |
| BC | same | 0.44 | 523 |
| BD | same | 0.62 | 541 |
| instant-only | `--takes 0` | 0.52 | the 64 primes 547-971 (547, 557, 563, ..., 967, 971) |

    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_survey_pick.py --capture ba.jsonl --lag 0.50 --seed 509 --procs 4 --takes "0.1,0.5,0.9,1.3,1.6,2.0,2.4,2.8,3.5,5.0,0" --tach 1
    (BB, BC, BD the same with their lag and seed; each instant seed S with --lag 0.52 --seed S --takes 0 --tach 1)
    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_bound_vote.py --heldout --procs 4 ba.jsonl bb.jsonl bc.jsonl bd.jsonl inst.jsonl

PREDICTION, pooled (132 standard drills, 204 instant builds), on the builds the shipped advice tells TAKE_US = 0:
(a) drop 0 covers every build the shipped bound covers; (b) it bounds more instant builds at 1.5 ms than the shipped
bound; (c) it is looser than shipped on no build; (d) `host.take_survey_bound` with `TAKE_BOUND_STRADDLE` on names the
same bound as the scorer's drop 0 on every frame.

DECISION RULE: `host.TAKE_BOUND_STRADDLE` ships True only if (a), (b), (c) and (d) all hold. Otherwise it stays False
and the item goes back to NEXT.md with these numbers. The other rules are reported, not decided on.
