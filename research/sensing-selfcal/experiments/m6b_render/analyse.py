"""Score milestone 6b's pre-registered hypotheses (LOG.md, H33-H37) and draw its figure.

    python3 experiments/m6b_render/analyse.py     # after run.py, ablate.py and outer.py
"""
import glob, gzip, json, os, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(ROOT, "src"))
from selfcal import detect, zhang, PATTERN  # noqa: E402

METHODS = ("subpix11", "subpix5", "sb")
LABEL = {"subpix11": "cornerSubPix 11×11", "subpix5": "cornerSubPix 5×5", "sb": "findChessboardCornersSB"}
SETTINGS = ("matched", "blur_half", "blur_double", "noise_zero", "noise_double")
CAMS = ("left", "right")


def ring_mask():
    r, c = np.divmod(np.arange(PATTERN[0] * PATTERN[1]), PATTERN[0])
    return (r == 0) | (r == PATTERN[1] - 1) | (c == 0) | (c == PATTERN[0] - 1)


def rms(x):
    x = np.asarray(x, float)
    return float(np.sqrt(np.mean(x ** 2)))


def real_images():
    """The same quantities on the real images: localiser gaps and per-localiser Zhang (k1 + k2)."""
    ring = ring_mask()
    out = {}
    for cam in CAMS:
        files = sorted(glob.glob(os.path.join(ROOT, "data", f"{cam}*.jpg")))
        C = {}
        for m in METHODS:
            cs = []
            for f in files:
                c, size = detect(f, method=m)
                cs.append(c)
            C[m] = np.array(cs)
        gap = np.linalg.norm(C["subpix11"] - C["sb"], axis=-1)
        z = {m: zhang(list(C[m]), size, k2=True) for m in METHODS}
        out[cam] = dict(gap11_sb_ring_over1=int((gap[:, ring] > 1).sum()), gap11_sb_interior_over1=int((gap[:, ~ring] > 1).sum()),
                        gap11_sb_max=float(gap.max()), gap11_sb_ring_rms=rms(gap[:, ring]), gap11_sb_interior_rms=rms(gap[:, ~ring]),
                        zhang_f={m: float(z[m]["f"]) for m in METHODS}, zhang_sf={m: float(z[m]["sf"]) for m in METHODS})
    return out


def summarise(runs, truth):
    ring = ring_mask()
    S = {}
    for cam in CAMS:
        ft = truth[cam]["f"]
        for st in SETTINGS:
            rs = [r for r in runs if r["cam"] == cam and r["setting"] == st]
            d = dict(n=len(rs))
            errs = {}
            for m in METHODS:
                ok = [r["methods"][m] for r in rs if r["methods"].get(m)]
                d[m] = dict(n_ok=len(ok))
                if not ok:
                    continue
                E = np.array([o["err"] for o in ok])                    # seeds, views, points, 2
                errs[m] = E
                n = np.linalg.norm(E, axis=-1)
                bias = E.mean(0)                                         # systematic part per corner
                zf = np.array([o["zhang"]["f"] for o in ok])
                sc = [o["selfcal"] for o in ok if o["selfcal"]]
                sf = np.array([s["f"] for s in sc]); ssf = np.array([s["sf"] for s in sc])
                svf = np.array([s["sf_cr_view"] for s in sc])
                zz = (zf - ft) / np.array([o["zhang"]["sf"] for o in ok])
                d[m].update(
                    rms_ring=rms(n[:, :, ring]), rms_interior=rms(n[:, :, ~ring]), max=float(n.max()),
                    bias_rms_ring=rms(np.linalg.norm(bias, axis=-1)[:, ring]),
                    bias_rms_interior=rms(np.linalg.norm(bias, axis=-1)[:, ~ring]),
                    n_over1=int((n > 1).sum()), n_over1_ring=int((n[:, :, ring] > 1).sum()),
                    zhang_f_err_pct_median=float(np.median((zf - ft) / ft * 100)),
                    zhang_f_err_pct_sd=float(np.std((zf - ft) / ft * 100, ddof=1)) if len(zf) > 1 else None,
                    zhang_rms_z=rms(zz),
                    selfcal_n=len(sc),
                    selfcal_f_err_pct_median=float(np.median((sf - ft) / ft * 100)) if len(sf) else None,
                    selfcal_f_sd_over_sigma=float(np.std(sf, ddof=1) / np.median(ssf)) if len(sf) > 1 else None,
                    selfcal_rms_z=rms((sf - ft) / ssf) if len(sf) else None,
                    selfcal_rms_z_cr_view=rms((sf - ft) / svf) if len(sf) else None,
                    selfcal_median_sf=float(np.median(ssf)) if len(sf) else None,
                    vertical_corr_median=float(np.median([o["resid_corr"]["vertical"] for o in ok if o["resid_corr"]])),
                    horizontal_corr_median=float(np.median([o["resid_corr"]["horizontal"] for o in ok if o["resid_corr"]])))
            if "subpix11" in errs and "sb" in errs and len(errs["subpix11"]) == len(errs["sb"]):
                g = np.linalg.norm(errs["subpix11"] - errs["sb"], axis=-1)
                d["gap11_sb_ring_over1"] = int((g[:, :, ring] > 1).sum())
                d["gap11_sb_max"] = float(g.max())
                d["gap11_sb_ring_over1_per_seed_min"] = int((g[:, :, ring] > 1).sum(axis=(1, 2)).min())
            S[(cam, st)] = d
    return S


def score(S):
    H = {}
    m = {c: S[(c, "matched")] for c in CAMS}
    H["H33"] = dict(held=all(m[c].get("gap11_sb_ring_over1", 0) >= 1 for c in CAMS),
                    detail={c: m[c].get("gap11_sb_ring_over1") for c in CAMS})
    lower = {}
    for c in CAMS:
        for part in ("ring", "interior"):
            v = {k: m[c][k]["rms_" + part] for k in METHODS}
            lower[f"{c}_{part}"] = min(v, key=v.get)
    H["H34"] = dict(held=all(v == "sb" for v in lower.values()), detail=lower)
    e = {c: {k: m[c][k]["zhang_f_err_pct_median"] for k in METHODS} for c in CAMS}
    H["H35"] = dict(held=all(abs(e[c]["sb"]) <= 0.2 and abs(e[c]["subpix11"]) > abs(e[c]["sb"]) for c in CAMS), detail=e)
    z = {c: m[c]["sb"]["selfcal_rms_z"] for c in CAMS}
    H["H36"] = dict(held=all(v <= 1.5 for v in z.values()), detail=z)
    vc = {c: {k: m[c][k]["vertical_corr_median"] for k in METHODS} for c in CAMS}
    H["H37"] = dict(held=all(v < 0.2 for c in CAMS for v in vc[c].values()), detail=vc)
    return H


def figure(S, real, abl, path):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    fig, ax = plt.subplots(1, 2, figsize=(11, 4))
    x = np.arange(len(METHODS))
    names = [LABEL[m].replace("findChessboardCorners", "") for m in METHODS]
    cols = {"left": "C0", "right": "C3"}
    for c in CAMS:
        full = [S[(c, "matched")][m]["zhang_f_err_pct_median"] for m in METHODS]
        half = [abl[f"{c}/halfend_margin0.15_grey"][m]["zhang_f_err_pct"] if abl[f"{c}/halfend_margin0.15_grey"][m] else np.nan for m in METHODS]
        half5 = [abl[f"{c}/halfend_margin0.5_grey"][m]["zhang_f_err_pct"] if abl[f"{c}/halfend_margin0.5_grey"][m] else np.nan for m in METHODS]
        rf = real[c]["zhang_f"]
        realshift = [(rf[m] - rf["subpix5"]) / rf["subpix5"] * 100 for m in METHODS]
        ax[0].plot(x, full, "o:", color=cols[c], alpha=0.6, label=f"{c}: render, full end squares")
        ax[0].plot(x, half, "^-", color=cols[c], label=f"{c}: render, half-width end squares")
        ax[0].plot(x, half5, "v-", color=cols[c], alpha=0.5, label=f"{c}: same, wider white margin")
        ax[0].plot(x + 0.06, realshift, "s--", color="k" if c == "left" else "0.5", label=f"{c}: real images, f minus 5×5's f")
    ax[0].axhline(0, color="k", lw=0.6)
    ax[0].set_xticks(x, names, fontsize=8)
    ax[0].set_ylabel("Zhang focal length error, % of f (k1 + k2)")
    ax[0].set_title("Which localiser biases f, and why")
    ax[0].legend(fontsize=6.5, loc="upper right")
    w = 0.2
    for j, c in enumerate(CAMS):
        full = [S[(c, "matched")][m]["rms_ring"] for m in METHODS]
        half = [abl[f"{c}/halfend_margin0.15_grey"][m]["rms_ring"] if abl[f"{c}/halfend_margin0.15_grey"][m] else np.nan for m in METHODS]
        ax[1].bar(x + (2 * j) * w - 1.5 * w, full, w, color=cols[c], alpha=0.4, label=f"{c}: full end squares")
        ax[1].bar(x + (2 * j + 1) * w - 1.5 * w, half, w, color=cols[c], label=f"{c}: half-width end squares")
    ax[1].set_xticks(x, names, fontsize=8)
    ax[1].set_ylabel("rms error of outer-ring corners vs truth (px)")
    ax[1].set_title("Renders at the real poses, matched blur and noise")
    ax[1].legend(fontsize=7)
    fig.tight_layout()
    fig.savefig(path, dpi=120)


def main():
    R = json.load(gzip.open(os.path.join(HERE, "results.json.gz"), "rt"))
    truth = {c: R["calib"][c]["truth"] for c in CAMS}
    S = summarise(R["runs"], truth)
    real = real_images()
    H = score(S)
    out = dict(calib={c: {k: v for k, v in R["calib"][c].items() if not k.startswith("grid")} for c in CAMS},
               real=real, hypotheses=H, settings={f"{c}/{s}": S[(c, s)] for (c, s) in S})
    json.dump(out, open(os.path.join(HERE, "summary.json"), "w"), indent=1)
    abl = json.load(open(os.path.join(HERE, "ablate.json")))
    outer = json.load(open(os.path.join(HERE, "outer.json")))
    out.update(ablation=abl, outer_square_reach=outer)
    json.dump(out, open(os.path.join(HERE, "summary.json"), "w"), indent=1)
    figure(S, real, abl, os.path.join(HERE, "render.png"))
    for k, v in H.items():
        print(k, "HELD" if v["held"] else "REFUTED", json.dumps(v["detail"]))
    print(json.dumps(real, indent=1))
    for (c, s), d in S.items():
        print(c, s, {m: {k: (round(v, 3) if isinstance(v, float) else v) for k, v in d[m].items()} if isinstance(d.get(m), dict) else None for m in METHODS},
              {k: v for k, v in d.items() if k.startswith("gap")})


if __name__ == "__main__":
    main()
