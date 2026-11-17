"""A contact-time term for the board's loop fit, scored offline (2026-11-17, firmware/esp32/README.md "A take that lasts
a few milliseconds").

tests/take_spread.py found the step model's readings scatter 0.94% about the true drop when the ball's take lasts 6 ms
(half-sine force), against 0.15% for an instant take, worst at high speed where a revolution is 7-13 ms. This script
keeps every board loop fit's inputs (as tests/fit_grid_floor.py does) from builds whose take is spread, then refits
them offline with `drop_from_commands_steps(take=controller.take_offsets(...))`: the take as equal parts at the force
profile's quantiles. Fits scored: the shipped step; the term at the true contact time and shape; at a wrong guess
(4 ms half-sine whatever the truth, since a real ball's contact time is not known until a tach log reads it); 2 and 8
parts instead of 4.

PREDICTION, written before the run: at the true contact time, 4 parts bring the scatter back under 0.3% for every
take; the 4 ms guess does better than the step on the 6 ms and front-loaded takes and no worse than 0.1 points on the
3 ms one. If the true-time term does not get under 0.3%, the miss is not the model's shape of the take (look at the
window or the anchor instead).

Builds: the first-order 8k plant at 0.1 ms steps, wheel lag 0.3 s, min_fit_heldout's three launchers, calibration plus
held-out slow drill, seed 7; takes: half-sine 6 ms, front 4 ms, half-sine 3 ms.

    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_fit.py [--procs 2] [--out rows.jsonl] [--rescore rows.jsonl[.gz]]

`--rescore` runs no drill: it refits saved rows. Simulated only.
"""

import gzip
import json
import multiprocessing
import statistics
import sys

import feeder_sim
import min_fit_heldout as h
import reading_floor as rf
import take_spread as ts
import unsure_weight as u
from feeder_sim import controller

TAKES = (("halfsine", 6.0), ("front", 4.0), ("halfsine", 3.0))
SEED, PLANT, LAG = 7, 0, 0.3
PICK = (0.0, 2.0, 3.0, 4.0, 5.0, 6.0, 8.0)     # candidate contact times, ms (0: the step)


def fits_for(row):
    """name -> (keyword arguments) for the refits of one row."""
    shape, ms = row["take"]
    return (("step (shipped)", {}),
            ("true time, 4 parts", {"take": controller.take_offsets(ms * 1000, shape, 4)}),
            ("true time, 2 parts", {"take": controller.take_offsets(ms * 1000, shape, 2)}),
            ("true time, 8 parts", {"take": controller.take_offsets(ms * 1000, shape, 8)}),
            ("guess 4 ms half-sine", {"take": controller.take_offsets(4000, "halfsine", 4)}))


def result(periods, ticks, kw):
    for item in controller.drop_from_commands_steps(periods, ticks, **kw):
        if item is not None:
            return item[1]
    return None


def case(args):
    li, ti = args
    shape, ms = TAKES[ti]
    rf._FINE_STEP = ts.FINE_STEP
    feeder_sim.SimFeeder.run_ms = rf._make_run_ms(sub=rf.FINE)
    h.PLANTS = list(h.PLANTS)
    h.PLANTS[PLANT] = (h.PLANTS[PLANT][0], dict(h.PLANTS[PLANT][1], take_ms=ms, take_shape=shape))
    sims, fits = [], {}
    steps = controller.drop_from_commands_steps
    init = feeder_sim.SimFeeder.__init__

    def made(self, *a, **k):
        init(self, *a, **k)
        sims.append(self)

    def kept(periods, ticks, **kw):
        res = None
        for item in steps(periods, ticks, **kw):
            if item is not None:
                res = item[1]
            yield item
        sim = sims[-1]
        if "refine" not in kw and res is not None and sim.taken:     # the board's own fit (the survey passes refine=0)
            at, dws = sim.taken[-1]
            k = min((0, 1), key=lambda i: abs(at[i] - res[1]))
            if abs(at[k] - res[1]) < 0.05 * at[k]:
                fits[(len(sims), len(sim.taken) - 1, k)] = (list(periods), list(ticks), at[k], dws[k] / at[k])
    controller.drop_from_commands_steps = kept
    feeder_sim.SimFeeder.__init__ = made
    u.run = ts.run                     # the true drop from the simulator's take record, not the speed after it
    try:
        _, r = u.case((PLANT, LAG, li, SEED))
    finally:
        controller.drop_from_commands_steps = steps
        feeder_sim.SimFeeder.__init__ = init
    if "wheels" not in r:
        return args, {"aborted": r["aborted"]}
    rows = [{"build": [li, ti], "take": [shape, ms], "drill": d, "ball": n, "wheel": k, "rpm": rpm, "true": true,
             "periods": p, "ticks": t} for (d, n, k), (p, t, rpm, true) in sorted(fits.items())]
    return args, {"rows": rows}


def score(rows):
    for x in rows:
        x["fits"] = {}
        for name, kw in fits_for(x):
            f = result(x["periods"], [tuple(t) for t in x["ticks"]], kw)
            x["fits"][name] = None if f is None else f[0] / x["true"]
    # the contact time picked from the fits' own misses: per wheel (lowest rms of that fit), and per build (lowest sum
    # of squared rms over the build's wheels at 1,000 rpm and up), half-sine profile, from PICK candidates
    for x in rows:
        x["cand"] = {}
        for ms in PICK:
            f = result(x["periods"], [tuple(t) for t in x["ticks"]], {"take": controller.take_offsets(ms * 1000)})
            x["cand"][ms] = None if f is None else (f[0] / x["true"], f[4])
        ok = [ms for ms in PICK if x["cand"][ms] is not None]
        x["fits"]["picked per wheel"] = x["cand"][min(ok, key=lambda ms: x["cand"][ms][1])][0] if ok else None
    for b in {tuple(x["build"]) for x in rows}:
        sub = [x for x in rows if tuple(x["build"]) == b and x["rpm"] >= u.FLOOR]
        cost = {ms: sum(x["cand"][ms][1] ** 2 for x in sub if x["cand"][ms] is not None) for ms in PICK}
        best = min(PICK, key=cost.get)
        print(f"build {b} (take {sub[0]['take'][0]} {sub[0]['take'][1]} ms): picked {best} ms half-sine")
        for x in rows:
            if tuple(x["build"]) == b:
                x["fits"]["picked per build"] = None if x["cand"][best] is None else x["cand"][best][0]
    rows = [x for x in rows if x["rpm"] >= u.FLOOR]
    names = [n for n, _ in fits_for(rows[0])] + ["picked per wheel", "picked per build"]
    print(f"{len(rows)} wheel fits at {u.FLOOR:.0f} rpm and up; reading / true drop, mean and sd")
    print(f"{'take':16} {'fit':22} {'n':>4} {'mean':>7} {'sd':>6} {'sd >= 4,500 rpm':>15}")
    for shape, ms in TAKES:
        sub = [x for x in rows if x["take"] == [shape, ms]]
        for name in names:
            rs = [x["fits"][name] for x in sub if x["fits"][name] is not None]
            hi = [x["fits"][name] for x in sub if x["fits"][name] is not None and x["rpm"] >= 4500]
            if len(rs) > 1:
                print(f"{shape + ' ' + str(ms) + ' ms':16} {name:22} {len(rs):4d} {statistics.fmean(rs):7.4f} "
                      f"{100 * statistics.pstdev(rs):5.2f}% {100 * statistics.pstdev(hi) if len(hi) > 1 else 0:14.2f}%")


def main():
    if "--rescore" in sys.argv:
        path = sys.argv[sys.argv.index("--rescore") + 1]
        with (gzip.open(path, "rt") if path.endswith(".gz") else open(path)) as f:
            return score([json.loads(line) for line in f])
    out = sys.argv[sys.argv.index("--out") + 1] if "--out" in sys.argv else None
    procs = int(sys.argv[sys.argv.index("--procs") + 1]) if "--procs" in sys.argv else multiprocessing.cpu_count()
    grid = [(li, ti) for ti in range(len(TAKES)) for li in range(len(h.LAUNCHERS))]
    rows = []
    with multiprocessing.Pool(procs, maxtasksperchild=1) as pool:
        for a, r in pool.imap_unordered(case, grid):
            if "aborted" in r:
                print(f"aborted {a}: {r['aborted']}")
                continue
            print(f"  {a}: {len(r['rows'])} wheel fits", file=sys.stderr, flush=True)
            rows += r["rows"]
            if out:
                with open(out, "a") as f:
                    for x in r["rows"]:
                        f.write(json.dumps(x) + "\n")
    score(rows)


if __name__ == "__main__":
    main()
