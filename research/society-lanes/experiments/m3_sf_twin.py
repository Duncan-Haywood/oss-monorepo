"""Milestone 3: fit a social-force twin (JuPedSim) on the free-choice runs, hold out assigned exits.

Predictions F1 to F7 and the design change are in LOG.md, written before any simulation ran.

Inputs:
  - experiments/m1_hermes_sides_runs.csv and experiments/m2_basigo_sides_runs.csv: the per-run
    summaries milestones 1 and 2 measured (share on own right with its 95% interval, lane order,
    median speed), the targets.
  - two raw BaSiGo runs (b_03, b_08; FZJ archive doi:10.34735/ped.2013.5, CC BY 4.0) as
    redistributed by PedPy (MIT) at a pinned commit, fetched into experiments/data_cache/
    (gitignored), for measured density and the F7 check.

Needs jupedsim and numpy: PY=$(python3 platform/ci/pyenv.py jupedsim numpy), then
  "$PY" experiments/m3_sf_twin.py        (about 15 min on 4 cores; results cached per stage
                                          in data_cache/m3_cache.json, delete it to rerun)
"""
from __future__ import annotations

import csv
import hashlib
import json
import multiprocessing as mp
import os
import statistics
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)
import lanes as L  # noqa: E402

CACHE = os.environ.get("SOCIETY_LANES_CACHE", os.path.join(HERE, "data_cache"))
PEDPY = ("https://raw.githubusercontent.com/PedestrianDynamics/PedPy/"
         "0604d9af80eeced0fe16d65d503ea78381dae11a/notebooks/demo-data/bi-directional/")
PEDPY_SHA = {"bi_corr_400_b_03": "e7c2b70c231f206897439187e8ad0255ebd10605fd311401102801b686c7d463",
             "bi_corr_400_b_08": "ccdbfeb6045aba715bf65db1dcf5b711bb05cae93cfff2f1af1fe3721ba97618"}
BETAS = [0.0, 0.1, 0.2, 0.35, 0.5, 0.75, 1.0]
N_GRID = [30, 60, 100, 150, 200]
SEED0 = 20261115
FIT_SEEDS, CAL_SEEDS, SCORE_SEEDS = 5, 3, 20
HERMES_LENGTH = 16.0  # m, assumed (archive geometry out of reach this session)
DURATION, WARMUP = 120.0, 40.0


# ---------------------------------------------------------------- data
def runs_table():
    out = []
    with open(os.path.join(HERE, "m1_hermes_sides_runs.csv")) as f:
        for r in csv.DictReader(f):
            if r["set"] == "asymmetric" or float(r["corridor_m"]) != 3.6:
                continue  # 3.0 m runs: no free-choice run at that width to fit on
            out.append(dict(run=r["run"], exp="HERMES", free=r["set"] == "free",
                            width=3.6, length=HERMES_LENGTH, entrance=float(r["entrance1_m"]),
                            walkers=int(r["walkers"]), share=float(r["share_right"]),
                            lo=float(r["ci_lo"]), hi=float(r["ci_hi"]),
                            lane=float(r["lane_order"]), speed=float(r["median_speed_ms"])))
    with open(os.path.join(HERE, "m2_basigo_sides_runs.csv")) as f:
        for r in csv.DictReader(f):
            if r["guided"] == "1" and r["run"] != "bi_corr_400_b_03":
                continue
            if r["screen"] == "given":
                continue  # b_09, b_10: screen content unknown, not modelled
            out.append(dict(run=r["run"], exp="BaSiGo", free=r["variant"] == "A",
                            width=4.0, length=float(r["length_m"]), entrance=float(r["entrance_m"]),
                            walkers=int(r["walkers"]), share=float(r["share_right"]),
                            lo=float(r["ci_lo"]), hi=float(r["ci_hi"]),
                            lane=float(r["lane_order"]), speed=float(r["median_speed_ms"])))
    return out


def pedpy_measure():
    """F7 check and measured density/speed for b_03 and b_08."""
    os.makedirs(CACHE, exist_ok=True)
    res = {}
    for run, sha in PEDPY_SHA.items():
        path = os.path.join(CACHE, run + ".txt")
        if not os.path.exists(path):
            with urllib.request.urlopen(PEDPY + run + ".txt", timeout=120) as r:
                data = r.read()
            with open(path, "wb") as f:
                f.write(data)
        blob = open(path, "rb").read()
        got = hashlib.sha256(blob).hexdigest()
        raw = list(L.parse_trajectories(blob.decode("utf-8", "replace").splitlines()))
        ws = L.walkers(L.rotate_x_corridor(raw, 400.0), 400.0)
        flags = [1 if L.mean_right_offset(d, s, 400.0) > 0 else 0 for d, s in ws.values()]
        cnt = {}
        for _, s in ws.values():
            for fr, _, _ in s:
                cnt[fr] = cnt.get(fr, 0) + 1
        vals = [cnt[k] for k in sorted(cnt)]
        mid = vals[len(vals) // 10: 9 * len(vals) // 10]
        res[run] = dict(sha_ok=got == sha, walkers=len(ws), share=sum(flags) / len(flags),
                        density=sum(mid) / len(mid) / (8.0 * 4.0),
                        speed=L.median(L.walker_speeds(ws, 25, 25)))
    return res


# ---------------------------------------------------------------- simulation
def _sim(job):
    import sftwin as S
    key, n, width, length, entrance, beta, seed, goals = job
    r = S.simulate(n, width, length, entrance, beta, seed, goals=goals, duration=DURATION, warmup=WARMUP)
    r.pop("flags")
    return key, r


def run_jobs(jobs, cache, pool):
    todo = [j for j in jobs if j[0] not in cache]
    for i, (key, r) in enumerate(pool.imap_unordered(_sim, todo)):
        cache[key] = r
        if i % 20 == 0:
            print(f"  {i + 1}/{len(todo)}", flush=True)
    return [cache[j[0]] for j in jobs]


def key(*a):
    return "|".join(str(x) for x in a)


def mean(v):
    v = [x for x in v if x == x]
    return sum(v) / len(v) if v else float("nan")


def agg(rs):
    ok = [r for r in rs if not r["failed"] and r["walkers"] > 0]
    return dict(share=mean([r["share"] for r in ok]), lane=mean([r["lane"] for r in ok]),
                speed=mean([r["speed"] for r in ok]), density=mean([r["density"] for r in ok]),
                walkers=sum(r["walkers"] for r in ok), n_ok=len(ok), n_failed=len(rs) - len(ok),
                share_sd=statistics.pstdev([r["share"] for r in ok]) if len(ok) > 1 else float("nan"))


def calibrate(run, cache, pool, target, beta=0.0):
    """Walker count on N_GRID whose mean simulated `target` (speed or density) is nearest."""
    jobs = [(key("cal", run["run"], n, beta, s), n, run["width"], run["length"], run["entrance"],
             beta, SEED0 + 1000 + s, False) for n in N_GRID for s in range(CAL_SEEDS)]
    rs = run_jobs(jobs, cache, pool)
    best = None
    for i, n in enumerate(N_GRID):
        a = agg(rs[i * CAL_SEEDS:(i + 1) * CAL_SEEDS])
        if a["n_ok"] == 0:
            continue
        miss = abs(a[target] - run[target])
        if best is None or miss < best[1]:
            best = (n, miss, a)
    return best


def loss(sim, run):
    half = max((run["hi"] - run["lo"]) / 2, 0.02)
    return ((sim["share"] - run["share"]) / half) ** 2 + ((sim["lane"] - run["lane"]) / 0.05) ** 2


def main():
    cpath = os.path.join(CACHE, "m3_cache.json")
    os.makedirs(CACHE, exist_ok=True)
    cache = json.load(open(cpath)) if os.path.exists(cpath) else {}
    runs = runs_table()
    free = [r for r in runs if r["free"]]
    held = [r for r in runs if not r["free"]]
    ped = pedpy_measure()
    for r in runs:
        if r["run"] in ped:
            r["density"] = ped[r["run"]]["density"]
    out = []
    P = out.append
    with mp.Pool(int(os.environ.get("M3_PROCS", "4"))) as pool:
        # 1. calibrate the walker count of each free run to its median speed, at beta = 0
        for r in free:
            r["N"], r["cal_miss"], r["cal"] = calibrate(r, cache, pool, "speed")
        json.dump(cache, open(cpath, "w"))
        # 2. fit beta on the free runs
        fits = {}
        for b in BETAS:
            jobs = [(key("fit", r["run"], r["N"], b, s), r["N"], r["width"], r["length"], r["entrance"],
                     b, SEED0 + s, False) for r in free for s in range(FIT_SEEDS)]
            rs = run_jobs(jobs, cache, pool)
            per = [agg(rs[i * FIT_SEEDS:(i + 1) * FIT_SEEDS]) for i in range(len(free))]
            fits[b] = (sum(loss(p, r) for p, r in zip(per, free)), per)
        json.dump(cache, open(cpath, "w"))
        beta = min(BETAS, key=lambda b: fits[b][0])
        # 3. score at the fitted beta, 20 seeds
        def score(rs_, goals, tag):
            jobs = [(key(tag, r["run"], r["N"], beta, s, goals), r["N"], r["width"], r["length"],
                     r["entrance"], beta, SEED0 + 500 + s, goals) for r in rs_ for s in range(SCORE_SEEDS)]
            got = run_jobs(jobs, cache, pool)
            return [agg(got[i * SCORE_SEEDS:(i + 1) * SCORE_SEEDS]) for i in range(len(rs_))]
        free_sc = score(free, False, "score")
        json.dump(cache, open(cpath, "w"))
        # 4. held-out assigned-exit runs: walker count from speed (HERMES, at beta = 0, as the free
        #    runs) or from the measured density (b_03, b_08, at the fitted beta)
        for r in held:
            if "density" in r:
                r["N"], r["cal_miss"], r["cal"] = calibrate(r, cache, pool, "density", beta)
            else:
                r["N"], r["cal_miss"], r["cal"] = calibrate(r, cache, pool, "speed")
        json.dump(cache, open(cpath, "w"))
        held_sc = score(held, True, "held")
        # the same held-out runs with no exit goal, to separate the goal's effect from the crowd's
        held_nogoal = score(held, False, "held_nogoal")
        json.dump(cache, open(cpath, "w"))

    # ------------------------------------------------------------ report
    P("Milestone 3: social-force twin (JuPedSim 1.4.2 SocialForceModel + side-bias steering), fitted on free-choice runs")
    P(f"seeds: calibration {CAL_SEEDS}, fit {FIT_SEEDS}, score {SCORE_SEEDS}; {DURATION:.0f} s per run after {WARMUP:.0f} s warm-up; walker counts {N_GRID}")
    P("")
    P("F7, PedPy copies of BaSiGo runs against milestone 2:")
    m2 = {r["run"]: r for r in runs}
    f7 = True
    for k, v in ped.items():
        same = v["walkers"] == m2[k]["walkers"] and abs(v["share"] - m2[k]["share"]) < 5e-5
        f7 &= same and v["sha_ok"]
        P(f"  {k}: sha256 {'ok' if v['sha_ok'] else 'MISMATCH'}; walkers {v['walkers']} (m2 {m2[k]['walkers']}), share {v['share']:.4f} (m2 {m2[k]['share']:.4f}); "
          f"measured density {v['density']:.2f}/m2, median speed {v['speed']:.2f} m/s")
    P("")
    P("Calibration of the free runs (walker count whose beta = 0 median speed is nearest the observed):")
    for r in free:
        P(f"  {r['run']:<18} {r['exp']:<6} W={r['width']} L={r['length']:.0f} entr={r['entrance']}  observed speed {r['speed']:.2f}"
          f" -> N={r['N']:>3}, simulated {r['cal']['speed']:.2f} m/s at {r['cal']['density']:.2f}/m2 (miss {r['cal_miss']:.2f})")
    P("")
    P("Fit (loss = sum of ((share miss)/CI half-width)^2 + ((lane miss)/0.05)^2 over the 9 free runs, 5 seeds):")
    for b in BETAS:
        per = fits[b][1]
        P(f"  beta {b:<5} loss {fits[b][0]:10.1f}   pooled share {mean([p['share'] for p in per]):.3f}   mean lane {mean([p['lane'] for p in per]):.3f}"
          f"   failed {sum(p['n_failed'] for p in per)}")
    P(f"  fitted beta = {beta}")
    P("")
    P(f"Free runs at beta = {beta}, {SCORE_SEEDS} seeds (mean over seeds; observed share with its 95% interval):")
    in_ci = in_lane = 0
    for r, s in zip(free, free_sc):
        a = r["lo"] <= s["share"] <= r["hi"]
        b_ = abs(s["lane"] - r["lane"]) <= 0.10
        in_ci += a
        in_lane += b_
        P(f"  {r['run']:<18} share sim {s['share']:.3f} (sd {s['share_sd']:.3f}) obs {r['share']:.3f} [{r['lo']:.3f}, {r['hi']:.3f}] {'in' if a else 'OUT'}"
          f"  lane sim {s['lane']:.3f} obs {r['lane']:.3f} {'ok' if b_ else 'MISS'}  speed sim {s['speed']:.2f} obs {r['speed']:.2f}"
          f"  density {s['density']:.2f}  failed {s['n_failed']}")
    P("")
    P(f"Held-out assigned-exit runs at beta = {beta}, lateral exit goals (and, for comparison, the same crowd without goals):")
    for r, s, s0 in zip(held, held_sc, held_nogoal):
        how = f"density {r['density']:.2f} measured" if "density" in r else f"speed {r['speed']:.2f} observed"
        P(f"  {r['run']:<18} {r['exp']:<6} N={r['N']:>3} ({how}; sim {s['speed']:.2f} m/s, {s['density']:.2f}/m2)"
          f"  share sim {s['share']:.3f} [no goal {s0['share']:.3f}] obs {r['share']:.3f}  lane sim {s['lane']:.3f} obs {r['lane']:.3f}  failed {s['n_failed']}")
    P("")
    # predictions
    b0 = fits[0.0][1]
    pooled0 = sum(p["share"] * r["walkers"] for p, r in zip(b0, free)) / sum(r["walkers"] for r in free)
    P(f"F1 (beta = 0 pooled free share in [0.40, 0.60]): {'held' if 0.40 <= pooled0 <= 0.60 else 'refuted'} ({pooled0:.3f})")
    P(f"F2 (share inside the run's 95% interval in >= 6 of 9): {'held' if in_ci >= 6 else 'refuted'} ({in_ci} of {len(free)})")
    P(f"F3 (lane order within 0.10 in >= 6 of 9): {'held' if in_lane >= 6 else 'refuted'} ({in_lane} of {len(free)})")
    f4 = []
    for r, s in zip(held, held_sc):
        if "density" in r:
            f4.append((r["run"], s["speed"], r["speed"], s["density"], r["density"]))
    f4_ok = all(abs(a - b) <= 0.15 for _, a, b, _, _ in f4)
    P(f"F4 (b_03 and b_08 median speed within 0.15 m/s at the measured density): {'held' if f4_ok else 'refuted'} ("
      + "; ".join(f"{k[-4:]}: sim {a:.2f} vs {b:.2f} m/s, sim density {c:.2f} vs {d:.2f}/m2" for k, a, b, c, d in f4) + ")")
    hs = [(r, s) for r, s in zip(held, held_sc) if r["run"].startswith("bot-360")]
    sim_p = sum(s["share"] * r["walkers"] for r, s in hs) / sum(r["walkers"] for r, _ in hs)
    obs_p = sum(r["share"] * r["walkers"] for r, _ in hs) / sum(r["walkers"] for r, _ in hs)
    f5 = [(r["run"], s["share"], r["share"]) for r, s in zip(held, held_sc) if "density" in r] + [("bot-360 pooled", sim_p, obs_p)]
    f5_ok = all(abs(a - b) <= 0.10 for _, a, b in f5)
    P(f"F5 (held-out share within 0.10 for b_03, b_08 and pooled bot-360): {'held' if f5_ok else 'refuted'} ("
      + "; ".join(f"{k}: sim {a:.3f} vs {b:.3f}" for k, a, b in f5) + ")")
    rho = L.spearman([r["N"] for r in free], [s["share"] for s in free_sc])
    P(f"F6 (simulated share falls with calibrated walker count, Spearman negative): {'held' if rho < 0 else 'refuted'} (rho = {rho:+.2f})")
    P(f"F7 (PedPy copies reproduce milestone 2 exactly): {'held' if f7 else 'refuted'}")
    P(f"H3 for the social-force family (F2, F3 and F4): {'passes' if in_ci >= 6 and in_lane >= 6 and f4_ok else 'fails'}")

    with open(os.path.join(HERE, "m3_sf_twin_results.txt"), "w") as f:
        f.write("\n".join(out) + "\n")
    rows = ["run,experiment,condition,N,obs_share,obs_lo,obs_hi,sim_share,sim_share_sd,obs_lane,sim_lane,obs_speed,sim_speed,sim_density,failed"]
    for cond, rs_, sc in (("free", free, free_sc), ("assigned", held, held_sc), ("assigned_nogoal", held, held_nogoal)):
        for r, s in zip(rs_, sc):
            rows.append(f"{r['run']},{r['exp']},{cond},{r['N']},{r['share']:.4f},{r['lo']:.4f},{r['hi']:.4f},{s['share']:.4f},"
                        f"{s['share_sd']:.4f},{r['lane']:.4f},{s['lane']:.4f},{r['speed']:.3f},{s['speed']:.3f},{s['density']:.3f},{s['n_failed']}")
    with open(os.path.join(HERE, "m3_sf_twin_runs.csv"), "w") as f:
        f.write("\n".join(rows) + "\n")
    fitrows = ["beta,loss,pooled_share,mean_lane"]
    for b in BETAS:
        per = fits[b][1]
        fitrows.append(f"{b},{fits[b][0]:.2f},{mean([p['share'] for p in per]):.4f},{mean([p['lane'] for p in per]):.4f}")
    with open(os.path.join(HERE, "m3_sf_twin_fit.csv"), "w") as f:
        f.write("\n".join(fitrows) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main()
