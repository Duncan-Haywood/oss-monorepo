# A straddle margin scaled to the count (2026-11-19, firmware/esp32/README.md, same title)

Item from `ventures/open-tennis-robots/NEXT.md` ("Buildable here", 2026-11-19): "A margin that scales with the straddle
count (instant builds vote 'for' about 1 in 5) is untested; test it on fresh seeds, not AA-AH."

The 1.5 ms vote (`host.TAKE_STRADDLE_MARGIN = 2`) advises 1.5 ms when for - against >= 2. A fixed lead means different
things at different counts: on an instant build, where a straddling wheel votes "for" with chance about 0.2, a 2-0
split has a 4% chance, 4-2 has 1.7%, and 4-3 (refused by the fixed margin) 3.3%. The scaled rule asks the binomial
question: advise 1.5 ms where for >= 2 and P(X >= for | n = for + against, p = 0.2) <= alpha.

## What the scaled rule can change

`tests/take_straddle_scaled.py` (`tail`, `fires`) and tests/test_take_straddle_scaled.py: at alpha 0.05 the binomial
rule fires on exactly the splits margin 2 fires on for every count up to 6 (2-0, 3-0, 3-1, 4-0, 4-1, 4-2, 5-0, 5-1,
6-0); the first split where they part is 4-3 (n = 7, tail 0.033). Lower alphas (0.01-0.035) are stricter than margin 2
(they refuse 2-0); a higher one (about 0.11) admits 2-1 (tail 0.104), which is margin 1 without its 1-0.

## Design reading (every stored nine-point capture with wheel inputs: 78 files, 1302 builds, 402 instant; eval/take-straddle-scaled-design-2026-11-19.txt)

| rule | named (of 900 spread) | instant told to set a take (of 402) | right that margin 2 was not | wrong that margin 2 got right |
| --- | --- | --- | --- | --- |
| margin 0 (off) | 533 | 0 | 0 | 62 |
| margin 1 | 693 | 18 | 106 | 26 |
| **margin 2 (shipped)** | **595** | **0** | - | - |
| margin 3 | 548 | 0 | 0 | 47 |
| binom 0.01-0.02 | 548 | 0 | 0 | 47 |
| binom 0.035 | 549 | 0 | 0 | 46 |
| binom 0.05, 0.1 | 595 | 0 | 0 | 0 |
| margin 2 or binom (any alpha tried) | 595 | 0 | 0 | 0 |

**Why nothing moves: no drill straddles enough wheels.** The largest straddle count on any of the 1302 builds is 5
(the full split tables are in the .txt). Below 7 the scaled rule is margin 2 or stricter, so it cannot name a take
margin 2 misses. The splits where a rule could still gain:

- 2-1: 6 of 402 instant builds (1.5%) and 5 of 294 builds at 1.3-2.1 ms (1.7%). Equally common on both, so no alpha
  or p separates them; admitting it is what failed margin 1's held-out test (3 of 48 instant builds told 1.5 ms, all
  on 2-1, eval/take-straddle-margin-one-2026-11-19.md).
- 1-0: 12 of 402 instant builds (3%) against 101 of 294 at 1.3-2.1 ms (34%). An 11-to-1 likelihood ratio, but on the
  1-in-35 instant builds it would misadvise, against the zero the shipped margin has kept on every held-out set.
- 0-0: 192 instant, 85 at 1.3-2.1 ms, 165 at 2.4 ms and up. No vote at all; most 1.3-2.1 ms builds still read 0
  because of this row and the 1-0 row, not because of the margin's shape.

## Decision

Closed at the design reading, without the fresh capture the NEXT.md line asked for: the item's premise (counts large
enough that a fixed lead is the wrong test) does not occur on the simulated drill, and a held-out set drawn from the
same drill cannot contain a split the rule acts on differently (it would need 7 or more straddling wheels; none of
1302 builds had more than 5). `host.TAKE_STRADDLE_MARGIN` stays 2; nothing in `host.py` changed. Reopen if a drill
change raises the straddle count (a longer survey drill or more tach pulses a revolution), and score it with this tool
first: at alpha 0.05 it differs from margin 2 only from 4-3 up.

**Not known.** Simulated only; one drill (`drill.calibration.json`), one jittery tach model, three launchers. The
straddle count per drill is a property of the drill's length and the tach, so a real wheel's survey could differ.
