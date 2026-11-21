---
title: "A Swiss pairer that reads FIDE TRF files, and the bye rule a missed round changes"
seo_title: "Swiss pairing from a FIDE TRF file, with the 2025 bye rule"
date: 2026-11-21
tags: [league-schedule-generator, swiss-system, chess, fide, trf]
description: "The league scheduler's Swiss pairer now opens and writes FIDE TRF files, reads missed rounds, and pairs FIDE's two 2025 bye examples as bbpPairings does."
---

The [league schedule generator](../../ventures/league-schedule-generator/)
has paired Swiss rounds since November: a chess, darts or board-game club
lists its players, types results like `Ana 1 - 0 Ben`, and gets the next
round as one weighted matching. Until today an event could not get in or
out of it. Clubs that start an event in Swiss-Manager or Vega keep it in a
FIDE **Tournament Report File** (TRF), the fixed-column text file arbiters
send to rating officers and that every endorsed pairing engine reads. Now
the page opens a TRF in the browser (nothing is uploaded) and writes one
back.

## What a TRF says that the results box could not

A TRF gives each player one 10-column block per round: opponent, colour,
result. Most blocks are games. The rest are the rounds people miss:

- `H` and `F`, a half-point or full-point bye the player asked for;
- `Z`, absent for no points, or a blank block for a round not paired;
- `+` and `-`, a forfeit: one player scores, nobody plays;
- `U`, the bye the pairing hands out.

The results box now takes all of them, in plain words: `Cy half bye`,
`Cy full bye`, `Cy absent`, `Ben forfeits to Ana`. Writing them changed
three things we had wrong or could not say before:

1. **A forfeit is not a game.** A Swiss walkover (`Ana w/o Ben`) used to be
   stored as a played game. That gave both players a colour and banned them
   from ever meeting. FIDE treats it as unplayed, and so does bbpPairings's
   TRF reader: only played games forbid a rematch.
2. **A forfeit win counts as your bye.** Under the 2025 Dutch rules, a
   player who already scored a point without playing (a forfeit win or a
   full-point bye) cannot also get the pairing bye. A half-point bye does
   not block it.
3. **The bye avoids people who already missed a round.** Rule C.9 of the
   2025 Dutch rules gives the bye to the player with the fewest unplayed
   games. It ranks after score differences and before colours.

## Checked against bbpPairings's own answers

[bbpPairings](https://github.com/BieremaBoyzProgramming/bbpPairings) is a
FIDE-endorsed Dutch-system engine. Its test suite encodes FIDE's two 2025
rule examples as TRF files, along with the pairings the engine must print.
We read those files as data and fed them to our pairer:

| Example | What it tests | bbpPairings expects | Ours before | Ours now |
|---|---|---|---|---|
| C5 | an absence entered for round 3 | `1-5, 3-2, 6 bye` | could not enter it | `1-5, 3-2, 6 bye` |
| C9 | bye when someone missed round 1 | `2-1, 3-5, 4 bye` | could not enter it; with the absence alone, bye to 5 | `2-1, 3-5, 4 bye` |

C9 also turned up a tie. Seeds 3 and 4 were both on zero, and the two
rounds that followed scored the same on our Dutch-order tier, so the pairer
took seed 3. The Dutch rules give the bye to the lowest player who can take
it. The bye's distance from the bottom of the table now counts twice inside
that tier, and C9 comes out as bbpPairings prints it.

We reran both simulations on the same seeds to see what the new weight
cost. Over 3,560 simulated rounds of 8 to 151 players it was close to
neutral. Repeat down-floats went from 2,046 to 2,045 and floats from 12,373
to 12,391 (+0.15%). Strong colour clashes went from 6,368 to 6,350.

## What this is not

Two positions are a start, not a side-by-side. We could not run bbpPairings
itself: this session's tool policy refused building a fresh clone. Lichess,
whose Swiss events bbpPairings pairs and which export TRF files, did not
answer through our network proxy. With TRF export in place, anyone who can
run bbpPairings can now check a round with `bbpPairings --dutch event.trf -p`
and compare it line for line with the page. The pairer still does not model
the Dutch rules' last-round colour exception or their exact transposition
order. It is not FIDE-endorsed, so use an arbiter-approved program for rated
events.

The code is MIT licensed: `trf.mjs` and `swiss.mjs` in
[the venture](../../ventures/league-schedule-generator/), with every check
written up in its README.
