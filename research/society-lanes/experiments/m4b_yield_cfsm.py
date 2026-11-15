"""Milestone 4b: a side bias that yields to a lateral goal, in three families, and a third family.

Predictions Y1 to Y5 and C1 to C6 are in LOG.md, written before this script's full run.

Part A: the two fitted families of milestones 3 and 4a (JuPedSim social force at beta = 0.1,
JuPedSim AnticipationVelocityModel at beta = 0.35), with their walker counts as calibrated there
(experiments/m3_sf_twin_runs.csv, experiments/m4_avm_exits_runs.csv), on the 14 held-out
assigned-exit runs, exits at 0.25 of the width from a wall, under two new bias rules ("yield",
"scaled"; sftwin.bias_weight). Walkers without a lateral goal get the full bias under every rule,
so the free-choice fits, and so beta, are unchanged: nothing is refitted on the held-out runs.
Part B: JuPedSim 1.4.2 CollisionFreeSpeedModel (Tordeux, Chraibi and Seyfried 2016, JuPedSim
defaults) under milestone 3's protocol (walker count calibrated to speed at beta = 0, beta fitted
on the nine free runs, scored with 20 seeds), then held out under all three rules.

Needs jupedsim and numpy: PY=$(python3 platform/ci/pyenv.py jupedsim numpy), then
  "$PY" experiments/m4b_yield_cfsm.py   (about 45 min on 4 cores; cached per job in
                                         data_cache/m4b_cache.json, delete it to rerun)
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
import m3_sf_twin as M3  # noqa: E402
import m4_avm_exits as M4  # noqa: E402

CACHE = M3.CACHE
SEED0 = M3.SEED0
DURATION, WARMUP = M3.DURATION, M3.WARMUP
FIT_SEEDS, CAL_SEEDS, SCORE_SEEDS = M3.FIT_SEEDS, M3.CAL_SEEDS, M3.SCORE_SEEDS
FITTED = {"sf": 0.1, "avm": 0.35}          # milestones 3 and 4a
RULES = ["always", "yield", "scaled"]
CFSM_BETAS = [0.0, 0.05, 0.1, 0.2, 0.35, 0.5, 0.75, 1.0]
CFSM_N_GRID = [20, 30, 40, 60, 80, 100, 130]
EXIT = 0.25
LOSSES = {"sf": 43.2, "avm": 106.8}


def _sim(job):
    import sftwin as S
    key, model, n, width, length, entrance, beta, seed, goals, rule = job
    r = S.simulate(n, width, length, entrance, beta, seed, goals=goals, duration=DURATION,
                   warmup=WARMUP, model=model, exit_frac=EXIT, rule=rule)
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


def earlier():
    """Held-out walker counts and 'always' shares from milestones 3 and 4a."""
    out = {}
    with open(os.path.join(HERE, "m3_sf_twin_runs.csv")) as f:
        for r in csv.DictReader(f):
            if r["condition"] == "assigned":
                out[("sf", r["run"])] = (int(r["N"]), float(r["sim_share"]), float(r["sim_lane"]))
    with open(os.path.join(HERE, "m4_avm_exits_runs.csv")) as f:
        for r in csv.DictReader(f):
            if r["model"] == "avm" and r["condition"] == "assigned" and r["exit_frac"] == "0.25":
                out[("avm", r["run"])] = (int(r["N"]), float(r["sim_share"]), float(r["sim_lane"]))
    return out


def main():
    cpath = os.path.join(CACHE, "m4b_cache.json")
    os.makedirs(CACHE, exist_ok=True)
    cache = json.load(open(cpath)) if os.path.exists(cpath) else {}
    runs = M3.runs_table()
    free = [r for r in runs if r["free"]]
    held = [r for r in runs if not r["free"]]
    ped = M3.pedpy_measure()
    for r in runs:
        if r["run"] in ped:
            r["density"] = ped[r["run"]]["density"]
    prev = earlier()
    k = M3.key
    out = []
    P = out.append

    def score(model, rs_, beta, goals, rule, tag, nkey):
        jobs = [(k(tag, model, r["run"], r[nkey], beta, s, goals, rule), model, r[nkey], r["width"],
                 r["length"], r["entrance"], beta, SEED0 + 500 + s, goals, rule)
                for r in rs_ for s in range(SCORE_SEEDS)]
        got = run_jobs(jobs, cache, pool, cpath)
        return [M4.agg(got[i * SCORE_SEEDS:(i + 1) * SCORE_SEEDS]) for i in range(len(rs_))]

    def calibrate(model, r, target, beta):
        jobs = [(k("cal", model, r["run"], n, beta, s), model, n, r["width"], r["length"], r["entrance"],
                 beta, SEED0 + 1000 + s, False, "always") for n in CFSM_N_GRID for s in range(CAL_SEEDS)]
        rs = run_jobs(jobs, cache, pool, cpath)
        best = None
        for i, n in enumerate(CFSM_N_GRID):
            a = M4.agg(rs[i * CAL_SEEDS:(i + 1) * CAL_SEEDS])
            if a["n_ok"] == 0:
                continue
            miss = abs(a[target] - r[target])
            if best is None or miss < best[1]:
                best = (n, miss, a)
        return best

    res = {}   # (model, rule) -> list of per-held-run aggregates (None: taken from the earlier CSVs)
    with mp.Pool(int(os.environ.get("M4_PROCS", "4"))) as pool:
        # ---------------- Part A: the fitted families under the new rules
        for model in ("sf", "avm"):
            for r in held:
                r["N_" + model] = prev[(model, r["run"])][0]
            for rule in ("yield", "scaled"):
                res[(model, rule)] = score(model, held, FITTED[model], True, rule, "rule", "N_" + model)
        # ---------------- Part B: collision-free speed model
        for r in free:
            r["N_cfsm"], r["cal_miss"], r["cal"] = calibrate("cfsm", r, "speed", 0.0)
        fits = {}
        for b in CFSM_BETAS:
            jobs = [(k("fit", "cfsm", r["run"], r["N_cfsm"], b, s), "cfsm", r["N_cfsm"], r["width"], r["length"],
                     r["entrance"], b, SEED0 + s, False, "always") for r in free for s in range(FIT_SEEDS)]
            rs = run_jobs(jobs, cache, pool, cpath)
            per = [M4.agg(rs[i * FIT_SEEDS:(i + 1) * FIT_SEEDS]) for i in range(len(free))]
            fits[b] = (sum(M3.loss(p, r) for p, r in zip(per, free)), per)
        beta = min(CFSM_BETAS, key=lambda b: fits[b][0] if fits[b][0] == fits[b][0] else float("inf"))
        FITTED["cfsm"] = beta
        free_sc = score("cfsm", free, beta, False, "always", "score", "N_cfsm")
        for r in held:
            if "density" in r:
                r["N_cfsm"], r["cal_miss"], r["cal"] = calibrate("cfsm", r, "density", beta)
            else:
                r["N_cfsm"], r["cal_miss"], r["cal"] = calibrate("cfsm", r, "speed", 0.0)
        for rule in RULES:
            res[("cfsm", rule)] = score("cfsm", held, beta, True, rule, "held", "N_cfsm")

    # ------------------------------------------------------------ report
    hermes = [i for i, r in enumerate(held) if r["run"].startswith("bot-360")]

    def share(model, rule, i):
        if (model, rule) in res:
            return res[(model, rule)][i]["share"]
        return prev[(model, held[i]["run"])][1]

    def lane(model, rule, i):
        if (model, rule) in res:
            return res[(model, rule)][i]["lane"]
        return prev[(model, held[i]["run"])][2]

    def pooled(model, rule):
        w = sum(held[i]["walkers"] for i in hermes)
        return (sum(share(model, rule, i) * held[i]["walkers"] for i in hermes) / w,
                sum(held[i]["share"] * held[i]["walkers"] for i in hermes) / w)

    P("Milestone 4b: a side bias that yields to a lateral goal (three JuPedSim 1.4.2 families) and the collision-free speed model")
    P(f"seeds: calibration {CAL_SEEDS}, fit {FIT_SEEDS}, score {SCORE_SEEDS}; {DURATION:.0f} s per run after {WARMUP:.0f} s warm-up; exits at {EXIT} of the width from a wall")
    P("'always' rows for sf and avm are milestone 3 and 4a results, read from their CSVs, not rerun")
    P("")
    P("Part B calibration (collision-free speed model; walker count whose beta = 0 median speed is nearest the observed):")
    for r in free:
        P(f"  {r['run']:<18} {r['exp']:<6} observed speed {r['speed']:.2f} -> N={r['N_cfsm']:>3}, simulated {r['cal']['speed']:.2f} m/s at "
          f"{r['cal']['density']:.2f}/m2 (miss {r['cal_miss']:.2f}; jammed {r['cal']['n_jammed']})")
    P("Fit (milestone 3's loss over the 9 free runs, 5 seeds):")
    for b in CFSM_BETAS:
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
    P("")
    P("Held-out assigned-exit runs: share on own right by family and bias rule (obs = people)")
    cols = [(m, ru) for m in ("sf", "avm", "cfsm") for ru in RULES]
    P(f"  {'run':<18} {'obs':>6} " + " ".join(f"{m + ':' + ru[:3]:>9}" for m, ru in cols))
    for i, r in enumerate(held):
        P(f"  {r['run']:<18} {r['share']:6.3f} " + " ".join(f"{share(m, ru, i):9.3f}" for m, ru in cols))
    P("  pooled bot-360     " + f"{pooled('sf', 'always')[1]:6.3f} " + " ".join(f"{pooled(m, ru)[0]:9.3f}" for m, ru in cols))
    P("Held-out lane order (obs = people):")
    for i, r in enumerate(held):
        P(f"  {r['run']:<18} {r['lane']:6.3f} " + " ".join(f"{lane(m, ru, i):9.3f}" for m, ru in cols))
    P("CFSM held-out calibration and speed (rule 'always'):")
    for i, r in enumerate(held):
        how = f"density {r['density']:.2f} measured" if "density" in r else f"speed {r['speed']:.2f} observed"
        s = res[("cfsm", "always")][i]
        P(f"  {r['run']:<18} N={r['N_cfsm']:>3} ({how}; sim {s['speed']:.2f} m/s, {s['density']:.2f}/m2) jammed {s['n_jammed']} failed {s['n_failed'] - s['n_jammed']}")
    mae = {(m, ru): M3.mean([abs(share(m, ru, i) - held[i]["share"]) for i in range(len(held))]) for m, ru in cols}
    P("Mean absolute share error over the 14 held-out runs: " + ", ".join(f"{m}:{ru} {mae[(m, ru)]:.3f}" for m, ru in cols))
    P("")
    obs_p = pooled("sf", "always")[1]
    near = {m: abs(pooled(m, "yield")[0] - obs_p) <= 0.10 for m in ("sf", "avm", "cfsm")}
    P(f"Y1 (social force, yield: pooled bot-360 within 0.10 of observed): {'held' if near['sf'] else 'refuted'} ({pooled('sf', 'yield')[0]:.3f} vs {obs_p:.3f})")
    P(f"Y2 (AVM, yield: pooled bot-360 within 0.10 of observed): {'held' if near['avm'] else 'refuted'} ({pooled('avm', 'yield')[0]:.3f} vs {obs_p:.3f})")
    y3 = all(abs(pooled(m, "yield")[0] - obs_p) < abs(pooled(m, "scaled")[0] - obs_p) for m in ("sf", "avm", "cfsm"))
    P(f"Y3 (yield closer than scaled in all three families): {'held' if y3 else 'refuted'} ("
      + "; ".join(f"{m}: yield {pooled(m, 'yield')[0]:.3f}, scaled {pooled(m, 'scaled')[0]:.3f}" for m in ("sf", "avm", "cfsm")) + ")")
    bb = {r["run"][-4:]: (share("sf", "yield", i), r["share"]) for i, r in enumerate(held) if "density" in r}
    y4 = all(abs(a - b) <= 0.10 for a, b in bb.values())
    P(f"Y4 (social force, yield: b_03 and b_08 within 0.10): {'held' if y4 else 'refuted'} ("
      + "; ".join(f"{n}: {a:.3f} vs {b:.3f}" for n, (a, b) in bb.items()) + ")")
    below = sum(1 for i, r in enumerate(held) if share("sf", "yield", i) < r["share"])
    P(f"Y5 (social force, yield: below the observed in >= 5 of 14): {'held' if below >= 5 else 'refuted'} ({below} of 14)")
    b0 = fits[0.0][1]
    p0 = sum(p["share"] * r["walkers"] for p, r in zip(b0, free)) / sum(r["walkers"] for r in free)
    P(f"C1 (CFSM beta = 0 pooled free share in [0.40, 0.60]): {'held' if 0.40 <= p0 <= 0.60 else 'refuted'} ({p0:.3f}, mean seed sd {M3.mean([p['share_sd'] for p in b0]):.3f})")
    P(f"C2 (CFSM share inside the 95% interval in >= 6 of 9): {'held' if in_ci >= 6 else 'refuted'} ({in_ci} of 9)")
    P(f"C3 (CFSM lane order within 0.10 in >= 6 of 9): {'held' if in_lane >= 6 else 'refuted'} ({in_lane} of 9)")
    f4 = [(r["run"][-4:], res[("cfsm", "always")][i]["speed"], r["speed"], res[("cfsm", "always")][i]["density"], r["density"])
          for i, r in enumerate(held) if "density" in r]
    c4 = all(abs(a - b) <= 0.15 for _, a, b, _, _ in f4)
    P(f"C4 (CFSM b_03 and b_08 speed within 0.15 m/s): {'held' if c4 else 'refuted'} ("
      + "; ".join(f"{n}: sim {a:.2f} vs {b:.2f} m/s, density {c:.2f} vs {d:.2f}/m2" for n, a, b, c, d in f4) + ")")
    P(f"C5 (CFSM always: pooled bot-360 > 0.70): {'held' if pooled('cfsm', 'always')[0] > 0.70 else 'refuted'} ({pooled('cfsm', 'always')[0]:.3f})")
    P(f"C6 (CFSM yield: pooled bot-360 within 0.10 of observed): {'held' if near['cfsm'] else 'refuted'} ({pooled('cfsm', 'yield')[0]:.3f})")
    P(f"Headline (yield within 0.10 of the HERMES pooled share in all three families): {'held' if all(near.values()) else 'refuted'}")
    P(f"CFSM best loss {fits[beta][0]:.1f} (social force {LOSSES['sf']}, AVM {LOSSES['avm']})")

    with open(os.path.join(HERE, "m4b_yield_cfsm_results.txt"), "w") as f:
        f.write("\n".join(out) + "\n")
    rows = ["model,rule,run,experiment,beta,N,obs_share,sim_share,obs_lane,sim_lane,source"]
    for m, ru in cols:
        for i, r in enumerate(held):
            src = "this run" if (m, ru) in res else ("milestone 3" if m == "sf" else "milestone 4a")
            rows.append(f"{m},{ru},{r['run']},{r['exp']},{FITTED[m]},{r['N_' + m]},{r['share']:.4f},"
                        f"{share(m, ru, i):.4f},{r['lane']:.4f},{lane(m, ru, i):.4f},{src}")
    with open(os.path.join(HERE, "m4b_yield_cfsm_runs.csv"), "w") as f:
        f.write("\n".join(rows) + "\n")
    fitrows = ["beta,loss,pooled_share,mean_seed_sd,mean_lane"]
    for b in CFSM_BETAS:
        per = fits[b][1]
        fitrows.append(f"{b},{fits[b][0]:.2f},{M3.mean([p['share'] for p in per]):.4f},"
                       f"{M3.mean([p['share_sd'] for p in per]):.4f},{M3.mean([p['lane'] for p in per]):.4f}")
    with open(os.path.join(HERE, "m4b_cfsm_fit.csv"), "w") as f:
        f.write("\n".join(fitrows) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main()
