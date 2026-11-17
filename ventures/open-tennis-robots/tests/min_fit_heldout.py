"""Held-out decision on `launcher.MIN_FIT_RPM`, and whether the slow-wheel hold makes shots late (2026-11-17,
firmware/esp32/README.md "The fit floor on held-out builds").

"Slow wheels watched past the verdict" (2026-11-16) left the floor at 1,000 rpm: with the board watching slow wheels,
no floor gave the lower worst spin error on three plants of four, but the means were mixed and the choice would have
been made on the builds it was scored on. This sweep decides it on builds none of the earlier sweeps used:

- true launchers (speed / spin efficiency) 0.78 / 0.42, 0.88 / 0.55, 0.83 / 0.28 (earlier: 0.70 / 0.35, 0.95 / 0.35,
  0.95 / 0.65);
- wheel lags 0.3 and 0.6 s (earlier: 0.2 / 0.4 / 0.8);
- plants: first-order with free speed 8,000 rpm, 3 us tach jitter with free speed 10,000, and a 50 ms ESC lag (told)
  with free speed 9,000, all against the 9,000 the firmware is told (earlier: 9,000 free, 5 us jitter, 30 ms ESC);
  simulator seed 7 (earlier: 0);
- a slow drill with other targets (540-1,450 rpm, never on the earlier grid), a slower serve (20 m/s against 22) and a
  shorter aim (8.0 m against 9.0), topspin and backspin swapped against the earlier drill's.

DECISION RULE, fixed before the run (committed with this file, before its output existed). Candidates: 1,000
(shipped) and 500 (the planner's floor, so in effect none). 750 is printed but not a candidate. The floor drops to
500 only if, on the spin efficiency error of `fit_from_drops` over the calibration drill's log plus the slow drill's:
  (a) the mean over all held-out builds is lower at 500, and
  (b) the mean is lower or equal at 500 on at least two of the three plants, and
  (c) on no plant is the worst build at 500 more than 0.25 percentage points worse than at 1,000, and
  (d) no drill aborts at 500 that did not abort at 1,000 (the floor cannot abort a drill, so this is a sanity check).
Otherwise it stays at 1,000. The speed efficiency is reported, not part of the rule (it moved by under 0.3% in every
earlier sweep).

LATENESS. The slow drill runs at its 3.0 s interval and at 2.0 s, with `host.HOLD_RPM` as shipped and at 0 (the Pi
sending the next speeds straight after each release). A shot is late by how far its release came after the previous
release plus the interval; the report gives, per hold and interval, the mean and worst lateness, how many shots were
over 0.25 s late, and the whole drill's span.

    PYTHONPATH=src:tests:firmware/esp32 python3 tests/min_fit_heldout.py [--raw out.jsonl] [--quick]

One process per case on every core; about 15 minutes on four. `--raw` appends each case as it finishes and a rerun
skips the cases already there. The physics is the simulator's assumption, not a real wheel.
"""

import json
import multiprocessing
import statistics
import sys

import min_fit_rpm_sweep as m
from feeder_sim import SimFeeder
from tennisbots import host, launcher

LAUNCHERS = ((0.78, 0.42), (0.88, 0.55), (0.83, 0.28))
LAGS = (0.3, 0.6)
PLANTS = (("first-order 8k", {"wheel_max_rpm": 8000.0}),
          ("tach 3 us 10k", {"tach_jitter_us": 3.0, "wheel_max_rpm": 10000.0}),
          ("ESC 50 ms told", {"esc_tau_s": 0.05}))
SEED = 7
TARGETS = (540, 640, 740, 860, 960, 1080, 1180, 1320, 1450)
FLOORS = (500.0, 750.0, 1000.0)
SHIPPED_HOLD = host.HOLD_RPM
INTERVALS = (3.0, 2.0)


def heldout_drill(interval=3.0):
    """The held-out slow drill: a fast flat shot, then each slow target twice (after the fast shot, after itself)."""
    shots = []
    for i, t in enumerate(TARGETS):
        sign = -1 if i % 2 == 0 else 1            # swapped against min_fit_rpm_sweep.slow_drill
        s = m._shot(t, sign, speed=20, x=8.0)
        shots += [dict(m.FAST), s, dict(s)]
    return {"machine": {"y": 0.0, "height": 1.0}, "interval": interval, "shots": shots}


def run(true, tau, spec, plant):
    """(res, per-wheel (truth, record, rpm)) for one drill on the simulator."""
    sim = SimFeeder(balls=None, wheel_tau_s=tau, true_launcher=true, seed=SEED, **plant)
    sim.hw.launch.esc_tau_us = int(round(1e6 * plant.get("esc_tau_s", 0.0)))      # told, as after its survey
    balls = []
    take = sim._take_momentum

    def taken():
        before = tuple(sim.wheel)
        take()
        balls.append((before, tuple(sim.wheel)))
    sim._take_momentum = taken
    res, _ = m.rs._run(sim, host.plan_drill(spec))
    wheels = []
    if res.ok:
        recs = [r for r in res.launches if r.get("launched")]
        for r, (before, after) in zip(recs, balls):
            for k, name in ((0, "top"), (1, "bottom")):
                wheels.append((1 - after[k] / before[k], float(r[f"drop_{name}"]), float(r[f"rpm_{name}"])))
    return res, wheels


def lateness(res, interval):
    rel = [s.released_at for s in res.shots]
    return [max(0.0, b - a - interval) for a, b in zip(rel, rel[1:])], (rel[-1] - rel[0]) if rel else None


def case(args):
    kind, pi, tau, li, hold, interval = args
    pname, plant = PLANTS[pi]
    se, sp = LAUNCHERS[li]
    true = launcher.WheelLauncher(speed_efficiency=se, spin_efficiency=sp)
    host.HOLD_RPM = hold
    res, wheels = run(true, tau, heldout_drill(interval), plant)
    if not res.ok:
        return args, {"aborted": res.aborted}
    late, span = lateness(res, interval)
    out = {"late": late, "span": span, "ratios": [(rpm, rec / truth) for truth, rec, rpm in wheels]}
    if kind == "fit":
        cres, _ = run(true, tau, m.rs.load("drill.calibration.json"), plant)
        if not cres.ok:
            return args, {"aborted": "calibration: " + cres.aborted}
        logs = cres.launches + res.launches
        for fl in FLOORS:
            f = m.fit_with_floor(logs, fl)
            out[f"fit{int(fl)}"] = (abs(f.speed_efficiency / se - 1), abs(f.spin_efficiency / sp - 1))
    return args, out


def main():
    quick = "--quick" in sys.argv
    plants = range(1) if quick else range(len(PLANTS))
    lags = LAGS[:1] if quick else LAGS
    grid = []
    for pi in plants:
        for tau in lags:
            for li in range(len(LAUNCHERS)):
                grid.append(("fit", pi, tau, li, SHIPPED_HOLD, 3.0))
                grid += [("late", pi, tau, li, h, iv) for h, iv in ((0.0, 3.0), (SHIPPED_HOLD, 2.0), (0.0, 2.0))]
    raw = sys.argv[sys.argv.index("--raw") + 1] if "--raw" in sys.argv else None
    done = {}
    if raw:
        try:
            with open(raw) as f:
                for line in f:
                    k, r = json.loads(line)
                    done[tuple(k)] = r
        except FileNotFoundError:
            pass
    todo = [g for g in grid if tuple(g) not in done]
    with multiprocessing.Pool(multiprocessing.cpu_count()) as pool:
        for a, r in pool.imap_unordered(case, todo):
            done[tuple(a)] = r
            print(f"  {a}: {'aborted ' + r['aborted'] if 'aborted' in r else 'done'}", file=sys.stderr)
            if raw:
                with open(raw, "a") as f:
                    f.write(json.dumps([list(a), r]) + "\n")
    rows = [(g, done[tuple(g)]) for g in grid]
    fit = [(g, r) for g, r in rows if g[0] == "fit"]

    print("Part 1. Record drop / true drop per launched wheel, held-out slow drill, shipped hold, 3.0 s interval")
    print(f"{'plant':15} {'rpm band':>11} | {'wheels':>6} {'>2% off':>7} {'min':>6} {'max':>6}")
    for pi in plants:
        rat = [x for g, r in fit if g[1] == pi and "ratios" in r for x in r["ratios"]]
        for lo, hi in m.BANDS:
            xs = [q for rpm, q in rat if lo <= rpm < hi]
            if xs:
                print(f"{PLANTS[pi][0]:15} {lo:5d}-{hi:<5d} | {len(xs):6d} {sum(abs(q - 1) > 0.02 for q in xs):7d} "
                      f"{min(xs):6.3f} {max(xs):6.3f}")

    print("\nPart 2. fit_from_drops, calibration + held-out slow drill: efficiency error, mean / worst %")
    print(f"{'plant':15} {'floor':>6} | {'builds':>6} {'speed mean':>10} {'worst':>6} | {'spin mean':>9} {'worst':>6}")
    spin = {}
    for pi in plants:
        ok = [r for g, r in fit if g[1] == pi and "aborted" not in r]
        for fl in FLOORS:
            e = [r[f"fit{int(fl)}"] for r in ok]
            if not e:
                continue
            spin[(pi, fl)] = [x[1] for x in e]
            print(f"{PLANTS[pi][0]:15} {fl:6.0f} | {len(e):6d} {100 * statistics.fmean(x[0] for x in e):10.2f} "
                  f"{100 * max(x[0] for x in e):6.2f} | {100 * statistics.fmean(x[1] for x in e):9.2f} "
                  f"{100 * max(x[1] for x in e):6.2f}")
    for g, r in fit:
        if "aborted" in r:
            print(f"aborted: {PLANTS[g[1]][0]} lag {g[2]} launcher {LAUNCHERS[g[3]]}: {r['aborted']}")

    if spin:
        pooled = {fl: statistics.fmean(x for pi in plants for x in spin.get((pi, fl), [])) for fl in (500.0, 1000.0)}
        a = pooled[500.0] < pooled[1000.0]
        b = sum(statistics.fmean(spin[(pi, 500.0)]) <= statistics.fmean(spin[(pi, 1000.0)])
                for pi in plants if (pi, 500.0) in spin) >= min(2, len(list(plants)))
        c = all(max(spin[(pi, 500.0)]) <= max(spin[(pi, 1000.0)]) + 0.0025 for pi in plants if (pi, 500.0) in spin)
        print(f"\nDecision rule: (a) pooled spin mean 500 {100 * pooled[500.0]:.2f}% vs 1,000 {100 * pooled[1000.0]:.2f}%:"
              f" {a}; (b) lower or equal on two plants of three: {b}; (c) no plant's worst over 0.25 points worse: {c};"
              f" (d) the floor aborts nothing (same drills feed every floor). -> floor "
              f"{'500' if a and b and c else '1,000'}")

    print("\nPart 3. Lateness, held-out slow drill: release after (previous release + interval)")
    print(f"{'plant':15} {'interval':>8} {'hold':>6} | {'drills':>6} {'abort':>5} | {'late mean s':>11} {'worst':>6} "
          f"{'>0.25 s':>8} | {'span mean s':>11}")
    for pi in plants:
        for iv in INTERVALS:
            for h in (0.0, SHIPPED_HOLD):
                rs_ = [r for g, r in rows if g[1] == pi and g[4] == h and g[5] == iv]
                ok = [r for r in rs_ if "aborted" not in r]
                late = [x for r in ok for x in r["late"]]
                if not ok:
                    print(f"{PLANTS[pi][0]:15} {iv:8.1f} {h:6.0f} | {len(rs_):6d} {len(rs_) - len(ok):5d} | all aborted")
                    continue
                print(f"{PLANTS[pi][0]:15} {iv:8.1f} {h:6.0f} | {len(rs_):6d} {len(rs_) - len(ok):5d} | "
                      f"{statistics.fmean(late):11.3f} {max(late):6.2f} {sum(x > 0.25 for x in late):4d}/{len(late):<3d} | "
                      f"{statistics.fmean(r['span'] for r in ok):11.1f}")
    for g, r in rows:
        if g[0] == "late" and "aborted" in r:
            print(f"aborted: {PLANTS[g[1]][0]} lag {g[2]} launcher {LAUNCHERS[g[3]]} hold {g[4]:.0f} interval {g[5]}: "
                  f"{r['aborted']}")


if __name__ == "__main__":
    main()
