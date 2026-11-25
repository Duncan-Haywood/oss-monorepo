# Assembly line balancer: fewest stations at takt, shortest cycle on a set crew

**Live:** https://marisstella.app/assembly-line-balancer/ · [How it works](https://marisstella.app/assembly-line-balancer/how-it-works.html)

How few stations can this line run on at takt? Type each task, its time and
the tasks that must come before it. Give the takt time (or the time available
and the units needed) and the tool finds the fewest workstations. Or give the
number of stations and it finds the shortest cycle. It proves the answer
optimal when it can, and when it cannot it shows the best balance found and
the proved lower bound. Everything runs in the browser.

Who it is for: manufacturing, industrial and lean engineers balancing or
rebalancing a line, plant managers checking a proposal, and industrial
engineering students with a textbook problem. Paid line-design suites and
research codes exist; this is a free, exact first pass you can check.

## Method

The simple assembly line balancing problem, type 1 (SALBP-1, fewest stations
for a cycle time) and type 2 (SALBP-2, shortest cycle for a number of
stations). Our own implementation (`engine.mjs`) of published ideas:

- lower bounds: total work over the cycle; the bin-packing bounds counting
  tasks over a half and a third of the cycle; earliest and latest stations
  from the work before and after each task, as collected in A. Scholl and
  R. Klein, "SALOME: A bidirectional branch and bound procedure for assembly
  line balancing", *INFORMS Journal on Computing* 9(4), 1997;
- a quick balance from four priority rules (ranked positional weight,
  W. B. Helgeson and D. P. Birnie, *Journal of Industrial Engineering* 12(6),
  1961; most followers; longest task; longest path), each run forwards and on
  the reversed line;
- an exact search over maximal station loads (J. R. Jackson, "A computing
  procedure for a line balancing problem", *Management Science* 2(3), 1956),
  pruned by the idle time a target station count allows, exploring states by
  cyclic best-first search and remembering every set of placed tasks, after
  D. R. Sewell and S. H. Jacobson, "A branch, bound, and remember algorithm
  for the simple assembly line balancing problem", *INFORMS Journal on
  Computing* 24(3), 2012. Targets go from the lower bound up, so the first
  feasible one is optimal; half the budget searches the reversed line, after
  SALOME's bidirectional idea;
- type 2 by binary search on the cycle time with the same exact test.

Not affiliated with or endorsed by the authors or by assembly-line-balancing.de.

## Checked against

- **Scholl's benchmark** (A. Scholl, *Data of assembly line balancing
  problems*, TH Darmstadt, 1993; optima at
  [assembly-line-balancing.de](https://assembly-line-balancing.de/)).
  `bench/scholl.mjs` reads the published zip, runs every problem and checks
  every balance with `checkBalance`, which is separate from the solver. At
  4 seconds per problem (the page's default) on the 269 SALBP-1 problems:
  same station count as the published optimum on 258, proved optimal on 249,
  more stations on 10 (six on the 297-task Scholl graph, two each on
  Barthol2 and Wee-Mag), fewer on none. Full table: `bench/salbp1.md`;
  type 2: `bench/salbp2.md`. The data set is not copied into this
  repository.
- **Brute force** (`engine.test.mjs`): on 300 random lines of 4 to 11 tasks,
  the station count equals a breadth-first search over every
  precedence-feasible station load. That check is run three ways: with the
  heuristics, with the exact search alone, and with the exact search on the
  reversed line alone. The shortest cycle is checked the same way on 60 more.
- **Jackson's example**: the published optimum at all six cycle times in the
  data set.

To reproduce the benchmark:

```
curl -o SALBP-data-sets.zip https://assembly-line-balancing.de/wp-content/uploads/2017/01/SALBP-data-sets.zip
node bench/scholl.mjs SALBP-data-sets.zip --type 1 > bench/salbp1.md
node bench/scholl.mjs SALBP-data-sets.zip --type 2 > bench/salbp2.md
```

## Use it

- Page: `index.html` (open it from a static server; it imports `engine.mjs`).
- CLI: `node cli.mjs tasks.csv --cycle 60`, `--stations 8`,
  `--takt 27000,450`, `--json`, `--ms 15000`. Reads task tables
  (`id, time, predecessors, description`, predecessors separated by spaces),
  JSON task lists and Scholl `.IN2` files.
- Engine: see `llms.txt` for the exports.
- Tests: `node --test engine.test.mjs page.test.mjs usage.test.mjs`.

## Limits

The simple problem only: one product, fixed task times, one operator per
station, no parallel stations, zoning, tool or space limits, or ergonomic
load. Hard problems may hit the time limit; the page then says "best found"
and gives the proved bound, and never calls that answer optimal.

## No warranty

This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not engineering advice, and it does not replace a qualified
professional. **You are responsible for reviewing and verifying its output
before relying on it.** To the maximum extent permitted by law, the authors
accept no liability for any loss or damage arising from its use.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be
slow, broken, moved, or taken offline without notice. Do not use this as a
system of record.

## Privacy

Everything runs in your browser. Your tasks are never uploaded, and there are
no accounts, tracking cookies or analytics vendor. The page keeps an anonymous
count in this browser's local storage (that a balance ran, and the day); the
footer checkbox turns it off and deletes it.

## Licence

FSL-1.1-MIT (`LICENSE`). If it saved you an afternoon,
[sponsor the work](https://github.com/sponsors/Duncan-Haywood).
