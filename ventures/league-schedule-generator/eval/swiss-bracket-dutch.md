# Bracket-by-bracket Dutch pairer against real published pairings (2026-11-21)

## Pre-registration (written before the new pairer was scored on any event)

Baseline: the shipped pairer (`swissPairings`, one weighted matching for the whole round,
`dutchOrder: "lex"`) reproduces 59.5% of later-round boards on the six chess-results events of
gbtami/swisspairing (condition `played`, rounds 2+; tune 0.609, held out 0.578) and 52.1% on the
three lichess events (`eval/swiss-vs-published.md`).

Change tested: `pairing: "bracket"`. Score brackets are paired top down, as FIDE C.04.3 does:

1. Stage A, one matching over every unpaired player (so the rest of the round stays pairable,
   criterion C4): in-bracket boards outrank everything (C5, most pairs in the bracket), then
   score differences (C6), then pairs in the next bracket for the players who float into it (C7),
   then colours and repeat floats, then the Dutch order. Its in-bracket boards fix who is paired in
   the bracket and who floats down.
2. Stage B, on the players paired in the bracket only: the best colour and float value is held
   fixed, and partners are chosen one S1 player at a time, S1 top first, each taking the earliest
   S2 player (then the S1 player nearest the S1/S2 boundary, an exchange) that still allows that
   value. Moved-down players (MDPs) are S1 first, against the residents; the residents left over
   form the remainder and split into their own S1 and S2.

Pre-registered test, same harness (`node eval/swiss-vs-published.mjs <fixtures> --pairing bracket`),
condition `played`, rounds 2+:

- (h1) board recall on the three held-out chess-results events (Budapest A, Graz, ChessHouse)
  rises by at least 2 points over 0.578;
- (h2) exact rounds on all six chess-results events do not fall (5 now);
- (h3) recall on the lichess events does not fall by more than 2 points (0.521 now);
- (h4) the simulated 440-event run (`eval/swiss-repeat-floats.mjs 40`) fails no event.

The tune events (Aeroflot, Budapest B, Prague D) may be used to fix defects; every change made after
the first held-out score is reported as post hoc. If h1 or h2 fails, the shipped default stays
`"matching"` and `"bracket"` ships only as an opt-in with the numbers stated.

## Result

**What was scored, in order (nothing hidden).**

1. The first run printed every event at once, held out included. It failed 35 of 54 chess-results
   rounds with "no pairing": after an exchange used up S1, two S2 players left to pair with each
   other were never visited, so the bracket ended with players unpaired. Where it did finish, it
   reproduced 0.949 of later-round boards. The fix (pair whoever is left by the same rule) is a
   completeness fix, not a tuning choice, but it was made after the held-out events had been seen.
2. With that fix, every round pairs. These are the numbers below, and every hypothesis was
   checked on them.
3. Two later changes, both to pass existing tests and run time, not to raise a score: the FIDE
   2025 C5 rule (the pairing bye goes to the lowest score the rest of the round allows, decided
   before any bracket; `trf.test.mjs`'s C5 example caught it) changed no eval number; a shortcut
   that reuses the last optimal matching (a 357-player round 1 went from 4.1 s to 1.1 s) changed
   one board in one `open` round (Graz round 5, 94 to 95 boards).

**The registered test: all four pass.**

| condition `played`, rounds 2+ | matching (`lex`, shipped before) | bracket |
|---|---|---|
| held-out chess-results events (Budapest A, Graz, ChessHouse), board recall | 0.578 | **0.809** (h1: +23.1 points) |
| tune events (Aeroflot, Budapest B, Prague D), board recall | 0.609 | 0.961 |
| all six chess-results events, board recall | 0.595 | 0.891 |
| exact rounds, all six chess-results events, rounds 1-9 | 5 | **15** (h2) |
| lichess events, board recall | 0.521 | **0.590** (h3) |
| round 1, chess-results, board recall (exact rounds) | 0.732 (4) | 0.732 (4) |

Per event, rounds 2+: Aeroflot 0.646 to 0.960, Budapest A 0.770 to 0.887, Budapest B 0.700 to
0.912, Graz 0.601 to 0.917, Prague D 0.571 to 0.973, ChessHouse 0.383 to 0.527. Aeroflot rounds
1-5 and Prague D rounds 1, 3 and 4 are now board-for-board what the arbiters published. Full output:
`eval/swiss-bracket-dutch.txt`.

**Simulated events, h4** (`node eval/swiss-repeat-floats.mjs 40 - bracket`, the same 440 events,
8 to 151 players, 3,560 rounds, repeat-float rule on; `eval/swiss-bracket-sim.txt`): **0 failed
events** (h4 passes). Against the whole-round matching on the same seeds
(`eval/swiss-repeat-floats.txt`): floats 12,523 to 12,399 (-1.0%), squared-gap total 8,153 to 8,012,
strong colour clashes 6,314 to 6,451 (+2.2%), mild 8,224 to 8,152, repeat down-floats 2,048 to
2,123 (+3.7%), repeat up-floats 1,715 to 1,705, two rounds back 1,601 to 1,566 down and 1,391 to
1,295 up, absolute clashes 0 in both. The small rises are the price of settling the top bracket
first, which is what the Dutch rules ask for; none was a registered metric. A 151-player round
averages 96 ms here (59 ms for the whole-round matching).

**Why it helps so much.** The whole-round matching weighs a float in the top group against
colour and order costs everywhere below it, so a cheap fix at the bottom could move a board at the
top. The Dutch rules never do that: a bracket is settled before the next is looked at, with the
rest of the round only required to stay pairable. Pairing the same way is most of the gain; holding
the best colour value and then taking the earliest S2 partner one S1 player at a time is the rest.

**What it still misses.** ChessHouse stays at 0.527 and Graz and Budapest B round 1 still differ
(the TRF does not carry the seed order those events used). The remaining differences in the
other events sit in the lower brackets of late rounds, where the rules' finer points apply: the
exact exchange order (FIDE ranks exchanges by the sum of the BSNs moved; here an S1 player is offered
S1 partners from the boundary up), the C.8 look-ahead to the bracket after next, and the tie between
heterogeneous remainder choices. Not FIDE-endorsed: an arbiter must still use an endorsed program
for a rated event, and the page says so.
