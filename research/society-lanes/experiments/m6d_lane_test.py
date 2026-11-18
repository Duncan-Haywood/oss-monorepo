"""Milestone 6d: a registered test of the lane-order gain from crowd-side robots, with a same-bodies control.

Predictions T1 to T7 are in LOG.md, written before this script's full run.

Milestone 6c found, after its run and unregistered, that at 20% robots crowd-side robots raised people's
lane order beyond a density-matched control in the social-force crowd at 0.25x (+0.080) and 0.75x
(+0.055) the fitted side bias. That control (N - k people, no robots) differs from the robot cells in two
ways: the robots hold the crowd's side, and they are k extra bodies in the corridor. This step tests the
gain on fresh seeds and separates the two with a third arm:

* none:     N people, no robots;
* control:  N - k people, no robots (6c's density-matched control);
* crowd:    N - k people plus k robots that hold the crowd's side (robots.py "crowd");
* goal:     N - k people plus k robots with a lateral goal drawn 50/50 per entry (robots.py "goal"):
            the same bodies at the same speed, without side-holding.

Effects: seed = crowd - control (6c's definition), side = crowd - goal (side-holding with bodies held
fixed), body = goal - control (bodies with no side-holding), density = control - none.

Families: social force (JuPedSim 1.4.2, fitted beta 0.1, milestone 3) at 0.25, 0.5 and 0.75 times the
fitted bias; collision-free speed (fitted beta 0.2, milestone 4b) at 0.25 and 0.5 times, the 6c
left-over (its crowd barely moved at half bias in 6a). Two HERMES 3.6 m runs with the calibrated walker
counts of m5_robots.RUNS; shares 20% and 30%; robots 1.2 m/s; 120 s runs, the first 40 s warm-up;
40 fresh seeds per cell (SEED0 20300000, disjoint from 5a to 6c).

People-only measures (sftwin.measure excludes robots): transit time of the 8 m section, lane order,
share on own right. Cell values are seed means; the two runs are pooled by the mean of their cell
means. Intervals: percentile bootstrap, seeds resampled within each cell (B = 2000).

Writes m6d_lane_test_results.txt and m6d_lane_test_runs.csv.

Needs jupedsim and numpy: PY=$(python3 platform/ci/pyenv.py jupedsim numpy), then
  "$PY" experiments/m6d_lane_test.py   (cached in data_cache/m6d_cache.json)
M6D_SEEDS and M6D_DURATION shorten a smoke run (its outputs carry _smoke).
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

SEED0 = 20300000
FULL_SEEDS = 40
SEEDS = int(os.environ.get("M6D_SEEDS", str(FULL_SEEDS)))
DURATION = float(os.environ.get("M6D_DURATION", str(M5.DURATION)))
SMOKE = (SEEDS, DURATION) != (FULL_SEEDS, M5.DURATION)
FAMS = {"sf": (0.1, [0.25, 0.5, 0.75]), "cfsm": (0.2, [0.25, 0.5])}
SHARES = [0.20, 0.30]
CONDS = ["control", "crowd", "goal"]
SPEED = M5.SPEED
B = 2000
MEASURES = ["transit", "lane", "share"]
KINDS = ("seed", "side", "body", "density")


def key(*a):
    return "|".join(str(x) for x in a)


def runs(fam):
    return [(run, ent, ns[fam]) for run, ent, ns in M5.RUNS]


def conds():
    return [("none", 0.0)] + [(c, s) for s in SHARES for c in CONDS]


def cells():
    for fam, (_, mults) in FAMS.items():
        for m in mults:
            for run, ent, n in runs(fam):
                for c, sh in conds():
                    yield fam, m, run, ent, n, c, sh


def agents(n, cond, sh):
    """(agents simulated, robots among them) for a cell."""
    if cond == "none":
        return n, 0
    k = M5.n_robots(n, sh)
    return (n - k, 0) if cond == "control" else (n, k)


def jobs():
    out = []
    for fam, m, run, ent, n, c, sh in cells():
        na, nr = agents(n, c, sh)
        beta = FAMS[fam][0] * m
        for s in range(SEEDS):
            out.append((key(fam, m, run, n, c, sh, s), fam, ent, na, beta, nr,
                        c if nr else "crowd", SEED0 + s))
    return out


def _sim(job):
    import sftwin as S
    k, fam, ent, na, beta, nr, pol, seed = job
    r = S.simulate(na, M5.WIDTH, M5.LENGTH, ent, beta, seed, duration=DURATION, warmup=M5.WARMUP,
                   model=fam, robots=nr, policy=pol, robot_speed=SPEED, passes=bool(nr))
    r.pop("flags")
    return k, {a: (float(b) if isinstance(b, (int, float, np.floating, np.integer)) else b) for a, b in r.items()}


def cell_means(rs):
    """Seed means of the people-only measures for one cell; failed runs are dropped."""
    ok = [r for r in rs if not r.get("failed")]
    return {q: M5.nanmean([r[q] for r in ok]) for q in MEASURES} | {"ok": len(ok)}


def pooled(per_run):
    return {q: M5.nanmean([c[q] for c in per_run]) for q in MEASURES}


def effects(pt, fam, m, sh):
    g = lambda c, s: pt[(fam, m, c, s)]  # noqa: E731
    out = {}
    for q in MEASURES:
        out[("seed", q)] = g("crowd", sh)[q] - g("control", sh)[q]
        out[("side", q)] = g("crowd", sh)[q] - g("goal", sh)[q]
        out[("body", q)] = g("goal", sh)[q] - g("control", sh)[q]
        out[("density", q)] = g("control", sh)[q] - g("none", 0.0)[q]
    return out


def verdicts(eff, point):
    """The registered predictions T1 to T7 from the effect table; returns (lines, dict of held flags)."""
    L, held = [], {}
    sf = FAMS["sf"][1]

    def iv(*k):
        v, lo, hi = eff[k]
        return f"{v:+.3f} [{lo:+.3f}, {hi:+.3f}]"

    c = [(m, eff[("sf", m, 0.20, "seed", "lane")]) for m in (0.25, 0.75)]
    held["T1"] = all(lo > 0 for _, (_, lo, _) in c)
    L.append("T1 (social force, 20%: crowd - control lane order, interval above 0 at x0.25 and x0.75): "
             + ("held" if held["T1"] else "refuted") + " (" + "; ".join(
                 f"x{m} {iv('sf', m, 0.20, 'seed', 'lane')}" for m, _ in c) + ")")
    held["T2"] = all(eff[("sf", m, 0.20, "side", "lane")][1] > 0 for m in sf)
    L.append("T2 (social force, 20%: crowd - goal lane order, interval above 0 at all three multipliers): "
             + ("held" if held["T2"] else "refuted") + " (" + "; ".join(
                 f"x{m} {iv('sf', m, 0.20, 'side', 'lane')}" for m in sf) + ")")
    held["T3"] = all(eff[("sf", m, 0.30, "seed", "lane")][0] > eff[("sf", m, 0.20, "seed", "lane")][0] for m in sf)
    L.append("T3 (social force: crowd - control lane order larger at 30% than at 20%, each multiplier, point): "
             + ("held" if held["T3"] else "refuted") + " (" + "; ".join(
                 f"x{m} {eff[('sf', m, 0.20, 'seed', 'lane')][0]:+.3f} -> {eff[('sf', m, 0.30, 'seed', 'lane')][0]:+.3f}"
                 for m in sf) + ")")
    held["T4"] = all(eff[("sf", m, 0.20, "seed", "transit")][2] >= 0 for m in sf)
    L.append("T4 (social force, 20%: no crowd - control transit interval wholly below 0, replicating 6c): "
             + ("held" if held["T4"] else "refuted") + " (" + "; ".join(
                 f"x{m} {iv('sf', m, 0.20, 'seed', 'transit')}" for m in sf) + ")")
    held["T5"] = any(eff[("sf", m, 0.30, "seed", "transit")][2] < 0 for m in sf)
    L.append("T5 (social force, 30%: crowd - control transit interval below 0 at one multiplier or more): "
             + ("held" if held["T5"] else "refuted") + " (" + "; ".join(
                 f"x{m} {iv('sf', m, 0.30, 'seed', 'transit')}" for m in sf) + ")")
    s = point[("cfsm", 0.25, "none", 0.0)]["share"]
    held["T6"] = s > 0.85
    L.append(f"T6 (collision-free speed, x0.25, no robots: share on own right above 0.85): "
             f"{'held' if held['T6'] else 'refuted'} ({s:.3f})")
    cf = [(m, sh) for m in FAMS["cfsm"][1] for sh in SHARES]
    held["T7"] = all(eff[("cfsm", m, sh, "seed", "lane")][1] <= 0 <= eff[("cfsm", m, sh, "seed", "lane")][2]
                     for m, sh in cf)
    L.append("T7 (collision-free speed: crowd - control lane order interval contains 0 in all 4 cells): "
             + ("held" if held["T7"] else "refuted") + " (" + "; ".join(
                 f"x{m} {sh:.2f} {iv('cfsm', m, sh, 'seed', 'lane')}" for m, sh in cf) + ")")
    return L, held


def main():
    os.makedirs(M5.CACHE, exist_ok=True)
    cname = f"m6d_smoke_{SEEDS}_{DURATION:.0f}.json" if SMOKE else "m6d_cache.json"
    cpath = os.path.join(M5.CACHE, cname)
    cache = json.load(open(cpath)) if os.path.exists(cpath) else {}
    js = jobs()
    todo = sorted([j for j in js if j[0] not in cache], key=lambda j: -j[3])
    print(f"{len(js)} runs, {len(todo)} to simulate", flush=True)
    with mp.Pool(int(os.environ.get("M5_PROCS", "4"))) as pool:
        for i, (k, r) in enumerate(pool.imap_unordered(_sim, todo, chunksize=2)):
            cache[k] = r
            if i % 100 == 0:
                print(f"  {i + 1}/{len(todo)}", flush=True)
                json.dump(cache, open(cpath, "w"))
    json.dump(cache, open(cpath, "w"))

    raw = {(fam, m, run, c, sh): [cache[key(fam, m, run, n, c, sh, s)] for s in range(SEEDS)]
           for fam, m, run, ent, n, c, sh in cells()}
    fm = [(fam, m) for fam, (_, ms) in FAMS.items() for m in ms]

    def point_of(pick=None):
        pt = {}
        for fam, m in fm:
            for c, sh in conds():
                per = []
                for run, _, _ in runs(fam):
                    rs = raw[(fam, m, run, c, sh)]
                    if pick is not None:
                        rs = [rs[i] for i in pick[(fam, m, run, c, sh)]]
                    per.append(cell_means(rs))
                pt[(fam, m, c, sh)] = pooled(per)
        return pt

    point = point_of()
    rng = np.random.default_rng(SEED0)
    boot = {}
    for _ in range(B):
        pick = {kk: rng.integers(0, SEEDS, SEEDS) for kk in raw}
        pt = point_of(pick)
        for fam, m in fm:
            for c, sh in conds():
                for q in MEASURES:
                    boot.setdefault((fam, m, c, sh, q), []).append(pt[(fam, m, c, sh)][q])
            for sh in SHARES:
                for kk, v in effects(pt, fam, m, sh).items():
                    boot.setdefault((fam, m, sh) + kk, []).append(v)

    def ci(k):
        v = [x for x in boot[k] if x == x]
        return tuple(float(x) for x in np.quantile(v, [0.025, 0.975])) if v else (float("nan"),) * 2

    out = []
    P = out.append
    P("Milestone 6d: registered test of the lane-order gain from crowd-side robots, with a same-bodies "
      "(lateral-goal robot) control")
    P(f"HERMES 3.6 m corridor, {M5.LENGTH:.0f} m; {SEEDS} seeds per cell (SEED0 {SEED0}); {DURATION:.0f} s runs, "
      f"the first {M5.WARMUP:.0f} s warm-up; robots {SPEED} m/s; beta = multiplier x fitted "
      f"(social force 0.1, collision-free speed 0.2); bootstrap B = {B} over seeds; runs pooled by the mean of "
      f"their cell means")
    P("")
    P("== Cells, pooled over the two runs (people only; 95% bootstrap interval)")
    for fam, m in fm:
        for c, sh in conds():
            q = point[(fam, m, c, sh)]
            s = "  ".join(f"{n} {q[n]:.3f} [{ci((fam, m, c, sh, n))[0]:.3f}, {ci((fam, m, c, sh, n))[1]:.3f}]"
                          for n in MEASURES)
            P(f"  {fam:4s} x{m:<4} {c:8s} {sh:.2f}  {s}")
    P("")
    P("== Effects (seed = crowd - control, side = crowd - goal, body = goal - control, density = control - none)")
    eff = {}
    for fam, m in fm:
        for sh in SHARES:
            for (kind, q), v in effects(point, fam, m, sh).items():
                lo, hi = ci((fam, m, sh, kind, q))
                eff[(fam, m, sh, kind, q)] = (v, lo, hi)
            for q in MEASURES:
                P(f"  {fam:4s} x{m:<4} share {sh:.2f} {q:7s} " + "  ".join(
                    f"{kind} {eff[(fam, m, sh, kind, q)][0]:+.3f} [{eff[(fam, m, sh, kind, q)][1]:+.3f}, "
                    f"{eff[(fam, m, sh, kind, q)][2]:+.3f}]" for kind in KINDS))
    P("")
    P("Predictions (LOG.md, milestone 6d):")
    lines, _ = verdicts(eff, point)
    out.extend(lines)
    text = "\n".join(out) + "\n"
    print(text)
    tag = "_smoke" if SMOKE else ""
    with open(os.path.join(HERE, f"m6d_lane_test_results{tag}.txt"), "w") as f:
        f.write(text)
    with open(os.path.join(HERE, f"m6d_lane_test_runs{tag}.csv"), "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["family", "mult", "beta", "run", "N", "condition", "share", "people", "robots", "seeds_ok",
                    "transit", "lane", "share_right"])
        for fam, m, run, ent, n, c, sh in cells():
            na, nr = agents(n, c, sh)
            s = cell_means(raw[(fam, m, run, c, sh)])
            w.writerow([fam, m, f"{FAMS[fam][0] * m:.3f}", run, n, c, sh, na - nr, nr, s["ok"],
                        f"{s['transit']:.4f}", f"{s['lane']:.4f}", f"{s['share']:.4f}"])


if __name__ == "__main__":
    main()
