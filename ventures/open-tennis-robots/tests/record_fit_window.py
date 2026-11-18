"""The record's own drop fit and its window on slow wheels (2026-11-18, firmware/esp32/README.md "The record's drop
fit and its window").

"Long ESC lags: the survey read too little of the recovery" moved the ESC-lag survey's refits from 8 revolutions after
the ball's anchor to 16 (controller.ESC_SURVEY_AFTER) and left the record's own drop fit at
`drop_from_commands_steps`' default, 8. That section's last open question: does the record's reading of the drop, the
number the Pi's launcher fit is built on, get better with a longer window on slow wheels (a wheel lag of 0.35-0.6 s,
where 8 revolutions at 3,000 rpm are 0.16 s of a recovery several times longer)?

The record fit knows the ESC lag (told, or set from the survey) and every command the loop sent, so unlike the survey
it does not have to tell two lags apart; a longer window gives it more rows against the same four linear unknowns and
the wheel's lag, but also more of whatever the model gets wrong (a 3 us jittery tach, the 4-revolution mean the loop
saw late). Each capture keeps every board record fit's inputs as the board passed them (snapshot periods, ESC-lagged
ticks) with the simulator's true drop (the ball's take, before and after), so any window is scored offline with the
board's own search.

    PYTHONPATH=src:tests:firmware/esp32 python3 tests/record_fit_window.py --capture rows.jsonl [--heldout]
    PYTHONPATH=src:tests:firmware/esp32 python3 tests/record_fit_window.py --score rows.jsonl[.gz] [--heldout]

Builds: the calibration drill and min_fit_heldout's slow drill (each slow target twice, after a fast flat shot), hold
mode as shipped, ESC lag told. A fit belongs to the last ball taken before it and to the wheel whose speed then is
nearest the fit's own speed (tests/fit_grid_floor.py's rule); a wheel fitted twice keeps its last fit, the one the
board reports.

PREDICTION and DECISION RULE: in firmware/esp32/README.md's section, written before the held-out capture ran, and
repeated in the eval file.

Simulated only: the simulator's first-order wheel (and first-order ESC), its tach jitter model, one seed per set.
"""

import gzip
import json
import multiprocessing
import statistics
import sys

import feeder_sim
import min_fit_heldout as h
import min_fit_rpm_sweep as m
from feeder_sim import SimFeeder, controller

PLANTS = {"first-order": {},
          "tach 3 us": {"tach_jitter_us": 3.0},
          "ESC 50 ms told": {"esc_tau_s": 0.05},
          "ESC 150 ms told": {"esc_tau_s": 0.15},
          "ESC 100 ms told": {"esc_tau_s": 0.10},
          "ESC 120 ms + tach 3 us": {"esc_tau_s": 0.12, "tach_jitter_us": 3.0}}
DESIGN = {"plants": ("first-order", "tach 3 us", "ESC 50 ms told", "ESC 150 ms told"), "lags": (0.35, 0.6),
          "seed": 7, "launcher": 0}
HELDOUT = {"plants": ("first-order", "tach 3 us", "ESC 100 ms told", "ESC 120 ms + tach 3 us"), "lags": (0.45, 0.55),
           "seed": 11, "launcher": 2}
WINDOWS = (8, 12, 16, 24)       # revolutions after the anchor (`after`); 8 is the board's (drop_from_commands_steps)
FLOOR = 1000.0                  # the launcher fit's floor (launcher.MIN_FIT_RPM as min_fit_heldout scores it)


def capture(args):
    plant, lag, seed, li = args
    from tennisbots import host, launcher
    controller.LOOP_THROUGH_CHANGE = host.LOOP_THROUGH_CHANGE = False
    host.HOLD_RPM = h.SHIPPED_HOLD
    kw = PLANTS[plant]
    se, sp = h.LAUNCHERS[li]
    true = launcher.WheelLauncher(speed_efficiency=se, spin_efficiency=sp)
    steps = controller.drop_from_commands_steps
    take = feeder_sim.SimFeeder._take_momentum
    rows = []
    for drill, spec in (("calibration", m.rs.load("drill.calibration.json")), ("slow", h.heldout_drill(3.0))):
        balls, fits = [], {}

        def taken(sim):
            before = tuple(sim.wheel)
            take(sim)
            balls.append((before, tuple(sim.wheel)))

        def kept(periods, ticks, **k):
            res = None
            for item in steps(periods, ticks, **k):
                if item is not None:
                    res = item[1]
                yield item
            # the record's fit is the only caller that passes neither `after` nor `refine` (the surveys pass both)
            if "after" not in k and "refine" not in k and res is not None and balls:
                before, after = balls[-1]
                w = min((0, 1), key=lambda i: abs(before[i] - res[1]))
                if abs(before[w] - res[1]) < 0.05 * before[w]:
                    fits[(len(balls) - 1, w)] = (list(periods), [list(t) for t in ticks], list(k.get("take", ())),
                                                 before[w], 1 - after[w] / before[w])
        controller.drop_from_commands_steps = kept
        feeder_sim.SimFeeder._take_momentum = taken
        try:
            sim = SimFeeder(balls=None, wheel_tau_s=lag, true_launcher=true, seed=seed, **kw)
            sim.hw.launch.esc_tau_us = int(round(1e6 * kw.get("esc_tau_s", 0.0)))     # told, as after its survey
            res, _ = m.rs._run(sim, host.plan_drill(spec))
        finally:
            controller.drop_from_commands_steps = steps
            feeder_sim.SimFeeder._take_momentum = take
        if not res.ok:
            return args, {"aborted": f"{drill}: {res.aborted}"}
        for (n, w), (p, t, tk, rpm, true_drop) in sorted(fits.items()):
            rows.append({"drill": drill, "ball": n, "wheel": w, "rpm": rpm, "true": true_drop, "periods": p,
                         "ticks": t, "take": tk})
    return args, {"build": [plant, lag], "seed": seed, "launcher": li, "rows": rows}


def refit(row):
    """reading / true drop and the fit's tau (ms) for each window, or None where the fit gave none."""
    out = {}
    for a in WINDOWS:
        f = controller.drop_from_commands(row["periods"], [tuple(t) for t in row["ticks"]], after=a,
                                          take=tuple(row["take"]))
        out[str(a)] = None if f is None else [f[0] / row["true"], f[3] / 1000, f[5]]
    return out


def score(builds, procs):
    rows = [dict(r, build=b["build"]) for b in builds for r in b["rows"] if r["rpm"] >= FLOOR]
    with multiprocessing.Pool(procs) as pool:
        fits = pool.map(refit, rows)
    print(f"{len(rows)} record fits at {FLOOR:.0f} rpm and up, {len(builds)} builds (seed {builds[0]['seed']}, "
          f"launcher {builds[0]['launcher']}), ESC told; reading / true drop per window (revolutions after the anchor)")
    print("sd = scatter of reading / true about 1 (rms of reading / true - 1), so it counts bias too; "
          ">0.5% = fits more than 0.5% off; worst = largest |reading / true - 1|")
    order = sorted({tuple(r["build"]) for r in rows}, key=lambda b: (list(PLANTS).index(b[0]), b[1]))

    def line(label, sel):
        cells = []
        for a in WINDOWS:
            q = [f[str(a)][0] for r, f in sel if f[str(a)] is not None]
            if not q:
                cells.append("-")
                continue
            rms = (statistics.fmean([(x - 1) ** 2 for x in q])) ** 0.5
            cells.append(f"{statistics.fmean(q):.4f} {100 * rms:4.2f}% {sum(abs(x - 1) > 0.005 for x in q):3d} "
                         f"{100 * max(abs(x - 1) for x in q):4.2f}%")
        n = len(sel)
        print(f"{label:34} {n:4d} | " + " | ".join(cells))

    head = " | ".join(f"after {a:2d}: mean rms >0.5% worst" for a in WINDOWS)
    print(f"\n{'build (plant, wheel lag s)':34} {'n':>4} | {head}")
    pairs = list(zip(rows, fits))
    for b in order:
        line(f"{b[0]}, {b[1]:.2f}", [(r, f) for r, f in pairs if tuple(r["build"]) == b])
    line("all", pairs)
    print("\nby speed band (all builds)")
    for lo, hi in ((1000, 2000), (2000, 3000), (3000, 4500), (4500, 99999)):
        line(f"{lo}-{hi if hi < 99999 else 'up'} rpm", [(r, f) for r, f in pairs if lo <= r["rpm"] < hi])
    print("\nby drill (all builds)")
    for d in ("calibration", "slow"):
        line(d, [(r, f) for r, f in pairs if r["drill"] == d])
    revs = [len(r["periods"]) for r in rows]
    print(f"\nsnapshot revolutions {min(revs)}-{max(revs)} (median {statistics.median(revs):.0f}); "
          f"fits with no reading per window: "
          + ", ".join(f"{a}: {sum(f[str(a)] is None for f in fits)}" for a in WINDOWS))
    return rows, fits


def main():
    procs = int(sys.argv[sys.argv.index("--procs") + 1]) if "--procs" in sys.argv else multiprocessing.cpu_count()
    cfg = HELDOUT if "--heldout" in sys.argv else DESIGN
    if "--score" in sys.argv:
        path = sys.argv[sys.argv.index("--score") + 1]
        with (gzip.open(path, "rt") if path.endswith(".gz") else open(path)) as f:
            score([b for b in map(json.loads, f) if b.get("seed") == cfg["seed"]], procs)
        return
    out = sys.argv[sys.argv.index("--capture") + 1]
    grid = [(p, lag, cfg["seed"], cfg["launcher"]) for p in cfg["plants"] for lag in cfg["lags"]]
    with multiprocessing.Pool(procs, maxtasksperchild=1) as pool:
        for a, r in pool.imap_unordered(capture, grid):
            if "aborted" in r:
                print(f"aborted {a}: {r['aborted']}", file=sys.stderr)
                continue
            print(f"  {a}: {len(r['rows'])} record fits", file=sys.stderr, flush=True)
            with open(out, "a") as f:
                f.write(json.dumps(r) + "\n")


if __name__ == "__main__":
    main()
