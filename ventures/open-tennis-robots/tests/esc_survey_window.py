"""The ESC-lag survey's fit window on slow wheels with a long ESC lag (2026-11-18, firmware/esp32/README.md "Long ESC
lags: the survey's window").

The section "The ESC-lag survey between 100 and 200 ms" ended with no flag the Pi could trust: above about 165 ms on a
slow wheel the survey's pick was off by 20-30% while it looked sure, and an "unsure" band on the per-lag rms failed
held out. This script first asks whether a noise flag could ever work (split-half: the pick from odd and even wheels),
then whether the fit sees enough of the recovery to tell two lags in series apart: each refit uses
`drop_from_commands_steps`' default window, 4 revolutions before the ball's anchor and 8 after (`after=8`), about
0.16 s at 3,000 rpm, where the wheel's own lag is 0.3-0.6 s and a long ESC's 0.15-0.25 s. The board's snapshot of a
launched stroke runs to the verdict, about 0.39 s after the ball, so it already holds more revolutions than the fit
reads.

    PYTHONPATH=src:tests:firmware/esp32 python3 tests/esc_survey_window.py --capture rows.jsonl [--heldout] [--procs 4]
    PYTHONPATH=src:tests:firmware/esp32 python3 tests/esc_survey_window.py --score rows.jsonl[.gz] [--heldout]

Each captured row keeps every surveyed wheel's inputs as the board passed them (snapshot periods, ticks relative to
the snapshot's first edge), so any window can be scored offline at the board's grid (ESC_SURVEY_GRID_US) and its
refinement (ESC_SURVEY_REFINE), with the board's own sums and pick (ResidualSurvey, survey_pick).

PREDICTION and DECISION RULE: written in firmware/esp32/README.md's section before the held-out capture ran, and
repeated in the eval file.

Simulated only: the simulator's first-order ESC and first-order wheel.
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

GRID = controller.ESC_SURVEY_GRID_US
DESIGN = {"esc": (0, 50, 120, 165, 180, 210, 250), "lags": (0.35, 0.5, 0.6), "seed": None, "launcher": 0,
          "drills": ("drill.rally.json", "drill.calibration.json")}
HELDOUT = {"esc": (0, 40, 90, 140, 175, 195, 230), "lags": (0.4, 0.55), "seed": 11, "launcher": 2,
           "drills": ("drill.rally.json", "drill.calibration.json")}
WINDOWS = (8, 12, 16, 24)       # revolutions after the anchor the refit reads (`after`); 8 is the board's


def capture(args):
    esc_ms, lag, name, seed, li = args
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
        # the board's survey on each wheel, unchanged, keeping the wheel's inputs for the offline refits
        for k in (0, 1):
            if targets[k] <= 0:
                continue
            raw = [(c - edges0[k], us, u) for c, us, u in ticks[k]]
            got = []
            for g in self.survey:
                fit = None
                for item in controller.drop_from_commands_steps(snap[k], controller.esc_lagged_ticks(snap[k], raw, g),
                                                                after=controller.ESC_SURVEY_AFTER,
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
        sim = SimFeeder(balls=None, wheel_tau_s=lag, true_launcher=true, seed=tss.SEED if seed is None else seed,
                        esc_tau_s=esc_ms / 1000)
        sim.hw.launch.esc_tau_us = 0           # untold: the survey is how the build learns its lag
        res = host.run_drill(host.FeederLink(sim, sim.clock), host.plan_drill(tss.rf_load(name)), sim.sleep)
    finally:
        controller.LaunchCheck._esc_survey = orig
    if not res.ok:
        return args, {"aborted": res.aborted}
    return args, {"build": [esc_ms, lag, name], "seed": seed, "launcher": li, "board": res.esc_survey,
                  "wheels": wheels}


def refit(w, after):
    """The wheel's squared rms at each grid lag with `after` revolutions after the anchor, or None."""
    periods, ticks = w["periods"], [tuple(t) for t in w["ticks"]]
    got = []
    for g in GRID:
        fit = None
        for item in controller.drop_from_commands_steps(periods, controller.esc_lagged_ticks(periods, ticks, g),
                                                        after=after, refine=controller.ESC_SURVEY_REFINE):
            if item is not None:
                fit = item[1]
        if fit is None:
            return None
        got.append(fit[4] * fit[4])
    return got


def pick(rows):
    rs = controller.ResidualSurvey(GRID)
    for r in rows:
        if r is not None:
            rs.add(r)
    if rs.n == 0:
        return None, 0
    return controller.survey_pick(GRID, rs.sums())[1] / 1000, rs.n


def refit_build(b):
    out = {"build": b["build"], "revs": [len(w["periods"]) for w in b["wheels"]]}
    for a in WINDOWS:
        out[str(a)] = [refit(w, a) for w in b["wheels"]]
    return out


def ok15(true_ms, got):
    return got is not None and (got <= 5 if true_ms == 0 else abs(got - true_ms) <= 0.15 * true_ms)


def score(builds, procs):
    from tennisbots import host
    builds = sorted(builds, key=lambda b: (b["build"][0], b["build"][1], b["build"][2]))
    with multiprocessing.Pool(procs) as pool:
        fits = pool.map(refit_build, builds)
    print(f"{len(builds)} drills (seed {builds[0]['seed']}, launcher {builds[0]['launcher']}), untold ESC; refits at "
          f"grid {', '.join(str(g // 1000) for g in GRID)} ms, ESC_SURVEY_REFINE {controller.ESC_SURVEY_REFINE}; "
          f"pick in ms per window (revolutions after the anchor); x = more than 15% off (first-order: over 5 ms)")
    print("ESC ms | wheel lag s | drill | wheels | snapshot revs (min-max) | split-half picks (odd / even, window 8) | "
          + " | ".join(f"after {a}" for a in WINDOWS))
    tally = {a: [0, 0, 0, 0, []] for a in WINDOWS}   # within, counted, within at >= 165 ms, counted at >= 165 ms, misses
    for b, f in zip(builds, fits):
        e, lag, name = b["build"]
        cells = []
        r8 = [r for r in f["8"] if r is not None]
        po, _ = pick(r8[0::2])
        pe, _ = pick(r8[1::2])
        for a in WINDOWS:
            got, n = pick(f[str(a)])
            counted = n >= host.ESC_SURVEY_MIN_WHEELS
            good = ok15(e, got)
            if counted:
                t = tally[a]
                t[0] += good
                t[1] += 1
                if e >= 165:
                    t[2] += good
                    t[3] += 1
                if not good:
                    t[4].append(f"{e} ms at {lag} s {name.split('.')[1]}: {got:.0f}")
            cells.append(("-" if got is None else f"{got:.0f}") + ("" if good else " x") + ("" if counted else " (few)"))
        revs = f["revs"]
        print(f"{e:4d} | {lag:.2f} | {name.split('.')[1]:11} | {len(b['wheels']):2d} | {min(revs)}-{max(revs)} | "
              f"{po if po is None else round(po)} / {pe if pe is None else round(pe)} | " + " | ".join(cells))
    print()
    for a in WINDOWS:
        good, n, g165, n165, miss = tally[a]
        print(f"after {a:2d}: {good} of {n} counted drills within 15%; ESC 165 ms or more: {g165} of {n165}"
              + (f"; misses: {'; '.join(miss)}" if miss else ""))


def main():
    procs = int(sys.argv[sys.argv.index("--procs") + 1]) if "--procs" in sys.argv else multiprocessing.cpu_count()
    held = "--heldout" in sys.argv
    cfg = HELDOUT if held else DESIGN
    if "--score" in sys.argv:
        path = sys.argv[sys.argv.index("--score") + 1]
        with (gzip.open(path, "rt") if path.endswith(".gz") else open(path)) as f:
            return score([b for b in map(json.loads, f) if b.get("seed") == cfg["seed"]], procs)
    out = sys.argv[sys.argv.index("--capture") + 1]
    only = [int(v) for v in sys.argv[sys.argv.index("--esc") + 1].split(",")] if "--esc" in sys.argv else cfg["esc"]
    grid = [(e, l, d, cfg["seed"], cfg["launcher"]) for e in only for l in cfg["lags"] for d in cfg["drills"]]
    with multiprocessing.Pool(procs, maxtasksperchild=1) as pool:
        for a, r in pool.imap_unordered(capture, grid):
            if "aborted" in r:
                print(f"aborted {a}: {r['aborted']}", file=sys.stderr)
                continue
            print(f"  {a}: {len(r['wheels'])} wheels, board {r['board']}", file=sys.stderr, flush=True)
            with open(out, "a") as f:
                f.write(json.dumps(r) + "\n")


if __name__ == "__main__":
    main()
