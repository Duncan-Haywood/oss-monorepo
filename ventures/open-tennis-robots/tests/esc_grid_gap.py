"""The ESC-lag survey between its grid points (2026-11-18, firmware/esp32/README.md "The ESC-lag survey between 100
and 200 ms").

The section "The ESC-lag survey's search, traced" left one build off: an untold 150 ms ESC on a 0.6 s wheel read
188 ms on the rally drill, 25% over. 150 ms sits between ESC_SURVEY_GRID_US's 100 and 200 ms, and the board refines the
least grid point by a parabola (controller.survey_pick) in the lag's log. Two suspects: the grid is too coarse there
(a parabola through 100 / 200 / 400 cannot follow the rms curve), or the parabola's axis (log lag) is the wrong one.

This script runs drills on the simulator with an untold ESC (the board's ESC_TAU_US 0, as before any survey), keeps
every surveyed wheel's inputs as the board passed them (snapshot periods and raw ticks), and refits each wheel offline,
as the board does (ESC_SURVEY_REFINE), at every lag of a dense grid (DENSE). Any candidate grid that is a subset of the
dense one, and any interpolation, can then be scored without another drill.

    PYTHONPATH=src:tests:firmware/esp32 python3 tests/esc_grid_gap.py --capture rows.jsonl [--procs 4]
    PYTHONPATH=src:tests:firmware/esp32 python3 tests/esc_grid_gap.py --score rows.jsonl[.gz]

PREDICTION, written before any score was read: the grid is the cause, not the axis. Adding 150 ms (CANDIDATES "+150",
seven lags, about 17% more survey time a ball) brings every untold ESC of 120-180 ms within 10% of its lag on every
drill and wheel lag, while the shipped grid misses at least one of them by more than 10%; the linear-axis parabola on
the shipped grid does no better than the log one. DECISION RULE: the cheapest candidate (fewest lags, then the
shipped axis) that puts every first-order build at 5 ms or less and every ESC build within 10% (on builds whose
survey counted at least host.ESC_SURVEY_MIN_WHEELS wheels, as the Pi advises only those) ships as
ESC_SURVEY_GRID_US; if none does, the shipped grid stays and the miss is reported.

RESULT (eval/esc-grid-gap-2026-11-18.txt): half held. The grid was the cause at 150 ms: the shipped grid read 169-195
on 5 of 6 counted 150 ms drills (the 188 of the section above), +150 read 148-155 on all 6. The linear axis was far
worse (50 ms read 63-67), so the log axis stays. But no candidate met the bar on every drill: above about 180 ms on
slow wheels the rms curve is flat (180 ms ESC, 0.6 s wheel, calibration drill: 53-63 ppm from 100 to 400 ms), and
250-300 ms builds picked 400 or 266-282. By the rule the grid does not change on part 1 alone.

PART 2 (designed on part 1's drills, then held out; written before the held-out capture ran). Two changes together:
the +150 grid, and an "unsure" check the Pi would run on the ESC_SURVEY frame's own per-lag rms (esc_survey_band):
the band is every grid lag whose mean rms is within ESC_BAND (15%) of the least; the pick is unsure when the band
reaches the grid's last lag, starts at 0 and reaches past 20 ms, or spans more than a factor of 2. Unsure, the Pi
advises no number. On part 1's drills this flagged 13 of 48 counted drills, all with an ESC of 180 ms or more, and 34
of the other 35 were within 15% (the miss: 180 ms at 0.45 s on the rally drill read 215). Held out: ESC lags 0, 35,
65, 130, 165 and 210 ms no part 1 drill used, wheel lags 0.35 and 0.5 s, seed 8, launcher 1, rally and calibration
drills. PREDICTION: every first-order build and every build of 130 ms or less is sure; every sure build is within 15%
(first-order 5 ms or less). DECISION RULE: if both hold on the counted held-out drills, ship both; if a sure build
misses by more than 15%, ship the grid alone only if it misses no build the shipped grid hits, and report the band
as failed.

RESULT: the band failed. Every first-order build and every build of 130 ms or less was sure and within 15% (16 of 16),
but 3 sure builds missed: 165 ms read 119 and 218 on the calibration drill, 210 ms read 167 on the rally drill. The +150
grid missed no build the shipped grid hit (19 of 24 within 15%, shipped 18), so it ships (ESC_SURVEY_GRID_US, the
ESC_SURVEY frame's seventh slot) and the band does not.

    PYTHONPATH=src:tests:firmware/esp32 python3 tests/esc_grid_gap.py --capture rows.jsonl --heldout
    PYTHONPATH=src:tests:firmware/esp32 python3 tests/esc_grid_gap.py --heldout-score rows.jsonl[.gz]

(eval/esc-grid-gap-rows-2026-11-18.jsonl.gz holds both captures: 72 part 1 rows, then 24 held out, seed 8.)

Simulated only: the simulator's first-order ESC.
"""

import gzip
import json
import math
import multiprocessing
import sys

import feeder_sim
import min_fit_heldout as h
import reading_floor as rf
import take_spread as ts
from feeder_sim import SimFeeder, controller

DENSE = (0, 20000, 35000, 50000, 70000, 100000, 120000, 141000, 150000, 170000, 200000, 250000, 283000, 300000,
         400000)
ESC_MS = (0, 50, 80, 120, 150, 180, 250, 300)
WHEEL_LAGS = (0.3, 0.45, 0.6)
HELDOUT_ESC_MS = (0, 35, 65, 130, 165, 210)
HELDOUT_LAGS = (0.35, 0.5)
HELDOUT_SEED = 8
DRILLS = ("drill.rally.json", "drill.example.json", "drill.calibration.json")


def capture(args):
    esc_ms, lag, name = args[:3]
    seed, li = (args[3], args[4]) if len(args) > 3 else (None, 0)
    import take_survey_sweep as tss
    from tennisbots import host, launcher
    rf._FINE_STEP = ts.FINE_STEP
    feeder_sim.SimFeeder.run_ms = rf._make_run_ms(sub=rf.FINE)
    controller.LOOP_TAKE = ()
    controller.LOOP_THROUGH_CHANGE = host.LOOP_THROUGH_CHANGE = False
    host.HOLD_RPM = h.SHIPPED_HOLD
    se, sp = h.LAUNCHERS[li]
    wheels = []
    orig = controller.LaunchCheck._esc_survey

    def esc(self, snap, ticks, edges0, targets):
        # the board's _esc_survey, keeping each wheel's inputs; the dense refit runs offline
        for k in (0, 1):
            if targets[k] <= 0:
                continue
            raw = [(c - edges0[k], us, u) for c, us, u in ticks[k]]
            got = []
            for g in self.survey:
                fit = None
                for item in controller.drop_from_commands_steps(snap[k], controller.esc_lagged_ticks(snap[k], raw, g),
                                                                refine=controller.ESC_SURVEY_REFINE):
                    if item is None:
                        yield None
                    else:
                        fit = item[1]
                if fit is None:
                    break
                got.append(fit[4] * fit[4])
            if len(got) == len(self.survey):
                wheels.append({"periods": list(snap[k]), "ticks": [list(t) for t in raw]})
                self.survey_add(got)

    controller.LaunchCheck._esc_survey = esc
    try:
        true = launcher.WheelLauncher(speed_efficiency=se, spin_efficiency=sp)
        sim = SimFeeder(balls=None, wheel_tau_s=lag, true_launcher=true, seed=tss.SEED if seed is None else seed, esc_tau_s=esc_ms / 1000)
        sim.hw.launch.esc_tau_us = 0           # untold: the survey is how the build learns its lag
        res = host.run_drill(host.FeederLink(sim, sim.clock), host.plan_drill(tss.rf_load(name)), sim.sleep)
    finally:
        controller.LaunchCheck._esc_survey = orig
    if not res.ok:
        return args, {"aborted": res.aborted}
    dense = []
    for w in wheels:
        row = []
        for g in DENSE:
            fit = None
            for item in controller.drop_from_commands_steps(w["periods"], controller.esc_lagged_ticks(
                    w["periods"], [tuple(t) for t in w["ticks"]], g), refine=controller.ESC_SURVEY_REFINE):
                if item is not None:
                    fit = item[1]
            if fit is None:
                row = None
                break
            row.append(fit[4])
        dense.append(row)
    return args, {"build": [esc_ms, lag, name], "seed": seed, "launcher": li, "board": res.esc_survey, "dense": dense,
                  "cut": sim.hw.launch.survey_cut}


CANDIDATES = (("shipped", (0, 20000, 50000, 100000, 200000, 400000), "log"),
              ("shipped, linear axis", (0, 20000, 50000, 100000, 200000, 400000), "lin"),
              ("+150", (0, 20000, 50000, 100000, 150000, 200000, 400000), "log"),
              ("+150 +300", (0, 20000, 50000, 100000, 150000, 200000, 300000, 400000), "log"))


def pick(grid, rows, axis):
    """The board's scoring (ResidualSurvey's trim and sums, survey_pick) on `grid`, a subset of DENSE; with axis "lin"
    the parabola is in the lag even when the lower neighbour is above 0."""
    idx = [DENSE.index(g) for g in grid]
    rs = controller.ResidualSurvey(grid)
    for r in rows:
        if r is not None:
            rs.add([r[i] * r[i] for i in idx])
    if rs.n == 0:
        return None, 0
    sums = rs.sums()
    if axis == "log":
        return controller.survey_pick(grid, sums)[1] / 1000, rs.n
    i = min(range(len(sums)), key=lambda k: sums[k])
    if i in (0, len(grid) - 1):
        return grid[i] / 1000, rs.n
    x, y = [float(g) for g in grid[i - 1:i + 2]], sums[i - 1:i + 2]
    d1, d2 = (y[1] - y[0]) / (x[1] - x[0]), (y[2] - y[1]) / (x[2] - x[1])
    curv = (d2 - d1) / (x[2] - x[0])
    if curv <= 0:
        return grid[i] / 1000, rs.n
    return min(max((x[0] + x[1]) / 2 - d1 / (2 * curv), x[0]), x[2]) / 1000, rs.n


def ok(true_ms, got):
    return got is not None and (got <= 5 if true_ms == 0 else abs(got - true_ms) <= 0.1 * true_ms)


def score(builds):
    from tennisbots import host
    builds = sorted(builds, key=lambda b: (b["build"][0], b["build"][1], b["build"][2]))
    print(f"{len(builds)} drills, untold ESC (board ESC_TAU_US 0), launcher 0, refits at ESC_SURVEY_REFINE "
          f"{controller.ESC_SURVEY_REFINE}; per drill the refined pick in ms under each candidate grid")
    print("ESC ms | wheel lag s | drill | wheels | " + " | ".join(c[0] for c in CANDIDATES))
    tally = {c[0]: [0, 0, []] for c in CANDIDATES}
    for b in builds:
        e, lag, name = b["build"]
        cells = []
        for cname, grid, axis in CANDIDATES:
            got, n = pick(grid, b["dense"], axis)
            counted = n >= host.ESC_SURVEY_MIN_WHEELS
            good = ok(e, got)
            if counted:
                tally[cname][1] += 1
                tally[cname][0] += good
                if not good:
                    tally[cname][2].append(f"{e} ms at {lag} s {name.split('.')[1]}: {got:.0f}")
            cells.append(f"{got:.0f}{'' if good else ' x'}" + ("" if counted else " (few)"))
        print(f"{e:4d} | {lag:.2f} | {name.split('.')[1]:11} | {len(b['dense']):2d} | " + " | ".join(cells))
    print()
    for cname, grid, axis in CANDIDATES:
        good, n, miss = tally[cname]
        print(f"{cname:22} ({len(grid)} lags, {axis}): {good} of {n} counted drills within the bar"
              + (f"; misses: {'; '.join(miss)}" if miss else ""))
    print("\nmean rms per dense lag (ppm), ESC 120-180 ms drills, to see the curve the parabola meets:")
    for b in builds:
        if 120 <= b["build"][0] <= 180:
            rows = [r for r in b["dense"] if r is not None]
            m = [1e6 * math.sqrt(sum(r[i] ** 2 for r in rows) / len(rows)) for i in range(len(DENSE))]
            print(f"  {b['build'][0]} ms {b['build'][1]} s {b['build'][2].split('.')[1]:11} " +
                  " ".join(f"{g // 1000}:{v:.0f}" for g, v in zip(DENSE, m)))


ESC_BAND = 0.15        # part 2's band (tried, not shipped): grid lags within this share of the least mean rms
ESC_BAND_SPAN = 2.0
GRID_MS = (0, 20, 50, 100, 150, 200, 400)


def esc_survey_band(sv, grid_ms=GRID_MS):
    """(lowest and highest grid lag in ms whose mean rms is within ESC_BAND of the least, whether that band is too wide
    to name one lag) for an ESC_SURVEY dict. Written for host.py and held out here; it failed, so it is not there."""
    rms = sv["rms_ppm"]
    best = min(rms)
    band = [g for g, v in zip(grid_ms, rms) if v <= (1 + ESC_BAND) * best]
    lo, hi = band[0], band[-1]
    return lo, hi, hi == grid_ms[-1] or (lo == 0 and hi > 20) or (lo > 0 and hi > ESC_BAND_SPAN * lo)


def heldout(builds):
    """Part 2: the +150 grid and host.esc_survey_band on the held-out drills, against the shipped grid alone."""
    from tennisbots import host
    builds = sorted(builds, key=lambda b: (b["build"][0], b["build"][1], b["build"][2]))
    new = CANDIDATES[2][1]
    old = CANDIDATES[0][1]
    print(f"{len(builds)} held-out drills (seed {builds[0]['seed']}, launcher {builds[0]['launcher']}), untold ESC; "
          f"grid {', '.join(str(g // 1000) for g in new)} ms with the band (ESC_BAND {ESC_BAND}, span "
          f"{ESC_BAND_SPAN}) against the shipped grid")
    print("ESC ms | wheel lag s | drill | wheels | shipped pick | +150 pick | band ms | sure | within the bar")
    sure_ok = sure_n = flag_low = old_hits_new_misses = 0
    for b in builds:
        e, lag, name = b["build"]
        idx = [DENSE.index(g) for g in new]
        rs = controller.ResidualSurvey(new)
        for r in b["dense"]:
            if r is not None:
                rs.add([r[i] * r[i] for i in idx])
        rep = rs.report(1000)
        sv = {"wheels": rep[0], "least_ms": rep[1], "refined_ms": rep[2], "rms_ppm": rep[3]}
        lo, hi, unsure = esc_survey_band(sv)
        got_old, _ = pick(old, b["dense"], "log")
        counted = rep[0] >= host.ESC_SURVEY_MIN_WHEELS
        good = ok(e, rep[2])
        if counted:
            if not unsure:
                sure_n += 1
                sure_ok += good
            if unsure and e <= 130:
                flag_low += 1
            if ok(e, got_old) and not good:
                old_hits_new_misses += 1
        print(f"{e:4d} | {lag:.2f} | {name.split('.')[1]:11} | {rep[0]:2d}{'' if counted else ' (few)'} | "
              f"{got_old:.0f}{'' if ok(e, got_old) else ' x'} | {rep[2]}{'' if good else ' x'} | {lo}-{hi} | "
              f"{'unsure' if unsure else 'sure'} | {'yes' if good else 'no'}")
    print(f"\nsure counted drills within the bar: {sure_ok} of {sure_n}; counted drills of 130 ms or less flagged "
          f"unsure: {flag_low}; counted drills the shipped grid hit and +150 missed: {old_hits_new_misses}")


def ok15(true_ms, got):
    return got is not None and (got <= 5 if true_ms == 0 else abs(got - true_ms) <= 0.15 * true_ms)


def main():
    if "--heldout-score" in sys.argv:
        global ok
        ok = ok15
        path = sys.argv[sys.argv.index("--heldout-score") + 1]
        with (gzip.open(path, "rt") if path.endswith(".gz") else open(path)) as f:
            return heldout([b for b in map(json.loads, f) if b.get("seed") == HELDOUT_SEED])
    if "--score" in sys.argv:
        path = sys.argv[sys.argv.index("--score") + 1]
        with (gzip.open(path, "rt") if path.endswith(".gz") else open(path)) as f:
            return score([b for b in map(json.loads, f) if b.get("seed") is None])
    procs = int(sys.argv[sys.argv.index("--procs") + 1]) if "--procs" in sys.argv else multiprocessing.cpu_count()
    out = sys.argv[sys.argv.index("--capture") + 1]
    esc = [int(v) for v in sys.argv[sys.argv.index("--esc") + 1].split(",")] if "--esc" in sys.argv else ESC_MS
    lags = [float(v) for v in sys.argv[sys.argv.index("--lags") + 1].split(",")] if "--lags" in sys.argv else WHEEL_LAGS
    drills = sys.argv[sys.argv.index("--drills") + 1].split(",") if "--drills" in sys.argv else DRILLS
    if "--heldout" in sys.argv:
        esc, lags, drills = HELDOUT_ESC_MS, HELDOUT_LAGS, ("drill.rally.json", "drill.calibration.json")
    grid = [(e, l, d) + ((HELDOUT_SEED, 1) if "--heldout" in sys.argv else ()) for e in esc for l in lags for d in drills]
    with multiprocessing.Pool(procs, maxtasksperchild=1) as pool:
        for a, r in pool.imap_unordered(capture, grid):
            if "aborted" in r:
                print(f"aborted {a}: {r['aborted']}", file=sys.stderr)
                continue
            print(f"  {a}: {len(r['dense'])} wheels, board {r['board']}", file=sys.stderr, flush=True)
            with open(out, "a") as f:
                f.write(json.dumps(r) + "\n")


if __name__ == "__main__":
    main()
