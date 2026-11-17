"""Does the board's LOOP_UNSURE mark the noisy wheels, and should the Pi's launcher fit weight them down? (2026-11-17,
firmware/esp32/README.md "Unsure marks on the noisy wheels").

"The jittery tach through a speed change" found the noisiest wheel readings in one class: the fast partner of a slow
spin shot (2,500 rpm and up, the other wheel watched past its verdict), sd 1.0% of the true drop where a fast shot's
wheels have 0.6%. The board marks a loop fit unsure (LAUNCH flags bits 6 / 7) when the fit's own misses give its drop a
standard error over LOOP_SE_MAX (1%). Two questions:

1. MARKS. Of the wheels more than 2% off, how many came marked, and how many of the marked are off? Per class.
   The loop fit's standard error itself is logged too (the Pi never sees it, only the bit).
2. WEIGHT. `launcher.fit_from_drops(unsure_weight=w)` counts a marked reading w times in the least squares. Candidates
   w = 0.5, 0.25 and 0 (set aside) against 1 (shipped). The fit is made as min_fit_heldout makes it: the calibration
   drill's log plus the held-out slow drill's, floor 1,000 rpm.

DECISION RULE, fixed before the run (committed with this file, before its output existed). Seeds 7 and 8 are the
design seeds: the candidate with the lowest mean spin efficiency error over their builds (all three plants) is
picked, if any beats w = 1 there. It ships as the default only if on the held-out seeds 13 and 14, against w = 1:
  (a) its mean spin efficiency error over all held-out builds is lower, and
  (b) its mean is lower or equal on at least two of the three plants, and
  (c) on no plant is its worst build more than 0.25 percentage points worse, and
  (d) its mean speed efficiency error is no more than 0.1 points worse.
Otherwise the default stays 1 (marks are a warning only, as since 2026-11-16).

Builds: min_fit_heldout's three launchers, two wheel lags and three plants (first-order 8k, tach 3 us 10k, ESC 50 ms
told), hold mode (LOOP_THROUGH_CHANGE off, as shipped).

    PYTHONPATH=src:tests:firmware/esp32 python3 tests/unsure_weight.py [--seeds 7,8,13,14] [--raw out.jsonl]

One process per case on every core; a case is two drills, about four minutes of one core. `--raw` appends each case
as it finishes and a rerun skips the cases already there. The physics is the simulator's assumption, not a real wheel.
"""

import json
import multiprocessing
import statistics
import sys

import min_fit_heldout as h
import min_fit_rpm_sweep as m
from feeder_sim import SimFeeder, controller
from tennisbots import host, launcher

LC = controller.LaunchCheck
_update = LC.update
_loop_fit = LC._loop_fit
WEIGHTS = (1.0, 0.5, 0.25, 0.0)
DESIGN = (7, 8)
HELDOUT = (13, 14)
FLOOR = 1000.0
KEYS = ("seq", "launched", "rpm_top", "rpm_bottom", "drop_top", "drop_bottom", "fit_top", "fit_bottom", "unsure_top",
        "unsure_bottom", "loop_top", "loop_bottom")


def _se_loop_fit(self, snap, ticks, edges0, targets, speeds, dips, flags):
    seq = self.seq                     # as _loop_fit reads it, on the generator's first step
    yield from _loop_fit(self, snap, ticks, edges0, targets, speeds, dips, flags)
    self._ses[seq] = [None if lp is None else lp[5] for lp in self.last_loop]


def _tagging_update(self, now_ms, rpms, targets=None, tachs=None, cmds=None, since=None):
    went = _update(self, now_ms, rpms, targets, tachs, cmds, since)
    if went:
        self._tags.append("watched" if self.ext is not None else ("crossed" if self.frozen else "plain"))
    return went


def run(true, tau, spec, plant, seed):
    """(res, per-wheel rows, the launch records) for one drill."""
    LC.update = _tagging_update
    LC._loop_fit = _se_loop_fit
    sim = SimFeeder(balls=None, wheel_tau_s=tau, true_launcher=true, seed=seed, **plant)
    sim.hw.launch.esc_tau_us = int(round(1e6 * plant.get("esc_tau_s", 0.0)))
    sim.hw.launch._tags = tags = []
    sim.hw.launch._ses = ses = {}
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
        for n, (r, (before, after), tag) in enumerate(zip(recs, balls, tags)):
            se = ses.get(r.get("seq"), [None, None])
            for k, name in ((0, "top"), (1, "bottom")):
                wheels.append({"shot": n, "wheel": name, "tag": tag, "rpm": float(r[f"rpm_{name}"]),
                               "unsure": bool(r.get(f"unsure_{name}")), "se": se[k],
                               "ratio": float(r[f"drop_{name}"]) / (1 - after[k] / before[k])})
    return res, wheels, [{k: r.get(k) for k in KEYS} for r in res.launches]


def case(args):
    pi, tau, li, seed = args
    plant = h.PLANTS[pi][1]
    se, sp = h.LAUNCHERS[li]
    true = launcher.WheelLauncher(speed_efficiency=se, spin_efficiency=sp)
    controller.LOOP_THROUGH_CHANGE = host.LOOP_THROUGH_CHANGE = False
    host.HOLD_RPM = h.SHIPPED_HOLD
    cres, cw, clog = run(true, tau, m.rs.load("drill.calibration.json"), plant, seed)
    if not cres.ok:
        return args, {"aborted": "calibration: " + cres.aborted}
    res, w, log = run(true, tau, h.heldout_drill(3.0), plant, seed)
    if not res.ok:
        return args, {"aborted": res.aborted}
    for x in cw:
        x["drill"] = "calibration"
    for x in w:
        x["drill"] = "slow"
    return args, {"wheels": cw + w, "log": clog + log}


def fit_errors(log, li, weight):
    se, sp = h.LAUNCHERS[li]
    old = launcher.MIN_FIT_RPM
    launcher.MIN_FIT_RPM = FLOOR
    try:
        f = launcher.fit_from_drops(log, unsure_weight=weight)
    except (ValueError, ZeroDivisionError):
        return None
    finally:
        launcher.MIN_FIT_RPM = old
    if f.spin_efficiency is None:
        return None
    return abs(f.speed_efficiency / se - 1), abs(f.spin_efficiency / sp - 1)


def cls(w):
    if w["drill"] == "calibration":
        return "calibration"
    if w["tag"] == "watched":
        return "slow shot, slow wheel" if w["rpm"] < 1000 else "slow shot, fast wheel"
    return "fast shot"


def main():
    seeds = [int(s) for s in sys.argv[sys.argv.index("--seeds") + 1].split(",")] if "--seeds" in sys.argv \
        else list(DESIGN + HELDOUT)
    raw = sys.argv[sys.argv.index("--raw") + 1] if "--raw" in sys.argv else None
    grid = [(pi, tau, li, s) for s in seeds for pi in range(len(h.PLANTS)) for tau in h.LAGS
            for li in range(len(h.LAUNCHERS))]
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
            print(f"  {a}: {'aborted ' + r['aborted'] if 'aborted' in r else 'done'}", file=sys.stderr, flush=True)
            if raw:
                with open(raw, "a") as f:
                    f.write(json.dumps([list(a), r]) + "\n")
    ok = [g for g in grid if "wheels" in done[tuple(g)]]
    for g in grid:
        if "aborted" in done[tuple(g)]:
            print(f"aborted: {g}: {done[tuple(g)]['aborted']}")

    print(f"Seeds {seeds}; {len(ok)} of {len(grid)} builds ran (calibration drill + held-out slow drill, hold mode)")
    print("\nPart 1. Do the marks find the misses? Wheels at 1,000 rpm and up (the fit's floor), by plant and class")
    print(f"{'plant':16} {'class':24} | {'wheels':>6} {'marked':>6} {'>2% off':>7} {'off, marked':>11} "
          f"{'sd marked':>9} {'sd unmarked':>11}")
    for pi, (pname, _) in enumerate(h.PLANTS):
        ws = [w for g in ok if g[0] == pi for w in done[tuple(g)]["wheels"] if w["rpm"] >= FLOOR]
        for c in ("calibration", "fast shot", "slow shot, fast wheel", "slow shot, slow wheel"):
            xs = [w for w in ws if cls(w) == c]
            if not xs:
                continue
            mk = [w for w in xs if w["unsure"]]
            um = [w for w in xs if not w["unsure"]]
            off = [w for w in xs if abs(w["ratio"] - 1) > 0.02]
            sd = (lambda v: f"{100 * statistics.pstdev([w['ratio'] for w in v]):8.2f}%" if len(v) > 1 else f"{'-':>9}")
            print(f"{pname:16} {c:24} | {len(xs):6d} {len(mk):6d} {len(off):7d} "
                  f"{sum(w['unsure'] for w in off):5d} of {len(off):<3d} {sd(mk)} {sd(um):>11}")

    print("\nPart 1b. The loop fit's own standard error against the true error (all plants, wheels >= 1,000 rpm)")
    ws = [w for g in ok for w in done[tuple(g)]["wheels"] if w["rpm"] >= FLOOR and w["se"] is not None]
    for lo, hi in ((0, 0.005), (0.005, 0.01), (0.01, 0.02), (0.02, 1.0)):
        xs = [w for w in ws if lo <= w["se"] < hi]
        if xs:
            print(f"  se {100 * lo:4.1f}-{100 * hi:5.1f}%: {len(xs):5d} wheels, |err| mean "
                  f"{100 * statistics.fmean(abs(w['ratio'] - 1) for w in xs):.2f}%, rms "
                  f"{100 * statistics.fmean((w['ratio'] - 1) ** 2 for w in xs) ** 0.5:.2f}%, "
                  f">2% off {sum(abs(w['ratio'] - 1) > 0.02 for w in xs)}")

    print("\nPart 2. Launcher fit error (speed / spin efficiency, % of true), mean and worst build, by unsure weight")
    fits = {}
    for g in ok:
        for wt in WEIGHTS:
            fits[(tuple(g), wt)] = fit_errors(done[tuple(g)]["log"], g[2], wt)

    def table(sel, label):
        print(f"\n  {label}")
        print(f"  {'plant':16} " + " ".join(f"{'w=' + str(wt):>22}" for wt in WEIGHTS))
        stats = {}
        for pi, (pname, _) in list(enumerate(h.PLANTS)) + [(None, ("all", None))]:
            row = []
            for wt in WEIGHTS:
                es = [fits[(tuple(g), wt)] for g in ok if g[3] in sel and (pi is None or g[0] == pi)]
                es = [e for e in es if e is not None]
                if not es:
                    row.append(f"{'-':>22}")
                    continue
                sm = statistics.fmean(e[0] for e in es)
                pm, pw = statistics.fmean(e[1] for e in es), max(e[1] for e in es)
                stats[(pi, wt)] = (sm, pm, pw, len(es))
                row.append(f"{100 * sm:5.2f} / {100 * pm:5.2f} ({100 * pw:5.2f})")
            print(f"  {pname:16} " + " ".join(f"{c:>22}" for c in row))
        return stats

    dstats = table([s for s in seeds if s in DESIGN], f"design seeds {DESIGN}: speed mean / spin mean (spin worst)")
    hstats = table([s for s in seeds if s in HELDOUT], f"held-out seeds {HELDOUT}: speed mean / spin mean (spin worst)")

    print("\nDecision")
    if (None, 1.0) not in dstats:
        print("  design seeds missing")
        return
    pick = min(WEIGHTS[1:], key=lambda wt: dstats.get((None, wt), (0, 9, 9))[1])
    print(f"  design pick: w = {pick} (spin mean {100 * dstats[(None, pick)][1]:.2f}% against "
          f"{100 * dstats[(None, 1.0)][1]:.2f}% at w = 1)")
    if dstats[(None, pick)][1] >= dstats[(None, 1.0)][1]:
        print("  no candidate beats w = 1 on the design seeds: the default stays 1")
        return
    if (None, 1.0) not in hstats:
        print("  held-out seeds missing")
        return
    a = hstats[(None, pick)][1] < hstats[(None, 1.0)][1]
    b = sum(hstats[(pi, pick)][1] <= hstats[(pi, 1.0)][1] for pi in range(len(h.PLANTS))) >= 2
    c = all(hstats[(pi, pick)][2] - hstats[(pi, 1.0)][2] <= 0.0025 for pi in range(len(h.PLANTS)))
    d = hstats[(None, pick)][0] - hstats[(None, 1.0)][0] <= 0.001
    print(f"  held out: (a) mean lower {a}; (b) two plants of three {b}; (c) no worst build > 0.25 pt worse {c}; "
          f"(d) speed no more than 0.1 pt worse {d}")
    print(f"  => {'ship w = ' + str(pick) if a and b and c and d else 'the default stays 1'}")


if __name__ == "__main__":
    main()
