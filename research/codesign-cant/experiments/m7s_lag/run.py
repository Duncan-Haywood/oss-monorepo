"""Milestone 7s: does milestone 7r's reading survive the motor-propeller lag law it never sourced?

Every design since milestone 0 has flown a first-order motor lag of 0.015 (D / 0.127)^1.5 s (`aero.size`), an inherited, ASSUMED
law. 7r found that, retuned on the sourced Li-ion closure, both tuners shrink the propeller from 0.130 m to 0.106-0.115 m, so the
law's diameter exponent now favours the retuned designs (12 ms at 0.110 m against 15.5 ms at 0.130 m). The law could not be sourced
in this session (the retailer catalogues 7q read refuse connections from it), so, as research/CLAUDE.md asks when nothing is
measured, this milestone sweeps it: LAG_K (lag at 0.127 m) in {7.5, 15, 30} ms and LAG_EXP in {0, 1.5, 3}, nine laws.

Designs: 7r's 72 (published 7l `t45 cap wide` and 7m `aware cap wide` under their inherited closure, the same designs on `src_li`
not retuned, and 7r's retuned `7l src_li` and `aware src_li` on `src_li`), each under the closure 7r scored it on; not retuned.
The law changes the vehicle and the controller's nominal model together (the deployed vehicle's lag is taken as identified), and
the plant randomisation (lag x 1-2) stays on top of it. Held-out as 7r (seed 9999, 64 episodes) on four capped conditions: lever 1 at
45 deg, lever 2 at 20 and 45 deg, lever 3 at 20 deg; plus the margin test (rho < 1) per law. Predictions S0-S5 in ../../LOG.md,
committed before the full run.

Usage: python3 run.py            (SMOKE=1: 8 episodes on seed 4242, 2 designs per set, never the held-out seed)
"""
import importlib.util, json, os, sys, time, warnings
from multiprocessing import Pool
import numpy as np

warnings.filterwarnings("ignore")
np.seterr(all="ignore")
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "m6_poshold"))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
from codesign_cant import aero as A  # noqa: E402

spec = importlib.util.spec_from_file_location("m7r", os.path.join(HERE, "..", "m7r_retune", "run.py"))
R = importlib.util.module_from_spec(spec); spec.loader.exec_module(R)
M7, L7, H = R.M7, R.L7, R.H
SMOKE = os.environ.get("SMOKE") == "1"
for mod in (M7, L7):
    mod.TEST_EP = 8 if SMOKE else 64
    mod.TEST_SEED = 4242 if SMOKE else 9999   # the smoke run never touches the held-out seed
COND = [(45.0, 1.0, True, None), (20.0, 2.0, True, None), (45.0, 2.0, True, None), (20.0, 3.0, True, None)]
M7.conditions = lambda: COND
KEYS = [L7.tag(*c) for c in COND]
LAG_KS = (0.0075, 0.015, 0.030)
LAG_EXPS = (0.0, 1.5, 3.0)
LAWS = [(k, e) for k in LAG_KS for e in LAG_EXPS]
SETS = ["7l t45 cap wide [inh60]", "aware cap wide [inh60]", "7l t45 cap wide [src_li]", "aware cap wide [src_li]",
        "7l src_li [src_li]", "aware src_li [src_li]"]


def law_name(k, e):
    return f"{k * 1000:g} ms, D^{e:g}"


def evaluate(law, d):
    A.LAG_K, A.LAG_EXP = law
    R.set_closure(d["closure"])
    lab = d["label"].rsplit(" [", 1)[0]
    r = M7.evaluate(lab, d["geom"], d["seed"], d["x"][:12], d["kp_hi"])
    L7.setup(None, d["kp_hi"])
    rho = float(H.margin_rho(np.array(d["x"][:12], float)[None], np.full(1, A.TWR))[0])
    L7.setup()
    lag = float(A.LAG_K * (r["D"] / A.LAG_D0) ** A.LAG_EXP)
    out = dict(set=d["label"], geom=d["geom"], seed=d["seed"], law=list(law), mass=r["mass"], D=r["D"], L=r["L"], lag_s=lag,
               margin_rho=rho, emax=d["emax"])
    out.update({f"dead_{k}": r[f"dead_{k}"] for k in KEYS})
    out.update({f"J_{k}": r[f"J_{k}"] for k in KEYS})
    A.LAG_K, A.LAG_EXP = 0.015, 1.5
    return out


def spearman(a, b):
    ra = np.argsort(np.argsort(a)).astype(float); rb = np.argsort(np.argsort(b)).astype(float)
    return float(np.corrcoef(ra, rb)[0, 1])


def summarise(out):
    Ls = [f"Milestone 7s: 7r's 72 designs (not retuned) under nine motor-lag laws lag = K (D / 0.127 m)^b; held-out "
          f"{M7.TEST_EP} episodes, seed {M7.TEST_SEED}; dead = diverged flights summed over seeds (per seed); cap on.", ""]
    for g in R.GEOMS:
        for s in SETS:
            rs0 = [r for r in out if r["set"] == s and r["geom"] == g]
            if not rs0: continue
            Ls.append(f"[{g}, {s}] mean D {np.mean([r['D'] for r in rs0]):.3f} m; mass {np.mean([r['mass'] for r in rs0]):.3f} kg")
            for law in LAWS:
                rs = sorted((r for r in rs0 if tuple(r["law"]) == law), key=lambda r: r["seed"])
                Ls.append(f"  {law_name(*law):>14} (lag {np.mean([r['lag_s'] for r in rs]) * 1000:5.1f} ms; margin {sum(r['margin_rho'] < 1 for r in rs)}/{len(rs)}): "
                          + "; ".join(f"{k} {sum(r[f'dead_{k}'] for r in rs):3d}" for k in KEYS)
                          + f"  | 45_2 {[r['dead_45_2_cap'] for r in rs]}")
            Ls.append("")
    Ls.append("Spearman rho, mass against dead_45_2_cap per design, over the published and retuned sets (24 per geometry):")
    for law in LAWS:
        parts = []
        for g in R.GEOMS:
            rs = [r for r in out if tuple(r["law"]) == law and r["geom"] == g and (r["set"].endswith("[inh60]") or r["set"].startswith(("7l src_li", "aware src_li")))]
            parts.append(f"{g} {spearman([r['mass'] for r in rs], [r['dead_45_2_cap'] for r in rs]):+.2f}")
        Ls.append(f"  {law_name(*law):>14}: " + ", ".join(parts))
    return Ls


if __name__ == "__main__":
    t0 = time.time()
    src = json.load(open(os.path.join(HERE, "..", "m7r_retune", "results.json")))["runs"]
    designs = [dict(label=r["label"], closure=r["closure"], geom=r["geom"], seed=r["seed"], x=r["x"], kp_hi=r["kp_hi"], emax=r["emax"])
               for r in src if not SMOKE or r["seed"] < 2]
    jobs = [(law, d) for law in LAWS for d in designs]
    with Pool() as p:
        out = p.starmap(evaluate, jobs, chunksize=1)
    lines = summarise(out)
    lines.append(f"wall time {time.time() - t0:.0f} s")
    sfx = "_smoke" if SMOKE else ""
    open(os.path.join(HERE, f"results{sfx}.txt"), "w").write("\n".join(lines) + "\n")
    json.dump(dict(laws=LAWS, keys=KEYS, test_ep=M7.TEST_EP, test_seed=M7.TEST_SEED, runs=out),
              open(os.path.join(HERE, f"results{sfx}.json"), "w"), indent=1)
    print("\n".join(lines))
