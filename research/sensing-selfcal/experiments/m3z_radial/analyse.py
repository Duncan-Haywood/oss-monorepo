"""Milestone 3z: is milestone 3y's distortion bias a real error in where a window puts a ray, or the focal
length and the distortion trading off? Scores H267-H273 (LOG.md, milestone 3z planned). Analysis only:
milestone 3s's saved est_c / est / est_cr solves and milestone 3b's solves with their 5x5 intrinsics
covariance; nothing is re-solved.

P(r): for a reference that images the ray of normalised radius x_r at r px, the window's image radius of
that same ray minus r. dD(r): the window's radial distortion displacement at r px minus the reference's
(milestone 3y's D200 at any radius). Writes summary.json and radial.png.
Run (from research/sensing-selfcal): python3 experiments/m3z_radial/analyse.py
"""
import importlib.util
import json
import os

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
EXP = os.path.join(HERE, "..")
RADII = tuple(range(50, 351, 25))   # the board fr1 model folds back at 381 px (k2 < 0); see LOG 3z
MODELS = ("est", "est_c", "est_cr")


def _load(name, path):
    s = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(s)
    s.loader.exec_module(m)
    return m


def radial_map(x, f, k1, k2, k3=0.0):
    """Image radius (px from the principal point) of a ray at normalised radius x."""
    x2 = x * x
    return f * x * (1 + k1 * x2 + k2 * x2 ** 2 + k3 * x2 ** 3)


def ray_at(r, ref):
    """Normalised ray radius the reference images at r px: the first crossing on a 0.001 grid over
    [0, 1.2], refined by bisection; the map must rise monotonically up to it (a k2 < 0 model folds back
    past its corner, so a bracket at 1.2 alone would be wrong)."""
    m = lambda x: radial_map(x, ref["f"], ref["k1"], ref["k2"], ref.get("k3", 0.0))
    xs = np.linspace(0.0, 1.2, 1201)
    v = m(xs)
    hit = np.nonzero(v >= r)[0]
    if len(hit) == 0:
        raise ValueError("reference does not reach r inside x <= 1.2")
    i = int(hit[0])
    if np.any(np.diff(v[:i + 1]) <= 0):
        raise ValueError("reference not monotone up to r")
    lo, hi = xs[i - 1], xs[i]
    for _ in range(60):
        mid = 0.5 * (lo + hi)
        if m(mid) < r:
            lo = mid
        else:
            hi = mid
    return 0.5 * (lo + hi)


def d_at(r, f, k1, k2, k3=0.0):
    """Milestone 3y's distortion displacement at r px: r (k1 rho^2 + k2 rho^4 + k3 rho^6), rho = r / f."""
    rho2 = (r / f) ** 2
    return r * (k1 * rho2 + k2 * rho2 ** 2 + k3 * rho2 ** 3)


def p_err(r, w, ref):
    return radial_map(ray_at(r, ref), w["f"], w["k1"], w["k2"]) - r


def d_err(r, w, ref):
    return d_at(r, w["f"], w["k1"], w["k2"]) - d_at(r, ref["f"], ref["k1"], ref["k2"], ref.get("k3", 0.0))


def delta_sd(fun, theta, cov3, h=(1e-3, 1e-6, 1e-6)):
    """sd of fun(f, k1, k2) by the delta method, central differences."""
    J = np.zeros(3)
    for i in range(3):
        a = np.array(theta, float); b = a.copy()
        a[i] += h[i]; b[i] -= h[i]
        J[i] = (fun(*a) - fun(*b)) / (2 * h[i])
    return float(np.sqrt(J @ cov3 @ J))


def references():
    """{ref: {unit: {f, k1, k2, k3}}} for the board, TUM's published calibration, the target-free anchor."""
    m3y = _load("m3y_an", os.path.join(EXP, "m3y_pp_dist", "analyse.py"))
    board = json.load(open(os.path.join(EXP, "m3i_principal", "tum_summary.json")))["board_reference"]
    tum = {"fr1": (517.3, 516.5, 0.2624, -0.9531, 1.1633), "fr3": (535.4, 539.2, 0.0, 0.0, 0.0)}
    anchors = json.load(open(os.path.join(EXP, "m4n_k2", "summary.json")))["anchors"]["k2"]
    out = {"board": {}, "tum": {}, "tf": {}}
    for u in m3y.UNITS:
        b = board[u]
        out["board"][u] = {"f": b["f"], "k1": b["k1"], "k2": b["k2"], "k3": 0.0}
        t = tum[u]
        out["tum"][u] = {"f": (t[0] + t[1]) / 2, "k1": t[2], "k2": t[3], "k3": t[4]}
        a = anchors[u]["intr"]
        out["tf"][u] = {"f": a[0], "k1": a[3], "k2": a[4], "k3": 0.0}
    return out


def spearman(x, y):
    rx = np.argsort(np.argsort(x)); ry = np.argsort(np.argsort(y))
    return float(np.corrcoef(rx, ry)[0, 1])


def sweep(rows, refs):
    """Per model, reference and sequence: median signed and median |.| P(r) and dD(r) at every radius."""
    out = {}
    for m in MODELS:
        out[m] = {}
        for rn, R in refs.items():
            out[m][rn] = {}
            groups = {s: [r for r in rows if r["seq"] == s and m in r] for s in sorted({r["seq"] for r in rows})}
            groups.update({f"unit_{u}": [r for r in rows if r["unit"] == u and m in r] for u in R})
            for g, rs in groups.items():
                d = {"n": len(rs)}
                for name, fn in (("P", p_err), ("dD", d_err)):
                    v = np.array([[fn(rad, r[m], R[r["unit"]]) for rad in RADII] for r in rs])
                    d[name] = {"med": np.median(v, 0).tolist(), "med_abs": np.median(np.abs(v), 0).tolist()}
                fe = [r[m]["f"] / R[r["unit"]]["f"] - 1 for r in rs]
                dd = [d_err(200, r[m], R[r["unit"]]) for r in rs]
                d["spearman_f_dD200"] = spearman(fe, dd) if len(rs) > 2 else None
                out[m][rn][g] = d
    return out


def m3b_rows():
    m3b = _load("m3b_an", os.path.join(EXP, "m3b_natural", "analyse.py"))
    res = json.load(open(os.path.join(EXP, "m3b_natural", "results.json")))
    out = []
    for w in res["windows"]:
        best, why = m3b.pick(w)
        if why != "ok":
            continue
        f, cx, cy, k1, k2 = best["intr"]
        C = np.array(best["cov"])[np.ix_([0, 3, 4], [0, 3, 4])]
        out.append({"seq": w["seq"], "unit": w["unit"], "window": w["window"],
                    "w": {"f": f, "k1": k1, "k2": k2}, "cov3": C})
    return out


def covariance(rows, refs):
    """Delta-method z of P(r) and dD(r) against every reference, and the solver's sd(P(r))/r per radius."""
    out = {}
    for rn, R in refs.items():
        zP = {rad: [] for rad in RADII}; zD = {rad: [] for rad in RADII}
        rel = {rad: [] for rad in RADII}
        sdD200, sdP200 = [], []
        for r in rows:
            ref, th = R[r["unit"]], (r["w"]["f"], r["w"]["k1"], r["w"]["k2"])
            for rad in RADII:
                x = ray_at(rad, ref)
                sP = delta_sd(lambda f, a, b: radial_map(x, f, a, b), th, r["cov3"])
                sD = delta_sd(lambda f, a, b: d_at(rad, f, a, b), th, r["cov3"])
                zP[rad].append(p_err(rad, r["w"], ref) / sP)
                zD[rad].append(d_err(rad, r["w"], ref) / sD)
                rel[rad].append(sP / rad)
                if rad == 200:
                    sdP200.append(sP); sdD200.append(sD)
        rms = lambda z: float(np.sqrt(np.mean(np.square(z))))
        out[rn] = {"rms_z_P": [rms(zP[r]) for r in RADII], "rms_z_dD": [rms(zD[r]) for r in RADII],
                   "med_sdP_over_r": [float(np.median(rel[r])) for r in RADII],
                   "med_sd_P200": float(np.median(sdP200)), "med_sd_dD200": float(np.median(sdD200))}
        seqs = sorted({r["seq"] for r in rows})
        out[rn]["med_dD200"] = {s: float(np.median([d_err(200, r["w"], R[r["unit"]]) for r in rows if r["seq"] == s]))
                                for s in seqs}
        out[rn]["med_P200"] = {s: float(np.median([p_err(200, r["w"], R[r["unit"]]) for r in rows if r["seq"] == s]))
                               for s in seqs}
    return out


def hypotheses(sw, cv):
    i200, i400 = RADII.index(200), RADII.index(350)   # i400: the edge radius, 350 px
    b = sw["est_c"]["board"]
    seqs = [g for g in b if not g.startswith("unit_") and g != "all"]
    h = {}
    pa = {s: b[s]["P"]["med_abs"][i200] for s in seqs}
    da = {s: b[s]["dD"]["med_abs"][i200] for s in seqs}
    h["H267"] = {"med_abs_P200": pa, "med_abs_dD200": da, "holds": all(pa[s] < da[s] for s in seqs)}
    h["H268"] = {"spearman": sw["est_c"]["board"]["all"]["spearman_f_dD200"],
                 "holds": sw["est_c"]["board"]["all"]["spearman_f_dD200"] < -0.5}
    cams = {}
    for u in ("fr1", "fr3"):
        ma = b[f"unit_{u}"]["P"]["med_abs"]
        cams[u] = {"argmin_r": RADII[int(np.argmin(ma))], "P350": ma[i400], "P200": ma[i200],
                   "holds": 100 <= RADII[int(np.argmin(ma))] <= 300 and ma[i400] >= 2 * ma[i200]}
    h["H269"] = {"by_camera": cams, "holds": all(c["holds"] for c in cams.values())}
    c = cv["board"]
    h["H270"] = {"rms_z_dD200": c["rms_z_dD"][i200], "holds": c["rms_z_dD"][i200] > 2}
    h["H271"] = {"rms_z_P200": c["rms_z_P"][i200], "rms_z_dD200": c["rms_z_dD"][i200],
                 "holds": c["rms_z_P"][i200] < c["rms_z_dD"][i200]}
    am = RADII[int(np.argmin(c["med_sdP_over_r"]))]
    h["H272"] = {"argmin_r": am, "holds": 100 <= am <= 300}
    h["H273"] = {"med_dD200": c["med_dD200"], "holds": all(v < 0 for v in c["med_dD200"].values())}
    return h


def main():
    m3s = _load("m3s_an", os.path.join(EXP, "m3s_causal", "analyse.py"))
    R, _ = m3s.rows()
    S = [r for r in R if r["scored"]]
    refs = references()
    sw = sweep(S, refs)
    for m in MODELS:                          # pooled over all scored windows (H268)
        for rn, Rf in refs.items():
            rs = [r for r in S if m in r]
            fe = [r[m]["f"] / Rf[r["unit"]]["f"] - 1 for r in rs]
            dd = [d_err(200, r[m], Rf[r["unit"]]) for r in rs]
            sw[m][rn]["all"] = {"n": len(rs), "spearman_f_dD200": spearman(fe, dd)}
    B = m3b_rows()
    cv = covariance(B, refs)
    hyp = hypotheses(sw, cv)
    out = {"rules": {"radii": RADII, "scored_windows": len(S), "m3b_counted": len(B)},
           "references": refs, "hypotheses": hyp, "sweep": sw, "covariance_m3b": cv}
    with open(os.path.join(HERE, "summary.json"), "w") as fh:
        json.dump(out, fh, indent=1)
    for k, v in hyp.items():
        print(k, json.dumps(v))
    print("radii", RADII)
    for rn in refs:
        for g, d in sw["est_c"][rn].items():
            if "P" not in d:
                print(f"est_c {rn:5s} {g:9s} n={d['n']} spearman={d['spearman_f_dD200']:.2f}")
                continue
            print(f"est_c {rn:5s} {g:9s} n={d['n']:2d} rho={d['spearman_f_dD200']:+.2f}")
            print("   P med ", " ".join(f"{v:+6.2f}" for v in d["P"]["med"]))
            print("   dD med", " ".join(f"{v:+6.2f}" for v in d["dD"]["med"]))
        c = cv[rn]
        print(f"m3b {rn}: rmsz P ", " ".join(f"{v:5.1f}" for v in c["rms_z_P"]))
        print(f"m3b {rn}: rmsz dD", " ".join(f"{v:5.1f}" for v in c["rms_z_dD"]))
        print(f"m3b {rn}: sdP/r %", " ".join(f"{100 * v:5.2f}" for v in c["med_sdP_over_r"]))
        print(f"m3b {rn}: med dD200 {c['med_dD200']} med P200 {c['med_P200']}")
    for m in ("est", "est_cr"):
        for g, d in sw[m]["board"].items():
            if "P" in d:
                print(f"{m} board {g:9s} P200 {d['P']['med'][RADII.index(200)]:+.2f} "
                      f"dD200 {d['dD']['med'][RADII.index(200)]:+.2f} P350 {d['P']['med'][-1]:+.2f}")
    figure(sw)


def figure(sw):
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except ImportError:
        print("matplotlib missing: radial.png not drawn")
        return
    fig, axes = plt.subplots(1, 2, figsize=(10, 3.8), sharey=True)
    cols = {"fr1_desk": "#1f77b4", "fr1_xyz": "#ff7f0e", "fr3_stf": "#2ca02c"}
    for ax, (name, lab) in zip(axes, (("P", "projected radius error P(r)"), ("dD", "distortion term error dD(r)"))):
        for s, col in cols.items():
            d = sw["est_c"]["board"].get(s)
            if d:
                ax.plot(RADII, d[name]["med"], "-o", ms=3, color=col, label=s.replace("_", "/"))
        ax.axhline(0, color="k", lw=0.6)
        ax.set_xlabel("image radius r (px from the principal point)")
        ax.set_title(f"{lab}, est_c windows vs the board", fontsize=9)
        ax.legend(fontsize=7)
    axes[0].set_ylabel("median signed error (px)")
    fig.tight_layout()
    fig.savefig(os.path.join(HERE, "radial.png"), dpi=130)


if __name__ == "__main__":
    main()
