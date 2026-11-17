"""Is the noise-free reading floor the loop fit's own search? (2026-11-17, firmware/esp32/README.md "Not the
simulator's step either").

`tests/reading_floor.py` found a noise-free reading still misses the simulator's true drop by 0.31% (sd) whether the
tach edges are timed to 1 us or exactly and whether the plant moves in 1 ms or 0.1 ms steps. On the first-order plant
`drop_from_commands_steps`' model is the simulator's own physics (a first-order lag on the logged commands, a step
drop at t0, each revolution's mean speed), so what is left is how the fit searches that model: the ball's moment t0
on three nested 9-point grids over two revolutions (each a quarter of the last one's span: a last step of 1/64 of a
revolution, about 0.19 ms at 5,000 rpm), the lag tau on a 5-point grid then 5 golden-section steps.

The test: the same builds as reading_floor.py (first-order 8k and ESC 50 ms told plants, shipped simulator), each
board loop fit's inputs kept and refitted offline with the shipped search and with finer ones. PREDICTION, written
before the first (one-build) run: if the search is the floor, the finest search's readings scatter less than half as
much (sd under 0.15%); if the sd stays within a quarter of the shipped one, the floor is in the inputs or the model
(the take landing at a millisecond boundary while the commands are logged at ticks), not the search. After that
run (0.31% shipped, 0.11% at 6 levels) two cheaper searches were added: `polish`, one more solve at the vertex of the
parabola through the last grid's best point and its neighbours, alone and with 4 levels.

`--out` keeps every fit's inputs (periods, ticks, true drop) so another search can be scored without a rerun.

    PYTHONPATH=src:tests:firmware/esp32 python3 tests/fit_grid_floor.py [--builds N] [--out rows.jsonl]

Simulated only: the physics is the simulator's assumption, not a real wheel.
"""

import json
import multiprocessing
import statistics
import sys

import min_fit_heldout as h
import unsure_weight as u
import feeder_sim
from feeder_sim import controller

SEARCHES = (("shipped (3 levels, 5 golden)", {}),
            ("t0 4 levels", {"levels": 4}),
            ("t0 5 levels", {"levels": 5}),
            ("t0 6 levels", {"levels": 6}),
            ("tau 15 golden", {"refine": 15}),
            ("both", {"levels": 6, "refine": 15}),
            ("polish", {"polish": True}),
            ("polish, 4 levels", {"levels": 4, "polish": True}))
SEED = 7
PLANTS = (0, 2)     # first-order 8k and ESC 50 ms told, as tests/reading_floor.py


def case(args):
    """One build's calibration and slow drills with every board loop fit kept, each refitted with each search. A fit
    belongs to the last ball taken before it, and to the wheel whose speed then is nearest the fit's own speed; a
    wheel fitted twice (a slow wheel watched past the verdict) keeps its last fit, the one the board reports."""
    pi, tau, li = args
    balls, fits = [], {}
    steps = controller.drop_from_commands_steps
    take = feeder_sim.SimFeeder._take_momentum

    def taken(sim):
        before = tuple(sim.wheel)
        take(sim)
        balls.append((before, tuple(sim.wheel)))

    def kept(periods, ticks, **kw):
        res = None
        for item in steps(periods, ticks, **kw):
            if item is not None:
                res = item[1]
            yield item
        if not kw and res is not None and balls:     # the board's own fit (the survey passes refine=0)
            before, after = balls[-1]
            k = min((0, 1), key=lambda i: abs(before[i] - res[1]))
            if abs(before[k] - res[1]) < 0.05 * before[k]:
                fits[(len(balls) - 1, k)] = (list(periods), list(ticks), before[k], 1 - after[k] / before[k])
    controller.drop_from_commands_steps = kept
    feeder_sim.SimFeeder._take_momentum = taken
    try:
        _, r = u.case((pi, tau, li, SEED))
    finally:
        controller.drop_from_commands_steps = steps
        feeder_sim.SimFeeder._take_momentum = take
    if "wheels" not in r:
        return args, {"aborted": r["aborted"]}
    rows = []
    for (n, k), (p, t, rpm, true_drop) in sorted(fits.items()):
        row = {"ball": n, "wheel": k, "rpm": rpm, "true": true_drop, "fits": {}, "periods": p, "ticks": t}
        for name, kw in SEARCHES:
            f = steps_result(steps, p, t, kw)
            row["fits"][name] = None if f is None else f[0] / true_drop
        rows.append(row)
    return args, {"rows": rows, "balls": len(balls)}


def steps_result(steps, periods, ticks, kw):
    for item in steps(periods, ticks, **kw):
        if item is not None:
            return item[1]
    return None


def main():
    out = sys.argv[sys.argv.index("--out") + 1] if "--out" in sys.argv else None
    grid = [(pi, tau, li) for pi in PLANTS for tau in h.LAGS for li in range(len(h.LAUNCHERS))]
    if "--builds" in sys.argv:
        grid = grid[:int(sys.argv[sys.argv.index("--builds") + 1])]
    rows = []
    with multiprocessing.Pool(min(len(grid), multiprocessing.cpu_count()), maxtasksperchild=1) as pool:
        for a, r in pool.imap_unordered(case, grid):
            if "aborted" in r:
                print(f"aborted {a}: {r['aborted']}")
                continue
            print(f"  {a}: {len(r['rows'])} wheel fits on {r['balls']} balls",
                  file=sys.stderr, flush=True)
            rows += [dict(x, build=list(a)) for x in r["rows"]]
    if out:
        with open(out, "w") as f:
            for x in rows:
                f.write(json.dumps(x) + "\n")
    rows = [x for x in rows if x["rpm"] >= u.FLOOR]
    print(f"{len(rows)} wheel fits at {u.FLOOR:.0f} rpm and up, seed {SEED}, {len(grid)} builds; reading / true drop")
    for pi in PLANTS:
        print(f"\n{h.PLANTS[pi][0]:30} {'n':>4} {'mean':>7} {'sd':>6} {'>0.5% off':>9}")
        for name, _ in SEARCHES:
            rs = [x["fits"][name] for x in rows if x["build"][0] == pi and x["fits"][name] is not None]
            if len(rs) > 1:
                print(f"  {name:28} {len(rs):4d} {statistics.fmean(rs):7.4f} {100 * statistics.pstdev(rs):5.2f}% "
                      f"{sum(abs(q - 1) > 0.005 for q in rs):9d}")


if __name__ == "__main__":
    main()
