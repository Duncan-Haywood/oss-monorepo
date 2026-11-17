# Pre-registration: a floored ratio for the synthetic control's placebo test (2026-11-17)

Written after an exploratory simulation (hashed seed base 21000, 100 panels a cell, `eval/synth-floor-explore.out.txt`)
and before the confirmatory simulation (fresh hashed base **23000**, 400 panels a cell) and before any real state is
run with the new statistics. Committed on its own before either run.

**Why.** The last round (README "A synthetic control", `eval/synth-prereg-2026-11-17.md`) replicated Proposition 99's
gap but ranked California 3rd of 39 (p 0.077): Missouri and Virginia are fitted almost exactly before 1989 (RMSPE 0.41
and 0.86 packs against California's 1.66), and the paper's ratio divides by that before-gap. It ended: "a statistic
that does not divide by a tiny before-gap (the after-gap alone, or the ratio with the before-gap floored at the
donors' median), checked in simulation against cells where some donors are near-copies of others".

**What was seen before this file.** The README quotes, for the real data, California's before RMSPE 1.66, after
20.5, ratio 12.4; Missouri before 0.41, after 10.9, ratio 26.5; Virginia before 0.86, ratio 16.9. From those numbers
alone, if the median before-gap of the 39 states is above about 0.9 packs, Missouri and Virginia fall below
California on the floored ratio; other states' values are not quoted. `eval/synth-real-diag.out.txt` (committed by
the last round) lists every placebo's before and after RMSPE; it was not opened for this round and the floored
ratio has not been computed on any real state. The exploratory simulation was seen (table below).

**Method** (`synth-control.mjs`, fixed by this file; fits unchanged from the last round, placebo pool 'without').
Every unit's fit gives a before-date RMSPE `pre` and after-date RMSPE `post`. Floor = the median `pre` over all units,
treated and donors. Statistics, each ranked as before, p = (1 + donors at least the treated's) / (donors + 1):
- **floored** (primary): post / max(pre, floor);
- ratio (the paper's): post / pre, the comparison;
- post (the after-gap alone): reported, no bar.

**Simulation** (`eval/synth-floor-sim.mjs`, seeds hashed with splitmix32 of base, cell and panel as the last round
asked). Cells N1-N5, E1, P1-P4 as the last round; new: N6/P5 eight near-copy donor pairs (copy = original + N(0, 0.1)
a point), no change / a step of -1 (2 noise sd); N7/P6 the treated unit's loadings at (1.45, 1.45), inside the donors'
U(0.5, 1.5) square near its corner, no change / a step of -1. Confirmatory: `SC_SEED_BASE=23000 SC_SHARD=i/4 node
eval/synth-floor-sim.mjs 400` for i 0-3, merged by `node eval/synth-floor-merge.mjs` into
`eval/synth-floor-confirm.out.txt`.

Exploratory (base 21000, 100 a cell), p <= 0.05 / p <= 0.10:

| cell | ratio | floored | post |
|---|---|---|---|
| N1-N5 | 1-5% / 4-11% | 1-2% / 2-13% | 0-8% / 5-10% |
| N6 copies | 3 / 11% | 6 / 16% | 6 / 13% |
| N7 corner | 0 / 2% | 2 / 9% | 5 / 22% |
| E1 outside | 1 / 3% | 5 / 11% | 49 / 89% |
| P1 | 29% | 60% | 14% |
| P2, P3, P4 | 6, 19, 9% | 9, 26, 20% | 5, 17, 12% |
| P5 copies, P6 corner | 40, 20% | 58, 43% | 23, 29% |

The after-gap alone fails the outside-the-hull cell (49%) and is not a candidate.

## Bars (floored statistic, confirmatory run)

1. **Size.** In each of N1-N7, p <= 0.05 in at most 6% of panels and p <= 0.10 in at most 14% (the last round's
   bar; N6 at 16% in exploration is the risk).
2. **Outside the hull.** E1: p <= 0.05 in at most 6%.
3. **Power.** On every one of P1-P6 the floored share with p <= 0.05 is at least the ratio's less 2 points; on P1 and
   P6 it is at least the ratio's plus 10 points.
4. **Real** (`SC_STAT=floored node eval/synth-real.mjs > eval/synth-floor-real.out.txt`; the last round's states,
   windows, donor pools and bars unchanged): T1 California 1989 p <= 0.05 with the average gap -30 to -10 packs and
   the gap at 2000 below 0; T2-T4 (MA 1993, AZ 1995, OR 1997) at least 2 of 3 with p <= 0.10 and a negative gap; I
   (California cut at 1988, fake dates 1980 and 1984) neither p <= 0.05; Q (the nine placebo states at 1989) at most
   1 of 9 with p <= 0.05.

**Decision.** If 1-3 hold, `synthControlTest`'s default statistic becomes 'floored' (the simulation is what calibrates
a statistic). `--synth-control` ships in the CLI only if 4 holds as well; otherwise the README says which real bar
failed and the module stays a library function.
