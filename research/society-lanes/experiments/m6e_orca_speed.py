"""Milestone 6e: 6d's four arms in ORCA, and a robot-speed sweep in collision-free speed.

Predictions U1 to U8 are in LOG.md, written before this script's full run.

Milestone 6d separated the lane-order gain of crowd-side robots into side-holding and extra bodies in
social force and collision-free speed, and left two things open (README Next steps 6):

Part A (ORCA). The same four arms in ORCA (own port of RVO2, milestone 4d), the third family that passed
the held-out share test and the planner real robots run:

* none:     N people, no robots;
* control:  N - k people, no robots (density-matched);
* crowd:    N - k people plus k robots that hold the crowd's side (robots.py "crowd");
* goal:     N - k people plus k robots with a lateral goal drawn 50/50 per entry (robots.py "goal").

ORCA's crowd barely moves when its fitted bias (1.0) is halved (6a: 0.998 on own right), so the bias
multipliers were picked by a no-robot calibration on separate seeds (SEED 20319000 to 20319009, 10 per
run; disclosed in LOG.md): 0.02 (share 0.68, street-like), 0.05 (0.87), 0.1 (0.95) and 1.0 (fitted).
Shares 20% and 30%; robots 1.2 m/s.

Part B (collision-free speed, fitted beta 0.2, at 0.5x): 6d found that here even crowd-side robots slow
people against the density-matched control (+0.50 to +0.88 s). Robots are capped at 1.2 m/s; people's
free speed is Weidmann's 1.34 m/s mean. The sweep runs crowd-side and lateral-goal robots at 0.8, 1.2,
1.6 and 2.0 m/s at 20%, with the none and control arms shared across speeds.

Effects per (family, multiplier, share, robot speed): seed = crowd - control, side = crowd - goal,
body = goal - control, density = control - none.

Two HERMES 3.6 m runs with the calibrated walker counts (ORCA 30/60 as milestone 5b; collision-free speed
20/60 as m5_robots.RUNS); 120 s runs, the first 40 s warm-up; 40 fresh seeds per cell (SEED0 20310000,
disjoint from 5a to 6d and from the calibration). People-only measures. Cell values are seed means; the
two runs are pooled by the mean of their cell means; percentile bootstrap over seeds within each cell
(B = 2000).

Writes m6e_orca_speed_results.txt and m6e_orca_speed_runs.csv.

Needs jupedsim, numpy (numba makes ORCA about 50x faster): PY=$(python3 platform/ci/pyenv.py jupedsim numpy
numba), then "$PY" experiments/m6e_orca_speed.py   (cached in data_cache/m6e_cache.json)
M6E_SEEDS and M6E_DURATION shorten a smoke run (its outputs carry _smoke).
"""
from __future__ import annotations

import csv
import json
import multiprocessing as mp
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)
sys.path.insert(0, HERE)
import m5_robots as M5  # noqa: E402

SEED0 = 20310000
CALIB_SEED0, CALIB_SEEDS = 20319000, 10
FULL_SEEDS = 40
SEEDS = int(os.environ.get("M6E_SEEDS", str(FULL_SEEDS)))
DURATION = float(os.environ.get("M6E_DURATION", str(M5.DURATION)))
SMOKE = (SEEDS, DURATION) != (FULL_SEEDS, M5.DURATION)
FITTED = {"orca": 1.0, "cfsm": 0.2}
MULTS = {"orca": [0.02, 0.05, 0.1, 1.0], "cfsm": [0.5]}
NCOUNT = {"orca": (30, 60), "cfsm": (20, 60)}
SHARES = {"orca": [0.20, 0.30], "cfsm": [0.20]}
SPEEDS = {"orca": [1.2], "cfsm": [0.8, 1.2, 1.6, 2.0]}
B = 2000
MEASURES = ["transit", "lane", "share"]
KINDS = ("seed", "side", "body", "density")
NAMES = {"orca": "ORCA", "cfsm": "collision-free speed"}


def key(*a):
    return "|".join(str(x) for x in a)


def runs(fam):
    return [(run, ent, NCOUNT[fam][i]) for i, (run, ent, _) in enumerate(M5.RUNS)]


def conds(fam):
    """(condition, share, robot speed); none and control carry speed 0 (no robots)."""
    out = [("none", 0.0, 0.0)]
    for sh in SHARES[fam]:
        out.append(("control", sh, 0.0))
        for v in SPEEDS[fam]:
            out += [("crowd", sh, v), ("goal", sh, v)]
    return out


def cells():
    for fam, mults in MULTS.items():
        for m in mults:
            for run, ent, n in runs(fam):
                for c, sh, v in conds(fam):
                    yield fam, m, run, ent, n, c, sh, v


def agents(n, cond, sh):
    """(agents simulated, robots among them) for a cell."""
    if cond == "none":
        return n, 0
    k = M5.n_robots(n, sh)
    return (n - k, 0) if cond == "control" else (n, k)


def jobs():
    out = []
    for fam, m, run, ent, n, c, sh, v in cells():
        na, nr = agents(n, c, sh)
        beta = FITTED[fam] * m
        for s in range(SEEDS):
            out.append((key(fam, m, run, n, c, sh, v, s), fam, ent, na, beta, nr,
                        c if nr else "crowd", v if nr else M5.SPEED, SEED0 + s))
    return out


def _sim(job):
    k, fam, ent, na, beta, nr, pol, v, seed = job
    kw = dict(duration=DURATION, warmup=M5.WARMUP, robots=nr, policy=pol, robot_speed=v, passes=bool(nr))
    if fam == "orca":
        import orca as mod
        r = mod.simulate(na, M5.WIDTH, M5.LENGTH, ent, beta, seed, **kw)
    else:
        import sftwin as mod
        r = mod.simulate(na, M5.WIDTH, M5.LENGTH, ent, beta, seed, model=fam, **kw)
    r.pop("flags")
    return k, {a: (float(b) if isinstance(b, (int, float, np.floating, np.integer)) else b) for a, b in r.items()}


def cell_means(rs):
    ok = [r for r in rs if not r.get("failed")]
    return {q: M5.nanmean([r[q] for r in ok]) for q in MEASURES} | {"ok": len(ok)}


def pooled(per_run):
    return {q: M5.nanmean([c[q] for c in per_run]) for q in MEASURES}


def effects(pt, fam, m, sh, v):
    g = lambda c, s, vv: pt[(fam, m, c, s, vv)]  # noqa: E731
    out = {}
    for q in MEASURES:
        out[("seed", q)] = g("crowd", sh, v)[q] - g("control", sh, 0.0)[q]
        out[("side", q)] = g("crowd", sh, v)[q] - g("goal", sh, v)[q]
        out[("body", q)] = g("goal", sh, v)[q] - g("control", sh, 0.0)[q]
        out[("density", q)] = g("control", sh, 0.0)[q] - g("none", 0.0, 0.0)[q]
    return out


def effect_keys():
    for fam, mults in MULTS.items():
        for m in mults:
            for sh in SHARES[fam]:
                for v in SPEEDS[fam]:
                    yield fam, m, sh, v


def verdicts(eff):
    """The registered predictions U1 to U8 from the effect table; returns (lines, dict of held flags)."""
    L, held = [], {}
    om = MULTS["orca"]

    def iv(*k):
        v, lo, hi = eff[k]
        return f"{v:+.3f} [{lo:+.3f}, {hi:+.3f}]"

    def o(m, sh, kind, q):
        return eff[("orca", m, sh, 1.2, kind, q)]

    def say(name, text, ok, detail):
        held[name] = ok
        L.append(f"{name} ({text}): {'held' if ok else 'refuted'} ({detail})")

    say("U1", "ORCA, 20%: crowd - goal lane order, interval above 0 at all four multipliers",
        all(o(m, 0.2, "side", "lane")[1] > 0 for m in om),
        "; ".join(f"x{m} {iv('orca', m, 0.2, 1.2, 'side', 'lane')}" for m in om))
    say("U2", "ORCA, 20%: crowd - goal transit, interval below 0 at all four multipliers",
        all(o(m, 0.2, "side", "transit")[2] < 0 for m in om),
        "; ".join(f"x{m} {iv('orca', m, 0.2, 1.2, 'side', 'transit')}" for m in om))
    say("U3", "ORCA x0.02, 20%: crowd - control lane order, interval above 0",
        o(0.02, 0.2, "seed", "lane")[1] > 0, iv("orca", 0.02, 0.2, 1.2, "seed", "lane"))
    say("U4", "ORCA x1.0: crowd - control lane order, interval contains 0 at both shares",
        all(o(1.0, sh, "seed", "lane")[1] <= 0 <= o(1.0, sh, "seed", "lane")[2] for sh in (0.2, 0.3)),
        "; ".join(f"{sh:.2f} {iv('orca', 1.0, sh, 1.2, 'seed', 'lane')}" for sh in (0.2, 0.3)))
    say("U5", "ORCA x1.0: crowd - control transit, interval above 0 at both shares",
        all(o(1.0, sh, "seed", "transit")[1] > 0 for sh in (0.2, 0.3)),
        "; ".join(f"{sh:.2f} {iv('orca', 1.0, sh, 1.2, 'seed', 'transit')}" for sh in (0.2, 0.3)))
    sp = SPEEDS["cfsm"]
    cs = [eff[("cfsm", 0.5, 0.2, v, "seed", "transit")] for v in sp]
    say("U6", "collision-free speed x0.5, 20%: crowd - control transit falls with each step up in robot speed",
        all(a[0] > b[0] for a, b in zip(cs, cs[1:])),
        "; ".join(f"{v} m/s {iv('cfsm', 0.5, 0.2, v, 'seed', 'transit')}" for v in sp))
    say("U7", "collision-free speed x0.5, 20%, robots 1.6 m/s: crowd - control transit interval not above 0",
        eff[("cfsm", 0.5, 0.2, 1.6, "seed", "transit")][1] <= 0, iv("cfsm", 0.5, 0.2, 1.6, "seed", "transit"))
    say("U8", "collision-free speed x0.5, 20%: crowd - goal transit interval below 0 at all four speeds",
        all(eff[("cfsm", 0.5, 0.2, v, "side", "transit")][2] < 0 for v in sp),
        "; ".join(f"{v} m/s {iv('cfsm', 0.5, 0.2, v, 'side', 'transit')}" for v in sp))
    return L, held


def main():
    os.makedirs(M5.CACHE, exist_ok=True)
    cname = f"m6e_smoke_{SEEDS}_{DURATION:.0f}.json" if SMOKE else "m6e_cache.json"
    cpath = os.path.join(M5.CACHE, cname)
    cache = json.load(open(cpath)) if os.path.exists(cpath) else {}
    js = jobs()
    todo = sorted([j for j in js if j[0] not in cache], key=lambda j: (j[1] != "orca", -j[3]))
    print(f"{len(js)} runs, {len(todo)} to simulate", flush=True)
    with mp.Pool(int(os.environ.get("M5_PROCS", "4"))) as pool:
        for i, (k, r) in enumerate(pool.imap_unordered(_sim, todo, chunksize=2)):
            cache[k] = r
            if i % 100 == 0:
                print(f"  {i + 1}/{len(todo)}", flush=True)
                json.dump(cache, open(cpath, "w"))
    json.dump(cache, open(cpath, "w"))

    raw = {(fam, m, run, c, sh, v): [cache[key(fam, m, run, n, c, sh, v, s)] for s in range(SEEDS)]
           for fam, m, run, ent, n, c, sh, v in cells()}
    fm = [(fam, m) for fam, ms in MULTS.items() for m in ms]

    def point_of(pick=None):
        pt = {}
        for fam, m in fm:
            for c, sh, v in conds(fam):
                per = []
                for run, _, _ in runs(fam):
                    rs = raw[(fam, m, run, c, sh, v)]
                    if pick is not None:
                        rs = [rs[i] for i in pick[(fam, m, run, c, sh, v)]]
                    per.append(cell_means(rs))
                pt[(fam, m, c, sh, v)] = pooled(per)
        return pt

    point = point_of()
    rng = np.random.default_rng(SEED0)
    boot = {}
    for _ in range(B):
        pick = {kk: rng.integers(0, SEEDS, SEEDS) for kk in raw}
        pt = point_of(pick)
        for fam, m in fm:
            for c, sh, v in conds(fam):
                for q in MEASURES:
                    boot.setdefault((fam, m, c, sh, v, q), []).append(pt[(fam, m, c, sh, v)][q])
        for fam, m, sh, v in effect_keys():
            for kk, x in effects(pt, fam, m, sh, v).items():
                boot.setdefault((fam, m, sh, v) + kk, []).append(x)

    def ci(k):
        v = [x for x in boot[k] if x == x]
        return tuple(float(x) for x in np.quantile(v, [0.025, 0.975])) if v else (float("nan"),) * 2

    out = []
    P = out.append
    P("Milestone 6e: 6d's four arms (none, control, crowd-side, lateral-goal robots) in ORCA, and a robot-speed "
      "sweep in collision-free speed")
    P(f"HERMES 3.6 m corridor, {M5.LENGTH:.0f} m; {SEEDS} seeds per cell (SEED0 {SEED0}); {DURATION:.0f} s runs, "
      f"the first {M5.WARMUP:.0f} s warm-up; beta = multiplier x fitted (ORCA 1.0, collision-free speed 0.2); "
      f"bootstrap B = {B} over seeds; runs pooled by the mean of their cell means")
    P("")
    P("== Cells, pooled over the two runs (people only; 95% bootstrap interval); v = robot speed (m/s)")
    for fam, m in fm:
        for c, sh, v in conds(fam):
            q = point[(fam, m, c, sh, v)]
            s = "  ".join(f"{n} {q[n]:.3f} [{ci((fam, m, c, sh, v, n))[0]:.3f}, {ci((fam, m, c, sh, v, n))[1]:.3f}]"
                          for n in MEASURES)
            P(f"  {fam:4s} x{m:<4} {c:8s} {sh:.2f} v{v:.1f}  {s}")
    P("")
    P("== Effects (seed = crowd - control, side = crowd - goal, body = goal - control, density = control - none)")
    eff = {}
    for fam, m, sh, v in effect_keys():
        for (kind, q), x in effects(point, fam, m, sh, v).items():
            lo, hi = ci((fam, m, sh, v, kind, q))
            eff[(fam, m, sh, v, kind, q)] = (x, lo, hi)
        for q in MEASURES:
            P(f"  {fam:4s} x{m:<4} share {sh:.2f} v{v:.1f} {q:7s} " + "  ".join(
                f"{kind} {eff[(fam, m, sh, v, kind, q)][0]:+.3f} [{eff[(fam, m, sh, v, kind, q)][1]:+.3f}, "
                f"{eff[(fam, m, sh, v, kind, q)][2]:+.3f}]" for kind in KINDS))
    P("")
    P("Predictions (LOG.md, milestone 6e):")
    lines, _ = verdicts(eff)
    out.extend(lines)
    text = "\n".join(out) + "\n"
    print(text)
    tag = "_smoke" if SMOKE else ""
    with open(os.path.join(HERE, f"m6e_orca_speed_results{tag}.txt"), "w") as f:
        f.write(text)
    with open(os.path.join(HERE, f"m6e_orca_speed_runs{tag}.csv"), "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["family", "mult", "beta", "run", "N", "condition", "share", "robot_speed", "people", "robots",
                    "seeds_ok", "transit", "lane", "share_right"])
        for fam, m, run, ent, n, c, sh, v in cells():
            na, nr = agents(n, c, sh)
            s = cell_means(raw[(fam, m, run, c, sh, v)])
            w.writerow([fam, m, f"{FITTED[fam] * m:.3f}", run, n, c, sh, v, na - nr, nr, s["ok"],
                        f"{s['transit']:.4f}", f"{s['lane']:.4f}", f"{s['share']:.4f}"])


if __name__ == "__main__":
    main()
