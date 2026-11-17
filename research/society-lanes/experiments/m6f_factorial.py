"""Milestone 6f: why do crowd-side robots slow people in two of three twins? A 2 x 2 factorial on the robot.

Predictions V1 to V7 are in LOG.md, written before this script's full run.

6d and 6e found that robots holding the crowd's side slow people against a density-matched control in
collision-free speed and ORCA, and speed them up in social force. A robot here differs from a person in
exactly two ways (robots.py): its steering (a fixed lane line a quarter of the width from its right wall,
instead of the people's rule: keep your line, veer right by beta when someone comes at you) and its speed
(a 1.2 m/s cap, instead of a desired speed drawn from Weidmann's 1.34 +/- 0.26 m/s). 6e's speed sweep
moved the cap alone; this step crosses the two at a fixed total agent count N:

* none:    N people;
* control: N - k people (density-matched, as 6d and 6e);
* hp:      N - k people + k robots on the people's steering and the people's speed draw (a labelled person);
* hc:      people's steering, 1.2 m/s cap;
* lp:      crowd-side line, people's speed draw;
* lc:      crowd-side line, 1.2 m/s cap (6d/6e's "crowd").

Effects on people-only measures: steer = ((lp - hp) + (lc - hc)) / 2, cap = ((hc - hp) + (lc - lp)) / 2,
inter = (lc - lp) - (hc - hp), robot = lc - hp (what turning a person into this robot costs the others),
seed = lc - control (6d/6e's effect, replicated), check = hp - none (should be 0: a labelled person).

Settings: social force at 0.75x its fitted bias (beta 0.075; 6d's clearest speed-up), collision-free speed
at 0.5x (0.1; 6e Part B), ORCA at 0.02x (street-like, 6e's largest slow-down) and 1.0x (fitted). 20% robots;
two HERMES 3.6 m runs with m6e's walker counts; 40 fresh seeds per cell (SEED0 20320000, disjoint from 5a to
6e); 120 s runs, first 40 s warm-up; 48 cells, 1,920 runs. Cell values are seed means, runs pooled by the mean
of their cell means; percentile bootstrap over seeds within each cell (B = 2000).

Writes m6f_factorial_results.txt and m6f_factorial_runs.csv. Needs jupedsim, numpy, numba:
PY=$(python3 platform/ci/pyenv.py jupedsim numpy numba), then "$PY" experiments/m6f_factorial.py
(cached in data_cache/m6f_cache.json). M6F_SEEDS and M6F_DURATION shorten a smoke run (outputs carry _smoke).
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
import robots as R  # noqa: E402

SEED0 = 20320000
FULL_SEEDS = 40
SEEDS = int(os.environ.get("M6F_SEEDS", str(FULL_SEEDS)))
DURATION = float(os.environ.get("M6F_DURATION", str(M5.DURATION)))
SMOKE = (SEEDS, DURATION) != (FULL_SEEDS, M5.DURATION)
FITTED = {"sf": 0.1, "cfsm": 0.2, "orca": 1.0}
SETTINGS = [("sf", 0.75), ("cfsm", 0.5), ("orca", 0.02), ("orca", 1.0)]
NCOUNT = {"sf": (30, 60), "cfsm": (20, 60), "orca": (30, 60)}
SHARE = 0.20
# robot arms: (steering policy, speed setting)
ARMS = {"hp": (R.HUMAN, R.PEOPLE_SPEED), "hc": (R.HUMAN, M5.SPEED),
        "lp": ("crowd", R.PEOPLE_SPEED), "lc": ("crowd", M5.SPEED)}
CONDS = ("none", "control") + tuple(ARMS)
B = 2000
MEASURES = ["transit", "lane", "share"]
KINDS = ("steer", "cap", "inter", "robot", "seed", "check")
NAMES = {"sf": "social force", "cfsm": "collision-free speed", "orca": "ORCA"}


def key(*a):
    return "|".join(str(x) for x in a)


def runs(fam):
    return [(run, ent, NCOUNT[fam][i]) for i, (run, ent, _) in enumerate(M5.RUNS)]


def cells():
    for fam, m in SETTINGS:
        for run, ent, n in runs(fam):
            for c in CONDS:
                yield fam, m, run, ent, n, c


def agents(n, cond):
    """(agents simulated, robots among them)."""
    if cond == "none":
        return n, 0
    k = M5.n_robots(n, SHARE)
    return (n - k, 0) if cond == "control" else (n, k)


def jobs():
    out = []
    for fam, m, run, ent, n, c in cells():
        na, nr = agents(n, c)
        pol, v = ARMS.get(c, ("crowd", M5.SPEED))
        for s in range(SEEDS):
            out.append((key(fam, m, run, n, c, s), fam, ent, na, FITTED[fam] * m, nr, pol, v, SEED0 + s))
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


def effects(pt, fam, m):
    g = lambda c: pt[(fam, m, c)]  # noqa: E731
    out = {}
    for q in MEASURES:
        hp, hc, lp, lc = (g(a)[q] for a in ("hp", "hc", "lp", "lc"))
        out[("steer", q)] = ((lp - hp) + (lc - hc)) / 2
        out[("cap", q)] = ((hc - hp) + (lc - lp)) / 2
        out[("inter", q)] = (lc - lp) - (hc - hp)
        out[("robot", q)] = lc - hp
        out[("seed", q)] = lc - g("control")[q]
        out[("check", q)] = hp - g("none")[q]
    return out


def verdicts(eff):
    """The registered predictions V1 to V7; returns (lines, dict of held flags)."""
    L, held = [], {}
    slow = [("cfsm", 0.5), ("orca", 0.02)]

    def e(fam, m, kind, q="transit"):
        return eff[(fam, m, kind, q)]

    def iv(fam, m, kind, q="transit"):
        v, lo, hi = e(fam, m, kind, q)
        return f"{fam} x{m} {v:+.3f} [{lo:+.3f}, {hi:+.3f}]"

    def say(name, text, ok, detail):
        held[name] = ok
        L.append(f"{name} ({text}): {'held' if ok else 'refuted'} ({detail})")

    say("V1", "check (hp - none) transit interval contains 0 in all four settings",
        all(e(f, m, "check")[1] <= 0 <= e(f, m, "check")[2] for f, m in SETTINGS),
        "; ".join(iv(f, m, "check") for f, m in SETTINGS))
    say("V2", "seed (lc - control) transit interval above 0 in cfsm x0.5 and orca x0.02, below 0 in sf x0.75",
        all(e(f, m, "seed")[1] > 0 for f, m in slow) and e("sf", 0.75, "seed")[2] < 0,
        "; ".join(iv(f, m, "seed") for f, m in SETTINGS))
    say("V3", "robot (lc - hp) transit interval above 0 in cfsm x0.5 and orca x0.02",
        all(e(f, m, "robot")[1] > 0 for f, m in slow), "; ".join(iv(f, m, "robot") for f, m in slow))
    say("V4", "steer transit interval above 0 and larger than the cap effect (points) in cfsm x0.5 and orca x0.02",
        all(e(f, m, "steer")[1] > 0 and e(f, m, "steer")[0] > e(f, m, "cap")[0] for f, m in slow),
        "; ".join(f"steer {iv(f, m, 'steer')}, cap {e(f, m, 'cap')[0]:+.3f}" for f, m in slow))
    say("V5", "cap transit interval contains 0 in cfsm x0.5",
        e("cfsm", 0.5, "cap")[1] <= 0 <= e("cfsm", 0.5, "cap")[2], iv("cfsm", 0.5, "cap"))
    say("V6", "sf x0.75: steer transit interval below 0",
        e("sf", 0.75, "steer")[2] < 0, iv("sf", 0.75, "steer"))
    say("V7", "sf x0.75: steer lane order interval above 0",
        e("sf", 0.75, "steer", "lane")[1] > 0, iv("sf", 0.75, "steer", "lane"))
    return L, held


def main():
    os.makedirs(M5.CACHE, exist_ok=True)
    cname = f"m6f_smoke_{SEEDS}_{DURATION:.0f}.json" if SMOKE else "m6f_cache.json"
    cpath = os.path.join(M5.CACHE, cname)
    cache = json.load(open(cpath)) if os.path.exists(cpath) else {}
    js = jobs()
    todo = sorted([j for j in js if j[0] not in cache], key=lambda j: (j[1] != "sf", -j[3]))
    print(f"{len(js)} runs, {len(todo)} to simulate", flush=True)
    with mp.Pool(int(os.environ.get("M5_PROCS", "4"))) as pool:
        for i, (k, r) in enumerate(pool.imap_unordered(_sim, todo, chunksize=2)):
            cache[k] = r
            if i % 100 == 0:
                print(f"  {i + 1}/{len(todo)}", flush=True)
                json.dump(cache, open(cpath, "w"))
    json.dump(cache, open(cpath, "w"))

    raw = {(fam, m, run, c): [cache[key(fam, m, run, n, c, s)] for s in range(SEEDS)]
           for fam, m, run, ent, n, c in cells()}

    def point_of(pick=None):
        pt = {}
        for fam, m in SETTINGS:
            for c in CONDS:
                per = []
                for run, _, _ in runs(fam):
                    rs = raw[(fam, m, run, c)]
                    if pick is not None:
                        rs = [rs[i] for i in pick[(fam, m, run, c)]]
                    per.append(cell_means(rs))
                pt[(fam, m, c)] = {q: M5.nanmean([p[q] for p in per]) for q in MEASURES}
        return pt

    point = point_of()
    rng = np.random.default_rng(SEED0)
    boot = {}
    for _ in range(B):
        pick = {kk: rng.integers(0, SEEDS, SEEDS) for kk in raw}
        pt = point_of(pick)
        for fam, m in SETTINGS:
            for c in CONDS:
                for q in MEASURES:
                    boot.setdefault((fam, m, c, q), []).append(pt[(fam, m, c)][q])
            for kk, x in effects(pt, fam, m).items():
                boot.setdefault((fam, m) + kk, []).append(x)

    def ci(k):
        v = [x for x in boot[k] if x == x]
        return tuple(float(x) for x in np.quantile(v, [0.025, 0.975])) if v else (float("nan"),) * 2

    out = []
    P = out.append
    P("Milestone 6f: a 2 x 2 factorial on the robot (steering: people's rule or crowd-side line; speed: people's "
      "draw or 1.2 m/s cap) at 20% robots")
    P(f"HERMES 3.6 m corridor, {M5.LENGTH:.0f} m; {SEEDS} seeds per cell (SEED0 {SEED0}); {DURATION:.0f} s runs, "
      f"the first {M5.WARMUP:.0f} s warm-up; beta = multiplier x fitted (sf 0.1, cfsm 0.2, ORCA 1.0); bootstrap "
      f"B = {B} over seeds; runs pooled by the mean of their cell means")
    P("")
    P("== Cells, pooled over the two runs (people only; 95% bootstrap interval)")
    for fam, m in SETTINGS:
        for c in CONDS:
            q = point[(fam, m, c)]
            P(f"  {fam:4s} x{m:<4} {c:8s} " + "  ".join(
                f"{n} {q[n]:.3f} [{ci((fam, m, c, n))[0]:.3f}, {ci((fam, m, c, n))[1]:.3f}]" for n in MEASURES))
    P("")
    P("== Effects (steer, cap: factorial main effects; inter = (lc - lp) - (hc - hp); robot = lc - hp; "
      "seed = lc - control; check = hp - none)")
    eff = {}
    for fam, m in SETTINGS:
        for (kind, q), x in effects(point, fam, m).items():
            lo, hi = ci((fam, m, kind, q))
            eff[(fam, m, kind, q)] = (x, lo, hi)
        for q in MEASURES:
            P(f"  {fam:4s} x{m:<4} {q:7s} " + "  ".join(
                f"{kind} {eff[(fam, m, kind, q)][0]:+.3f} [{eff[(fam, m, kind, q)][1]:+.3f}, "
                f"{eff[(fam, m, kind, q)][2]:+.3f}]" for kind in KINDS))
    P("")
    P("== Robots' own median speed (m/s), mean over runs and seeds")
    for fam, m in SETTINGS:
        P(f"  {fam:4s} x{m:<4} " + "  ".join(
            f"{a} {M5.nanmean([r.get('robot_speed', float('nan')) for run, _, _ in runs(fam) for r in raw[(fam, m, run, a)] if not r.get('failed')]):.3f}"
            for a in ARMS))
    P("")
    P("Predictions (LOG.md, milestone 6f):")
    lines, _ = verdicts(eff)
    out.extend(lines)
    text = "\n".join(out) + "\n"
    print(text)
    tag = "_smoke" if SMOKE else ""
    with open(os.path.join(HERE, f"m6f_factorial_results{tag}.txt"), "w") as f:
        f.write(text)
    with open(os.path.join(HERE, f"m6f_factorial_runs{tag}.csv"), "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["family", "mult", "beta", "run", "N", "condition", "people", "robots", "seeds_ok",
                    "transit", "lane", "share_right"])
        for fam, m, run, ent, n, c in cells():
            na, nr = agents(n, c)
            s = cell_means(raw[(fam, m, run, c)])
            w.writerow([fam, m, f"{FITTED[fam] * m:.3f}", run, n, c, na - nr, nr, s["ok"],
                        f"{s['transit']:.4f}", f"{s['lane']:.4f}", f"{s['share']:.4f}"])


if __name__ == "__main__":
    main()
