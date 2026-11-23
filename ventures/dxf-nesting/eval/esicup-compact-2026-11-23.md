# Strip compaction by overlap minimisation, 2026-11-23

## Pre-registration (written after the dev runs, before any held-out run)

- **Data, score, grid, split:** as in `esicup-strip-2026-11-22.md` (the 23
  discrete-rotation ESICUP instances from sparrow, commit b8ef033; ratio =
  sparrow's record length / our length; strip height / 500 cells, gap 0;
  dev = gardeyn0-9, held out = the 13 classic sets). Every nest must pass
  `verify`.
- **Change under test:** `compactMoves` (`compact.mjs`). After the greedy and
  the order search, the last sheet's strip end is pulled in a little; parts
  that stick out are moved inside and every overlapping part is moved to its
  least-overlap spot (overlap counted on the grid, deeper cells costing more),
  with weights on parts that keep overlapping; a layout with no overlap is
  kept and the strip is pulled in again. Seeded, budgeted in part moves.
- **Setting chosen on dev:** 5,000 moves, 100 global + 60 local samples per
  move, 60 rounds per attempt, first pull-in 0.5% of the length, weights +25%
  per round in collision. Things tried on dev and dropped: plain cell counts
  instead of depth-weighted (dev subset gardeyn1/4/6: 0.851 vs 0.856),
  decaying the weights of free parts (no better), more rounds per attempt
  (120: no better; 30: worse).
- **Dev results (no held-out data seen):**

  | setting | dev mean ratio |
  |---|---|
  | greedy, no search (2026-11-22) | 0.8475 |
  | compaction 5,000 | 0.8691 |
  | search 100 (2026-11-22) | 0.8673 |
  | search 100 + compaction 5,000 | 0.8779 |

- **Adopt as the page default if** on the held-out 13: search 100 +
  compaction 5,000 beats search 100 alone (0.8359) by at least 0.01 in mean
  ratio, no instance gets worse (compaction only keeps a shorter layout, so a
  worse one would be a bug), all nests pass `verify`, and the page's worked
  example still finishes in under 5 s here with the page's settings.

## Results

Commands (two at a time on a 4-core cloud container, so times are loaded
wall-clock times):
`node eval/esicup-strip.mjs sparrow/data --opts '{"compactMoves":5000,"timeLimitMs":300000}'`
and the same with `"searchIters":100`. Per-instance numbers:
`esicup-compact-2026-11-23.json`; the 2026-11-22 columns come from
`esicup-strip-2026-11-22.json`.

| set | no search | compaction 5,000 | search 100 | search 100 + compaction 5,000 |
|---|---|---|---|---|
| dev (gardeyn0-9) | 0.8475 | 0.8691 | 0.8673 | 0.8779 |
| **held out (classic 13)** | 0.8069 | **0.8358** | 0.8359 | **0.8526** |

Held out, length ratio per instance:

| instance | no search | compaction | search 100 | search 100 + compaction | s (last) |
|---|---|---|---|---|---|
| albano | 0.844 | 0.902 | 0.892 | 0.912 | 10.0 |
| blaz1 | 0.788 | 0.819 | 0.828 | 0.832 | 12.0 |
| dagli | 0.838 | 0.861 | 0.847 | 0.853 | 6.4 |
| fu | 0.849 | 0.856 | 0.849 | 0.871 | 5.9 |
| jakobs1 | 0.822 | 0.885 | 0.863 | 0.885 | 1.6 |
| jakobs2 | 0.731 | 0.767 | 0.748 | 0.802 | 2.1 |
| mao | 0.842 | 0.853 | 0.842 | 0.853 | 5.6 |
| marques | 0.852 | 0.871 | 0.884 | 0.884 | 4.6 |
| shapes0 | 0.758 | 0.791 | 0.801 | 0.820 | 7.7 |
| shapes1 | 0.730 | 0.760 | 0.797 | 0.811 | 7.0 |
| shirts | 0.855 | 0.859 | 0.870 | 0.870 | 9.8 |
| swim | 0.722 | 0.775 | 0.767 | 0.794 | 6.6 |
| trousers | 0.859 | 0.867 | 0.878 | 0.897 | 21.4 |

All 46 nests (20 dev, 26 held out) pass `verify`. No instance got worse than
the run without compaction; marques and shirts did not move after the search.

Worked example (72 parts, 2500 x 1250, gap 5, page settings with search 60),
this machine, unloaded: compaction off 3.9 s, 1,000 moves 4.9 s (no gain),
2,000 moves 5.3 s (used length 1912 to 1908), 5,000 moves 7.5 s (1904).

**Verdict: the quality bar passed, the time bar failed, so it ships opt-in.**
Held-out gain over search 100 is +0.017 (bar 0.01) and +0.029 over the
greedy alone, none worse, every check passes. But 5,000 moves take the worked
example to 7.5 s against the 5 s bar, so the page default stays Off and the
page offers "Squeeze the last sheet shorter" (Off, 2,000, 5,000 moves); the CLI
takes `--compact N`. With search 100 and compaction our held-out strips are
about 17% longer than the records (1/0.8526), down from about 20%.

## What it says, and what next

- Moving parts after they are placed is worth about as much as the whole
  order search (each +0.029 alone on the held-out set), and the two add up
  only partly (+0.046 together): both are taking up the same slack.
- The biggest gains are on the interlocking sets the greedy does worst on
  (jakobs2 +0.054 over search, swim +0.027, shapes0 +0.019), which is where
  a placement rule that never revisits a part was expected to lose.
- Dev runs showed the separation stalling on large instances (gardeyn6, 161
  parts: a pull-in of 3 cells of 2,296 never separated in 10,000 moves); the
  collisions spread rather than shrink. Weights per pair of parts (as
  sparrow uses) instead of per part are the obvious next step; they need a
  per-pair overlap, not the single weighted grid used here.
- Still not checked: any real shop's job. On the worked example the squeeze
  buys 0.4% of the used length; on real jobs with a long last sheet the
  remnant is what grows.
