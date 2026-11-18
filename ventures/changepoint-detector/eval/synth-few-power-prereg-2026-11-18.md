# Pre-registration: size and power of the placebo test with few units and one shocked donor (2026-11-18)

Written after one exploratory run (`eval/synth-few-power-explore.out.txt`, base 81000, 100 panels a cell) and
committed before the confirmatory run (base 83000, 400 panels a cell, `eval/synth-few-power-confirm.out.txt`).

## Why

README "Few donors: the Basque Country and West Germany" found both published gaps but neither treated unit at rank 1
of 17, with donors' own after-date shocks (Norway's oil, Asturias's coal) ranked above them, and ended: "a size and
power check at 10-20 units in simulation (how often rank 1 is reached with a real 2 sd step when one donor has its own
shock)". A user with a handful of stores or regions needs that number before running the test, and needs to know what
to do about a donor whose own event they already know of.

## Design (`eval/synth-few-power-sim.mjs`)

The shipped panel generator (eval/synth-sim.mjs, N1's shape: two AR(1) factors, idiosyncratic sd 0.5, 19 points
before, 12 after) at 11, 16 and 21 units. Unit 0 is treated, unit 1 is the donor that may carry its own shock (a step
from the date, sign drawn per panel). Cells per unit count U:

- N_U: nothing. ND_U: donor shock 1.0. P_U: effect -1.0 (2 idiosyncratic sd). PD_U: effect -1.0, donor shock 1.0.
  PE_U: effect -1.0, donor shock 2.0.

Shipped defaults (outcome-only fit, floored ratio, pool without the treated unit). Each panel is also scored with
donor 1 left out of the pool before the fit (the pre-declared exclusion a user can make when a donor's own event is
known in advance). "Rank 1" is the strongest result the test allows (p = 1/U).

## Bars (confirmatory run)

1. **Size.** In every N and ND cell the rank-1 share is at most 1/U + 4 points.
2. **Power, clean donors.** In every P cell the rank-1 share is at least 40%.
3. **A donor shock the size of the effect costs power.** In each U, PD's rank-1 share is at least 8 points below P's.
4. **A donor shock twice the effect takes the test down to about its size.** In every PE cell the rank-1 share is
   at most 15%.
5. **Leaving the shocked donor out beforehand restores it.** In every PD and PE cell the rank-1 share with donor 1
   left out is within 8 points of P's at the same U, or above it.
6. **The "ranked above" list names it.** Pooled over PD and PE, of the panels not at rank 1, at least 70% have the
   shocked donor among the units at or above the treated one.

Reported, no bar: rank <= 2, the plain ratio's and the after-gap's rank-1 share, the shocked donor's weight in the
treated fit, the mean effect (truth -1), the fit warning's rate.

## Product change decided now, whatever the bars say

The FEW DONORS note (CLI and page, `fewDonorsNote` in synth-view.mjs) quotes the confirmatory rank-1 shares at the
nearest of 11, 16 and 21 units: with a 2-sd step and clean donors, and with one donor shocked by the same amount; and
says to leave out of `--donors`, before fitting, any donor whose own event after the date is already known, naming
the event in the write-up, never dropping one after seeing the ranks. If bar 5 fails, the note says instead that
leaving such a donor out did not restore power in simulation.
