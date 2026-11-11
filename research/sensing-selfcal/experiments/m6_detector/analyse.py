"""Score milestone 6's pre-registered hypotheses (LOG.md, H14-H17) and draw its figure.

    python3 experiments/m6_detector/analyse.py
"""
import glob, json, os, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(ROOT, "src"))
sys.path.insert(0, os.path.join(ROOT, "experiments", "m3_robust"))
from analyse import rms, boot_rms  # noqa: E402  (milestone 3's helpers)
from selfcal import detect, PATTERN  # noqa: E402

METHODS = ("subpix11", "subpix5", "sb")
LABEL = {"subpix11": "cornerSubPix 11×11 (m1–5)", "subpix5": "cornerSubPix 5×5", "sb": "findChessboardCornersSB"}
SIGMAS = ("sf", "sf_cr_view", "sf_cr_viewcol", "sf_cr_viewrow", "sf_cr_point", "sf_hc0")


def edge_mask():
    r, c = np.divmod(np.arange(PATTERN[0] * PATTERN[1]), PATTERN[0])
    return (r == 0) | (r == PATTERN[1] - 1) | (c == 0) | (c == PATTERN[0] - 1)


def detector_gaps():
    """Per-corner distance between detectors, outer ring of the grid against the interior."""
    edge = edge_mask()
    out = {}
    for a, b in (("subpix11", "subpix5"), ("subpix11", "sb"), ("subpix5", "sb")):
        d = []
        for f in sorted(glob.glob(os.path.join(ROOT, "data", "*.jpg"))):
            p, _ = detect(f, method=a); q, _ = detect(f, method=b)
            d.append(np.linalg.norm(p - q, axis=1))
        d = np.array(d)
        out[f"{a}_vs_{b}"] = dict(
            median_px=float(np.median(d)), edge_median_px=float(np.median(d[:, edge])),
            interior_median_px=float(np.median(d[:, ~edge])), over_1px=int((d > 1).sum()),
            over_1px_on_edge=int((d[:, edge] > 1).sum()), max_px=float(d.max()), n=int(d.size))
    return out


def main():
    R = json.load(open(os.path.join(HERE, "results.json")))
    S = {"cams": {}, "hypotheses": {}, "detector_gaps": detector_gaps(), "unplanned": {}}
    for cam, c in R["cams"].items():
        S["cams"][cam] = {}
        for m in METHODS:
            x = c[m]; s = x["selfcal_k1"]; z = x["zhang_k1"]
            S["cams"][cam][m] = dict(
                f=s["f"], sf=s["sf"], cy=s["cy"], scy=s["scy"], rms=s["rms"], zhang_f=z["f"], zhang_cy=z["cy"],
                zhang_rms=z["rms"], resid_corr=x["resid_corr"], structure=x["structure"],
                shift_from_subpix11=x["shift_from_subpix11"], **{k: s[k] for k in SIGMAS[1:]})
    zref = {cam: c["zhang_k1_subpix11_m2"] for cam, c in R["cams"].items()}
    D = []
    for r in R["subsets"]:
        s = r["selfcal"]
        if s is None or not np.isfinite(s["sf"]) or s["sf"] <= 0:
            continue
        D.append(dict(cam=r["cam"], m=r["method"], kind=r["kind"], k=r["k"], f=s["f"], conv=s["status"] > 0,
                      f_all=S["cams"][r["cam"]][r["method"]]["f"], **{k: s[k] for k in SIGMAS}))
    S["convergence"] = {m: dict(n=sum(d["m"] == m for d in D), converged=sum(d["conv"] for d in D if d["m"] == m))
                        for m in METHODS}
    rnd = [d for d in D if d["kind"] == "random" and 4 <= d["k"] <= 12]

    # H14: SB corners' adjacent-along-column correlation < 0.2 on both cameras.
    v = {cam: S["cams"][cam]["sb"]["resid_corr"]["vertical"] for cam in R["cams"]}
    S["hypotheses"]["H14"] = dict(sb_vertical=v, holds=all(x < 0.2 for x in v.values()),
                                  all_methods={cam: {m: S["cams"][cam][m]["resid_corr"]["vertical"] for m in METHODS}
                                               for cam in R["cams"]})
    # H15: column means mostly perpendicular to the column (>= 70%), original corners.
    p = {cam: S["cams"][cam]["subpix11"]["structure"]["col_perp_share"] for cam in R["cams"]}
    S["hypotheses"]["H15"] = dict(perp_share=p, holds=all(x >= 0.7 for x in p.values()))

    def nested(rows, key):
        zs, dropped = [], 0
        for d in rows:
            sa = S["cams"][d["cam"]][d["m"]][key]
            var = d[key] ** 2 - sa ** 2
            if not np.isfinite(var) or var <= 0:
                dropped += 1; continue
            zs.append((d["f"] - d["f_all"]) / np.sqrt(var))
        zs = np.array(zs)
        top5 = np.sort(np.abs(zs))[:-5] if len(zs) > 5 else zs
        return dict(n=len(zs), dropped=dropped, rms_z=rms(zs), ci95=boot_rms(zs), median_abs_z=float(np.median(np.abs(zs))),
                    rms_z_without_top5=rms(top5))

    # H16: (view, column)-clustered sandwich on original corners against all-view Zhang, per camera.
    h16 = {}
    for key in SIGMAS:
        h16[key] = {}
        for cam in R["cams"]:
            z = [(d["f"] - zref[cam]) / d[key] for d in rnd if d["m"] == "subpix11" and d["cam"] == cam
                 and np.isfinite(d[key]) and d[key] > 0]
            h16[key][cam] = dict(n=len(z), rms_z=rms(z), ci95=boot_rms(z), cover_2sigma=float(np.mean(np.abs(z) <= 2)))
        h16[key]["nested"] = nested([d for d in rnd if d["m"] == "subpix11"], key)
    h16["holds"] = all(0.7 <= h16["sf_cr_viewcol"][cam]["rms_z"] <= 1.4 for cam in R["cams"])
    S["hypotheses"]["H16"] = h16
    # H17: SB corners, nested rms z <= 1.5 (H8's test); all detectors reported.
    h17 = {m: nested([d for d in rnd if d["m"] == m], "sf") for m in METHODS}
    h17["holds"] = h17["sb"]["rms_z"] <= 1.5
    S["hypotheses"]["H17"] = h17
    # Unplanned: every sigma, every detector, nested; and against all-view Zhang (subpix11).
    S["unplanned"]["nested_by_detector_and_sigma"] = {
        m: {k: nested([d for d in rnd if d["m"] == m], k)["rms_z"] for k in SIGMAS} for m in METHODS}
    S["unplanned"]["median_abs_err_pct_vs_own_all_view"] = {
        m: float(np.median([abs(d["f"] - d["f_all"]) / d["f_all"] * 100 for d in rnd if d["m"] == m])) for m in METHODS}
    S["unplanned"]["median_sf_by_detector"] = {m: float(np.median([d["sf"] for d in rnd if d["m"] == m])) for m in METHODS}
    with open(os.path.join(HERE, "summary.json"), "w") as fh:
        json.dump(S, fh, indent=1)
    figure(S)
    for k, h in S["hypotheses"].items():
        print(k, "holds" if h["holds"] else "refuted")
    print(json.dumps({k: S[k] for k in ("detector_gaps", "convergence")}, indent=1))


def figure(S):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    import cv2
    fig, ax = plt.subplots(1, 3, figsize=(13, 4.2))
    # (a) the worst corner: left02, corner 45 (bottom-left of the grid)
    f = os.path.join(ROOT, "data", "left02.jpg")
    img = cv2.imread(f, cv2.IMREAD_GRAYSCALE)
    pts = {m: detect(f, method=m)[0][45] for m in METHODS}
    cx, cy = pts["sb"]
    h = 26
    x0, y0 = int(cx) - h, int(cy) - h
    ax[0].imshow(img[y0:y0 + 2 * h, x0:x0 + 2 * h], cmap="gray", extent=(x0, x0 + 2 * h, y0 + 2 * h, y0))
    for m, mk, col in (("subpix11", "x", "C3"), ("subpix5", "+", "C0"), ("sb", "o", "C2")):
        ax[0].plot(*pts[m], mk, color=col, ms=10, mfc="none", mew=2, label=LABEL[m])
    for w, col in ((11, "C3"), (5, "C0")):
        p = pts["subpix5"]
        ax[0].add_patch(plt.Rectangle((p[0] - w, p[1] - w), 2 * w + 1, 2 * w + 1, fill=False, ec=col, ls="--", lw=1))
    ax[0].set_title("(a) left02, outer corner 45; dashed: the 23 px and\n11 px windows, drawn around the 5×5 result", fontsize=9)
    ax[0].legend(fontsize=7, loc="lower right")
    # (b) adjacent-along-column residual correlation
    cams = list(S["cams"])
    w = 0.25
    for i, m in enumerate(METHODS):
        ax[1].bar(np.arange(len(cams)) + (i - 1) * w, [S["cams"][c][m]["resid_corr"]["vertical"] for c in cams], w,
                  label=LABEL[m], color=f"C{[3, 0, 2][i]}")
    ax[1].axhline(0.2, color="k", ls=":", lw=1)
    ax[1].set_xticks(range(len(cams)), cams)
    ax[1].set_ylabel("residual correlation, neighbours along a column")
    ax[1].set_title("(b) all 13 views, target-free k1 fit", fontsize=9)
    ax[1].legend(fontsize=7)
    # (c) nested rms z per detector and sigma
    keys = ("sf", "sf_cr_view", "sf_cr_viewcol")
    lab = {"sf": "reported σ", "sf_cr_view": "sandwich, view", "sf_cr_viewcol": "sandwich, view×column"}
    U = S["unplanned"]["nested_by_detector_and_sigma"]
    for i, k in enumerate(keys):
        ax[2].bar(np.arange(len(METHODS)) + (i - 1) * w, [U[m][k] for m in METHODS], w, label=lab[k], color=f"C{i + 4}")
    ax[2].axhline(1, color="k", lw=1); ax[2].axhline(1.5, color="k", ls=":", lw=1)
    ax[2].set_xticks(range(len(METHODS)), ["subpix 11", "subpix 5", "SB"])
    ax[2].set_ylabel("rms z, nested test, random 4–12 views")
    ax[2].set_title("(c) is σ honest? (1 = honest)", fontsize=9)
    ax[2].legend(fontsize=7)
    fig.tight_layout()
    fig.savefig(os.path.join(HERE, "detector.png"), dpi=130)


if __name__ == "__main__":
    main()
