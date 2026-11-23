"""Milestone 3zd: does "update f, hold the distortion" survive at the image edge?
Scores H290-H294 (LOG.md, milestone 3zd planned). Analysis only: milestone 3s's saved TUM solves, milestone
3zb's blocks, six rules and score, with the radii band moved out to the image corner (250-400 px).

Truth: TUM's published calibration of each camera, the only reference that does not fold before 400 px on
either camera (the board's fr1 model folds at 381 px, the target-free fr1 anchor at 403 px). Held model: the
truth's f shifted by delta % with the distortion of H in {board, TUM, target-free}. Writes summary.json and
edge.png.
Run (from research/sensing-selfcal): python3 experiments/m3zd_edge/analyse.py
"""
import importlib.util
import json
import os

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
EXP = os.path.join(HERE, "..")


def _load(name, path):
    s = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(s)
    s.loader.exec_module(m)
    return m


m3z = _load("m3z_an", os.path.join(EXP, "m3z_radial", "analyse.py"))
m3za = _load("m3za_an", os.path.join(EXP, "m3za_joint", "analyse.py"))
m3zb = _load("m3zb_an", os.path.join(EXP, "m3zb_staledist", "analyse.py"))
KS, MODELS, RULES = m3za.KS, m3za.MODELS, m3zb.RULES
REFS = m3zb.REFS
BANDS = {"inner": tuple(range(50, 251, 25)), "edge": tuple(range(250, 401, 25)), "full": tuple(range(50, 401, 25))}
IMAGE_EDGE = 400.0


def fold_radius(m, xmax=1.5, n=30001):
    """Image radius (px) where the forward map r(x) first stops rising, or None if it rises up to xmax."""
    x = np.linspace(0.0, xmax, n)
    r = m3z.radial_map(x, m["f"], m["k1"], m["k2"], m.get("k3", 0.0))
    d = np.diff(r)
    bad = np.nonzero(d <= 0)[0]
    return None if len(bad) == 0 else float(r[bad[0]])


def p_at_d0(bl, truth_u, held_u, radii):
    """Median over blocks of signed P(r) at each radius, delta = 0, for every rule."""
    xr = {u: m3za.rays(R, radii) for u, R in truth_u.items()}
    out = {}
    for rule in RULES:
        rows = []
        for b in bl:
            T, H = truth_u[b["unit"]], held_u[b["unit"]]
            held = {"f": T["f"], "k1": H["k1"], "k2": H["k2"], "k3": H.get("k3", 0.0)}
            m = m3zb.updated(rule, b, held)
            rows.append(m3z.radial_map(xr[b["unit"]], m["f"], m["k1"], m["k2"], m.get("k3", 0.0)) - np.asarray(radii, float))
        out[rule] = [float(v) for v in np.median(np.array(rows), axis=0)]
    return out


def analyse(R, S, refs):
    res = {}
    for m in MODELS:
        res[m] = {}
        for k in KS:
            by_seq = m3zb.all_blocks(R, S, m, k)
            allb = [b for bl in by_seq.values() for b in bl]
            cell = {band: {f"tum|{h}": m3zb.score(allb, refs["tum"], refs[h], radii=rad) for h in REFS}
                    for band, rad in BANDS.items()}
            if m == "est_c" and k == 5:
                cell["by_unit_edge"] = {}
                for u in ("fr1", "fr3"):
                    ub = [b for b in allb if b["unit"] == u]
                    cell["by_unit_edge"][u] = {f"tum|{h}": m3zb.score(ub, refs["tum"], refs[h], radii=BANDS["edge"])
                                               for h in REFS}
                fr3 = [b for b in allb if b["unit"] == "fr3"]
                cell["fr3_all_pairs_edge"] = {f"{t}|{h}": m3zb.score(fr3, {"fr3": refs[t]["fr3"]}, {"fr3": refs[h]["fr3"]}, radii=BANDS["edge"])
                                              for t in REFS for h in REFS}
                cell["p_at_d0_full"] = {f"tum|{h}": p_at_d0(allb, refs["tum"], refs[h], BANDS["full"]) for h in REFS}
                folds = [fold_radius({"f": b["f"], "k1": b["k1"], "k2": b["k2"]}) for b in allb]
                cell["pool_folds"] = {"n": len(folds),
                                      "inside_image": sum(1 for f in folds if f is not None and f < IMAGE_EDGE),
                                      "radii": [f for f in folds if f is not None]}
            res[m][k] = cell
    return res


def hypotheses(res):
    c = res["est_c"][5]
    w = lambda band, p, r: c[band][p]["rules"][r]["worst_regret"]
    h = {}
    a, b = w("edge", "tum|tum", "f_gate0.5"), w("edge", "tum|tum", "joint_gate0.5")
    h["H290"] = {"f_gate": a, "joint_gate": b, "holds": a < b}
    nv = c["by_unit_edge"]["fr1"]["tum|board"]["rules"]["never"]["med"][0]
    h["H291"] = {"never_fr1_d0": nv, "holds": nv > 2.0}
    a, b = w("edge", "tum|board", "f_gate0.5"), w("edge", "tum|board", "joint_gate0.5")
    h["H292"] = {"f_gate": a, "joint_gate": b, "holds": b < a}
    mx = {r: max(w("edge", f"tum|{hh}", r) for hh in REFS) for r in RULES}
    best = min(mx, key=mx.get)
    h["H293"] = {"max_worst_over_pairs": mx, "best": best, "holds": best == "f_gate0.5"}
    pf = c["pool_folds"]
    h["H294"] = {"inside_image": pf["inside_image"], "n": pf["n"], "holds": pf["inside_image"] < 0.1 * pf["n"]}
    return h


def main():
    m3s = _load("m3s_an", os.path.join(EXP, "m3s_causal", "analyse.py"))
    R, _ = m3s.rows()
    S = [r for r in R if r["scored"]]
    refs = m3za.references()
    ref_folds = {t: {u: fold_radius(v) for u, v in d.items()} for t, d in refs.items()}
    res = analyse(R, S, refs)
    hyp = hypotheses(res)
    out = {"rules": {"K": KS, "deltas": m3za.DELTAS, "bands": BANDS, "gate_c": m3za.GATE_C,
                     "windows": len(S), "counted": len(R), "image_edge": IMAGE_EDGE},
           "references": refs, "reference_fold_px": ref_folds, "hypotheses": hyp, "scores": res}
    with open(os.path.join(HERE, "summary.json"), "w") as fh:
        json.dump(out, fh, indent=1)
    print("reference folds", json.dumps(ref_folds))
    for k, v in hyp.items():
        print(k, json.dumps(v) if k != "H294" else json.dumps({kk: vv for kk, vv in v.items()}))
    for m in MODELS:
        for k in KS:
            for band in BANDS:
                for p, s in res[m][k][band].items():
                    print(f"{m:6s} K={k} {band:5s} {p:10s} n={s['n']:2d} mm={s['minimax']:13s} | "
                          + " ".join(f"{r}={v['worst_regret']:.2f}" for r, v in s["rules"].items()))
    c = res["est_c"][5]
    for u, d in c["by_unit_edge"].items():
        for p, s in d.items():
            print(f"edge {u} {p:10s} n={s['n']:2d} mm={s['minimax']:13s} d0: " + " ".join(
                f"{r}={v['med'][0]:.2f}" for r, v in s["rules"].items()) + " | worst: " + " ".join(
                f"{r}={v['worst_regret']:.2f}" for r, v in s["rules"].items()))
    for p, s in c["fr3_all_pairs_edge"].items():
        print(f"fr3 edge {p:11s} mm={s['minimax']:13s} " + " ".join(
            f"{r}={v['worst_regret']:.2f}" for r, v in s["rules"].items()))
    for p, d in c["p_at_d0_full"].items():
        for r, v in d.items():
            print(f"P(r) d0 {p:10s} {r:13s} " + " ".join(f"{x:+.1f}" for x in v))
    print("pool folds", c["pool_folds"]["inside_image"], "of", c["pool_folds"]["n"],
          "radii", sorted(round(x) for x in c["pool_folds"]["radii"])[:10])
    figure(res)


def figure(res):
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except ImportError:
        print("matplotlib missing: edge.png not drawn")
        return
    c = res["est_c"][5]
    sty = {"never": ("k", ":"), "f_always": ("#d62728", "--"), "f_gate0.5": ("#d62728", "-"),
           "joint_always": ("#1f77b4", "--"), "joint_gate0.5": ("#1f77b4", "-"), "two_gates": ("#2ca02c", "-")}
    fig, axes = plt.subplots(1, 3, figsize=(14, 3.9))
    radii = BANDS["full"]
    for ax, h in zip(axes[:2], ("tum", "board")):
        for r in RULES:
            col, ls = sty[r]
            ax.plot(radii, c["p_at_d0_full"][f"tum|{h}"][r], ls, color=col, label=r.replace("_", " "))
        ax.axhline(0, color="0.6", lw=0.6)
        ax.axvspan(250, 400, color="0.92", zorder=0)
        ax.set_xlabel("image radius r (px); shaded: edge band")
        ax.set_ylabel("median signed P(r) at delta = 0 (px)")
        ax.set_title(f"truth TUM, held distortion {h}", fontsize=9)
    axes[0].legend(fontsize=6, ncol=2)
    x = np.arange(len(REFS))
    wd = 0.8 / len(RULES)
    for i, r in enumerate(RULES):
        if r == "never":
            continue
        vals = [c["edge"][f"tum|{h}"]["rules"][r]["worst_regret"] for h in REFS]
        axes[2].bar(x + (i - len(RULES) / 2 + 0.5) * wd, vals, wd, color=sty[r][0],
                    alpha=0.45 if "always" in r else 1.0, label=r.replace("_", " "))
    axes[2].set_xticks(x)
    axes[2].set_xticklabels([f"held {h}" for h in REFS], fontsize=8)
    axes[2].set_ylabel("worst regret, rms P 250-400 px (px)")
    axes[2].set_title("edge band, truth TUM (five windows, causal prior)", fontsize=9)
    fig.tight_layout()
    fig.savefig(os.path.join(HERE, "edge.png"), dpi=130)


if __name__ == "__main__":
    main()
