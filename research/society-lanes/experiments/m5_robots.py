"""Milestone 5a: robots with four passing-side policies at three shares, human costs per family.

Predictions Q1 to Q8 are in LOG.md, written before this script's full run.

Crowds: the three JuPedSim 1.4.2 families with their fitted side bias (social force beta = 0.1,
milestone 3; anticipation velocity beta = 0.35, milestone 4a; collision-free speed beta = 0.2,
milestone 4b), free choice (no lateral goals for people), in two HERMES 3.6 m runs with their
calibrated walker counts: bo-360-090-090 (entrance 0.9 m, low density) and bo-360-160-160
(entrance 1.6 m, the densest free HERMES run). Robots replace 5, 10 and 20% of the agents
(at least one), robots.py's four policies, robot speed 1.2 m/s (MiR250 rated configuration);
a 0% baseline per family and run. 20 seeds per cell. Sensitivity (registered): robot speed
2.0 m/s, the MiR250's other rated configuration, at 10%.

Human costs (people only): delay per transit of the 8 m section against the 0% baseline, delay
per robot pass (total human delay over robot-person passes), the close-pass rate (clearance
under 0.5 m), lane order and share on own right. Intervals: percentile bootstrap over seeds
(2,000 resamples). Rankings: Kendall tau between families over the four policies (H5's test).

Needs jupedsim and numpy: PY=$(python3 platform/ci/pyenv.py jupedsim numpy), then
  "$PY" experiments/m5_robots.py   (about 10 min on 4 cores; cached in data_cache/m5_cache.json)
"""
from __future__ import annotations

import csv
import itertools
import json
import math
import multiprocessing as mp
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)
sys.path.insert(0, HERE)

CACHE = os.environ.get("SOCIETY_LANES_CACHE", os.path.join(HERE, "data_cache"))
SEED0 = 20261116
SEEDS = 20
DURATION, WARMUP = 120.0, 40.0   # as milestones 3 to 4d
WIDTH, LENGTH = 3.6, 16.0        # HERMES 3.6 m corridor, length as milestone 3
FAMILIES = {"sf": 0.1, "avm": 0.35, "cfsm": 0.2}
NAMES = {"sf": "social force", "avm": "anticipation velocity", "cfsm": "collision-free speed"}
# (run, entrance m, calibrated N per family): m3_sf_twin_runs.csv, m4_avm_exits_runs.csv,
# m4b_yield_cfsm_results.txt
RUNS = [("bo-360-090-090", 0.9, {"sf": 30, "avm": 20, "cfsm": 20}),
        ("bo-360-160-160", 1.6, {"sf": 60, "avm": 60, "cfsm": 60})]
POLICIES = ["crowd", "opposite", "adapt", "goal"]
SHARES = [0.05, 0.10, 0.20]
SPEED, SPEED_SENS = 1.2, 2.0
BOOT = 2000


def n_robots(n, share):
    return max(1, int(math.floor(n * share + 0.5)))


def key(*a):
    return "|".join(str(x) for x in a)


def _sim(job):
    import sftwin as S
    k, fam, run, ent, n, beta, nr, pol, v, seed = job
    r = S.simulate(n, WIDTH, LENGTH, ent, beta, seed, duration=DURATION, warmup=WARMUP, model=fam,
                   robots=nr, policy=pol, robot_speed=v, passes=True)
    r.pop("flags")
    return k, {a: (float(b) if isinstance(b, (int, float, np.floating, np.integer)) else b) for a, b in r.items()}


def jobs():
    out = []
    for fam, beta in FAMILIES.items():
        for run, ent, ns in RUNS:
            n = ns[fam]
            cells = [("none", 0.0, SPEED)] + [(p, s, SPEED) for p in POLICIES for s in SHARES] + \
                    [(p, 0.10, SPEED_SENS) for p in POLICIES]
            for pol, sh, v in cells:
                nr = n_robots(n, sh) if sh else 0
                for s in range(SEEDS):
                    out.append((key(fam, run, n, pol, sh, v, s), fam, run, ent, n, beta, nr,
                                pol if nr else "crowd", v, SEED0 + s))
    return out


def nanmean(v):
    v = [x for x in v if x == x]
    return sum(v) / len(v) if v else float("nan")


def boot(vals, stat, rng):
    vals = list(vals)
    if not vals:
        return (float("nan"), float("nan"))
    idx = rng.integers(0, len(vals), size=(BOOT, len(vals)))
    b = [stat([vals[i] for i in row]) for row in idx]
    b = [x for x in b if x == x]
    return (float(np.quantile(b, 0.025)), float(np.quantile(b, 0.975))) if b else (float("nan"),) * 2


def kendall(a, b):
    """Kendall tau-a between two score lists (ties count zero)."""
    c = d = 0
    for i, j in itertools.combinations(range(len(a)), 2):
        s = (a[i] - a[j]) * (b[i] - b[j])
        c += s > 0
        d += s < 0
    n = len(a) * (len(a) - 1) / 2
    return (c - d) / n


def main():
    os.makedirs(CACHE, exist_ok=True)
    cpath = os.path.join(CACHE, "m5_cache.json")
    cache = json.load(open(cpath)) if os.path.exists(cpath) else {}
    js = jobs()
    todo = [j for j in js if j[0] not in cache]
    print(f"{len(js)} runs, {len(todo)} to simulate", flush=True)
    with mp.Pool(int(os.environ.get("M5_PROCS", "4"))) as pool:
        for i, (k, r) in enumerate(pool.imap_unordered(_sim, todo, chunksize=2)):
            cache[k] = r
            if i % 100 == 0:
                print(f"  {i + 1}/{len(todo)}", flush=True)
                json.dump(cache, open(cpath, "w"))
    json.dump(cache, open(cpath, "w"))
    rng = np.random.default_rng(SEED0)

    def seeds_of(fam, run, n, pol, sh, v):
        return [cache[key(fam, run, n, pol, sh, v, s)] for s in range(SEEDS)]

    rows, cell = [], {}
    for fam in FAMILIES:
        for run, ent, ns in RUNS:
            n = ns[fam]
            base = seeds_of(fam, run, n, "none", 0.0, SPEED)
            b_tr = nanmean([r["transit"] for r in base])
            for pol, sh, v in [("none", 0.0, SPEED)] + [(p, s, SPEED) for p in POLICIES for s in SHARES] + \
                              [(p, 0.10, SPEED_SENS) for p in POLICIES]:
                rs = seeds_of(fam, run, n, pol, sh, v)
                ok = [r for r in rs if not r["failed"]]
                delay = [r["transit"] - b_tr for r in ok if r["transit"] == r["transit"]]
                tot_delay = sum((r["transit"] - b_tr) * r["transits"] for r in ok if r["transit"] == r["transit"])
                passes = sum(r.get("rp_passes", 0) for r in ok)
                close = [g for r in ok for g in [r.get("rp_close")] if g == g and g is not None]
                row = dict(family=fam, run=run, N=n, policy=pol, share=sh, robot_speed=v,
                           robots=n_robots(n, sh) if sh else 0, seeds_ok=len(ok),
                           transit=nanmean([r["transit"] for r in ok]), base_transit=b_tr,
                           delay=nanmean(delay),
                           delay_per_pass=(tot_delay / passes) if passes else float("nan"),
                           rp_passes=passes / max(1, len(ok)),
                           rp_close=(sum(r["rp_close"] * r["rp_passes"] for r in ok if r.get("rp_passes"))
                                     / passes) if passes else float("nan"),
                           pp_close=(sum(r["pp_close"] * r["pp_passes"] for r in ok if r.get("pp_passes"))
                                     / max(1, sum(r.get("pp_passes", 0) for r in ok))),
                           lane=nanmean([r["lane"] for r in ok]), share_right=nanmean([r["share"] for r in ok]),
                           speed=nanmean([r["speed"] for r in ok]),
                           robot_speed_obs=nanmean([r.get("robot_speed", float("nan")) for r in ok]))
                row["delay_lo"], row["delay_hi"] = boot(delay, nanmean, rng)
                row["_seeds"] = ok
                rows.append(row)
                cell[(fam, run, pol, sh, v)] = row

    def pooled(fam, pol, sh, v, field):
        """Mean of a per-run value over the two runs (pass-weighted for rates)."""
        rs = [cell[(fam, run, pol, sh, v)] for run, _, _ in RUNS]
        if field in ("rp_close", "delay_per_pass"):
            w = [r["rp_passes"] for r in rs]
            return sum(r[field] * x for r, x in zip(rs, w)) / sum(w) if sum(w) else float("nan")
        return nanmean([r[field] for r in rs])

    out = []
    P = out.append
    P("Milestone 5a: robots in the fitted JuPedSim 1.4.2 crowds (free choice), four policies x three shares")
    P(f"HERMES 3.6 m corridor, {LENGTH:.0f} m; {SEEDS} seeds per cell; {DURATION:.0f} s per run after "
      f"{WARMUP:.0f} s warm-up; robot speed {SPEED} m/s (sensitivity {SPEED_SENS} m/s at 10%)")
    P("families and fitted beta: " + ", ".join(f"{NAMES[f]} {b}" for f, b in FAMILIES.items()))
    P("human costs are people only; delay = mean section transit time minus the 0% baseline (s);")
    P("close = robot-person pass with clearance under 0.5 m; pp = person-person close rate, same run")
    P("")
    hdr = (f"  {'family':5s} {'run':15s} {'policy':8s} {'share':>5s} {'rob':>3s} {'transit':>7s} {'delay':>6s} "
           f"{'[95% CI]':>15s} {'d/pass':>6s} {'passes':>6s} {'close':>5s} {'pp':>5s} {'lane':>5s} "
           f"{'right':>5s} {'speed':>5s} {'robv':>5s} {'ok':>3s}")
    for v in (SPEED, SPEED_SENS):
        P(f"== Per run, robot speed {v} m/s")
        P(hdr)
        for r in rows:
            if r["robot_speed"] != v and r["policy"] != "none":
                continue
            if v == SPEED_SENS and r["policy"] == "none":
                continue
            P(f"  {r['family']:5s} {r['run']:15s} {r['policy']:8s} {r['share']:5.2f} {r['robots']:3d} "
              f"{r['transit']:7.2f} {r['delay']:+6.2f} [{r['delay_lo']:+6.2f},{r['delay_hi']:+6.2f}] "
              f"{r['delay_per_pass']:+6.3f} {r['rp_passes']:6.1f} {r['rp_close']:5.3f} {r['pp_close']:5.3f} "
              f"{r['lane']:5.3f} {r['share_right']:5.3f} {r['speed']:5.2f} {r['robot_speed_obs']:5.2f} "
              f"{r['seeds_ok']:3d}")
        P("")
    P("== Pooled over the two runs (rates pass-weighted), robot speed 1.2 m/s")
    P(f"  {'family':5s} {'policy':8s} {'share':>5s} {'delay':>6s} {'d/pass':>6s} {'close':>5s} {'lane':>5s} "
      f"{'dlane':>6s} {'right':>5s} {'dright':>6s}")
    for fam in FAMILIES:
        bl, br = pooled(fam, "none", 0.0, SPEED, "lane"), pooled(fam, "none", 0.0, SPEED, "share_right")
        P(f"  {fam:5s} {'none':8s} {0:5.2f} {0:+6.2f} {'':>6s} {'':>5s} {bl:5.3f} {'':>6s} {br:5.3f}   "
          f"pp close {pooled(fam, 'none', 0.0, SPEED, 'pp_close'):.3f}")
        for sh in SHARES:
            for pol in POLICIES:
                ln, rt = pooled(fam, pol, sh, SPEED, "lane"), pooled(fam, pol, sh, SPEED, "share_right")
                P(f"  {fam:5s} {pol:8s} {sh:5.2f} {pooled(fam, pol, sh, SPEED, 'delay'):+6.2f} "
                  f"{pooled(fam, pol, sh, SPEED, 'delay_per_pass'):+6.3f} {pooled(fam, pol, sh, SPEED, 'rp_close'):5.3f} "
                  f"{ln:5.3f} {ln - bl:+6.3f} {rt:5.3f} {rt - br:+6.3f}")
    P("")
    P("== Policy rankings (pooled; rank 1 = lowest human cost) and Kendall tau between families (H5)")
    metrics = [("delay_per_pass", +1), ("rp_close", +1), ("lane", -1)]
    for sh in SHARES:
        for m, sign in metrics:
            sc = {f: [sign * pooled(f, p, sh, SPEED, m) for p in POLICIES] for f in FAMILIES}
            rk = {f: " > ".join(p for _, p in sorted(zip(sc[f], POLICIES))) for f in FAMILIES}
            taus = {f"{a}-{b}": kendall(sc[a], sc[b]) for a, b in itertools.combinations(FAMILIES, 2)}
            P(f"  share {sh:.2f} {m:14s} " + "  ".join(f"{f}: {rk[f]}" for f in FAMILIES))
            P(f"  {'':10s} {'':14s} tau " + "  ".join(f"{k} {t:+.2f}" for k, t in taus.items()))
    P("")
    P("== Sensitivity: robot speed 2.0 m/s against 1.2 m/s at 10% (pooled)")
    for fam in FAMILIES:
        for pol in POLICIES:
            P(f"  {fam:5s} {pol:8s} delay {pooled(fam, pol, 0.10, SPEED, 'delay'):+6.2f} -> "
              f"{pooled(fam, pol, 0.10, SPEED_SENS, 'delay'):+6.2f}   close {pooled(fam, pol, 0.10, SPEED, 'rp_close'):.3f} -> "
              f"{pooled(fam, pol, 0.10, SPEED_SENS, 'rp_close'):.3f}   lane {pooled(fam, pol, 0.10, SPEED, 'lane'):.3f} -> "
              f"{pooled(fam, pol, 0.10, SPEED_SENS, 'lane'):.3f}")
    text = "\n".join(out) + "\n"
    print(text)
    with open(os.path.join(HERE, "m5_robots_results.txt"), "w") as f:
        f.write(text)
    fields = [k for k in rows[0] if not k.startswith("_")]
    with open(os.path.join(HERE, "m5_robots_runs.csv"), "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        for r in rows:
            w.writerow({k: (f"{r[k]:.4f}" if isinstance(r[k], float) else r[k]) for k in fields})


if __name__ == "__main__":
    main()
