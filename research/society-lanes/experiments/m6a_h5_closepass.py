"""Milestone 6a: H5 registered on the close-pass metric, fresh seeds, with a weaker human side bias.

Predictions R1 to R7 are in LOG.md, written before this script's full run.

Milestone 5b's preview found that the three families whose yielding bias passed the held-out share
test (social force, collision-free speed, ORCA) rank the four robot policies identically by
robot-person close passes (Kendall tau 1.00 in all 9 pair-share cells), but not by human delay per
robot pass. That preview reused the seeds of milestones 5a and 5b and had no interval on tau. This
step registers H5 on close passes as a confirmatory test:

* fresh seeds (SEED0 = 20270000, disjoint from 5a/5b's 20261116 + 0..19), 20 per cell;
* the three families at their fitted side bias (social force 0.1, collision-free speed 0.2, ORCA
  1.0) and, as the registered robustness axis, at half that bias ("weak"), a crowd whose own-right
  convention is weaker, toward the street value 0.65 of milestone 7 (README, Next steps 2 and 7);
* the same two HERMES 3.6 m runs and calibrated walker counts, the four policies at 5, 10 and 20%,
  robots at 1.2 m/s, 120 s runs whose first 40 s are warm-up (the `duration` argument is the
  whole run; LOG.md's "120 s after 40 s warm-up" for 5a and 5b means the same runs), as 5a and 5b;
* tau with a percentile bootstrap interval: seeds are resampled within each cell (each family,
  run, policy, share), the pass-weighted close-pass rate pooled over the two runs is recomputed,
  and tau-a between each pair of families over the four policies (B = 1000).

Writes m6a_h5_results.txt and m6a_h5_runs.csv (one row per cell).

Needs jupedsim, numpy and numba: PY=$(python3 platform/ci/pyenv.py jupedsim numpy numba), then
  "$PY" experiments/m6a_h5_closepass.py   (about 40 min on 4 cores; cached in data_cache/m6a_cache.json)
M6A_SEEDS and M6A_DURATION shorten a smoke run (its cache file is separate).
"""
from __future__ import annotations

import csv
import itertools
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

SEED0 = 20270000
SEEDS = int(os.environ.get("M6A_SEEDS", "20"))
DURATION = float(os.environ.get("M6A_DURATION", str(M5.DURATION)))
FITTED = {"sf": 0.1, "cfsm": 0.2, "orca": 1.0}   # milestones 3, 4b, 4d
FAMS = list(FITTED)
NAMES = {"sf": "social force", "cfsm": "collision-free speed", "orca": "ORCA"}
LEVELS = {"fitted": 1.0, "weak": 0.5}            # multiplier on the fitted beta
RUNS = [("bo-360-090-090", 0.9, {"sf": 30, "cfsm": 20, "orca": 30}),
        ("bo-360-160-160", 1.6, {"sf": 60, "cfsm": 60, "orca": 60})]
POLICIES, SHARES, SPEED = M5.POLICIES, M5.SHARES, M5.SPEED
B = 1000
METRICS = [("rp_close", +1), ("delay_per_pass", +1), ("lane", -1)]   # registered: rp_close; others read


def key(*a):
    return "|".join(str(x) for x in a)


def _sim(job):
    k, fam, ent, n, beta, nr, pol, seed = job
    kw = dict(duration=DURATION, warmup=M5.WARMUP, robots=nr, policy=pol, robot_speed=SPEED, passes=True)
    if fam == "orca":
        import orca as mod
        r = mod.simulate(n, M5.WIDTH, M5.LENGTH, ent, beta, seed, **kw)
    else:
        import sftwin as mod
        r = mod.simulate(n, M5.WIDTH, M5.LENGTH, ent, beta, seed, model=fam, **kw)
    r.pop("flags")
    return k, {a: (float(b) if isinstance(b, (int, float, np.floating, np.integer)) else b) for a, b in r.items()}


def cells():
    for lev in LEVELS:
        for fam in FAMS:
            for run, ent, ns in RUNS:
                for pol, sh in [("none", 0.0)] + [(p, s) for p in POLICIES for s in SHARES]:
                    yield lev, fam, run, ent, ns[fam], pol, sh


def jobs():
    out = []
    for lev, fam, run, ent, n, pol, sh in cells():
        nr = M5.n_robots(n, sh) if sh else 0
        for s in range(SEEDS):
            out.append((key(lev, fam, run, n, pol, sh, s), fam, ent, n, FITTED[fam] * LEVELS[lev], nr,
                        pol if nr else "crowd", SEED0 + s))
    return out


def cell_stats(rs, b_tr):
    """Pooling sums for one cell's seed results: close count, passes, delay sum, transits, lane, share."""
    ok = [r for r in rs if not r["failed"]]
    passes = sum(r.get("rp_passes", 0) for r in ok)
    close = sum(r["rp_close"] * r["rp_passes"] for r in ok if r.get("rp_passes"))
    tot_delay = sum((r["transit"] - b_tr) * r["transits"] for r in ok if r["transit"] == r["transit"])
    return dict(ok=len(ok), passes=passes, close=close, tot_delay=tot_delay,
                delay=M5.nanmean([r["transit"] - b_tr for r in ok if r["transit"] == r["transit"]]),
                lane=M5.nanmean([r["lane"] for r in ok]), share=M5.nanmean([r["share"] for r in ok]),
                pp_close=sum(r["pp_close"] * r["pp_passes"] for r in ok if r.get("pp_passes"))
                / max(1, sum(r.get("pp_passes", 0) for r in ok)))


def pooled(stats_by_run):
    """Pool one (level, family, policy, share) over the two runs."""
    ps = sum(s["passes"] for s in stats_by_run)
    return dict(rp_close=sum(s["close"] for s in stats_by_run) / ps if ps else float("nan"),
                delay_per_pass=sum(s["tot_delay"] for s in stats_by_run) / ps if ps else float("nan"),
                lane=M5.nanmean([s["lane"] for s in stats_by_run]),
                delay=M5.nanmean([s["delay"] for s in stats_by_run]),
                share=M5.nanmean([s["share"] for s in stats_by_run]))


def main():
    os.makedirs(M5.CACHE, exist_ok=True)
    cname = "m6a_cache.json" if (SEEDS, DURATION) == (20, M5.DURATION) else f"m6a_smoke_{SEEDS}_{DURATION:.0f}.json"
    cpath = os.path.join(M5.CACHE, cname)
    cache = json.load(open(cpath)) if os.path.exists(cpath) else {}
    js = jobs()
    todo = [j for j in js if j[0] not in cache]
    # slowest first (dense ORCA), so the pool does not end on one long tail
    todo.sort(key=lambda j: (j[1] != "orca", -j[3]))
    print(f"{len(js)} runs, {len(todo)} to simulate", flush=True)
    with mp.Pool(int(os.environ.get("M5_PROCS", "4"))) as pool:
        for i, (k, r) in enumerate(pool.imap_unordered(_sim, todo, chunksize=2)):
            cache[k] = r
            if i % 100 == 0:
                print(f"  {i + 1}/{len(todo)}", flush=True)
                json.dump(cache, open(cpath, "w"))
    json.dump(cache, open(cpath, "w"))

    def seeds_of(lev, fam, run, n, pol, sh):
        return [cache[key(lev, fam, run, n, pol, sh, s)] for s in range(SEEDS)]

    base_tr = {}
    raw = {}
    for lev, fam, run, ent, n, pol, sh in cells():
        rs = seeds_of(lev, fam, run, n, pol, sh)
        raw[(lev, fam, run, pol, sh)] = rs
        if pol == "none":
            base_tr[(lev, fam, run)] = M5.nanmean([r["transit"] for r in rs if not r["failed"]])

    def stats(lev, fam, pol, sh, pick=None):
        out = []
        for run, _, _ in RUNS:
            rs = raw[(lev, fam, run, pol, sh)]
            if pick is not None:
                rs = [rs[i] for i in pick[run]]
            out.append(cell_stats(rs, base_tr[(lev, fam, run)]))
        return out

    point = {(lev, fam, pol, sh): pooled(stats(lev, fam, pol, sh))
             for lev in LEVELS for fam in FAMS for pol, sh in [("none", 0.0)] + [(p, s) for p in POLICIES for s in SHARES]}

    def taus_of(pt, lev, sh, m, sign):
        sc = {f: [sign * pt[(lev, f, p, sh)][m] for p in POLICIES] for f in FAMS}
        return {(a, b): M5.kendall(sc[a], sc[b]) for a, b in itertools.combinations(FAMS, 2)}, sc

    # bootstrap: resample seeds within every (family, run, policy, share) cell independently
    rng = np.random.default_rng(SEED0)
    boot_t = {}
    boot_close = {}
    for lev in LEVELS:
        for sh in SHARES:
            for _ in range(B):
                pt = {}
                for fam in FAMS:
                    for pol in POLICIES:
                        pick = {run: rng.integers(0, SEEDS, SEEDS) for run, _, _ in RUNS}
                        pt[(lev, fam, pol, sh)] = pooled(stats(lev, fam, pol, sh, pick))
                        boot_close.setdefault((lev, fam, pol, sh), []).append(pt[(lev, fam, pol, sh)]["rp_close"])
                for m, sign in METRICS:
                    t, _ = taus_of(pt, lev, sh, m, sign)
                    for pr, v in t.items():
                        boot_t.setdefault((lev, sh, m, pr), []).append(v)

    out = []
    P = out.append
    P("Milestone 6a: H5 registered on close passes; fresh seeds; fitted and half-fitted human side bias")
    P(f"HERMES 3.6 m corridor, {M5.LENGTH:.0f} m; {SEEDS} seeds per cell (SEED0 {SEED0}); {DURATION:.0f} s runs, the first "
      f"{M5.WARMUP:.0f} s warm-up; robots {SPEED} m/s; tau-a over four policies, bootstrap B = {B} over seeds")
    P("families (fitted beta): " + ", ".join(f"{NAMES[f]} {b}" for f, b in FITTED.items()) + "; weak = half")
    P("")
    P("== Crowd with no robots (pooled over the two runs)")
    for lev in LEVELS:
        for fam in FAMS:
            q = point[(lev, fam, "none", 0.0)]
            P(f"  {lev:6s} {fam:5s} beta {FITTED[fam] * LEVELS[lev]:.3f}  share on own right {q['share']:.3f}  "
              f"lane {q['lane']:.3f}")
    P("")
    P("== Pooled human costs (close = robot-person passes under 0.5 m, pass-weighted; 95% bootstrap interval)")
    for lev in LEVELS:
        for fam in FAMS:
            for sh in SHARES:
                for pol in POLICIES:
                    q = point[(lev, fam, pol, sh)]
                    lo, hi = np.quantile(boot_close[(lev, fam, pol, sh)], [0.025, 0.975])
                    P(f"  {lev:6s} {fam:5s} {sh:4.2f} {pol:8s} close {q['rp_close']:.3f} [{lo:.3f}, {hi:.3f}]  "
                      f"d/pass {q['delay_per_pass']:+.3f}  delay {q['delay']:+.2f} s  lane {q['lane']:.3f}  "
                      f"right {q['share']:.3f}")
    P("")
    P("== Rankings and Kendall tau (point, [95% bootstrap interval], share of resamples with tau = 1)")
    summary = {}
    for lev in LEVELS:
        for m, sign in METRICS:
            for sh in SHARES:
                t, sc = taus_of(point, lev, sh, m, sign)
                P(f"  {lev:6s} {m:14s} share {sh:.2f}: " + "  ".join(
                    f"{f} " + "<".join(p for _, p in sorted(zip(sc[f], POLICIES))) for f in FAMS))
                for pr, v in t.items():
                    bt = np.array(boot_t[(lev, sh, m, pr)])
                    lo, hi = np.quantile(bt, [0.025, 0.975])
                    summary[(lev, m, sh, pr)] = (v, lo, hi, float(np.mean(bt == 1.0)))
                    P(f"      {pr[0]}-{pr[1]} tau {v:+.2f} [{lo:+.2f}, {hi:+.2f}]  P(tau=1) {np.mean(bt == 1.0):.2f}")
    P("")

    def h5(lev, m):
        vs = [summary[(lev, m, sh, pr)][0] for sh in SHARES for pr in itertools.combinations(FAMS, 2)]
        return min(vs), sum(v >= 0.8 for v in vs), len(vs)

    for lev in LEVELS:
        for m, _ in METRICS:
            mn, k, nn = h5(lev, m)
            P(f"H5 {lev:6s} {m:14s}: min tau {mn:+.2f}, {k} of {nn} pair-share cells >= 0.8 -> "
              f"{'holds' if mn >= 0.8 else 'refuted'}")
    P("")
    P("Predictions (LOG.md, milestone 6a):")
    mn, _, _ = h5("fitted", "rp_close")
    P(f"R1 (H5 on close passes, fitted bias, fresh seeds: tau >= 0.8 in all 9 cells): {'held' if mn >= 0.8 else 'refuted'} (min {mn:+.2f})")
    mn, _, _ = h5("weak", "rp_close")
    P(f"R2 (same at half bias): {'held' if mn >= 0.8 else 'refuted'} (min {mn:+.2f})")
    lows = [summary[("fitted", "rp_close", sh, pr)][1] for sh in SHARES for pr in itertools.combinations(FAMS, 2)]
    P(f"R3 (fitted: lower bootstrap bound of tau >= 0.33 in every cell): {'held' if min(lows) >= 0.33 else 'refuted'} "
      f"(lowest {min(lows):+.2f})")
    worst = [(lev, f, sh, max(POLICIES, key=lambda p: point[(lev, f, p, sh)]["rp_close"]))
             for lev in LEVELS for f in FAMS for sh in SHARES]
    P(f"R4 (opposite has the highest close-pass rate in all 18 level-family-share cells): "
      f"{'held' if all(w == 'opposite' for *_, w in worst) else 'refuted'} ("
      + "; ".join(f"{a} {b} {c:.2f}: {d}" for a, b, c, d in worst if d != "opposite") + ")")
    best = [(lev, f, sh, min(POLICIES, key=lambda p: point[(lev, f, p, sh)]["rp_close"]))
            for lev in LEVELS for f in FAMS for sh in SHARES]
    nc = sum(b == "crowd" for *_, b in best if _[0] == "weak")
    P(f"R5 (weak: crowd has the lowest close-pass rate in at least 7 of 9 cells): {'held' if nc >= 7 else 'refuted'} "
      f"({nc} of 9; " + "; ".join(f"{b} {c:.2f}: {d}" for a, b, c, d in best if a == "weak") + ")")
    mn, _, _ = h5("fitted", "delay_per_pass")
    P(f"R6 (delay per pass, fitted: H5 fails again, some cell tau < 0.8): {'held' if mn < 0.8 else 'refuted'} (min {mn:+.2f})")
    shares = [point[("weak", f, "none", 0.0)]["share"] for f in FAMS]
    P(f"R7 (weak: no-robot share on own right between 0.60 and 0.85 in every family): "
      f"{'held' if all(0.60 <= s <= 0.85 for s in shares) else 'refuted'} (" + ", ".join(f"{s:.3f}" for s in shares) + ")")
    text = "\n".join(out) + "\n"
    print(text)
    with open(os.path.join(HERE, "m6a_h5_results.txt"), "w") as f:
        f.write(text)
    with open(os.path.join(HERE, "m6a_h5_runs.csv"), "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["level", "family", "beta", "run", "N", "policy", "share", "robots", "seeds_ok", "rp_passes",
                    "rp_close", "pp_close", "delay", "delay_per_pass", "lane", "share_right"])
        for lev, fam, run, ent, n, pol, sh in cells():
            s = cell_stats(raw[(lev, fam, run, pol, sh)], base_tr[(lev, fam, run)])
            w.writerow([lev, fam, f"{FITTED[fam] * LEVELS[lev]:.3f}", run, n, pol, sh,
                        M5.n_robots(n, sh) if sh else 0, s["ok"], f"{s['passes'] / max(1, s['ok']):.2f}",
                        f"{s['close'] / s['passes']:.4f}" if s["passes"] else "nan", f"{s['pp_close']:.4f}",
                        f"{s['delay']:.4f}", f"{s['tot_delay'] / s['passes']:.4f}" if s["passes"] else "nan",
                        f"{s['lane']:.4f}", f"{s['share']:.4f}"])


if __name__ == "__main__":
    main()
