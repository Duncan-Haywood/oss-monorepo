"""Milestone 7ag verdicts AG0-AG9 (predictions in ../../LOG.md) from results.json, and 7ad's, 7ae's and 7af's flights for AG0.

Rise per design = median over its 64 episodes of the time to 90% of the step (NaN when never reached or diverged; a NaN counts as
a miss). Point mass and line from cruise_model.py, evaluated on each design's decoded kp, kd, ki."""
import json, math, os, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from cruise_model import rise_point_mass, overshoot_point_mass, cruise_line  # noqa: E402

SFX = "_smoke" if os.environ.get("SMOKE") == "1" else ""
R = json.load(open(os.path.join(HERE, f"results{SFX}.json")))
MID = "mid 36 ms D^0"
OTHER = ("id 33 ms D^0", "id 39.1 ms D^0")
B = R["band"]
TOL_S, TOL_REL, TOL_LAG = 0.10, 0.10, 0.05


def med(v):
    v = np.array([np.nan if x is None else x for x in v], float)
    return float(np.nanmedian(v)) if np.isfinite(v).any() else float("nan")


def key(r):
    return (r["set"], r["geom"], r["seed"])


G = {key(g): g for g in R["gains"]}
KEYS = sorted(G)


def cond(a, s, law=MID):
    return {key(r): r for r in R["resp"] if r["a_p"] == a and r["step"] == s and r["law_name"] == law}


def table(a, s, law=MID):
    c = cond(a, s, law)
    kp, kd, ki = (np.array([G[k][f] for k in KEYS]) for f in ("kp", "kd", "ki"))
    sim = np.array([med(c[k]["rise"]) for k in KEYS])
    ov = np.array([med(c[k]["over"]) for k in KEYS])
    pm = rise_point_mass(kp, kd, ki, a, s, B)
    ln = cruise_line(kd, a, s)
    po = overshoot_point_mass(kp, kd, ki, a, s, B)
    dead = sum(c[k]["dead"] for k in KEYS)
    return dict(sim=sim, pm=pm, ln=ln, ov=ov, po=po, dead=dead, n_ep=len(KEYS) * R["ep"])


def within_abs(sim, pred, tol):
    return int(np.sum(np.isfinite(sim) & (np.abs(sim - pred) <= tol)))


def within_rel(sim, pred, tol):
    return int(np.sum(np.isfinite(sim) & (np.abs(sim - pred) <= tol * sim)))


def mae(sim, pred):
    return float(np.nanmedian(np.abs(sim - pred)))


def main():
    from scipy.stats import spearmanr
    L, V = [], []
    n = len(KEYS)
    L.append(f"{len(R['resp'])} flights, {n} designs, {R['ep']} episodes on seed {R['seed']}, band {B} m, wall {R['wall']:.0f} s")
    T = {tuple(c): table(*c) for c in R["conds"]}
    L.append("")
    L.append("36 ms law. sim/pm/line: median over designs of rise (s); within: designs inside 0.10 s (pm) or 10% (line); "
             "MAE: median |sim - pred| (s); bias: median sim - pm (s)")
    L.append(f"{'A_P':>5} {'S':>4} | {'sim':>5} {'pm':>5} {'line':>5} | {'pm<=0.1s':>8} {'line<=10%':>9} | {'MAE pm':>6} {'MAE ln':>6} "
             f"{'bias':>6} | {'over sim':>8} {'over pm':>7} {'rho':>5} | dead")
    for (a, s), t in T.items():
        rho = spearmanr(t["ov"], t["po"], nan_policy="omit").statistic
        L.append(f"{a:5.1f} {s:4.1f} | {np.nanmedian(t['sim']):5.2f} {np.median(t['pm']):5.2f} {np.median(t['ln']):5.2f} | "
                 f"{within_abs(t['sim'], t['pm'], TOL_S):>5}/{n} {within_rel(t['sim'], t['ln'], TOL_REL):>6}/{n} | "
                 f"{mae(t['sim'], t['pm']):6.3f} {mae(t['sim'], t['ln']):6.3f} {np.nanmedian(t['sim'] - t['pm']):+6.3f} | "
                 f"{np.nanmedian(t['ov']) * 100:6.1f}cm {np.median(t['po']) * 100:5.1f}cm {rho:5.2f} | {t['dead']}/{t['n_ep']}")
    L.append("")
    L.append("motor lag: designs whose rise under 33 and 39.1 ms is within 0.05 s of the 36 ms law's; dead flights per law")
    lagok = {}
    for (a, s) in T:
        sm = T[(a, s)]["sim"]; cnt = []
        for law in OTHER:
            so = np.array([med(cond(a, s, law)[k]["rise"]) for k in KEYS])
            cnt.append(int(np.sum(np.isfinite(sm) & np.isfinite(so) & (np.abs(so - sm) <= TOL_LAG))))
        lagok[(a, s)] = min(cnt)
        dd = [sum(cond(a, s, law)[k]["dead"] for k in KEYS) for law in (OTHER[0], MID, OTHER[1])]
        L.append(f"  ({a}, {s}): 33 ms {cnt[0]}/{n}, 39.1 ms {cnt[1]}/{n}; dead 33/36/39.1 ms {dd}")
    # AG0: reproduction against the published flights at (3.5, 1)
    E = {}
    for sub, lab in (("m7ad_settle", "aware lag39c125"), ("m7ae_cint_train", "aware lag39c125 cint25"),
                     ("m7af_step_obj", "aware lag39c125 cint25 step")):
        for r in json.load(open(os.path.join(HERE, "..", sub, "results.json")))["resp"]:
            if r["set"] == lab and r.get("band") == B and r["test"] == "step" and r["law_name"] == MID:
                E[key(r)] = r
    c = cond(3.5, 1.0)
    mis = sum(1 for k in KEYS if k in E and [None if v in (None, 0) else v for v in E[k]["rise"]] != c[k]["rise"])
    miss_keys = sum(1 for k in KEYS if k not in E)
    L.append("")
    L.append(f"reproduction at (3.5, 1), 36 ms: {mis} rise mismatches against 7ad/7ae/7af, {miss_keys} designs not found")
    ok = lambda a, s, f: f(T[(a, s)])
    V.append(("AG0", mis == 0 and miss_keys == 0, f"{mis} mismatches"))
    a1 = [within_abs(T[(a, 1.0)]["sim"], T[(a, 1.0)]["pm"], TOL_S) for a in (2.0, 2.5, 5.0)]
    V.append(("AG1", min(a1) >= n - 2, f"point mass within 0.10 s at A_P 2.0, 2.5, 5.0: {a1}"))
    a2 = [within_abs(T[(3.5, s)]["sim"], T[(3.5, s)]["pm"], TOL_S) for s in (0.5, 2.0)]
    V.append(("AG2", min(a2) >= n - 2, f"point mass within 0.10 s at S 0.5, 2.0: {a2}"))
    a3 = within_abs(T[(8.0, 1.0)]["sim"], T[(8.0, 1.0)]["pm"], TOL_S)
    V.append(("AG3", a3 >= n - 2, f"point mass within 0.10 s at A_P 8: {a3}"))
    a4 = [within_rel(T[(a, 1.0)]["sim"], T[(a, 1.0)]["ln"], TOL_REL) for a in (2.0, 2.5, 5.0)]
    V.append(("AG4", min(a4) >= n - 2, f"line within 10% at A_P 2.0, 2.5, 5.0: {a4}"))
    a5 = [within_rel(T[(3.5, s)]["sim"], T[(3.5, s)]["ln"], TOL_REL) for s in (0.5, 2.0)]
    V.append(("AG5", min(a5) >= n - 2, f"line within 10% at S 0.5, 2.0: {a5}"))
    oos = [c for c in T if c != (3.5, 1.0)]
    a6 = [(c, mae(T[c]["sim"], T[c]["pm"]) < mae(T[c]["sim"], T[c]["ln"])) for c in oos]
    V.append(("AG6", all(v for _, v in a6), "point mass smaller MAE: " + ", ".join(f"{c}: {'yes' if v else 'no'}" for c, v in a6)))
    a7 = {c: lagok[c] for c in T if c != (8.0, 1.0)}
    V.append(("AG7", min(a7.values()) >= n - 2, f"min over 33/39.1 ms of designs within 0.05 s: {a7}"))
    a8 = [float(spearmanr(T[(a, 1.0)]["ov"], T[(a, 1.0)]["po"], nan_policy="omit").statistic) for a in (2.0, 2.5, 3.5, 5.0)]
    V.append(("AG8", min(a8) >= 0.8, "overshoot rho at A_P 2.0, 2.5, 3.5, 5.0: " + ", ".join(f"{v:.2f}" for v in a8)))
    t5 = T[(5.0, 1.0)]
    V.append(("AG9", t5["dead"] <= 0.01 * t5["n_ep"], f"dead at A_P 5: {t5['dead']}/{t5['n_ep']}; at A_P 8: {T[(8.0, 1.0)]['dead']}/"
              f"{T[(8.0, 1.0)]['n_ep']}"))
    L.append("")
    for name, held, why in V:
        L.append(f"{name}: {'held' if held else 'REFUTED'} ({why})")
    L.append("Verdicts: " + ", ".join(f"{n_} {'held' if h else 'refuted'}" for n_, h, _ in V))
    out = "\n".join(L) + "\n"
    open(os.path.join(HERE, f"verdicts{SFX}.txt"), "w").write(out)
    print(out)


if __name__ == "__main__":
    main()
