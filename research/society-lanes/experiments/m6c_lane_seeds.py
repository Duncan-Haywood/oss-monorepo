"""Milestone 6c: do crowd-side robots seed lanes in a weak-convention crowd, or is it only lower density?

Predictions S1 to S6 are in LOG.md, written before this script's full run.

Milestone 6a read, after its run and unregistered, that in the half-bias social-force crowd
crowd-side robots at 20% *cut* people's transit by 1.59 s (0.06 s at the fitted bias) and raised
people's lane order from 0.756 to 0.873. Robots there replace people at a fixed agent count, so the
same cells also have fewer people. This step separates the two with a density-matched control:

* none:      N people, no robots (6a's baseline);
* control:   N - k people, no robots (the same people count as the robot cells, nobody replaced);
* crowd:     N - k people plus k robots that hold the crowd's side (robots.py "crowd");
* opposite:  N - k people plus k robots that hold the other side (a contrast that should hurt).

k = n_robots(N, share) at shares 10% and 20%. The seeding effect is crowd - control, the density
effect control - none. Family: social force (JuPedSim 1.4.2, fitted beta 0.1, milestone 3), the one
family in which halving the bias moved the crowd toward the street convention (6a, R7). The side
bias is swept at 0.25, 0.5, 0.75 and 1.0 times the fitted value (README, Next steps 2: sweep the human
side bias toward the street value 0.65). Two HERMES 3.6 m runs with milestone 3's calibrated walker
counts (bo-360-090-090, N 30; bo-360-160-160, N 60); robots 1.2 m/s; 120 s runs, the first 40 s
warm-up; 20 fresh seeds per cell (SEED0 20280000, disjoint from 5a, 5b and 6a).

People-only measures (sftwin.measure excludes robots): mean transit time of the 8 m section, lane
order, share on own right. Cell values are means over seeds; the two runs are pooled by the mean of
their cell values. Intervals: percentile bootstrap, seeds resampled within each cell independently
(B = 2000).

Writes m6c_lane_seeds_results.txt and m6c_lane_seeds_runs.csv (one row per cell).

Needs jupedsim and numpy: PY=$(python3 platform/ci/pyenv.py jupedsim numpy), then
  "$PY" experiments/m6c_lane_seeds.py   (cached in data_cache/m6c_cache.json)
M6C_SEEDS and M6C_DURATION shorten a smoke run (its cache file is separate).
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

SEED0 = 20280000
SEEDS = int(os.environ.get("M6C_SEEDS", "20"))
DURATION = float(os.environ.get("M6C_DURATION", str(M5.DURATION)))
BETA_FIT = 0.1                                   # social force, milestone 3
MULTS = [0.25, 0.5, 0.75, 1.0]
RUNS = [("bo-360-090-090", 0.9, 30), ("bo-360-160-160", 1.6, 60)]
SHARES = [0.10, 0.20]
CONDS = ["control", "crowd", "opposite"]
SPEED = M5.SPEED
B = 2000
MEASURES = ["transit", "lane", "share"]


def key(*a):
    return "|".join(str(x) for x in a)


def cells():
    for m in MULTS:
        for run, ent, n in RUNS:
            yield m, run, ent, n, "none", 0.0
            for sh in SHARES:
                for c in CONDS:
                    yield m, run, ent, n, c, sh


def agents(n, cond, sh):
    """(agents simulated, robots among them) for a cell."""
    if cond == "none":
        return n, 0
    k = M5.n_robots(n, sh)
    return (n - k, 0) if cond == "control" else (n, k)


def jobs():
    out = []
    for m, run, ent, n, cond, sh in cells():
        na, nr = agents(n, cond, sh)
        for s in range(SEEDS):
            out.append((key(m, run, n, cond, sh, s), ent, na, BETA_FIT * m, nr,
                        cond if nr else "crowd", SEED0 + s))
    return out


def _sim(job):
    import sftwin as S
    k, ent, na, beta, nr, pol, seed = job
    r = S.simulate(na, M5.WIDTH, M5.LENGTH, ent, beta, seed, duration=DURATION, warmup=M5.WARMUP,
                   model="sf", robots=nr, policy=pol, robot_speed=SPEED, passes=bool(nr))
    r.pop("flags")
    return k, {a: (float(b) if isinstance(b, (int, float, np.floating, np.integer)) else b) for a, b in r.items()}


def cell_means(rs):
    """Seed means of the people-only measures for one cell; failed runs are dropped."""
    ok = [r for r in rs if not r.get("failed")]
    return {q: M5.nanmean([r[q] for r in ok]) for q in MEASURES} | {"ok": len(ok)}


def pooled(per_run):
    """Pool one (multiplier, condition, share) over runs: the mean of the runs' cell means."""
    return {q: M5.nanmean([c[q] for c in per_run]) for q in MEASURES}


def effects(pt, m, sh):
    """Seeding (crowd - control), density (control - none), total (crowd - none), opposite - control."""
    g = lambda c, s: pt[(m, c, s)]  # noqa: E731
    out = {}
    for q in MEASURES:
        out[("seed", q)] = g("crowd", sh)[q] - g("control", sh)[q]
        out[("density", q)] = g("control", sh)[q] - g("none", 0.0)[q]
        out[("total", q)] = g("crowd", sh)[q] - g("none", 0.0)[q]
        out[("opp", q)] = g("opposite", sh)[q] - g("control", sh)[q]
    return out


def conds():
    return [("none", 0.0)] + [(c, s) for s in SHARES for c in CONDS]


def main():
    os.makedirs(M5.CACHE, exist_ok=True)
    cname = "m6c_cache.json" if (SEEDS, DURATION) == (20, M5.DURATION) else f"m6c_smoke_{SEEDS}_{DURATION:.0f}.json"
    cpath = os.path.join(M5.CACHE, cname)
    cache = json.load(open(cpath)) if os.path.exists(cpath) else {}
    js = jobs()
    todo = sorted([j for j in js if j[0] not in cache], key=lambda j: -j[2])
    print(f"{len(js)} runs, {len(todo)} to simulate", flush=True)
    with mp.Pool(int(os.environ.get("M5_PROCS", "4"))) as pool:
        for i, (k, r) in enumerate(pool.imap_unordered(_sim, todo, chunksize=2)):
            cache[k] = r
            if i % 100 == 0:
                print(f"  {i + 1}/{len(todo)}", flush=True)
                json.dump(cache, open(cpath, "w"))
    json.dump(cache, open(cpath, "w"))

    raw = {(m, run, c, sh): [cache[key(m, run, n, c, sh, s)] for s in range(SEEDS)]
           for m, run, ent, n, c, sh in cells()}

    def point_of(pick=None):
        pt = {}
        for m in MULTS:
            for c, sh in conds():
                per = []
                for run, _, _ in RUNS:
                    rs = raw[(m, run, c, sh)]
                    if pick is not None:
                        rs = [rs[i] for i in pick[(m, run, c, sh)]]
                    per.append(cell_means(rs))
                pt[(m, c, sh)] = pooled(per)
        return pt

    point = point_of()
    rng = np.random.default_rng(SEED0)
    boot = {}
    for _ in range(B):
        pick = {kk: rng.integers(0, SEEDS, SEEDS) for kk in raw}
        pt = point_of(pick)
        for m in MULTS:
            for c, sh in conds():
                for q in MEASURES:
                    boot.setdefault((m, c, sh, q), []).append(pt[(m, c, sh)][q])
            for sh in SHARES:
                for kk, v in effects(pt, m, sh).items():
                    boot.setdefault((m, sh) + kk, []).append(v)

    def ci(k):
        v = [x for x in boot[k] if x == x]
        return tuple(float(x) for x in np.quantile(v, [0.025, 0.975])) if v else (float("nan"),) * 2

    out = []
    P = out.append
    P("Milestone 6c: crowd-side robots as lane seeds, against a density-matched control (social force)")
    P(f"HERMES 3.6 m corridor, {M5.LENGTH:.0f} m; {SEEDS} seeds per cell (SEED0 {SEED0}); {DURATION:.0f} s runs, "
      f"the first {M5.WARMUP:.0f} s warm-up; robots {SPEED} m/s; beta = multiplier x {BETA_FIT}; "
      f"bootstrap B = {B} over seeds; runs pooled by the mean of their cell means")
    P("")
    P("== Cells, pooled over the two runs (people only; 95% bootstrap interval)")
    for m in MULTS:
        for c, sh in conds():
            q = point[(m, c, sh)]
            s = "  ".join(f"{n} {q[n]:.3f} [{ci((m, c, sh, n))[0]:.3f}, {ci((m, c, sh, n))[1]:.3f}]" for n in MEASURES)
            P(f"  x{m:<4} beta {BETA_FIT * m:.3f} {c:8s} {sh:.2f}  {s}")
    P("")
    P("== Effects (seed = crowd - control, density = control - none, total = crowd - none, "
      "opp = opposite - control)")
    eff = {}
    for m in MULTS:
        for sh in SHARES:
            e = effects(point, m, sh)
            for (kind, q), v in e.items():
                lo, hi = ci((m, sh, kind, q))
                eff[(m, sh, kind, q)] = (v, lo, hi)
            P(f"  x{m:<4} share {sh:.2f}  " + "  ".join(
                f"{kind}-{q} {eff[(m, sh, kind, q)][0]:+.3f} [{eff[(m, sh, kind, q)][1]:+.3f}, "
                f"{eff[(m, sh, kind, q)][2]:+.3f}]" for kind in ("seed", "density", "total", "opp")
                for q in ("transit", "lane")))
    P("")
    P("Predictions (LOG.md, milestone 6c):")
    v, lo, hi = eff[(0.5, 0.20, "seed", "transit")]
    P(f"S1 (x0.5, 20%: crowd-side robots shorten people's transit against the density-matched control, "
      f"95% interval below 0): {'held' if hi < 0 else 'refuted'} ({v:+.3f} s [{lo:+.3f}, {hi:+.3f}])")
    v, lo, hi = eff[(0.5, 0.20, "seed", "lane")]
    P(f"S2 (x0.5, 20%: crowd-side robots raise people's lane order against the control, interval above 0): "
      f"{'held' if lo > 0 else 'refuted'} ({v:+.3f} [{lo:+.3f}, {hi:+.3f}])")
    tot = eff[(0.5, 0.20, "total", "transit")][0]
    den = eff[(0.5, 0.20, "density", "transit")][0]
    frac = den / tot if tot else float("nan")
    P(f"S3 (x0.5, 20%: density alone is less than half of the total transit change, and the total is a cut): "
      f"{'held' if tot < 0 and frac < 0.5 else 'refuted'} (total {tot:+.3f} s, density {den:+.3f} s, "
      f"fraction {frac:.2f})")
    lowm = [eff[(m, sh, "seed", "transit")][0] for m in (0.25, 0.5) for sh in SHARES]
    fit = [eff[(1.0, sh, "seed", "transit")][0] for sh in SHARES]
    s4 = min(lowm) < min(fit) and np.mean(lowm) < np.mean(fit)
    P(f"S4 (the transit seeding effect is more negative at x0.25 and x0.5 than at x1.0): "
      f"{'held' if s4 else 'refuted'} (x0.25/x0.5 " + ", ".join(f"{x:+.3f}" for x in lowm)
      + "; x1.0 " + ", ".join(f"{x:+.3f}" for x in fit) + ")")
    opp = [(m, sh, eff[(m, sh, "opp", "transit")]) for m in MULTS for sh in SHARES]
    nopp = sum(1 for *_, (v, lo, hi) in opp if lo > 0)
    P(f"S5 (opposite-side robots lengthen people's transit against the control, interval above 0, in all 8 "
      f"multiplier-share cells): {'held' if nopp == 8 else 'refuted'} ({nopp} of 8)")
    sh25 = point[(0.25, "none", 0.0)]["share"]
    P(f"S6 (x0.25, no robots: share on own right below 0.75): {'held' if sh25 < 0.75 else 'refuted'} ({sh25:.3f})")
    text = "\n".join(out) + "\n"
    print(text)
    tag = "" if (SEEDS, DURATION) == (20, M5.DURATION) else "_smoke"
    with open(os.path.join(HERE, f"m6c_lane_seeds_results{tag}.txt"), "w") as f:
        f.write(text)
    with open(os.path.join(HERE, f"m6c_lane_seeds_runs{tag}.csv"), "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["mult", "beta", "run", "N", "condition", "share", "people", "robots", "seeds_ok",
                    "transit", "lane", "share_right"])
        for m, run, ent, n, c, sh in cells():
            na, nr = agents(n, c, sh)
            s = cell_means(raw[(m, run, c, sh)])
            w.writerow([m, f"{BETA_FIT * m:.3f}", run, n, c, sh, na - nr, nr, s["ok"],
                        f"{s['transit']:.4f}", f"{s['lane']:.4f}", f"{s['share']:.4f}"])


if __name__ == "__main__":
    main()
