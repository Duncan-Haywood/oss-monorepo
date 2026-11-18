"""The ESC-lag survey's pick between grid lags (2026-11-18, firmware/esp32/README.md "The ESC-lag survey's pick between
grid lags").

With 16 revolutions after the anchor (controller.ESC_SURVEY_AFTER) every design and held-out drill of
tests/esc_survey_window.py came within 15%, but short lags read low (40 ms: 36-37, 50 ms: 44-47) and 210-250 ms
high (222-271). Refit on a dense set of lags at the same window, the least residual sat on the true lag (40, 50 and 90
ms builds, to the 5 ms step), so the window is not biased: the refinement is. `survey_pick` draws a parabola through
the least sum and its two neighbours in the lag's log, and the residual curve is a lopsided V, not a parabola.

On the 70 stored drills of eval/esc-survey-window-rows-2026-11-18.jsonl.gz (the design set here), scored by the board's
own sums (ResidualSurvey) on the shipped grid (ESC_SURVEY_GRID_US):

    pick                                           within 5%  within 10%  within 15%  max    mean
    three-point parabola, log axis (shipped)       41         66          70          11.7%  4.4%
    natural cubic spline, log(lag + 10 ms)         68         70          70          6.4%   1.3%

Tried and dropped on the same drills: the parabola on rms, on log sums, on sqrt and linear axes (no better than 41;
the linear axes 25-35); a four-point cubic (56); the spline on rms (55) or a linear axis (35); and regridding the
seven lags (geometric grids 24-41 with the parabola). The spline's offset: a quarter of grid[1] 68, half 68, one 65,
two 61; half ships.

PREDICTION (written before the held-out capture ran): on the held-out drills below, every one with at least
host.ESC_SURVEY_MIN_WHEELS surveyed wheels counted, the spline puts at least 85% within 5% of the true lag and the
parabola under 65%; on the 25-75 ms drills the parabola's mean signed error is below -4% and the spline's within +-3%.

DECISION RULE (written with the prediction): `controller.ESC_SURVEY_SPLINE` ships True if, on the counted held-out
drills, the spline has (a) more drills within 5% than the parabola, (b) at least as many within 15%, and (c) a max
error no larger. Otherwise it stays False and this section says so.

HELD OUT: ESC 25 / 33 / 45 / 60 / 75 / 110 / 130 / 160 / 185 / 220 / 270 ms (none of the design set's lags), wheel lags
0.45 and 0.65 s (0.65 longer than any design build), rally and calibration drills, seed 13, the second true launcher
(min_fit_heldout.LAUNCHERS[1], used by neither earlier set). 44 drills.

    PYTHONPATH=src:tests:firmware/esp32 python3 tests/esc_survey_spline.py --capture rows.jsonl [--procs 4]
    PYTHONPATH=src:tests:firmware/esp32 python3 tests/esc_survey_spline.py --score rows.jsonl[.gz]
    PYTHONPATH=src:tests:firmware/esp32 python3 tests/esc_survey_spline.py --score eval/esc-survey-window-rows-2026-11-18.jsonl.gz

Simulated only: the simulator's first-order ESC behind a first-order wheel, one seed per set.
"""

import gzip
import json
import multiprocessing
import sys

import esc_survey_window as esw
from feeder_sim import controller

GRID = controller.ESC_SURVEY_GRID_US
HELDOUT = {"esc": (25, 33, 45, 60, 75, 110, 130, 160, 185, 220, 270), "lags": (0.45, 0.65), "seed": 13, "launcher": 1,
           "drills": ("drill.rally.json", "drill.calibration.json")}
PICKS = (("parabola", controller.survey_pick), ("spline", controller.survey_spline_pick))


def refit_build(b):
    return {"build": b["build"], "rows": [esw.refit(w, controller.ESC_SURVEY_AFTER) for w in b["wheels"]]}


def err(true_ms, got_ms):
    """Relative error; a 0 ms build counts 5 ms as 5%."""
    return (got_ms / 100.0) if true_ms == 0 else (got_ms - true_ms) / true_ms


def score(builds, procs):
    from tennisbots import host
    builds = sorted(builds, key=lambda b: (b["build"][0], b["build"][1], b["build"][2]))
    with multiprocessing.Pool(procs) as pool:
        fits = pool.map(refit_build, builds)
    print(f"{len(builds)} drills, untold ESC; refits at grid {', '.join(str(g // 1000) for g in GRID)} ms, "
          f"{controller.ESC_SURVEY_AFTER} revolutions after the anchor, ESC_SURVEY_REFINE {controller.ESC_SURVEY_REFINE}; "
          f"the board's sums (ResidualSurvey); pick in ms; x = more than 5% off")
    print("ESC ms | wheel lag s | drill | wheels | " + " | ".join(k for k, _ in PICKS))
    tally = {k: [] for k, _ in PICKS}
    for b, f in zip(builds, fits):
        e, lag, name = b["build"]
        rs = controller.ResidualSurvey(GRID)
        for r in f["rows"]:
            if r is not None:
                rs.add(r)
        counted = rs.n >= host.ESC_SURVEY_MIN_WHEELS
        cells = []
        for k, fn in PICKS:
            got = fn(GRID, rs.sums())[1] / 1000 if rs.n else None
            if got is None:
                cells.append("-")
                continue
            x = err(e, got)
            if counted:
                tally[k].append((e, x))
            cells.append(f"{got:.0f}" + (" x" if abs(x) > 0.05 else "") + ("" if counted else " (few)"))
        print(f"{e:4d} | {lag:.2f} | {name.split('.')[1]:11} | {rs.n:2d} | " + " | ".join(cells))
    print()
    out = {}
    for k, _ in PICKS:
        xs = tally[k]
        n = len(xs)
        w5 = sum(abs(x) <= 0.05 for _, x in xs)
        w15 = sum(abs(x) <= 0.15 for _, x in xs)
        mx = max(abs(x) for _, x in xs)
        short = [x for e, x in xs if 0 < e <= 75]
        ms = sum(short) / len(short) if short else float("nan")
        out[k] = (w5, w15, mx, n)
        print(f"{k:8s}: {w5} of {n} counted drills within 5% ({100 * w5 / n:.0f}%), {w15} within 15%, max error "
              f"{100 * mx:.1f}%, mean |error| {100 * sum(abs(x) for _, x in xs) / n:.1f}%; 1-75 ms drills mean signed "
              f"error {100 * ms:+.1f}% ({len(short)})")
    p, s = out["parabola"], out["spline"]
    ok = s[0] > p[0] and s[1] >= p[1] and s[2] <= p[2]
    print(f"\nDECISION RULE: (a) {s[0]} > {p[0]}, (b) {s[1]} >= {p[1]}, (c) {100 * s[2]:.1f}% <= {100 * p[2]:.1f}%: "
          + ("met, ESC_SURVEY_SPLINE ships True" if ok else "not met, ESC_SURVEY_SPLINE stays False"))


def main():
    procs = int(sys.argv[sys.argv.index("--procs") + 1]) if "--procs" in sys.argv else multiprocessing.cpu_count()
    if "--score" in sys.argv:
        path = sys.argv[sys.argv.index("--score") + 1]
        with (gzip.open(path, "rt") if path.endswith(".gz") else open(path)) as f:
            return score([json.loads(line) for line in f], procs)
    out = sys.argv[sys.argv.index("--capture") + 1]
    cfg = HELDOUT
    grid = [(e, l, d, cfg["seed"], cfg["launcher"]) for e in cfg["esc"] for l in cfg["lags"] for d in cfg["drills"]]
    with multiprocessing.Pool(procs, maxtasksperchild=1) as pool:
        for a, r in pool.imap_unordered(esw.capture, grid):
            if "aborted" in r:
                print(f"aborted {a}: {r['aborted']}", file=sys.stderr)
                continue
            print(f"  {a}: {len(r['wheels'])} wheels, board {r['board']}", file=sys.stderr, flush=True)
            with open(out, "a") as f:
                f.write(json.dumps(r) + "\n")


if __name__ == "__main__":
    main()
