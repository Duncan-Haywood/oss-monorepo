# FIDE exchange order in the bracket-by-bracket Swiss pairer (2026-11-21, later)

## What changed

The Dutch rules (FIDE C.04.3, article 4.3) say which exchange between S1 and S2 to try when no
plain transposition of S2 pairs a homogeneous bracket (or the remainder of a heterogeneous one)
at its best quality: (a) the fewest players exchanged, (b) the smallest difference between the
BSN sums moved S2 -> S1 and S1 -> S2, (c) the highest different BSN moved out of S1, (d) the lowest
different BSN moved out of S2. After the exchange, S1 and S2 are re-sorted and S2's transpositions
are tried in lexicographic order.

Before this change `bracketMate` approximated that: each S1 player took the earliest S2 partner
that still allowed the best colour-and-float value, else an S1 player from the boundary up. That
lets an early S1 player take an S2 partner that only works through an exchange, and it pairs the
players left in S2 with each other instead of against the exchanged S1 players.

`exchangeFor` (swiss.mjs) now does it the rules' way:

1. One matching over the remainder with weight (best value first, then boards across S1/S2) gives
   the best value and the fewest S1-S1 boards j an optimal pairing needs. Every candidate is
   some S1'-S2' pairing, so the best value over candidates is the best over all perfect matchings,
   and the smallest exchange that reaches it moves exactly j players each way.
2. If j = 0, nothing changes (the S1 players take S2 partners in order, as before).
3. Otherwise the C(h, j)^2 exchange sets of size j are sorted by (b), (c), (d), and each is checked
   with a bipartite matching (S1' against S2' only) until one reaches the best value. Over 4,000
   sets falls back to the old rule (never happened on the eval data).
4. The S1' players then take partners from S2' only, top first, earliest S2' player that keeps the
   value: the lexicographically first transposition.

Option `exchange: "boundary"` keeps the old rule; `"dutch"` is the default.
`swiss.test.mjs` checks rules (a), (b) and (c) on six-player cases where the old rule and the new
one pick different exchanges.

## Result (same harness, condition `played`, rounds 2+; nothing tuned)

`node eval/swiss-vs-published.mjs <fixtures> --pairing bracket --exchange dutch|boundary`
(gbtami/swisspairing 193ad99; full output in `eval/swiss-exchange-order.txt`):

| | boundary (before) | dutch exchange order |
|---|---|---|
| all six chess-results events, boards matched (all rounds) | 4,290 of 4,915 | **4,297** |
| all six, rounds 2+ recall | 0.891 | **0.893** |
| exact rounds, chess-results | 15 | 15 |
| Budapest A (held out), rounds 2+ | 0.887 | **0.895** (round 8: 0.86 -> 0.92) |
| Budapest B, rounds 2+ | 0.912 | **0.925** (round 7: 0.74 -> 0.84) |
| Aeroflot, Graz, Prague D, ChessHouse | 0.960, 0.917, 0.973, 0.527 | unchanged |
| lichess events, boards matched (all rounds) | 636 of 1,182 | **640** (weekly 02.28: 0.638 -> 0.648) |

No round of any event got worse. Of the 975 remainder brackets scored, 25 needed an exchange
(j = 1 in every one; the budget never applied), which is why the gain is small: the exchange
order was a real deviation from the rules but a rare one.

**Simulated events** (`node eval/swiss-repeat-floats.mjs 40 - bracket`, the same 440 events,
3,560 rounds; `eval/swiss-exchange-sim.txt`): 0 failed, absolute colour clashes 0. Against
`eval/swiss-bracket-sim.txt`: floats 12,399 to 12,387, repeat down-floats 2,123 to 2,120, repeat
up-floats 1,705 to 1,699, strong clashes 6,451 to 6,454, mild 8,152 to 8,222.

## Also tested, no effect: FIDE's colour criteria order

FIDE ranks C.12 (fewest players without their colour preference) above C.13 (fewest without a
strong preference); stage B ranked strong-vs-strong clashes first. Swapping to the FIDE order
changed **0 boards** on all nine real events (`played` and `open`), so it was not shipped; noted
here so the next run does not retry it.

## What the remaining 10.7% is

With 25 of 975 brackets touched, the exchange order was not the main gap. The open items are in
NEXT.md: C.8 look-ahead to the bracket after next (which downfloaters to choose), the
heterogeneous-remainder tie (which MDPs are paired), and ChessHouse's attendance (0.527).
Not FIDE-endorsed: an arbiter must still use an endorsed program for a rated event.

**Later the same day:** ChessHouse's 0.527 turned out to be a name bug (five players named `0`; `0 (154)` lost its bracket as a note), not attendance. After the fix the six events read 94.8% later-round recall, ChessHouse 0.975: `eval/swiss-bracketed-names.txt`, README "Players told apart by \"(id)\" kept their own results".
