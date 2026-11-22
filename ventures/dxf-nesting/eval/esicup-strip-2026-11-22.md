# ESICUP strip benchmark and an order search, 2026-11-22

## Pre-registration (written before any held-out run with the search)

- **Data.** The 23 discrete-rotation ESICUP strip-packing instances as JSON in
  [sparrow](https://github.com/JeroenGar/sparrow) (MIT, commit b8ef033), `data/input`.
  Reference: sparrow's best strip length per instance (`data/records/final_best_*.svg`,
  the bin's bbox `x_max`), the state of the art in the 2025 paper
  "An open-source heuristic to reboot 2D nesting research" (arXiv 2509.13329).
  The `_c` (continuous rotation) twins are left out: no record to compare to.
- **Score.** Length ratio = record length / our length (1.0 = matches the record),
  averaged over instances; density = parts' area / (strip height x our length).
  Grid: strip height / 500 cells, gap 0, margin 0, tolerance 1e-6 of the height.
  Every nest must pass `verify` (exact segment-to-segment check).
- **Split.** Dev (tuning allowed): gardeyn0 to gardeyn9 (10). Held out: the 13
  classic sets (albano, blaz1, dagli, fu, jakobs1, jakobs2, mao, marques,
  shapes0, shapes1, shirts, swim, trousers), run once with the setting the dev
  set picks.
- **Change under test.** `searchIters`: after the four fixed orders, mutate the
  best order (swap two copies of different parts, or move one earlier), keep it
  when the nest is no worse, seeded so it repeats; runs that can no longer win
  stop early.
- **Adopt as the page default if** the held-out mean length ratio rises by at
  least 0.01 over searchIters 0, no held-out instance gets worse (the search
  only accepts no-worse nests, so a worse one would be a bug), and the
  page's worked example still finishes in under 5 s on this machine.

## Results

Command: `node eval/esicup-strip.mjs sparrow/data --opts '{"searchIters":100,"timeLimitMs":300000}'`
(four instances at a time on a 4-core cloud container, so the times are loaded
wall-clock times). Per-instance numbers: `esicup-strip-2026-11-22.json`.

Ratio = record length / our length; density = parts' area / (height x length).

| set | instances | ratio, no search | ratio, search 100 | change |
|---|---|---|---|---|
| dev (gardeyn0-9) | 10 | 0.8475 | 0.8673 | +0.020 |
| **held out (classic 13)** | 13 | **0.8069** | **0.8359** | **+0.029** |

Held out, per instance:

| instance | parts | record density | density, no search | density, search 100 | ratio, no search | ratio, search 100 | s |
|---|---|---|---|---|---|---|---|
| albano | 24 | 0.898 | 0.758 | 0.801 | 0.844 | 0.892 | 4.4 |
| blaz1 | 28 | 0.862 | 0.679 | 0.714 | 0.788 | 0.828 | 6.6 |
| dagli | 30 | 0.902 | 0.755 | 0.763 | 0.838 | 0.847 | 4.0 |
| fu | 12 | 0.924 | 0.784 | 0.784 | 0.849 | 0.849 | 3.0 |
| jakobs1 | 25 | 0.892 | 0.733 | 0.770 | 0.822 | 0.863 | 0.9 |
| jakobs2 | 25 | 0.877 | 0.641 | 0.656 | 0.731 | 0.748 | 1.2 |
| mao | 20 | 0.869 | 0.732 | 0.732 | 0.842 | 0.842 | 2.3 |
| marques | 24 | 0.920 | 0.784 | 0.813 | 0.852 | 0.884 | 2.8 |
| shapes0 | 43 | 0.700 | 0.530 | 0.561 | 0.758 | 0.801 | 4.6 |
| shapes1 | 43 | 0.767 | 0.560 | 0.611 | 0.730 | 0.796 | 4.2 |
| shirts | 99 | 0.909 | 0.778 | 0.791 | 0.855 | 0.870 | 6.1 |
| swim | 48 | 0.798 | 0.577 | 0.612 | 0.722 | 0.767 | 4.1 |
| trousers | 64 | 0.926 | 0.795 | 0.813 | 0.859 | 0.878 | 9.4 |

All 46 nests (23 instances x 2 settings) pass `verify`. No instance got worse;
fu and mao did not move.

**Verdict: adopted.** Held-out gain +0.029 (bar 0.01), none worse, and the
worked example takes 2.9 s with 60 tries (bar 5 s). The page now defaults to
60 tries (a "Search for a shorter nest" select: off, 60, 300); the CLI takes
`--search N` and defaults to 0. Deviation from the pre-registration: the dev
set was only run at 100 tries (one setting, not a sweep), and the page default
is 60, not 100, to keep the example near 3 s on a loaded machine.

## What it says about the tool

- Before this run the README said the greedy nester was "a few percent" off a
  commercial nester. On the classic held-out set its strips were 24% longer than
  the best known (ratio 0.807), and are now 20% longer (0.836). "A few
  percent" was wrong, and the README now gives the measured figure.
- The grid costs part of the gap by design: every part reserves at least one
  extra cell all round so the gap guarantee holds. At 1000 cells instead of
  500 (no search), five instances moved +0.01 to +0.06 in ratio (dagli
  0.838 to 0.849, jakobs1 0.822 to 0.869, shapes0 0.758 to 0.792, shirts 0.855
  to 0.879, swim 0.722 to 0.778).
- sparrow's records come from many 20-minute runs on 16 cores with exact
  geometry; a few seconds in a browser tab is a different budget. The point
  of the table is the size of the gap, and which instances it is widest on
  (jakobs2, swim, shapes: many concave parts that interlock).

## Speed change in the same PR

`Sheet.find` now tests the mask row that blocked the previous candidate first.
Every blocked row gives a safe jump, so the nests are identical (the 13
held-out instances and gardeyn1 and gardeyn4, with no search, gave the same
length before and after); swim went
from 288 ms to 151 ms and gardeyn4 from 3.5 s to 1.7 s on the same loaded
machine.

## Next

- Mutate the turn as well as the order (the search keeps each copy's greedy
  choice of turn).
- A coarse-to-fine search: rank orders at half resolution, place the best at
  full resolution.
- Run the search in a Web Worker so the page stays responsive at 300 tries.
