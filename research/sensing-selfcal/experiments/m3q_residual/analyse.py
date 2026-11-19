"""Milestone 3q: on TUM, with the shutter term in, is the focal error left per window a bias against the board
reference or per-window scatter, and does anything the window reports (k1, solver sd, principal point) predict it?

No new solves. Inputs: milestone 3p's results.json (its `est` equals milestone 3n's `est` exactly in every counted
window, LOG.md milestone 3p) on milestone 3p's counting rule (53 windows), and `est_mud` for the unscored rows.
Hypotheses H201-H207 were set in LOG.md before this file was written. Writes summary.json and residual.png.
Run (from research/sensing-selfcal): python3 experiments/m3q_residual/analyse.py
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


m3n = _load("m3n_an", os.path.join(EXP, "m3n_tumrs", "analyse.py"))
mad_sd, spearman, counted = m3n.mad_sd, m3n.spearman, m3n.counted
M4N = json.load(open(os.path.join(EXP, "m4n_k2", "summary.json")))
SEQS = ("fr1_desk", "fr1_xyz", "fr3_stf")
UNITS = ("fr1", "fr3")
# References for the k1 + k2 window model (LOG.md, milestone 3q plan).
REFS = {
    "board": {u: M4N["zhang"][u]["k1k2"]["f"] for u in UNITS},           # milestone 4n flat-board Zhang
    "tum": {"fr1": (517.3 + 516.5) / 2, "fr3": (535.4 + 539.2) / 2},     # Sturm et al. 2012, published
    "tf": {u: M4N["anchors"]["k2"][u]["f13"] for u in UNITS},           # milestone 4n target-free 13-view
}
K1_BOARD = {u: M4N["zhang"][u]["k1k2"]["d"][0] for u in UNITS}
PP_REF = {u: tuple(M4N["anchors"]["k2"][u]["intr"][1:3]) for u in UNITS}
MODELS = ("est", "est_mud")


def rows():
    res = json.load(open(os.path.join(EXP, "m3p_tumvel", "results.json")))
    out = []
    for w in res["windows"]:
        ok, _ = counted(w)
        if not ok:
            continue
        r = {"seq": w["seq"], "unit": w["unit"], "window": w["window"]}
        for m in MODELS:
            s = w["solves"].get(m)
            if s is None or s["status"] <= 0:
                continue
            f, cx, cy, k1, k2 = s["intr"]
            r[m] = {"f": f, "cx": cx, "cy": cy, "k1": k1, "k2": k2, "sd_rel": s["sd_f"] / f}
        out.append(r)
    return out


def e(r, m, ref="board"):
    R = REFS[ref][r["unit"]]
    return (r[m]["f"] - R) / R


def boot_median(x, n=2000, seed=0):
    rng = np.random.default_rng(seed)
    x = np.asarray(x)
    meds = np.median(rng.choice(x, size=(n, len(x)), replace=True), axis=1)
    return [float(np.percentile(meds, 2.5)), float(np.percentile(meds, 97.5))]


def ols(x, y):
    A = np.column_stack([np.ones(len(x)), x])
    return np.linalg.lstsq(A, np.asarray(y), rcond=None)[0]


def main():
    R = rows()
    per = {}
    for m in MODELS:
        for s in SEQS:
            rs = [r for r in R if r["seq"] == s and m in r]
            f = np.array([r[m]["f"] for r in rs])
            d = {"n": len(rs), "med_f": float(np.median(f)), "med_f_ci95": boot_median(f)}
            for ref in REFS:
                ee = np.array([e(r, m, ref) for r in rs]) * 100
                d[ref] = {"R": REFS[ref][rs[0]["unit"]], "med_e_pct": float(np.median(ee)),
                          "med_abs_e_pct": float(np.median(np.abs(ee))), "robust_sd_e_pct": float(mad_sd(ee))}
            per[f"{m}/{s}"] = d

    hyp = {}
    # H201: the window median f lies between the smallest and largest reference, in >= 2 of 3 sequences
    inside = {}
    for s in SEQS:
        u = s[:3]
        lo, hi = min(REFS[x][u] for x in REFS), max(REFS[x][u] for x in REFS)
        mf = per[f"est/{s}"]["med_f"]
        inside[s] = {"med_f": mf, "lo": lo, "hi": hi, "inside": bool(lo <= mf <= hi)}
    hyp["H201"] = {"per_seq": inside, "held": sum(v["inside"] for v in inside.values()) >= 2}
    # H202: robust sd of e exceeds |median e| in every sequence (board reference)
    h202 = {s: {"robust_sd": per[f"est/{s}"]["board"]["robust_sd_e_pct"],
                "abs_med": abs(per[f"est/{s}"]["board"]["med_e_pct"])} for s in SEQS}
    hyp["H202"] = {"per_seq": h202, "held": all(v["robust_sd"] > v["abs_med"] for v in h202.values())}
    # H203: fr1 Spearman(signed e, k1) >= +0.4
    f1 = [r for r in R if r["unit"] == "fr1" and "est" in r]
    rho = spearman([e(r, "est") for r in f1], [r["est"]["k1"] for r in f1])
    hyp["H203"] = {"rho": rho, "n": len(f1), "held": rho >= 0.4}
    # H204: pooled Spearman(|e|, sd_f / f) >= +0.3
    al = [r for r in R if "est" in r]
    rho = spearman([abs(e(r, "est")) for r in al], [r["est"]["sd_rel"] for r in al])
    hyp["H204"] = {"rho": rho, "n": len(al), "held": rho >= 0.3}
    # H205: keep windows with sd_f/f <= their sequence median; median |e| drops >= 25% in >= 2 of 3 sequences
    gate = {}
    for s in SEQS:
        rs = [r for r in al if r["seq"] == s]
        sd = np.array([r["est"]["sd_rel"] for r in rs])
        ae = np.array([abs(e(r, "est")) for r in rs]) * 100
        keep = sd <= np.median(sd)
        gate[s] = {"all": float(np.median(ae)), "kept": float(np.median(ae[keep])), "n_kept": int(keep.sum()),
                   "ratio": float(np.median(ae[keep]) / np.median(ae))}
    hyp["H205"] = {"per_seq": gate, "held": sum(v["ratio"] <= 0.75 for v in gate.values()) >= 2}
    # H206: pooled Spearman(|e|, principal-point distance from the anchor) >= +0.3
    pp = [float(np.hypot(r["est"]["cx"] - PP_REF[r["unit"]][0], r["est"]["cy"] - PP_REF[r["unit"]][1])) for r in al]
    rho = spearman([abs(e(r, "est")) for r in al], pp)
    hyp["H206"] = {"rho": rho, "med_pp_dist_px": float(np.median(pp)), "held": rho >= 0.3}
    # H207: k1 correction fitted on one fr1 sequence, applied to the other
    tr = {}
    for a, b in (("fr1_desk", "fr1_xyz"), ("fr1_xyz", "fr1_desk")):
        A = [r for r in al if r["seq"] == a]
        B = [r for r in al if r["seq"] == b]
        c0, c1 = ols([r["est"]["k1"] - K1_BOARD["fr1"] for r in A], [e(r, "est") for r in A])
        raw = np.array([abs(e(r, "est")) for r in B]) * 100
        cor = np.array([abs(e(r, "est") - (c0 + c1 * (r["est"]["k1"] - K1_BOARD["fr1"]))) for r in B]) * 100
        tr[f"{a}->{b}"] = {"a": float(c0), "b": float(c1), "raw": float(np.median(raw)),
                           "corrected": float(np.median(cor)), "ratio": float(np.median(cor) / np.median(raw))}
    hyp["H207"] = {"per_pair": tr, "held": all(v["ratio"] <= 0.8 for v in tr.values())}

    # Unscored: H203, H204, H206 under the other references and for est_mud
    uns = {}
    for m in MODELS:
        for ref in REFS:
            a = [r for r in R if m in r]
            a1 = [r for r in a if r["unit"] == "fr1"]
            ppm = [float(np.hypot(r[m]["cx"] - PP_REF[r["unit"]][0], r[m]["cy"] - PP_REF[r["unit"]][1])) for r in a]
            uns[f"{m}/{ref}"] = {
                "fr1_rho_e_k1": spearman([e(r, m, ref) for r in a1], [r[m]["k1"] for r in a1]),
                "rho_abs_e_sd": spearman([abs(e(r, m, ref)) for r in a], [r[m]["sd_rel"] for r in a]),
                "rho_abs_e_pp": spearman([abs(e(r, m, ref)) for r in a], ppm),
                "pooled_med_abs_e_pct": float(np.median([abs(e(r, m, ref)) for r in a]) * 100)}
    # Unscored: within-sequence (de-meaned) Spearman of e with k1, est
    within = {}
    for s in SEQS:
        rs = [r for r in al if r["seq"] == s]
        within[s] = spearman([e(r, "est") for r in rs], [r["est"]["k1"] for r in rs])
    out = {"refs": REFS, "k1_board": K1_BOARD, "pp_ref": PP_REF, "n": len(R), "hypotheses": hyp,
           "per_sequence": per, "unscored": uns, "within_seq_rho_e_k1": within}
    json.dump(out, open(os.path.join(HERE, "summary.json"), "w"), indent=1)
    for k, v in hyp.items():
        print(k, "held" if v["held"] else "refuted", json.dumps({x: y for x, y in v.items() if x != "held"}))
    print("within-seq rho(e, k1):", json.dumps(within))
    for k, v in per.items():
        print(k, json.dumps(v))
    for k, v in uns.items():
        print(k, json.dumps(v))
    figure(R)


def figure(R):
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except ImportError:
        print("matplotlib missing: residual.png not drawn")
        return
    fig, ax = plt.subplots(1, 2, figsize=(10, 4))
    col = {"fr1_desk": "C0", "fr1_xyz": "C1", "fr3_stf": "C2"}
    for i, s in enumerate(SEQS):
        rs = [r for r in R if r["seq"] == s and "est" in r]
        u = s[:3]
        f = [r["est"]["f"] for r in rs]
        ax[0].scatter(np.full(len(f), i) + np.linspace(-0.15, 0.15, len(f)), f, s=12, color=col[s])
        ax[0].plot([i - 0.25, i + 0.25], [np.median(f)] * 2, color="k", lw=2)
        for ref, ls in (("board", "-"), ("tum", "--"), ("tf", ":")):
            ax[0].plot([i - 0.35, i + 0.35], [REFS[ref][u]] * 2, ls, color="0.4", lw=1)
        ax[1].scatter([r["est"]["k1"] for r in rs], [e(r, "est") * 100 for r in rs], s=12, color=col[s], label=s)
    ax[0].set_xticks(range(3), SEQS)
    ax[0].set_ylabel("window focal length f (px)")
    ax[0].set_title("est per window; black: median; grey: board (-), TUM (--), target-free (:)", fontsize=8)
    ax[0].set_ylim(420, 600)
    ax[1].set_xlabel("window k1")
    ax[1].set_ylabel("e against the board (%)")
    ax[1].axhline(0, color="0.6", lw=0.8)
    ax[1].legend(fontsize=8)
    fig.tight_layout()
    fig.savefig(os.path.join(HERE, "residual.png"), dpi=120)


if __name__ == "__main__":
    main()
