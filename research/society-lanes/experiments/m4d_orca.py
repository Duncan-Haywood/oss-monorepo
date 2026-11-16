"""Milestone 4d: ORCA (van den Berg et al. 2011; RVO2's algorithm, UMANS parameters) as a fifth family.

Predictions O1 to O9 are in LOG.md, written before this script's full run.

The operational model is orca.py (nothing about it is fitted). It runs under milestone 3's
protocol exactly as the power law did in milestone 4c: the walker count is calibrated to the
observed median speed at beta = 0 for each free run, the side bias beta is fitted on the nine free
runs by milestone 3's loss, the fit is scored with 20 seeds, and the 14 held-out assigned-exit runs
are simulated (count calibrated to measured density for b_03 and b_08, to speed otherwise) under
the three bias rules (always, yield, scaled; exits at 0.25 of the width from a wall). Nothing is
refitted on the held-out runs. The other four families' numbers are read from milestone 4b's and
4c's CSVs.

Needs numpy (numba makes it about 50 times faster): "$PY" experiments/m4d_orca.py
(about 15 min on 4 cores with numba; cached per job in data_cache/m4d_cache.json)
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

CACHE = M3.CACHE
SEED0 = M3.SEED0
DURATION, WARMUP = M3.DURATION, M3.WARMUP
FIT_SEEDS, CAL_SEEDS, SCORE_SEEDS = M3.FIT_SEEDS, M3.CAL_SEEDS, M3.SCORE_SEEDS
RULES = ["always", "yield", "scaled"]
BETAS = [0.0, 0.05, 0.1, 0.2, 0.35, 0.5, 0.75, 1.0]           # milestone 4b's grid
N_GRID = [20, 30, 40, 60, 80, 100, 130, 160, 200]              # milestone 4c's grid
EXIT = 0.25
LOSSES = {"sf": 43.2, "avm": 106.8, "cfsm": 53.9, "pl": 82.2}  # milestones 3, 4a, 4b, 4c
FITTED = {"sf": 0.1, "avm": 0.35, "cfsm": 0.2, "pl": 0.35}       # their fitted beta
NAMES = {"sf": "social force", "avm": "anticipation velocity", "cfsm": "collision-free speed",
         "pl": "power law", "orca": "ORCA"}


def mean(v):
    return M3.mean(v)


def agg(rs):
    a = M3.agg(rs)
    a["n_jammed"] = sum(1 for r in rs if not r["failed"] and r["walkers"] == 0)
    return a


def _sim(job):
    import orca as PL
    key, n, width, length, entrance, beta, seed, goals, rule = job
    r = PL.simulate(n, width, length, entrance, beta, seed, goals=goals, duration=DURATION,
                    warmup=WARMUP, exit_frac=EXIT, rule=rule)
    r.pop("flags")
    return key, r


def run_jobs(jobs, cache, pool, cpath):
    todo = [j for j in jobs if j[0] not in cache]
    for i, (k, r) in enumerate(pool.imap_unordered(_sim, todo, chunksize=2)):
        cache[k] = r
        if i % 40 == 0:
            print(f"  {i + 1}/{len(todo)}", flush=True)
            json.dump(cache, open(cpath, "w"))
    json.dump(cache, open(cpath, "w"))
    return [cache[j[0]] for j in jobs]


def earlier():
    """Held-out shares and lanes of the other four families (milestones 4b and 4c CSVs)."""
    out = {}
    with open(os.path.join(HERE, "m4b_yield_cfsm_runs.csv")) as f:
        for r in csv.DictReader(f):
            out[(r["model"], r["rule"], r["run"])] = (float(r["sim_share"]), float(r["sim_lane"]))
    with open(os.path.join(HERE, "m4c_powerlaw_runs.csv")) as f:
        for r in csv.DictReader(f):
            out[(r["model"], r["rule"], r["run"])] = (float(r["sim_share"]), float(r["sim_lane"]))
    return out


def main():
    cpath = os.path.join(CACHE, "m4d_cache.json")
    os.makedirs(CACHE, exist_ok=True)
    cache = json.load(open(cpath)) if os.path.exists(cpath) else {}
    runs = M3.runs_table()
    free = [r for r in runs if r["free"]]
    held = [r for r in runs if not r["free"]]
    ped = M3.pedpy_measure()
    for r in runs:
        if r["run"] in ped:
            r["density"] = ped[r["run"]]["density"]
    k = M3.key
    out = []
    P = out.append

    with mp.Pool(int(os.environ.get("M4_PROCS", "4"))) as pool:
        def calibrate(r, target, beta):
            jobs = [(k("cal", r["run"], n, beta, s), n, r["width"], r["length"], r["entrance"],
                     beta, SEED0 + 1000 + s, False, "always") for n in N_GRID for s in range(CAL_SEEDS)]
            rs = run_jobs(jobs, cache, pool, cpath)
            best = None
            for i, n in enumerate(N_GRID):
                a = agg(rs[i * CAL_SEEDS:(i + 1) * CAL_SEEDS])
                if a["n_ok"] == 0:
                    continue
                miss = abs(a[target] - r[target])
                if best is None or miss < best[1]:
                    best = (n, miss, a)
            return best

        def score(rs_, beta, goals, rule, tag):
            jobs = [(k(tag, r["run"], r["N"], beta, s, goals, rule), r["N"], r["width"], r["length"],
                     r["entrance"], beta, SEED0 + 500 + s, goals, rule)
                    for r in rs_ for s in range(SCORE_SEEDS)]
            got = run_jobs(jobs, cache, pool, cpath)
            return [agg(got[i * SCORE_SEEDS:(i + 1) * SCORE_SEEDS]) for i in range(len(rs_))]

        for r in free:
            r["N"], r["cal_miss"], r["cal"] = calibrate(r, "speed", 0.0)
        fits = {}
        for b in BETAS:
            jobs = [(k("fit", r["run"], r["N"], b, s), r["N"], r["width"], r["length"],
                     r["entrance"], b, SEED0 + s, False, "always") for r in free for s in range(FIT_SEEDS)]
            rs = run_jobs(jobs, cache, pool, cpath)
            per = [agg(rs[i * FIT_SEEDS:(i + 1) * FIT_SEEDS]) for i in range(len(free))]
            fits[b] = (sum(M3.loss(p, r) for p, r in zip(per, free)), per)
        beta = min(BETAS, key=lambda b: fits[b][0] if fits[b][0] == fits[b][0] else float("inf"))
        free_sc = score(free, beta, False, "always", "score")
        for r in held:
            if "density" in r:
                r["N"], r["cal_miss"], r["cal"] = calibrate(r, "density", beta)
            else:
                r["N"], r["cal_miss"], r["cal"] = calibrate(r, "speed", 0.0)
        res = {rule: score(held, beta, True, rule, "held") for rule in RULES}

    prev = earlier()
    hermes = [i for i, r in enumerate(held) if r["run"].startswith("bot-360")]
    fams = ["sf", "avm", "cfsm", "pl", "orca"]

    def share(m, rule, i):
        return res[rule][i]["share"] if m == "orca" else prev[(m, rule, held[i]["run"])][0]

    def lane(m, rule, i):
        return res[rule][i]["lane"] if m == "orca" else prev[(m, rule, held[i]["run"])][1]

    w = sum(held[i]["walkers"] for i in hermes)
    obs_p = sum(held[i]["share"] * held[i]["walkers"] for i in hermes) / w

    def pooled(m, rule):
        return sum(share(m, rule, i) * held[i]["walkers"] for i in hermes) / w

    P("Milestone 4d: ORCA (van den Berg et al. 2011; RVO2 via UMANS, UMANS parameters) as a fifth family")
    P(f"seeds: calibration {CAL_SEEDS}, fit {FIT_SEEDS}, score {SCORE_SEEDS}; {DURATION:.0f} s per run after {WARMUP:.0f} s warm-up; exits at {EXIT} of the width from a wall")
    P("rows for sf, avm, cfsm and pl are milestone 3, 4a, 4b and 4c results, read from their CSVs, not rerun")
    P("")
    P("Calibration (walker count whose beta = 0 median speed is nearest the observed):")
    for r in free:
        P(f"  {r['run']:<18} {r['exp']:<6} observed speed {r['speed']:.2f} -> N={r['N']:>3}, simulated {r['cal']['speed']:.2f} m/s at "
          f"{r['cal']['density']:.2f}/m2 (miss {r['cal_miss']:.2f}; jammed {r['cal']['n_jammed']})")
    P("Fit (milestone 3's loss over the 9 free runs, 5 seeds):")
    for b in BETAS:
        per = fits[b][1]
        P(f"  beta {b:<5} loss {fits[b][0]:10.1f}   pooled share {mean([p['share'] for p in per]):.3f}"
          f"   mean seed sd {mean([p['share_sd'] for p in per]):.3f}   mean lane {mean([p['lane'] for p in per]):.3f}"
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
          f"  density {s['density']:.2f}")
    P("")
    P("Held-out assigned-exit runs: share on own right by family and bias rule (obs = people)")
    cols = [(m, ru) for m in fams for ru in RULES]
    P(f"  {'run':<18} {'obs':>6} " + " ".join(f"{m + ':' + ru[:3]:>9}" for m, ru in cols))
    for i, r in enumerate(held):
        P(f"  {r['run']:<18} {r['share']:6.3f} " + " ".join(f"{share(m, ru, i):9.3f}" for m, ru in cols))
    P("  pooled bot-360     " + f"{obs_p:6.3f} " + " ".join(f"{pooled(m, ru):9.3f}" for m, ru in cols))
    P("Held-out lane order (obs = people):")
    for i, r in enumerate(held):
        P(f"  {r['run']:<18} {r['lane']:6.3f} " + " ".join(f"{lane(m, ru, i):9.3f}" for m, ru in cols))
    P("ORCA held-out calibration and speed (rule 'always'):")
    for i, r in enumerate(held):
        how = f"density {r['density']:.2f} measured" if "density" in r else f"speed {r['speed']:.2f} observed"
        s = res["always"][i]
        P(f"  {r['run']:<18} N={r['N']:>3} ({how}; sim {s['speed']:.2f} m/s, {s['density']:.2f}/m2) jammed {s['n_jammed']} failed {s['n_failed'] - s['n_jammed']}")
    mae = {c: mean([abs(share(*c, i) - held[i]["share"]) for i in range(len(held))]) for c in cols}
    lane_ok = {c: sum(1 for i in range(len(held)) if abs(lane(*c, i) - held[i]["lane"]) <= 0.10) for c in cols}
    P("Mean absolute share error over the 14 held-out runs: " + ", ".join(f"{m}:{ru} {mae[(m, ru)]:.3f}" for m, ru in cols))
    P("Held-out lane order within 0.10 (of 14): " + ", ".join(f"{m}:{ru} {lane_ok[(m, ru)]}" for m, ru in cols))
    P("")
    b0 = fits[0.0][1]
    p0 = sum(p["share"] * r["walkers"] for p, r in zip(b0, free)) / sum(r["walkers"] for r in free)
    P(f"O1 (beta = 0 pooled free share in [0.40, 0.60]): {'held' if 0.40 <= p0 <= 0.60 else 'refuted'} ({p0:.3f}, mean seed sd {mean([p['share_sd'] for p in b0]):.3f})")
    P(f"O2 (H3 side: share inside the 95% interval in >= 6 of 9): {'held' if in_ci >= 6 else 'refuted'} ({in_ci} of 9)")
    P(f"O3 (H3 lanes: within 0.10 in >= 6 of 9): {'held' if in_lane >= 6 else 'refuted'} ({in_lane} of 9)")
    f4 = [(r["run"][-4:], res["always"][i]["speed"], r["speed"], res["always"][i]["density"], r["density"])
          for i, r in enumerate(held) if "density" in r]
    p4 = all(abs(a - b) <= 0.15 for _, a, b, _, _ in f4)
    P(f"O4 (H3 speed: b_03 and b_08 within 0.15 m/s at the calibrated count): {'held' if p4 else 'refuted'} ("
      + "; ".join(f"{n}: sim {a:.2f} vs {b:.2f} m/s, density {c:.2f} vs {d:.2f}/m2" for n, a, b, c, d in f4) + ")")
    po = pooled("orca", "always")
    P(f"O5 (always: pooled bot-360 held-out share > 0.70): {'held' if po > 0.70 else 'refuted'} ({po:.3f})")
    py_ = pooled("orca", "yield")
    P(f"O6 (yield: within 0.10 of the observed {obs_p:.3f}): {'held' if abs(py_ - obs_p) <= 0.10 else 'refuted'} ({py_:.3f})")
    p7 = abs(py_ - obs_p) < abs(pooled("orca", "scaled") - obs_p)
    P(f"O7 (yield closer than scaled): {'held' if p7 else 'refuted'} (yield {py_:.3f}, scaled {pooled('orca', 'scaled'):.3f})")
    P(f"O8 (best loss below social force's {LOSSES['sf']}): {'held' if fits[beta][0] < LOSSES['sf'] else 'refuted'} ({fits[beta][0]:.1f}; "
      + ", ".join(f"{NAMES[m]} {LOSSES[m]}" for m in ("avm", "cfsm", "pl")) + ")")
    lead = (beta <= 0.2) == (abs(py_ - obs_p) <= 0.10)
    P(f"O9 (4c's lead: yield lands within 0.10 exactly when the fitted beta <= 0.2): {'held' if lead else 'refuted'} (fitted beta {beta}, yield {py_:.3f})")
    P(f"H3 for ORCA (O2, O3 and O4 all hold): {'passes' if in_ci >= 6 and in_lane >= 6 and p4 else 'fails'}")
    near = [m for m in fams if abs(pooled(m, "yield") - obs_p) <= 0.10]
    P(f"Yield within 0.10 of the HERMES pooled share: {len(near)} of 5 families ({', '.join(NAMES[m] for m in near)})")
    fb = dict(FITTED, orca=beta)
    P("Fitted beta and yield error by family: " + ", ".join(f"{NAMES[m]} beta {fb[m]} -> {pooled(m, 'yield'):.3f} ({pooled(m, 'yield') - obs_p:+.3f})" for m in fams))

    with open(os.path.join(HERE, "m4d_orca_results.txt"), "w") as f:
        f.write("\n".join(out) + "\n")
    rows = ["model,rule,run,experiment,N,obs_share,sim_share,obs_lane,sim_lane"]
    for ru in RULES:
        for i, r in enumerate(held):
            rows.append(f"orca,{ru},{r['run']},{r['exp']},{r['N']},{r['share']:.4f},{share('orca', ru, i):.4f},"
                        f"{r['lane']:.4f},{lane('orca', ru, i):.4f}")
    with open(os.path.join(HERE, "m4d_orca_runs.csv"), "w") as f:
        f.write("\n".join(rows) + "\n")
    fitrows = ["beta,loss,pooled_share,mean_seed_sd,mean_lane"]
    for b in BETAS:
        per = fits[b][1]
        fitrows.append(f"{b},{fits[b][0]:.2f},{mean([p['share'] for p in per]):.4f},"
                       f"{mean([p['share_sd'] for p in per]):.4f},{mean([p['lane'] for p in per]):.4f}")
    with open(os.path.join(HERE, "m4d_orca_fit.csv"), "w") as f:
        f.write("\n".join(fitrows) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main()
