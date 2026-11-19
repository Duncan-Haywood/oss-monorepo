"""Milestone 7af verdicts AF1-AF9 (predictions in ../../LOG.md) and the summary table, from results.json, 7ae's, 7ad's and 7ac's.

step: 7ae's training (band b = 0.25 m on) with a 1 m set-point step added as a fourth training condition. cint25: 7ae's designs.
base: 7ac's "aware lag39c125" designs. Flown at b = 0.25 m unless stated; 36 ms law. Unsettled: more than half of a design's 64
step episodes end outside the 5 cm band. Identified total: L2-45 diverged flights summed over the 33, 36 and 39.1 ms laws.
Medians over designs of each design's median over episodes. Post hoc: Mann-Whitney U (scipy) on per-design values, step against
cint25."""
import json, math, os
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
SFX = "_smoke" if os.environ.get("SMOKE") == "1" else ""
R = json.load(open(os.path.join(HERE, f"results{SFX}.json")))
AE = json.load(open(os.path.join(HERE, "..", "m7ae_cint_train", "results.json")))
AD = json.load(open(os.path.join(HERE, "..", "m7ad_settle", "results.json")))
AC = json.load(open(os.path.join(HERE, "..", "m7ac_ceil125", "results.json")))
ID = ("id 33 ms D^0", "mid 36 ms D^0", "id 39.1 ms D^0")
MID = ID[1]
L75 = "stress 75 ms D^0"
GEOMS = ("above", "below")
NEW, CINT, BASE = "aware lag39c125 cint25 step", "aware lag39c125 cint25", "aware lag39c125"
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
    from scipy.stats import mannwhitneyu
    return float(mannwhitneyu(a, b, alternative="two-sided").pvalue)


def per_geom(d, f):
    return [med([med(r[f]) for k, r in d.items() if k[0] == g]) for g in GEOMS]


def main():
    from scipy.stats import spearmanr
    L, V = list(R["checks"]), []
    tr = R["train"]
    L.append(f"training: {len(tr)} CMA-ES runs of {R['budget']} evaluations; step condition weight {R['w_step']} of one lever, "
             f"{R['ep_step']} episodes; rejected share "
             + ", ".join(f"{g} {np.mean([t['rejected'] for t in tr if t['geom'] == g]) / R['budget']:.3f}" for g in GEOMS))
    mine = [r for r in R["resp"] if r["set"] == CINT]
    old = {(r["geom"], r["seed"], r["test"], r["law_name"]): r for r in AE["resp"] if r["set"] == CINT and r["band"] == B}
    mism = sum(1 for r in mine for f in ("settle", "rise", "over", "peak", "resid", "tail_off") if f in r and
               json.dumps(r[f]) != json.dumps(old[(r["geom"], r["seed"], r["test"], r["law_name"])][f]))
    L += [f"Reproduction: {len(mine)} cint25 response flights at b = {B} re-flown against 7ae's results.json: {mism} field mismatches", ""]
    src = {("step", B): R["resp"], ("step", None): R["resp"], ("cint25", B): AE["resp"], ("cint25", None): AE["resp"],
           ("base", B): AD["resp"], ("base", None): AD["resp"]}
    lab = {"step": NEW, "cint25": CINT, "base": BASE}
    srun = {("step", B): runs(R["runs"], NEW, B), ("step", None): runs(R["runs"], NEW, None),
            ("cint25", B): runs(AE["runs"], CINT, B), ("cint25", None): runs(AE["runs"], CINT, None),
            ("base", B): runs(AD["runs"], BASE, B), ("base", None): runs(AC["runs"], BASE, None)}
    calls = {"step": {(c["geom"], c["seed"]): c for c in R["calls"]["new"]},
             "cint25": {(c["geom"], c["seed"]): c for c in AE["calls"]["new"]},
             "base": {(c["geom"], c["seed"]): c for c in AE["calls"]["base"]}}
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
                        idt=idt, d75=d75, rr=rr, okm=okm, n=len(st), J=J, mass=mass)
        x = S[(s, b)]
        L.append(f"  {s:6s} b = {b!s:4s} unsettled {uns}; rise {x['rise'][0]:.3f}, {x['rise'][1]:.3f} s; overshoot {x['over'][0]:.4f}, "
                 f"{x['over'][1]:.4f} m; last-second {x['tail'][0]:.4f}, {x['tail'][1]:.4f} m; wind6 peak {per_geom(w6, 'peak')[0]:.4f}, "
                 f"{per_geom(w6, 'peak')[1]:.4f} m, resid {per_geom(w6, 'resid')[0]:.4f}, {per_geom(w6, 'resid')[1]:.4f} m; wind3 peak "
                 f"{per_geom(w3, 'peak')[0]:.4f}, {per_geom(w3, 'peak')[1]:.4f} m; identified {idt}; 75 ms {d75}; J_45_1 {J[0]:.3f}, "
                 f"{J[1]:.3f}; mass {mass[0]:.3f}, {mass[1]:.3f} kg; margin pass {okm} of {len(st)}")
    L += ["", "Decoded outer-loop gains (median kp 1/s^2, kd 1/s, ki/kp 1/s, A_P/kd m/s; above, below)"]
    G = {}
    for s in ("base", "cint25", "step"):
        c = calls[s]
        G[s] = {f: [float(np.median([v[f] if f != "q" else v["ki"] / v["kp"] for k, v in c.items() if k[0] == g])) for g in GEOMS]
                for f in ("kp", "kd", "q")}
        L.append(f"  {s:6s} kp {G[s]['kp'][0]:.2f}, {G[s]['kp'][1]:.2f}; kd {G[s]['kd'][0]:.2f}, {G[s]['kd'][1]:.2f}; "
                 f"ki/kp {G[s]['q'][0]:.4f}, {G[s]['q'][1]:.4f}; A_P/kd {3.5 / G[s]['kd'][0]:.3f}, {3.5 / G[s]['kd'][1]:.3f}; "
                 f"model-called unsettled at b = None {sum(v['model_tail'] > 0.05 for v in c.values())}")
    L += ["", "Stress dead by law (L2-45 = dead_45_2_cap, summed over designs; above, below)"]
    for law in sorted({r["law_name"] for r in R["runs"]}):
        L.append(f"  {law:24s} " + "; ".join(f"{s} b={b}: " + str([sum(r['dead_45_2_cap'] for r in S[(s, b)]['rr'] if r['geom'] == g and r['law_name'] == law) for g in GEOMS])
                                             for s, b in S))
    kd_all, rise_all = [], []
    for s in ("base", "cint25", "step"):
        for k, r in S[(s, B)]["st"].items():
            kd_all.append(calls[s][k]["kd"]); rise_all.append(med(r["rise"]))
    rho = float(spearmanr(kd_all, rise_all).statistic)
    L.append(f"\nkd against median rise over {len(kd_all)} designs at b = {B}: Spearman rho {rho:.3f}")
    n, c, bn = S[("step", B)], S[("cint25", B)], S[("base", None)]
    V += [("AF1", all(n["rise"][i] < c["rise"][i] for i in range(2)), f"rise {n['rise'][0]:.3f}, {n['rise'][1]:.3f} s against cint25 {c['rise'][0]:.3f}, {c['rise'][1]:.3f}"),
          ("AF2", all(n["rise"][i] <= bn["rise"][i] + 0.1 for i in range(2)), f"rise {n['rise'][0]:.3f}, {n['rise'][1]:.3f} s against base at b = None + 0.1 s: {bn['rise'][0] + 0.1:.3f}, {bn['rise'][1] + 0.1:.3f}"),
          ("AF3", all(G["step"]["kp"][i] > G["cint25"]["kp"][i] for i in range(2)), f"kp {G['step']['kp'][0]:.2f}, {G['step']['kp'][1]:.2f} against {G['cint25']['kp'][0]:.2f}, {G['cint25']['kp'][1]:.2f}"),
          ("AF4", all(G["step"]["kd"][i] < G["cint25"]["kd"][i] for i in range(2)), f"kd {G['step']['kd'][0]:.2f}, {G['step']['kd'][1]:.2f} against {G['cint25']['kd'][0]:.2f}, {G['cint25']['kd'][1]:.2f}"),
          ("AF5", sum(n["uns"]) <= 1, f"{sum(n['uns'])} of {n['n']} unsettled (need at most 1)"),
          ("AF6", all(n["idt"][i] <= c["idt"][i] + 10 for i in range(2)), f"identified {n['idt']} against cint25 {c['idt']} + 10"),
          ("AF7", n["okm"] >= 11, f"{n['okm']} of {n['n']} pass the margin test (need 11)"),
          ("AF8", all(n["over"][i] <= 0.03 for i in range(2)), f"overshoot {n['over'][0] * 100:.2f}, {n['over'][1] * 100:.2f} cm (need at most 3)"),
          ("AF9", rho >= 0.7, f"Spearman rho(kd, rise) {rho:.3f} over {len(kd_all)} designs (need 0.7)")]
    L += ["", "Post hoc (Mann-Whitney U, two-sided, per-design values, step against cint25, both at b = 0.25 m; per geometry, then pooled)"]
    for f in ("rise", "over", "tail_off"):
        a = {g: [med(r[f]) for k, r in n["st"].items() if k[0] == g] for g in GEOMS}
        b_ = {g: [med(r[f]) for k, r in c["st"].items() if k[0] == g] for g in GEOMS}
        L.append(f"  step {f:9s} " + "; ".join(f"{g} p = {mwu(a[g], b_[g]):.3g}" for g in GEOMS)
                 + f"; pooled {np.median(a['above'] + a['below']):.4f} against {np.median(b_['above'] + b_['below']):.4f}, p = {mwu(a['above'] + a['below'], b_['above'] + b_['below']):.3g}")
    pd = lambda S_, g, laws: [sum(r["dead_45_2_cap"] for r in S_["rr"] if r["geom"] == g and r["seed"] == s and r["law_name"] in laws) for s in sorted({r["seed"] for r in S_["rr"]})]
    for nm, laws in (("identified", ID), ("75 ms", (L75,))):
        a = {g: pd(n, g, laws) for g in GEOMS}; b_ = {g: pd(c, g, laws) for g in GEOMS}
        L.append(f"  {nm:10s} L2-45 per design " + "; ".join(f"{g} p = {mwu(a[g], b_[g]):.3g}" for g in GEOMS)
                 + f"; pooled {sum(a['above'] + a['below'])} against {sum(b_['above'] + b_['below'])}, p = {mwu(a['above'] + a['below'], b_['above'] + b_['below']):.3g}")
    for f in ("kp", "kd"):
        a = [v[f] for v in calls["step"].values()]; b_ = [v[f] for v in calls["cint25"].values()]
        L.append(f"  gain {f} pooled median {np.median(a):.2f} against {np.median(b_):.2f}, p = {mwu(a, b_):.3g}")
    a = [v["ki"] / v["kp"] for v in calls["step"].values()]; b_ = [v["ki"] / v["kp"] for v in calls["cint25"].values()]
    L.append(f"  gain ki/kp pooled median {np.median(a):.4f} against {np.median(b_):.4f}, p = {mwu(a, b_):.3g}")
    L += ["", "Verdicts:"] + [f"  {nm}: {'held' if ok else 'refuted'} ({why})" for nm, ok, why in V]
    L.append(f"wall: {R['wall']}")
    out = "\n".join(L) + "\n"
    open(os.path.join(HERE, f"verdicts{SFX}.txt"), "w").write(out)
    print(out)


if __name__ == "__main__":
    main()
