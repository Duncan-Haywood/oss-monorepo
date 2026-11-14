"""Milestone 4j, step 3: the update test and the twin reference on the two TUM units.

    python3 experiments/m4j_tum/analyse.py      # a few minutes, after run.py

Milestone 4g's splits and statistics and milestone 4i's twin references, unchanged code (imported),
with the two TUM RGB-D units (fr1, a Kinect; fr3, an Xtion) in place of OpenCV's left and right
cameras. Scores H63 and H65-H67 (LOG.md, 2026-11-14, milestone 4j planned); H64 is check.py's.
Writes summary.json and reference.png.
"""
import gzip, importlib.util, json, os, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
import tumunit as tu  # noqa: E402

_spec = importlib.util.spec_from_file_location("m4i", os.path.join(ROOT, "experiments", "m4i_geomref", "analyse.py"))
m4i = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(m4i)
m4g = m4i.m4g
# A private copy of milestone 4i's twin, on tumunit's private selfcal, so that pointing it at the
# 48-corner board does not change the shared `twin` module other milestones' code uses.
_tspec = importlib.util.spec_from_file_location("twin_tum", os.path.join(ROOT, "experiments", "m4i_geomref", "twin.py"))
twin = importlib.util.module_from_spec(_tspec)
_tspec.loader.exec_module(twin)
twin.sc, twin.NPT = tu.sc, tu.NPT
m4i.twin = twin
# point the imported (private) milestone-4g code at the TUM units
m4g.CAMS, m4g.OTHER = tu.UNITS, tu.OTHER
CAMS = tu.UNITS
DESIGNS = m4i.DESIGNS
MODELS, N_DRAWS, CHUNK, SEED = m4i.MODELS, m4i.N_DRAWS, m4i.CHUNK, m4i.SEED
M4H_REF = {(7, 4): 25.84, (7, 5): 22.90, (7, 6): 18.45}   # milestone 4h, Gaussian independent offsets (unit-free)
RESULTS = os.path.join(HERE, "results.json.gz")


def load_unit(unit):
    obs, size, _ = tu.load(unit)
    with gzip.open(RESULTS, "rt") as fh:
        f0 = json.load(fh)["cams"][unit]["f0"]
    return twin.fit_all(obs, size, f0), obs, size, f0


load_cam = load_unit   # milestone 4i's check.py imports this name


def rate_of(res, model, test, designs=DESIGNS, cams=CAMS, scen="S0", s_set=(1.0,)):
    n = det = 0
    for des in designs:
        for cam in cams:
            for s in s_set:
                r = res[(model, des, cam, scen, s, test)]
                n, det = n + r["n"], det + r["det"]
    return det / n if n else float("nan")


def main():
    sols = m4g.load(RESULTS)
    T = {cam: m4g.per_set(sols[cam]) for cam in CAMS}
    D = {des: m4g.decisions(T, *des) for des in DESIGNS}
    usable = {cam: {n: int(sum(T[cam]["usable"][m4g.mask(v)] for v in sols[cam] if len(v) == n)) for n in range(4, 8)}
              for cam in CAMS}
    conv = {cam: {n: [int(sum(m4g.ok(s) for v, s in sols[cam].items() if len(v) == n)),
                      int(sum(1 for v in sols[cam] if len(v) == n))] for n in list(range(3, 8)) + [13]} for cam in CAMS}
    tw = {}
    for cam in CAMS:
        tw[cam] = load_unit(cam)[0]
        assert abs(tw[cam]["intr"][0] / T[cam]["f13"] - 1) < 1e-8, (cam, tw[cam]["intr"][0], T[cam]["f13"])
    G, IDX = {}, {}
    for cam in CAMS:
        G[cam], IDX[cam] = twin.gain_matrix(tw[cam])
    anchor = {}
    for cam in CAMS:
        c = tu.TUM_CALIB[cam]
        ref = (c[0] + c[1]) / 2
        anchor[cam] = dict(f13=float(T[cam]["f13"]), tum_mean_fxfy=ref, rel=float(T[cam]["f13"] / ref - 1),
                           rms13=tw[cam]["rms"], cx=float(tw[cam]["intr"][1]), cy=float(tw[cam]["intr"][2]),
                           k1=float(tw[cam]["intr"][3]), tum_cx=c[2], tum_cy=c[3])
    REF = {}
    for model in MODELS:
        TWS = {}
        for cam in CAMS:
            rng = np.random.default_rng([SEED, MODELS.index(model), CAMS.index(cam)])
            parts = [m4i.twin_sets(G[cam], IDX[cam], twin.noise(rng, model, CHUNK, tw[cam]))
                     for _ in range(N_DRAWS // CHUNK)]
            TWS[cam] = tuple(np.concatenate([p[j] for p in parts], axis=1) for j in range(3))
        for des in DESIGNS:
            for cam in CAMS:
                for old_cam, tag in ((cam, "own"), (tu.OTHER[cam], "swap")):
                    row = D[des][(cam, "S0" if tag == "own" else "S3", 1.0)]
                    qR, qJ, pR, pJ = m4i.references(TWS[old_cam], TWS[cam], IDX[old_cam], IDX[cam], row["old"], row["new"])
                    REF[(model, des, cam, tag)] = dict(qR=qR, qJ=qJ, poolR=pR, poolJ=pJ)
                    print(model, des, cam, tag, "qR median", float(np.median(qR)), "pooled", pR, flush=True)
        del TWS
    res = {}
    for model in MODELS:
        for des in DESIGNS:
            for cam in CAMS:
                for name, s in m4g.SCEN:
                    tag = "swap" if name == "S3" else "own"
                    ref = REF[(model, des, cam, tag)]
                    row = D[des][(cam, name, s)]
                    base = D[des][(cam, "S3" if tag == "swap" else "S0", 1.0)]
                    assert np.array_equal(base["old"], row["old"]) and np.array_equal(base["new"], row["new"])
                    for test, z, q in (("R_geom", row["z2_R"], ref["qR"]), ("J_geom", row["z2_J"], ref["qJ"]),
                                       ("R_pool", row["z2_R"], ref["poolR"]), ("J_pool", row["z2_J"], ref["poolJ"]),
                                       ("R_chi2", row["z2_R"], m4g.CHI2_1_99), ("J_chi2", row["z2_J"], m4g.CHI2_1_99),
                                       ("R_m4h", row["z2_R"], M4H_REF[des])):
                        f = z > q
                        res[(model, des, cam, name, s, test)] = dict(n=int(len(f)), det=int(f.sum()),
                                                                     harm=int(m4g.harmful(row, f).sum()))
    pm2 = (0.98, 1.02)
    H = {}
    h = dict(fr3_rel=anchor["fr3"]["rel"], fr1_rel_unscored=anchor["fr1"]["rel"])
    h["holds"] = bool(abs(h["fr3_rel"]) <= 0.01)
    H["H63"] = h
    h = {cam: rate_of(res, "resid", "R_geom", cams=(cam,)) for cam in CAMS}
    h["holds"] = bool(all(0.005 <= h[c] <= 0.025 for c in CAMS))
    H["H65"] = h
    h = dict(R_geom_pm2_k6=rate_of(res, "resid", "R_geom", designs=[(7, 6)], scen="S1", s_set=pm2))
    h["holds"] = bool(h["R_geom_pm2_k6"] >= 0.25)
    H["H66"] = h
    h = {cam: rate_of(res, "resid", "R_geom", designs=[(7, 6)], cams=(cam,), scen="S3") for cam in CAMS}
    h["holds"] = bool(all(h[c] >= 0.5 for c in CAMS))
    H["H67"] = h
    table = []
    for model in MODELS:
        for des in DESIGNS:
            for name, s in m4g.SCEN:
                for test in ("R_geom", "J_geom", "R_pool", "J_pool", "R_chi2", "J_chi2", "R_m4h"):
                    r = dict(model=model, design=f"{des[0]}+{des[1]}", scen=name, s=s, test=test)
                    for cam in CAMS:
                        x = res[(model, des, cam, name, s, test)]
                        r[cam] = x["det"] / x["n"] if x["n"] else float("nan")
                        r[f"n_{cam}"] = x["n"]; r[f"harm_{cam}"] = x["harm"] / x["n"] if x["n"] else float("nan")
                    r["pooled"] = rate_of(res, model, test, designs=[des], scen=name, s_set=(s,))
                    table.append(r)
    refs = {}
    for (model, des, cam, tag), ref in REF.items():
        q = ref["qR"]
        refs[f"{model}/{des[0]}+{des[1]}/{cam}/{tag}"] = dict(
            qR_quantiles=[float(np.quantile(q, p)) for p in (0.0, 0.1, 0.5, 0.9, 1.0)],
            qJ_median=float(np.median(ref["qJ"])), poolR=ref["poolR"], poolJ=ref["poolJ"])
    real_scale = {f"{des[0]}+{des[1]}/{cam}/{est}": m4g.scale_ratio(D, cam, est, des)
                  for des in DESIGNS for cam in CAMS for est in ("R", "J")}
    swap_f = {cam: dict(f13_this=float(T[cam]["f13"]), f13_other=float(T[tu.OTHER[cam]]["f13"]),
                        rel=float(T[tu.OTHER[cam]]["f13"] / T[cam]["f13"] - 1)) for cam in CAMS}
    harm = {f"{model}/{test}": sum(res[(model, des, c, n, s, test)]["harm"] for des in DESIGNS for c in CAMS for n, s in m4g.SCEN)
            / sum(res[(model, des, c, n, s, test)]["n"] for des in DESIGNS for c in CAMS for n, s in m4g.SCEN)
            for model in MODELS for test in ("R_geom", "R_pool", "R_chi2")}
    out = dict(anchor=anchor, converged=conv, usable_sets=usable, swap=swap_f, hypotheses=H, references=refs,
               real_scale_ratio=real_scale, harmful=harm, n_draws=N_DRAWS, seed=SEED, table=table)
    with open(os.path.join(HERE, "summary.json"), "w") as fh:
        json.dump(out, fh, indent=1)
    print(json.dumps(dict(anchor=anchor, converged=conv, swap=swap_f, real_scale=real_scale, harmful=harm), indent=1))
    for k, v in H.items():
        print(k, "holds" if v["holds"] else "REFUTED", json.dumps({a: b for a, b in v.items() if a != "holds"}))
    for r in table:
        if r["scen"] in ("S0", "S3") or r["s"] in (0.98, 1.02, 0.99, 1.01, 0.96, 1.04):
            print(f"{r['model']:5s} {r['design']} {r['scen']} {r['s']:.3f} {r['test']:6s} fr1 {r['fr1']:.3f} "
                  f"fr3 {r['fr3']:.3f} pooled {r['pooled']:.3f}")
    figure(REF, res, os.path.join(HERE, "reference.png"), swap_f)


def figure(REF, res, path, swap_f):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    col = {"fr1": "#1b2f6b", "fr3": "#c0392b"}
    lab = {"fr1": "fr1 (Kinect)", "fr3": "fr3 (Xtion)"}
    fig, axes = plt.subplots(1, 2, figsize=(10, 4.2))
    for cam in CAMS:
        q = np.sort(REF[("resid", (7, 6), cam, "own")]["qR"])
        axes[0].plot(q, np.linspace(0, 1, len(q)), color=col[cam], label=lab[cam])
    axes[0].axvline(m4g.CHI2_1_99, color="grey", ls=":", lw=1); axes[0].text(m4g.CHI2_1_99, 0.02, " χ²₁", fontsize=8, color="grey")
    axes[0].axvline(18.45, color="#c08a3e", ls="--", lw=1); axes[0].text(18.45, 0.02, " 4h model", fontsize=8, color="#c08a3e")
    axes[0].set_xscale("log"); axes[0].set_xlabel("twin's 99th percentile of z_R² for the split (log)")
    axes[0].set_ylabel("share of the 1,716 splits (old 7, new 6)"); axes[0].legend(fontsize=8, frameon=False)
    axes[0].set_title("each split's own threshold, from the unit's twin", fontsize=9)
    xs = sorted(set(m4g.S_LIST) | {1.0})
    for cam in CAMS:
        ys = [res[("resid", (7, 6), cam, "S0" if s == 1.0 else "S1", s, "R_geom")] for s in xs]
        axes[1].plot([100 * (s - 1) for s in xs], [y["det"] / y["n"] for y in ys], "o-", color=col[cam], ms=3,
                     label=f"{lab[cam]}, scaled f")
        sw = res[("resid", (7, 6), cam, "S3", 1.0, "R_geom")]
        x = -100 * swap_f[cam]["rel"]      # the new views' f over the other unit's, minus 1
        axes[1].plot([x], [sw["det"] / sw["n"]], "s", color=col[cam], ms=7, mfc="none",
                     label=f"{lab[cam]} new views, the other unit's old views (real {x:+.1f}%)")
    axes[1].axhline(0.01, color="grey", lw=0.8, ls=":")
    axes[1].set_xlabel("focal change applied to the new views (%)"); axes[1].set_ylabel("share of splits where the test fires")
    axes[1].legend(fontsize=7, frameon=False); axes[1].set_ylim(-0.02, 1.02)
    axes[1].set_title("robust jackknife test, per-split twin reference, old 7 + new 6", fontsize=9)
    fig.suptitle("Milestone 4j: the twin reference on two TUM RGB-D cameras", fontsize=10)
    fig.tight_layout()
    fig.savefig(path, dpi=130)


if __name__ == "__main__":
    main()
