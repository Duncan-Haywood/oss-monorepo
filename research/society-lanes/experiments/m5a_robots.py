"""Milestone 5a: robots with four passing policies at three shares, in two fitted crowd families.

Predictions R1 to R8 are in LOG.md, written before this script's full run.

Crowd: the HERMES free-choice corridor (3.6 m wide, 16 m long, 1.6 m entrances, closed loop), no
lateral goals, the two JuPedSim 1.4.2 families whose yielding bias passed the held-out share test
(milestone 4b): the collision-free speed model at its fitted beta = 0.2 and social force at its
fitted beta = 0.1. Two densities, N = 30 and N = 60 agents (the counts milestones 3 and 4b
calibrated to the bo-360-120-120 and bo-360-160-160 speeds). Robots replace humans, so the agent
count and density are those of the no-robot crowd; 5, 10 and 20% of N are robots.

Robots (sftwin.ROBOT_POLICIES): same model and body radius as the humans, no side bias, desired
speed 0.9 m/s (Aethon's hospital tug: "up to 3' per second", US 7,894,939 B2; 0.914 m/s), and a
1.3 m/s sensitivity at the 10% share. Costs to the humans, per cell over 20 seeds:
  delay per robot pass  (8 m / v_humans - 8 m / v_humans,no robots) x human passes / robot passes, s
  close passes          human-robot pairs within 0.5 m (centre to centre) per robot pass; 1.0 m too
  share, lane order     the milestone 1 statistics on the humans only, against the no-robot crowd
Intervals: 2,000 bootstrap resamples over seeds (cell and baseline resampled independently).

Needs jupedsim and numpy: PY=$(python3 platform/ci/pyenv.py jupedsim numpy), then
  "$PY" experiments/m5a_robots.py   (about 20 min on 4 cores; cached per job in
                                     data_cache/m5a_cache.json, delete it to rerun)
"""
from __future__ import annotations

import itertools
import json
import multiprocessing as mp
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)
import sftwin as S  # noqa: E402

CACHE = os.environ.get("SOCIETY_LANES_CACHE", os.path.join(HERE, "data_cache"))
SEED0 = 20261116
SEEDS = 20
DURATION, WARMUP = 160.0, 40.0
WIDTH, LENGTH, ENTRANCE = 3.6, 16.0, 1.6
FAMILIES = {"cfsm": 0.2, "sf": 0.1}       # fitted beta, milestones 3 and 4b
COUNTS = [30, 60]
SHARES = [0.05, 0.10, 0.20]
POLICIES = list(S.ROBOT_POLICIES)
SPEED, SPEED_ALT = 0.9, 1.3
SECTION = 2 * S.SECTION_HALF
BOOT = 2000


def n_robots(n, share):
    return max(1, int(share * n + 0.5))


def key(model, n, nr, pol, speed, seed):
    return f"{model}|{n}|{nr}|{pol}|{speed}|{seed}"


def _sim(job):
    k, model, n, nr, pol, speed, seed = job
    r = S.simulate(n, WIDTH, LENGTH, ENTRANCE, FAMILIES[model], seed, goals=False, duration=DURATION,
                   warmup=WARMUP, model=model, rule="yield", robot_n=nr, robot_policy=pol,
                   robot_speed=speed, track_close=True)
    r.pop("flags")
    return k, r


def jobs_all():
    out = []
    for model, n in itertools.product(FAMILIES, COUNTS):
        cells = [(0, "none", SPEED)]
        cells += [(n_robots(n, sh), p, SPEED) for sh in SHARES for p in POLICIES]
        cells += [(n_robots(n, 0.10), p, SPEED_ALT) for p in POLICIES]
        for nr, pol, sp in cells:
            for s in range(SEEDS):
                out.append((key(model, n, nr, pol, sp, s), model, n, nr, pol if nr else "crowd", sp, SEED0 + s))
    return out


def cell(cache, model, n, nr, pol, sp):
    rs = [cache[key(model, n, nr, pol, sp, s)] for s in range(SEEDS)]
    return [r for r in rs if not r["failed"]]


def stat(rs, base, rng, which):
    """Point value and 95% bootstrap interval of one cost, from per-seed runs."""
    def value(a, b):
        if which == "delay":
            v1 = np.mean([r["human_vbar"] for r in a])
            v0 = np.mean([r["human_vbar"] for r in b])
            rp = np.mean([r["robot_passes"] for r in a])
            hp = np.mean([r["walkers"] for r in a])
            return (SECTION / v1 - SECTION / v0) * hp / rp if rp > 0 else float("nan")
        if which in ("close", "near"):
            rp = sum(r["robot_passes"] for r in a)
            return sum(r[which + "_passes"] for r in a) / rp if rp else float("nan")
        if which in ("share", "lane"):
            return np.nanmean([r[which] for r in a]) - np.nanmean([r[which] for r in b])
        raise ValueError(which)
    pt = value(rs, base)
    bs = []
    for _ in range(BOOT):
        a = [rs[i] for i in rng.integers(0, len(rs), len(rs))]
        b = [base[i] for i in rng.integers(0, len(base), len(base))]
        bs.append(value(a, b))
    lo, hi = np.nanpercentile(bs, [2.5, 97.5])
    return pt, lo, hi


def kendall_tau(a, b):
    """Kendall tau-a between two score lists (no ties expected)."""
    n, s = len(a), 0
    for i in range(n):
        for j in range(i + 1, n):
            s += np.sign(a[i] - a[j]) * np.sign(b[i] - b[j])
    return s / (n * (n - 1) / 2)


def main():
    cpath = os.path.join(CACHE, "m5a_cache.json")
    os.makedirs(CACHE, exist_ok=True)
    cache = json.load(open(cpath)) if os.path.exists(cpath) else {}
    jobs = [j for j in jobs_all() if j[0] not in cache]
    with mp.Pool(int(os.environ.get("M5_PROCS", "4"))) as pool:
        for i, (k, r) in enumerate(pool.imap_unordered(_sim, jobs)):
            cache[k] = r
            if i % 40 == 0:
                print(f"  {i + 1}/{len(jobs)}", flush=True)
                json.dump(cache, open(cpath, "w"))
    json.dump(cache, open(cpath, "w"))

    rng = np.random.default_rng(SEED0)
    out, rows = [], ["family,beta,N,share,robots,policy,robot_speed,seeds_ok,human_share,human_lane,human_speed,"
                     "robot_speed_measured,robot_passes,delay_s,delay_lo,delay_hi,close_per_pass,close_lo,close_hi,"
                     "near_per_pass,near_lo,near_hi,d_share,d_share_lo,d_share_hi,d_lane,d_lane_lo,d_lane_hi"]
    P = out.append
    P("Milestone 5a: robots with four passing policies in two fitted JuPedSim 1.4.2 crowds (HERMES corridor 3.6 x 16 m, free choice)")
    P(f"{SEEDS} seeds per cell, {DURATION - WARMUP:.0f} s measured after {WARMUP:.0f} s warm-up; robots {SPEED} m/s "
      f"({SPEED_ALT} m/s sensitivity at 10%); humans keep the fitted bias (cfsm beta 0.2, sf beta 0.1)")
    P("delay = extra human seconds per robot pass through the 8 m section; close/near = human-robot pairs within 0.5/1.0 m per robot pass;")
    P("d_share, d_lane = change in the humans' share on own right and lane order against the no-robot crowd; [95% bootstrap over seeds]")
    ranks = {}
    for model, n in itertools.product(FAMILIES, COUNTS):
        base = cell(cache, model, n, 0, "none", SPEED)
        hh = sum(r["close_hh"] for r in base) / max(1, sum(r["walkers"] for r in base))
        P("")
        P(f"{model} (beta {FAMILIES[model]}), N = {n}: no robots: share {np.nanmean([r['share'] for r in base]):.3f}, "
          f"lane {np.nanmean([r['lane'] for r in base]):.3f}, human speed {np.mean([r['human_vbar'] for r in base]):.3f} m/s, "
          f"density {np.nanmean([r['density'] for r in base]):.2f}/m2, human-human pairs within 0.5 m per human pass {hh:.3f}, "
          f"failed {SEEDS - len(base)}")
        P(f"  {'share':>5} {'nr':>3} {'policy':<9} {'v_r':>4} {'delay s':>22} {'close/pass':>20} {'near/pass':>20} "
          f"{'d_share':>24} {'d_lane':>24} {'v_rob':>5}")
        for sh, sp in [(s_, SPEED) for s_ in SHARES] + [(0.10, SPEED_ALT)]:
            nr = n_robots(n, sh)
            for pol in POLICIES:
                rs = cell(cache, model, n, nr, pol, sp)
                st = {w: stat(rs, base, rng, w) for w in ("delay", "close", "near", "share", "lane")}
                if sp == SPEED:
                    ranks.setdefault((model, n, sh), {})[pol] = st
                vr = np.nanmean([r["robot_vbar"] for r in rs])
                f = lambda t, d=3: f"{t[0]:+.{d}f} [{t[1]:+.{d}f}, {t[2]:+.{d}f}]"  # noqa: E731
                P(f"  {sh:5.2f} {nr:3d} {pol:<9} {sp:4.1f} {f(st['delay'], 2):>22} {f(st['close']):>20} {f(st['near']):>20} "
                  f"{f(st['share']):>24} {f(st['lane']):>24} {vr:5.2f}")
                rows.append(",".join(str(x) for x in [
                    model, FAMILIES[model], n, sh, nr, pol, sp, len(rs),
                    f"{np.nanmean([r['share'] for r in rs]):.4f}", f"{np.nanmean([r['lane'] for r in rs]):.4f}",
                    f"{np.mean([r['human_vbar'] for r in rs]):.4f}", f"{vr:.4f}",
                    f"{np.mean([r['robot_passes'] for r in rs]):.2f}"]
                    + [f"{v:.4f}" for w in ("delay", "close", "near", "share", "lane") for v in st[w]]))

    # ---------------------------------------------------------------- predictions
    P("")
    P("Predictions (LOG.md):")

    def worst(model, n, sh, w="delay"):
        d = ranks[(model, n, sh)]
        return max(d, key=lambda p: d[p][w][0])
    cells_ = [(m, n, sh) for m in FAMILIES for n in COUNTS for sh in SHARES]
    r1 = [worst(*c) == "opposite" for c in cells_]
    P(f"R1 (opposite has the largest human delay per robot pass in every family, density and share): "
      f"{'held' if all(r1) else 'refuted'} ({sum(r1)} of {len(r1)}; "
      + "; ".join(f"{m} N{n} {int(sh * 100)}%: {worst(m, n, sh)}" for m, n, sh in cells_) + ")")
    over = lambda a, b: a[1] <= b[2] and b[1] <= a[2]  # noqa: E731
    r2 = [all(over(ranks[c]["crowd"][w], ranks[c]["adapt"][w]) for w in ("delay", "close", "share", "lane")) for c in cells_]
    P(f"R2 (crowd and adapt intervals overlap on delay, close passes, share and lane in every cell): "
      f"{'held' if all(r2) else 'refuted'} ({sum(r2)} of {len(r2)})")
    r3 = {m: all(ranks[(m, n, 0.20)]["opposite"]["share"][0] <= -0.05 for n in COUNTS) for m in FAMILIES}
    P(f"R3 (opposite at 20% lowers the humans' share on own right by at least 0.05, both densities, both families): "
      f"{'held' if all(r3.values()) else 'refuted'} ("
      + "; ".join(f"{m} N{n}: {ranks[(m, n, 0.20)]['opposite']['share'][0]:+.3f}" for m in FAMILIES for n in COUNTS) + ")")
    r4 = {m: all(ranks[(m, n, 0.20)]["opposite"]["lane"][0] <= -0.05 for n in COUNTS) for m in FAMILIES}
    P(f"R4 (opposite at 20% lowers lane order by at least 0.05, both densities, both families): "
      f"{'held' if all(r4.values()) else 'refuted'} ("
      + "; ".join(f"{m} N{n}: {ranks[(m, n, 0.20)]['opposite']['lane'][0]:+.3f}" for m in FAMILIES for n in COUNTS) + ")")
    taus = {}
    for n in COUNTS:
        for sh in SHARES:
            a = [ranks[("cfsm", n, sh)][p]["delay"][0] for p in POLICIES]
            b = [ranks[("sf", n, sh)][p]["delay"][0] for p in POLICIES]
            taus[(n, sh)] = kendall_tau(a, b)
    r5 = all(taus[(60, sh)] >= 0.8 for sh in SHARES)
    P(f"R5 (cfsm and sf rank the four policies by delay with Kendall tau >= 0.8 at every share, N = 60): "
      f"{'held' if r5 else 'refuted'} (" + "; ".join(f"N{n} {int(sh * 100)}%: {t:+.2f}" for (n, sh), t in taus.items()) + ")")
    cf = [ranks[("cfsm", n, sh)][p]["close"][0] for n in COUNTS for sh in SHARES for p in POLICIES]
    P(f"R6 (cfsm: fewer than 0.05 close passes per robot pass for every policy): {'held' if max(cf) < 0.05 else 'refuted'} (max {max(cf):.3f})")
    r7 = [ranks[("sf", n, sh)]["opposite"]["close"][0] > ranks[("sf", n, sh)]["crowd"]["close"][0] for n in COUNTS for sh in SHARES]
    P(f"R7 (sf: opposite has more close passes per robot pass than crowd in every density and share): "
      f"{'held' if all(r7) else 'refuted'} ({sum(r7)} of {len(r7)})")
    r8 = []
    for m in FAMILIES:
        for n in COUNTS:
            base = cell(cache, m, n, 0, "none", SPEED)
            fast = stat(cell(cache, m, n, n_robots(n, 0.10), "crowd", SPEED_ALT), base, rng, "delay")[0]
            slow = ranks[(m, n, 0.10)]["crowd"]["delay"][0]
            r8.append((m, n, slow, fast))
    P(f"R8 (crowd robots at 1.3 m/s cost less delay than at 0.9 m/s, every family and density): "
      f"{'held' if all(f_ < s_ for _, _, s_, f_ in r8) else 'refuted'} ("
      + "; ".join(f"{m} N{n}: {s_:+.2f} -> {f_:+.2f} s" for m, n, s_, f_ in r8) + ")")

    with open(os.path.join(HERE, "m5a_robots_results.txt"), "w") as f:
        f.write("\n".join(out) + "\n")
    with open(os.path.join(HERE, "m5a_robots_cells.csv"), "w") as f:
        f.write("\n".join(rows) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main()
