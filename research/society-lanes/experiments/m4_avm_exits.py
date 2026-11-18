"""Milestone 4a: the exit-position check on the social-force twin, and the AVM as a second family.

Predictions E1 to E3 and A1 to A7 are in LOG.md, written before this script's full run.

Part A: JuPedSim social force at milestone 3's fitted beta = 0.1 and walker counts
(experiments/m3_sf_twin_runs.csv), the 14 held-out assigned-exit runs with the exit goal at
0.10, 0.25 and 0.40 of the width from a wall.
Part B: JuPedSim 1.4.2 AnticipationVelocityModel (Xu, Chraibi and Seyfried 2021) under
milestone 3's protocol: walker count calibrated to speed at beta = 0, beta fitted on the nine
free-choice runs, scored with 20 seeds, held out on the assigned-exit runs.

Needs jupedsim and numpy: PY=$(python3 platform/ci/pyenv.py jupedsim numpy), then
  "$PY" experiments/m4_avm_exits.py     (about 35 min on 4 cores; cached per job in
                                         data_cache/m4_cache.json, delete it to rerun)
"""
from __future__ import annotations

import csv
import json
import multiprocessing as mp
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)
sys.path.insert(0, HERE)
import lanes as L  # noqa: E402
import m3_sf_twin as M3  # noqa: E402

CACHE = M3.CACHE
SEED0 = M3.SEED0
DURATION, WARMUP = M3.DURATION, M3.WARMUP
FIT_SEEDS, CAL_SEEDS, SCORE_SEEDS = M3.FIT_SEEDS, M3.CAL_SEEDS, M3.SCORE_SEEDS
SF_BETA = 0.1                      # milestone 3's fitted value
EXITS = [0.10, 0.25, 0.40]
AVM_BETAS = [0.0, 0.05, 0.1, 0.2, 0.35, 0.5, 0.75, 1.0]
AVM_N_GRID = [20, 30, 40, 60, 80, 100, 130]
SF_LOSS_M3 = 43.2


def _sim(job):
    import sftwin as S
    key, model, n, width, length, entrance, beta, seed, goals, exit_frac = job
    r = S.simulate(n, width, length, entrance, beta, seed, goals=goals, duration=DURATION,
                   warmup=WARMUP, model=model, exit_frac=exit_frac)
    r.pop("flags")
    return key, r


def run_jobs(jobs, cache, pool, cpath):
    todo = [j for j in jobs if j[0] not in cache]
    for i, (k, r) in enumerate(pool.imap_unordered(_sim, todo)):
        cache[k] = r
        if i % 40 == 0:
            print(f"  {i + 1}/{len(todo)}", flush=True)
            json.dump(cache, open(cpath, "w"))
    json.dump(cache, open(cpath, "w"))
    return [cache[j[0]] for j in jobs]


def agg(rs):
    a = M3.agg(rs)
    a["n_jammed"] = sum(1 for r in rs if not r["failed"] and r["walkers"] == 0)
    sds = [r["share"] for r in rs if not r["failed"] and r["walkers"] > 0]
    a["share_sd"] = (sum((x - a["share"]) ** 2 for x in sds) / len(sds)) ** 0.5 if len(sds) > 1 else float("nan")
    return a


def pooled(pairs):
    """Walker-weighted share over (run, sim) pairs, with the observed one."""
    w = sum(r["walkers"] for r, _ in pairs)
    return (sum(s["share"] * r["walkers"] for r, s in pairs) / w,
            sum(r["share"] * r["walkers"] for r, _ in pairs) / w)


def m3_counts():
    out = {}
    with open(os.path.join(HERE, "m3_sf_twin_runs.csv")) as f:
        for r in csv.DictReader(f):
            out[(r["run"], r["condition"])] = (int(r["N"]), float(r["sim_share"]))
    return out


def main():
    cpath = os.path.join(CACHE, "m4_cache.json")
    os.makedirs(CACHE, exist_ok=True)
    cache = json.load(open(cpath)) if os.path.exists(cpath) else {}
    runs = M3.runs_table()
    free = [r for r in runs if r["free"]]
    held = [r for r in runs if not r["free"]]
    ped = M3.pedpy_measure()
    for r in runs:
        if r["run"] in ped:
            r["density"] = ped[r["run"]]["density"]
    m3 = m3_counts()
    out = []
    P = out.append
    k = M3.key

    def score(model, rs_, beta, goals, exit_frac, tag, nkey):
        jobs = [(k(tag, model, r["run"], r[nkey], beta, s, goals, exit_frac), model, r[nkey], r["width"],
                 r["length"], r["entrance"], beta, SEED0 + 500 + s, goals, exit_frac)
                for r in rs_ for s in range(SCORE_SEEDS)]
        got = run_jobs(jobs, cache, pool, cpath)
        return [agg(got[i * SCORE_SEEDS:(i + 1) * SCORE_SEEDS]) for i in range(len(rs_))]

    def calibrate(model, r, target, beta):
        jobs = [(k("cal", model, r["run"], n, beta, s), model, n, r["width"], r["length"], r["entrance"],
                 beta, SEED0 + 1000 + s, False, 0.25) for n in AVM_N_GRID for s in range(CAL_SEEDS)]
        rs = run_jobs(jobs, cache, pool, cpath)
        best = None
        for i, n in enumerate(AVM_N_GRID):
            a = agg(rs[i * CAL_SEEDS:(i + 1) * CAL_SEEDS])
            if a["n_ok"] == 0:
                continue
            miss = abs(a[target] - r[target])
            if best is None or miss < best[1]:
                best = (n, miss, a)
        return best

    with mp.Pool(int(os.environ.get("M4_PROCS", "4"))) as pool:
        # ---------------- Part A: social force, exit position
        for r in held:
            r["N_sf"] = m3[(r["run"], "assigned")][0]
        sf_exit = {e: score("sf", held, SF_BETA, True, e, "sfx", "N_sf") for e in EXITS}
        # ---------------- Part B: AVM
        for r in free:
            r["N_avm"], r["cal_miss"], r["cal"] = calibrate("avm", r, "speed", 0.0)
        fits = {}
        for b in AVM_BETAS:
            jobs = [(k("fit", "avm", r["run"], r["N_avm"], b, s), "avm", r["N_avm"], r["width"], r["length"],
                     r["entrance"], b, SEED0 + s, False, 0.25) for r in free for s in range(FIT_SEEDS)]
            rs = run_jobs(jobs, cache, pool, cpath)
            per = [agg(rs[i * FIT_SEEDS:(i + 1) * FIT_SEEDS]) for i in range(len(free))]
            fits[b] = (sum(M3.loss(p, r) for p, r in zip(per, free)), per)
        beta = min(AVM_BETAS, key=lambda b: fits[b][0] if fits[b][0] == fits[b][0] else float("inf"))
        free_sc = score("avm", free, beta, False, 0.25, "score", "N_avm")
        for r in held:
            if "density" in r:
                r["N_avm"], r["cal_miss"], r["cal"] = calibrate("avm", r, "density", beta)
            else:
                r["N_avm"], r["cal_miss"], r["cal"] = calibrate("avm", r, "speed", 0.0)
        avm_exit = {e: score("avm", held, beta, True, e, "held", "N_avm") for e in EXITS}
        avm_nogoal = score("avm", held, beta, False, 0.25, "held_nogoal", "N_avm")

    # ------------------------------------------------------------ report
    hermes = [i for i, r in enumerate(held) if r["run"].startswith("bot-360")]
    P("Milestone 4a: exit-position check (social force) and the anticipation velocity model (JuPedSim 1.4.2)")
    P(f"seeds: calibration {CAL_SEEDS}, fit {FIT_SEEDS}, score {SCORE_SEEDS}; {DURATION:.0f} s per run after {WARMUP:.0f} s warm-up")
    P("")
    P(f"Part A: social force, beta = {SF_BETA}, milestone 3 walker counts; held-out share by exit position (fraction of width from a wall)")
    P(f"  {'run':<18} {'obs':>6} " + " ".join(f"{e:>7.2f}" for e in EXITS) + "   m3(0.25)")
    for i, r in enumerate(held):
        P(f"  {r['run']:<18} {r['share']:6.3f} " + " ".join(f"{sf_exit[e][i]['share']:7.3f}" for e in EXITS)
          + f"   {m3[(r['run'], 'assigned')][1]:.3f}   failed " + "/".join(str(sf_exit[e][i]['n_failed']) for e in EXITS))
    e1 = max(abs(sf_exit[0.25][i]["share"] - m3[(r["run"], "assigned")][1]) for i, r in enumerate(held))
    pa = {e: pooled([(held[i], sf_exit[e][i]) for i in hermes]) for e in EXITS}
    above = sum(1 for i, r in enumerate(held) if sf_exit[0.10][i]["share"] > r["share"])
    P(f"  pooled bot-360: obs {pa[0.25][1]:.3f}; sim " + ", ".join(f"{e:.2f}: {pa[e][0]:.3f}" for e in EXITS))
    P(f"E1 (rerun at 0.25 within 0.005 of milestone 3 in all 14): {'held' if e1 <= 0.005 else 'refuted'} (largest difference {e1:.4f})")
    P(f"E2 (pooled bot-360 share 0.10 < 0.25 < 0.40): {'held' if pa[0.10][0] < pa[0.25][0] < pa[0.40][0] else 'refuted'}")
    P(f"E3 (at 0.10 the twin is above the observed in >= 12 of 14): {'held' if above >= 12 else 'refuted'} ({above} of 14)")
    P("")
    P("Part B: anticipation velocity model")
    P("Calibration of the free runs (walker count whose beta = 0 median speed is nearest the observed):")
    for r in free:
        P(f"  {r['run']:<18} {r['exp']:<6} observed speed {r['speed']:.2f} -> N={r['N_avm']:>3}, simulated {r['cal']['speed']:.2f} m/s at "
          f"{r['cal']['density']:.2f}/m2 (miss {r['cal_miss']:.2f}; jammed {r['cal']['n_jammed']})")
    P("Fit (milestone 3's loss over the 9 free runs, 5 seeds):")
    for b in AVM_BETAS:
        per = fits[b][1]
        P(f"  beta {b:<5} loss {fits[b][0]:10.1f}   pooled share {M3.mean([p['share'] for p in per]):.3f}"
          f"   mean seed sd {M3.mean([p['share_sd'] for p in per]):.3f}   mean lane {M3.mean([p['lane'] for p in per]):.3f}"
          f"   failed {sum(p['n_failed'] - p['n_jammed'] for p in per)} jammed {sum(p['n_jammed'] for p in per)}")
    P(f"  fitted beta = {beta}")
    P(f"Free runs at beta = {beta}, {SCORE_SEEDS} seeds:")
    in_ci = in_lane = 0
    for r, s in zip(free, free_sc):
        a = r["lo"] <= s["share"] <= r["hi"]
        b_ = abs(s["lane"] - r["lane"]) <= 0.10
        in_ci += a
        in_lane += b_
        P(f"  {r['run']:<18} share sim {s['share']:.3f} (sd {s['share_sd']:.3f}) obs {r['share']:.3f} [{r['lo']:.3f}, {r['hi']:.3f}] {'in' if a else 'OUT'}"
          f"  lane sim {s['lane']:.3f} obs {r['lane']:.3f} {'ok' if b_ else 'MISS'}  speed sim {s['speed']:.2f} obs {r['speed']:.2f}"
          f"  density {s['density']:.2f}  jammed {s['n_jammed']}")
    P(f"Held-out assigned-exit runs at beta = {beta} (share by exit position; no-goal share for comparison):")
    for i, r in enumerate(held):
        how = f"density {r['density']:.2f} measured" if "density" in r else f"speed {r['speed']:.2f} observed"
        s = avm_exit[0.25][i]
        P(f"  {r['run']:<18} N={r['N_avm']:>3} ({how}; sim {s['speed']:.2f} m/s, {s['density']:.2f}/m2) obs {r['share']:.3f}  sim "
          + " ".join(f"{e:.2f}:{avm_exit[e][i]['share']:.3f}" for e in EXITS)
          + f"  [no goal {avm_nogoal[i]['share']:.3f}]  lane sim {s['lane']:.3f} obs {r['lane']:.3f}  jammed {s['n_jammed']}")
    pb = {e: pooled([(held[i], avm_exit[e][i]) for i in hermes]) for e in EXITS}
    P(f"  pooled bot-360: obs {pb[0.25][1]:.3f}; sim " + ", ".join(f"{e:.2f}: {pb[e][0]:.3f}" for e in EXITS))
    P("")
    b0 = fits[0.0][1]
    pooled0 = sum(p["share"] * r["walkers"] for p, r in zip(b0, free)) / sum(r["walkers"] for r in free)
    sd0 = M3.mean([p["share_sd"] for p in b0])
    P(f"A1 (beta = 0 pooled share in [0.40, 0.60] and mean seed sd > 0.30): {'held' if 0.40 <= pooled0 <= 0.60 and sd0 > 0.30 else 'refuted'} ({pooled0:.3f}, sd {sd0:.3f})")
    P(f"A2 (share inside the 95% interval in >= 6 of 9): {'held' if in_ci >= 6 else 'refuted'} ({in_ci} of 9)")
    P(f"A3 (lane order within 0.10 in >= 6 of 9): {'held' if in_lane >= 6 else 'refuted'} ({in_lane} of 9)")
    f4 = [(r["run"], avm_exit[0.25][i]["speed"], r["speed"], avm_exit[0.25][i]["density"], r["density"])
          for i, r in enumerate(held) if "density" in r]
    a4 = all(abs(a - b) <= 0.15 for _, a, b, _, _ in f4)
    P(f"A4 (b_03 and b_08 speed within 0.15 m/s at the measured density): {'held' if a4 else 'refuted'} ("
      + "; ".join(f"{n[-4:]}: sim {a:.2f} vs {b:.2f} m/s, sim density {c:.2f} vs {d:.2f}/m2" for n, a, b, c, d in f4) + ")")
    f5 = [(r["run"], avm_exit[0.25][i]["share"], r["share"]) for i, r in enumerate(held) if "density" in r] + [("bot-360 pooled",) + pb[0.25]]
    a5 = all(abs(a - b) <= 0.10 for _, a, b in f5)
    P(f"A5 (held-out share within 0.10 for b_03, b_08, pooled bot-360): {'held' if a5 else 'refuted'} ("
      + "; ".join(f"{n}: sim {a:.3f} vs {b:.3f}" for n, a, b in f5) + ")")
    sf_p = pa[0.25][0]
    P(f"A6 (AVM pooled bot-360 closer to observed than social force): {'held' if abs(pb[0.25][0] - pb[0.25][1]) < abs(sf_p - pa[0.25][1]) else 'refuted'}"
      f" (AVM {pb[0.25][0]:.3f}, SF {sf_p:.3f}, observed {pb[0.25][1]:.3f})")
    P(f"A7 (AVM best loss below social force's {SF_LOSS_M3}): {'held' if fits[beta][0] < SF_LOSS_M3 else 'refuted'} ({fits[beta][0]:.1f})")
    P(f"H3 for the AVM family (A2, A3 and A4): {'passes' if in_ci >= 6 and in_lane >= 6 and a4 else 'fails'}")

    with open(os.path.join(HERE, "m4_avm_exits_results.txt"), "w") as f:
        f.write("\n".join(out) + "\n")
    rows = ["model,run,experiment,condition,exit_frac,beta,N,obs_share,obs_lo,obs_hi,sim_share,sim_share_sd,obs_lane,sim_lane,obs_speed,sim_speed,sim_density,failed,jammed"]

    def row(model, r, cond, e, b, n, s):
        rows.append(f"{model},{r['run']},{r['exp']},{cond},{e},{b},{n},{r['share']:.4f},{r['lo']:.4f},{r['hi']:.4f},{s['share']:.4f},"
                    f"{s['share_sd']:.4f},{r['lane']:.4f},{s['lane']:.4f},{r['speed']:.3f},{s['speed']:.3f},{s['density']:.3f},"
                    f"{s['n_failed'] - s['n_jammed']},{s['n_jammed']}")
    for e in EXITS:
        for r, s in zip(held, sf_exit[e]):
            row("sf", r, "assigned", e, SF_BETA, r["N_sf"], s)
    for r, s in zip(free, free_sc):
        row("avm", r, "free", "", beta, r["N_avm"], s)
    for e in EXITS:
        for r, s in zip(held, avm_exit[e]):
            row("avm", r, "assigned", e, beta, r["N_avm"], s)
    for r, s in zip(held, avm_nogoal):
        row("avm", r, "assigned_nogoal", "", beta, r["N_avm"], s)
    with open(os.path.join(HERE, "m4_avm_exits_runs.csv"), "w") as f:
        f.write("\n".join(rows) + "\n")
    fitrows = ["beta,loss,pooled_share,mean_seed_sd,mean_lane"]
    for b in AVM_BETAS:
        per = fits[b][1]
        fitrows.append(f"{b},{fits[b][0]:.2f},{M3.mean([p['share'] for p in per]):.4f},"
                       f"{M3.mean([p['share_sd'] for p in per]):.4f},{M3.mean([p['lane'] for p in per]):.4f}")
    with open(os.path.join(HERE, "m4_avm_fit.csv"), "w") as f:
        f.write("\n".join(fitrows) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main()
