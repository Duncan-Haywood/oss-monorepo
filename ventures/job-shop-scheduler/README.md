# Job shop scheduler: shortest makespan, a Gantt chart and a proved bound

**Live:** https://marisstella.app/job-shop-scheduler/ · [How it works](https://marisstella.app/job-shop-scheduler/how-it-works.html)

Which order should each machine run its jobs in, so the last job finishes
soonest? Type each job's routing (the machines it visits in order, and the
time on each) and the tool finds a short schedule, draws it as a Gantt chart,
and proves a lower bound no schedule can beat, so you can see how far from
optimal it could be. On small shops it proves the answer optimal. Everything
runs in the browser.

Who it is for: production planners and schedulers in machine, fabrication and
print shops, operations engineers, and operations research students with a
textbook instance. Paid advanced planning and scheduling suites and research
codes exist; this is a free first pass you can check.

## Method

The job shop problem with makespan objective (J||Cmax). Our own
implementation (`engine.mjs`) of published ideas:

- the disjunctive graph, heads and tails (B. Roy and B. Sussmann, 1964;
  E. Balas, "Machine sequencing via disjunctive graphs", *Operations
  Research* 17(6), 1969);
- a first schedule from Giffler-Thompson active schedule generation with
  five dispatch rules (B. Giffler and G. L. Thompson, "Algorithms for solving
  production-scheduling problems", *Operations Research* 8(4), 1960);
- tabu search on the N5 neighbourhood, swapping the first two or last two
  operations of each critical block (E. Nowicki and C. Smutnicki, "A fast
  taboo search algorithm for the job shop problem", *Management Science*
  42(6), 1996), with moves scored by the head-and-tail estimate in
  E. Taillard, "Parallel taboo search techniques for the job shop scheduling
  problem", *ORSA Journal on Computing* 6(2), 1994, random tabu tenure and
  restarts from the best schedule. A plain version, not a reproduction of
  TSAB (no back-jump list);
- lower bounds: longest job, busiest machine, and the preemptive
  one-machine bound with heads and tails (Jackson's preemptive schedule;
  J. Carlier, "The one-machine sequencing problem", *European Journal of
  Operational Research* 11(1), 1982);
- on shops of up to 64 operations, a depth-first branch and bound over
  Giffler-Thompson conflict sets, pruned by the one-machine bound on the
  operations left. It runs first with a 2,000-node cap, which settles most small
  shops without any tabu run; only when that cap is hit does
  a short tabu run (at most 300 ms) come before the uncapped search. If it
  finishes, the answer is proved optimal.

Not affiliated with or endorsed by the authors or by the JSPLIB maintainers.

## Checked against

- **JSPLIB** ([tamy0612/JSPLIB](https://github.com/tamy0612/JSPLIB)): the
  162 standard instances (ft, la, abz, orb, swv, yn, ta) with the optimum or
  bounds its `instances.json` records. `bench/jsplib.mjs` runs every instance
  and re-checks every schedule with `checkSchedule`, which shares no code
  with the search. Results at 4 seconds per instance: `bench/jsplib.md`
  (summary at the top). The data are not copied into this repository
  (JSPLIB states no licence).
- **Brute force** (`engine.test.mjs`): on 150 random shops of 2 to 4 jobs on
  2 or 3 machines (some with zero-length operations) the makespan equals the
  best over every combination of machine orders, computed by a separate
  relaxation; the same on 60 shops where a job visits a machine twice.
  The branch and bound alone and the tabu search alone are each checked the
  same way.

To reproduce the benchmark:

```
git clone --depth 1 https://github.com/tamy0612/JSPLIB
node bench/jsplib.mjs JSPLIB --ms 4000 > bench/jsplib.md
```

Results are time-limited, so a slower or busier machine can shift a few rows.

## Use it

- Page: `index.html` (open it from a static server; it imports `engine.mjs`).
- CLI: `node cli.mjs shop.csv`, `node cli.mjs ft10.txt --ms 15000`,
  `--example`, `--json`, `--gantt` (a text Gantt chart), `--seed N`. Reads
  `job, machine, time` tables (one operation per line, in routing order),
  JSON, OR-Library / JSPLIB files and Taillard files.
- Engine: see `llms.txt` for the exports.
- Tests: `node --test engine.test.mjs page.test.mjs usage.test.mjs`.

## Limits

The classic problem only: one machine per operation (no alternative
machines), fixed times, no setups, transport, release dates, due dates or
shifts, and the makespan as the only goal. Large shops will not be proved
optimal; the page then says "best found" and gives the bound and the gap.
The search runs on the page's main thread, so the tab is busy for the time
limit.

## No warranty

This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not engineering or operations advice, and it does not replace
a qualified professional. **You are responsible for reviewing and verifying
its output before relying on it.** To the maximum extent permitted by law, the
authors accept no liability for any loss or damage arising from its use.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be
slow, broken, moved, or taken offline without notice. Do not use this as a
system of record.

## Privacy

Everything runs in your browser. Your jobs are never uploaded, and there are
no accounts, tracking cookies or analytics vendor. The page keeps an anonymous
count in this browser's local storage (that a schedule ran, and the day); the
footer checkbox turns it off and deletes it.

## Licence

FSL-1.1-MIT (`LICENSE`). If it saved you a morning at the whiteboard,
[sponsor the work](https://github.com/sponsors/Duncan-Haywood).
