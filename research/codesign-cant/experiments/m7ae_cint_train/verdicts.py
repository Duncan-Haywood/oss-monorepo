"""Milestone 7ae verdicts AE1-AE7 (predictions in ../../LOG.md) and the summary table, from results.json, 7ad's and 7ac's.

cint25: 7ac's 125 ms-ceiling training rerun with conditional integration (b = 0.25 m) on in training. base: 7ac's
"aware lag39c125" designs (trained with the integrator always on). Flown at b = 0.25 m unless stated; 36 ms law.
Unsettled: more than half of a design's 64 step episodes end outside the 5 cm band (7y's settle time is NaN). Identified total:
L2-45 diverged flights (lever 2, 45 deg, cap) summed over the 33, 36 and 39.1 ms laws. Medians over designs of each design's
median over episodes. Post hoc: Mann-Whitney U (scipy if present) on per-design values, cint25 against base."""
import json, math, os
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
SFX = "_smoke" if os.environ.get("SMOKE") == "1" else ""
R = json.load(open(os.path.join(HERE, f"results{SFX}.json")))
AD = json.load(open(os.path.join(HERE, "..", "m7ad_settle", "results.json")))
AC = json.load(open(os.path.join(HERE, "..", "m7ac_ceil125", "results.json")))
ID = ("id 33 ms D^0", "mid 36 ms D^0", "id 39.1 ms D^0")
MID = ID[1]
L75 = "stress 75 ms D^0"
GEOMS = ("above", "below")
NEW, BASE = "aware lag39c125 cint25", "aware lag39c125"
B = R["band"]


def nan(v):
    return v is None or (isinstance(v, float) and math.isnan(v))


def unsettled(r):
    return float(np.mean([nan(v) for v in r["settle"]])) > 0.5


def med(v):
    v = np.array([np.nan if x is None else x for x in v], float)
    return float(np.nanmedian(v)) if np.isfinite(v).any() else float("nan")


def resp(rs, s, band, test, law=MID):
    return {(r["geom"], r["seed"]): r for r in rs if r["set"] == s and r.get("band") == band and r["test"] == test and r["law_name"] == law}


def runs(rs, s, band):
    return [r for r in rs if r["set"] == s and r.get("band", None) == band]


def mwu(a, b):
    try:
        from scipy.stats import mannwhitneyu
        return float(mannwhitneyu(a, b, alternative="two-sided").pvalue)
    except Exception:
        return float("nan")


def per_geom(d, f):
    return [med([med(r[f]) for k, r in d.items() if k[0] == g]) for g in GEOMS]


def main():
    L, V = [], []
    L += R["checks"]
    tr = [t for t in R["train"]]
    L.append(f"training: {len(tr)} CMA-ES runs of {R['budget']} evaluations; rejected share "
             + ", ".join(f"{g} {np.mean([t['rejected'] for t in tr if t['geom'] == g]) / R['budget']:.3f}" for g in GEOMS))
    # reproduction: base at b = 0.25 against 7ad
    mine = [r for r in R["resp"] if r["set"] == BASE]
    old = {(r["geom"], r["seed"], r["test"], r["law_name"]): r for r in AD["resp"] if r["set"] == BASE and r["band"] == B}
    mism = sum(1 for r in mine for f in ("settle", "rise", "over", "peak", "resid", "tail_off") if f in r and
               json.dumps(r[f]) != json.dumps(old[(r["geom"], r["seed"], r["test"], r["law_name"])][f]))
    L += [f"Reproduction: {len(mine)} base response flights at b = {B} re-flown against 7ad's results.json: {mism} field mismatches", ""]
    src = {("cint25", B): R["resp"], ("cint25", None): R["resp"], ("base", B): AD["resp"], ("base", None): AD["resp"]}
    lab = {"cint25": NEW, "base": BASE}
    srun = {("cint25", B): runs(R["runs"], NEW, B), ("cint25", None): runs(R["runs"], NEW, None),
            ("base", B): runs(AD["runs"], BASE, B), ("base", None): runs(AC["runs"], BASE, None)}
    calls = {"cint25": {(c["geom"], c["seed"]): c for c in R["calls"]["new"]},
             "base": {(c["geom"], c["seed"]): c for c in R["calls"]["base"]}}
    S = {}
    L.append("Per set and band (values above, below; 36 ms law)")
    for (s, b), rs in src.items():
        st = resp(rs, lab[s], b, "step"); w6 = resp(rs, lab[s], b, "wind6"); w3 = resp(rs, lab[s], b, "wind3")
        rr = srun[(s, b)]
        uns = [sum(unsettled(r) for k, r in st.items() if k[0] == g) for g in GEOMS]
        idt = [sum(r["dead_45_2_cap"] for r in rr if r["geom"] == g and r["law_name"] in ID) for g in GEOMS]
        d75 = [sum(r["dead_45_2_cap"] for r in rr if r["geom"] == g and r["law_name"] == L75) for g in GEOMS]
        J = [float(np.median([r["J_45_1_cap"] for r in rr if r["geom"] == g and r["law_name"] == MID])) for g in GEOMS]
        mass = [float(np.mean([r["mass"] for r in rr if r["geom"] == g and r["law_name"] == MID])) for g in GEOMS]
        okm = sum(all(r["margin_rho"] < 1.0 for r in rr if (r["geom"], r["seed"]) == k and r["law_name"] in ID) for k in st)
        S[(s, b)] = dict(st=st, w6=w6, uns=uns, rise=per_geom(st, "rise"), over=per_geom(st, "over"), tail=per_geom(st, "tail_off"),
                        idt=idt, d75=d75, rr=rr, okm=okm, n=len(st))
        L.append(f"  {s:6s} b = {b!s:4s} unsettled {uns}; rise {S[(s, b)]['rise'][0]:.3f}, {S[(s, b)]['rise'][1]:.3f} s; "
                 f"overshoot {S[(s, b)]['over'][0]:.4f}, {S[(s, b)]['over'][1]:.4f} m; last-second {S[(s, b)]['tail'][0]:.4f}, "
                 f"{S[(s, b)]['tail'][1]:.4f} m; wind6 peak {per_geom(w6, 'peak')[0]:.4f}, {per_geom(w6, 'peak')[1]:.4f} m, resid "
                 f"{per_geom(w6, 'resid')[0]:.4f}, {per_geom(w6, 'resid')[1]:.4f} m; wind3 peak {per_geom(w3, 'peak')[0]:.4f}, "
                 f"{per_geom(w3, 'peak')[1]:.4f} m; identified {idt}; 75 ms {d75}; J_45_1 {J[0]:.3f}, {J[1]:.3f}; mass {mass[0]:.3f}, "
                 f"{mass[1]:.3f} kg; margin pass {okm} of {len(st)}")
    L += ["", "Decoded outer-loop gains (median kp 1/s^2, kd 1/s, ki/kp 1/s; above, below)"]
    G = {}
    for s in ("base", "cint25"):
        c = calls[s]
        G[s] = {f: [float(np.median([v[f] if f != "q" else v["ki"] / v["kp"] for k, v in c.items() if k[0] == g])) for g in GEOMS]
                for f in ("kp", "kd", "q")}
        L.append(f"  {s:6s} kp {G[s]['kp'][0]:.2f}, {G[s]['kp'][1]:.2f}; kd {G[s]['kd'][0]:.2f}, {G[s]['kd'][1]:.2f}; "
                 f"ki/kp {G[s]['q'][0]:.4f}, {G[s]['q'][1]:.4f}; model-called unsettled at b = None "
                 f"{sum(v['model_tail'] > 0.05 for v in c.values())}")
    L += ["", "Stress dead by law (L2-45 = dead_45_2_cap, summed over designs; above, below)"]
    for law in sorted({r["law_name"] for r in R["runs"]}):
        L.append(f"  {law:24s} " + "; ".join(f"{s} b={b}: " + str([sum(r['dead_45_2_cap'] for r in S[(s, b)]['rr'] if r['geom'] == g and r['law_name'] == law) for g in GEOMS])
                                             for s, b in S))
    n, bb, bn = S[("cint25", B)], S[("base", B)], S[("base", None)]
    V += [("AE1", all(n["rise"][i] < bb["rise"][i] for i in range(2)), f"rise {n['rise'][0]:.3f}, {n['rise'][1]:.3f} s against base at b = {B} {bb['rise'][0]:.3f}, {bb['rise'][1]:.3f}"),
          ("AE2", all(n["rise"][i] <= bn["rise"][i] + 0.1 for i in range(2)), f"rise {n['rise'][0]:.3f}, {n['rise'][1]:.3f} s against base at b = None + 0.1 s: {bn['rise'][0] + 0.1:.3f}, {bn['rise'][1] + 0.1:.3f}"),
          ("AE3", sum(n["uns"]) <= 1, f"{sum(n['uns'])} of {n['n']} unsettled (need at most 1)"),
          ("AE4", all(G["cint25"]["kp"][i] > G["base"]["kp"][i] for i in range(2)), f"kp {G['cint25']['kp'][0]:.2f}, {G['cint25']['kp'][1]:.2f} against {G['base']['kp'][0]:.2f}, {G['base']['kp'][1]:.2f}"),
          ("AE5", all(n["idt"][i] <= bb["idt"][i] + 10 for i in range(2)), f"identified {n['idt']} against base at b = {B} {bb['idt']} + 10"),
          ("AE6", n["okm"] >= 11, f"{n['okm']} of {n['n']} pass the margin test (need 11)"),
          ("AE7", sum(S[('cint25', None)]["uns"]) > sum(n["uns"]), f"unsettled at b = None {sum(S[('cint25', None)]['uns'])} against {sum(n['uns'])} at b = {B}")]
    L += ["", "Post hoc (Mann-Whitney U, two-sided, per-design values, cint25 against base, both at b = 0.25 m; per geometry, then pooled)"]
    for f in ("rise", "over", "tail_off"):
        a = {g: [med(r[f]) for k, r in n["st"].items() if k[0] == g] for g in GEOMS}
        c = {g: [med(r[f]) for k, r in bb["st"].items() if k[0] == g] for g in GEOMS}
        L.append(f"  step {f:9s} " + "; ".join(f"{g} p = {mwu(a[g], c[g]):.3g}" for g in GEOMS)
                 + f"; pooled {np.median(a['above'] + a['below']):.4f} against {np.median(c['above'] + c['below']):.4f}, p = {mwu(a['above'] + a['below'], c['above'] + c['below']):.3g}")
    pd = lambda S_, g, laws: [sum(r["dead_45_2_cap"] for r in S_["rr"] if r["geom"] == g and r["seed"] == s and r["law_name"] in laws) for s in sorted({r["seed"] for r in S_["rr"]})]
    for nm, laws in (("identified", ID), ("75 ms", (L75,))):
        a = {g: pd(n, g, laws) for g in GEOMS}; c = {g: pd(bb, g, laws) for g in GEOMS}
        L.append(f"  {nm:10s} L2-45 per design " + "; ".join(f"{g} p = {mwu(a[g], c[g]):.3g}" for g in GEOMS)
                 + f"; pooled p = {mwu(a['above'] + a['below'], c['above'] + c['below']):.3g}")
    for f in ("kp", "kd"):
        a = [v[f] for v in calls["cint25"].values()]; c = [v[f] for v in calls["base"].values()]
        L.append(f"  gain {f} pooled median {np.median(a):.2f} against {np.median(c):.2f}, p = {mwu(a, c):.3g}")
    a = [v["ki"] / v["kp"] for v in calls["cint25"].values()]; c = [v["ki"] / v["kp"] for v in calls["base"].values()]
    L.append(f"  gain ki/kp pooled median {np.median(a):.4f} against {np.median(c):.4f}, p = {mwu(a, c):.3g}")
    L += ["", "Verdicts:"] + [f"  {nm}: {'held' if ok else 'refuted'} ({why})" for nm, ok, why in V]
    L.append(f"wall: {R['wall']}")
    out = "\n".join(L) + "\n"
    open(os.path.join(HERE, f"verdicts{SFX}.txt"), "w").write(out)
    print(out)


if __name__ == "__main__":
    main()
