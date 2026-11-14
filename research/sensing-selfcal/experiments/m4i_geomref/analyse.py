"""Milestone 4i: a per-split reference for the robust-jackknife update test from the unit's own twin.

    python3 experiments/m4i_geomref/analyse.py      # a few minutes; no new real solve

Milestone 4h's reference assumed each view adds an independent offset to f, which ignores the
views' geometry; on this rig it made the test conservative (0.2-0.5% false alarms) and weak (a 2%
focal change at 6 new views caught in 19% of splits). Here the reference for each (old, new) split
is drawn from the unit's linearised twin (twin.py): pixel noise -> every set's f and its delete-one
f's -> R -> z_R^2 = (f_new - f_old)^2 / (R_old + R_new), 10,000 draws per split, and the split's own
99th percentile is its threshold. The real statistics are milestone 4g's, imported unchanged.
Scores H60-H62 (LOG.md, 2026-11-14, milestone 4i planned) and writes summary.json and reference.png.
H59 (the linearisation) is scored by check.py.
"""
import importlib.util, json, os, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
import twin  # noqa: E402


def _module(name, rel):
    spec = importlib.util.spec_from_file_location(name, os.path.join(ROOT, "experiments", rel))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


m4g = _module("m4g", "m4g_allsplits/analyse.py")
CAMS, SCEN, CHI2 = m4g.CAMS, m4g.SCEN, m4g.CHI2_1_99
DESIGNS = [(7, 4), (7, 5), (7, 6)]
MODELS = ("resid", "iid")          # resid is the scored one (pre-registered); iid reported
N_DRAWS = 10_000
CHUNK = 2_500
SEED = 20261114
BLOCK = 1_000
Q = 0.99


def load_cam(cam):
    """(twin, obs, size, f0) for one camera, from milestone 4f's corners and start."""
    import gzip
    m4b = _module("m4b", "m4b_viewcov/run.py")
    obs, size, _ = m4b.load(cam, "subpix5")
    with gzip.open(os.path.join(ROOT, "experiments", "m4f_setsize", "results.json.gz"), "rt") as fh:
        f0 = json.load(fh)["cams"][cam]["f0"]
    return twin.fit_all(obs, size, f0), obs, size, f0


def twin_sets(G, index, E):
    """Per draw: f of every set (sizes 3..7) and J, R of every set of sizes 4..7. float32, (sets, M)."""
    F = (G @ E).astype(np.float32)
    n_sets = len(index)
    Jm = np.full((n_sets, E.shape[1]), np.nan, np.float32)
    Rm = np.full_like(Jm, np.nan)
    for m, i in index.items():
        views = [v for v in range(13) if m >> v & 1]
        n = len(views)
        if n < 4:
            continue
        loo = F[[index[m & ~(1 << v)] for v in views]].astype(np.float64)     # (n, M)
        Jm[i] = (n - 1) / n * ((loo - loo.mean(0)) ** 2).sum(0)
        med = np.median(loo, 0)
        Rm[i] = (n - 1) ** 2 / n * (m4g.MAD * np.median(np.abs(loo - med), 0)) ** 2
    return F, Jm, Rm


def references(TW_old, TW_new, idx_old, idx_new, om, nm):
    """Per split: the twin's 99th percentile of z_R^2 and z_J^2, and the pooled z^2 of the design
    (a sample of 200 draws per split) for the design-level twin reference."""
    F_o, J_o, R_o = TW_old
    F_n, J_n, R_n = TW_new
    io = np.array([idx_old[int(m)] for m in om]); inn = np.array([idx_new[int(m)] for m in nm])
    qR, qJ, poolR, poolJ = [], [], [], []
    for a in range(0, len(om), BLOCK):
        o, n = io[a:a + BLOCK], inn[a:a + BLOCK]
        d2 = (F_n[n].astype(np.float64) - F_o[o]) ** 2
        zR = d2 / (R_o[o] + R_n[n]); zJ = d2 / (J_o[o] + J_n[n])
        qR.append(np.quantile(zR, Q, axis=1)); qJ.append(np.quantile(zJ, Q, axis=1))
        poolR.append(zR[:, :200].ravel()); poolJ.append(zJ[:, :200].ravel())
    return (np.concatenate(qR), np.concatenate(qJ),
            float(np.quantile(np.concatenate(poolR), Q)), float(np.quantile(np.concatenate(poolJ), Q)))


def main():
    sols = m4g.load()
    T = {cam: m4g.per_set(sols[cam]) for cam in CAMS}
    _, _, D = m4g.run(T)
    tw = {}
    for cam in CAMS:
        tw[cam], _, _, _ = load_cam(cam)
        assert abs(tw[cam]["intr"][0] / T[cam]["f13"] - 1) < 1e-8, cam
    G, IDX = {}, {}
    for cam in CAMS:
        G[cam], IDX[cam] = twin.gain_matrix(tw[cam])
    out = dict(twin={cam: dict(f=float(tw[cam]["intr"][0]), rms=tw[cam]["rms"]) for cam in CAMS},
               n_draws=N_DRAWS, seed=SEED, models={})
    REF = {}
    for model in MODELS:
        TWS = {}
        for cam in CAMS:
            rng = np.random.default_rng([SEED, MODELS.index(model), CAMS.index(cam)])
            parts = [twin_sets(G[cam], IDX[cam], twin.noise(rng, model, CHUNK, tw[cam]))
                     for _ in range(N_DRAWS // CHUNK)]
            TWS[cam] = tuple(np.concatenate([p[j] for p in parts], axis=1) for j in range(3))
        for des in DESIGNS:
            for cam in CAMS:
                for old_cam, tag in ((cam, "own"), (m4g.OTHER[cam], "swap")):
                    row = D[des][(cam, "S0", 1.0)] if tag == "own" else D[des][(cam, "S3", 1.0)]
                    qR, qJ, pR, pJ = references(TWS[old_cam], TWS[cam], IDX[old_cam], IDX[cam], row["old"], row["new"])
                    REF[(model, des, cam, tag)] = dict(qR=qR, qJ=qJ, poolR=pR, poolJ=pJ)
                    print(model, des, cam, tag, "qR median", float(np.median(qR)), "pooled", pR, flush=True)
        del TWS
    # score the real statistics against each reference
    table = []
    res = {}
    for model in MODELS:
        for des in DESIGNS:
            for cam in CAMS:
                for name, s in SCEN:
                    tag = "swap" if name == "S3" else "own"
                    ref = REF[(model, des, cam, tag)]
                    row = D[des][(cam, name, s)]
                    # S0 and S1 share the same splits (and order) as the reference rows; S3 has its own
                    base = D[des][(cam, "S3" if tag == "swap" else "S0", 1.0)]
                    assert np.array_equal(base["old"], row["old"]) and np.array_equal(base["new"], row["new"])
                    for test, z, q in (("R_geom", row["z2_R"], ref["qR"]), ("J_geom", row["z2_J"], ref["qJ"]),
                                       ("R_pool", row["z2_R"], ref["poolR"]), ("J_pool", row["z2_J"], ref["poolJ"])):
                        f = z > q
                        res[(model, des, cam, name, s, test)] = dict(n=int(len(f)), det=int(f.sum()),
                                                                     harm=int(m4g.harmful(row, f).sum()))
    def rate(model, test, designs=DESIGNS, cams=CAMS, scen="S0", s_set=(1.0,)):
        n = det = 0
        for des in designs:
            for cam in cams:
                for s in s_set:
                    r = res[(model, des, cam, scen, s, test)]
                    n, det = n + r["n"], det + r["det"]
        return det / n
    pm2 = (0.98, 1.02)
    H = {}
    h = {cam: rate("resid", "R_geom", cams=(cam,)) for cam in CAMS}
    h["holds"] = bool(all(0.005 <= h[c] <= 0.025 for c in CAMS))
    H["H60"] = h
    h = dict(R_geom_pm2_k6=rate("resid", "R_geom", designs=[(7, 6)], scen="S1", s_set=pm2))
    h["holds"] = bool(h["R_geom_pm2_k6"] >= 0.25)
    H["H61"] = h
    h = {}
    for cam in CAMS:
        q = REF[("resid", (7, 6), cam, "own")]["qR"]
        h[cam] = float(np.quantile(q, 0.9) / np.quantile(q, 0.1))
    h["holds"] = bool(all(h[c] >= 1.5 for c in CAMS))
    H["H62"] = h
    for model in MODELS:
        for des in DESIGNS:
            for name, s in SCEN:
                for test in ("R_geom", "J_geom", "R_pool", "J_pool"):
                    r = dict(model=model, design=f"{des[0]}+{des[1]}", scen=name, s=s, test=test)
                    for cam in CAMS:
                        x = res[(model, des, cam, name, s, test)]
                        r[cam] = x["det"] / x["n"]; r[f"harm_{cam}"] = x["harm"] / x["n"]
                    r["pooled"] = rate(model, test, designs=[des], scen=name, s_set=(s,))
                    table.append(r)
    refs = {}
    for (model, des, cam, tag), ref in REF.items():
        q = ref["qR"]
        refs[f"{model}/{des[0]}+{des[1]}/{cam}/{tag}"] = dict(
            qR_quantiles=[float(np.quantile(q, p)) for p in (0.0, 0.1, 0.5, 0.9, 1.0)],
            qJ_median=float(np.median(ref["qJ"])), poolR=ref["poolR"], poolJ=ref["poolJ"],
            p_chi2_R=None)
    # does the split's threshold track its own real z^2? (Spearman of qR and real z_R^2 under S0, k = 6)
    from scipy.stats import spearmanr
    track = {}
    for cam in CAMS:
        row = D[(7, 6)][(cam, "S0", 1.0)]
        rho = spearmanr(REF[("resid", (7, 6), cam, "own")]["qR"], row["z2_R"])
        track[cam] = float(rho.statistic)
    harm = {f"{model}/{test}": sum(res[(model, des, c, n, s, test)]["harm"] for des in DESIGNS for c in CAMS for n, s in SCEN)
            / sum(res[(model, des, c, n, s, test)]["n"] for des in DESIGNS for c in CAMS for n, s in SCEN)
            for model in MODELS for test in ("R_geom", "R_pool")}
    out.update(hypotheses=H, references=refs, table=table, spearman_q_vs_real_z2_k6=track, harmful=harm)
    with open(os.path.join(HERE, "summary.json"), "w") as fh:
        json.dump(out, fh, indent=1)
    for k, v in H.items():
        print(k, "holds" if v["holds"] else "REFUTED", json.dumps({a: b for a, b in v.items() if a != "holds"}))
    print("spearman", track, "harmful", harm)
    for r in table:
        if r["scen"] in ("S0", "S3") or r["s"] in (0.98, 1.02, 0.99, 1.01, 0.96, 1.04):
            print(f"{r['model']:5s} {r['design']} {r['scen']} {r['s']:.3f} {r['test']:6s} left {r['left']:.3f} "
                  f"right {r['right']:.3f} pooled {r['pooled']:.3f}")
    figure(REF, res, os.path.join(HERE, "reference.png"))


def figure(REF, res, path):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    fig, axes = plt.subplots(1, 2, figsize=(10, 4.2))
    for cam, c in zip(CAMS, ("#1b2f6b", "#c0392b")):
        q = np.sort(REF[("resid", (7, 6), cam, "own")]["qR"])
        axes[0].plot(q, np.linspace(0, 1, len(q)), color=c, label=f"{cam} camera")
    axes[0].axvline(CHI2, color="grey", ls=":", lw=1); axes[0].text(CHI2, 0.02, " χ²₁", fontsize=8, color="grey")
    axes[0].axvline(18.45, color="#c08a3e", ls="--", lw=1); axes[0].text(18.45, 0.02, " 4h model", fontsize=8, color="#c08a3e")
    axes[0].set_xscale("log"); axes[0].set_xlabel("twin's 99th percentile of z_R² for the split (log)")
    axes[0].set_ylabel("share of the 1,716 splits (old 7, new 6)"); axes[0].legend(fontsize=8, frameon=False)
    axes[0].set_title("each split's own threshold, from the unit's twin", fontsize=9)
    xs = sorted(set(m4g.S_LIST) | {1.0})
    for cam, c in zip(CAMS, ("#1b2f6b", "#c0392b")):
        for test, ls in (("R_geom", "-"), ("R_pool", ":")):
            ys = [res[("resid", (7, 6), cam, "S0" if s == 1.0 else "S1", s, test)] for s in xs]
            axes[1].plot([100 * (s - 1) for s in xs], [y["det"] / y["n"] for y in ys], "o" + ls, color=c, ms=3,
                         label=f"{cam}, {'per-split' if test == 'R_geom' else 'per-design'} twin reference")
    axes[1].axhline(0.01, color="grey", lw=0.8, ls=":")
    axes[1].set_xlabel("focal change applied to the new views (%)"); axes[1].set_ylabel("share of splits where the test fires")
    axes[1].legend(fontsize=7, frameon=False); axes[1].set_ylim(-0.02, 1.02)
    axes[1].set_title("robust jackknife test, old 7 + new 6 views", fontsize=9)
    fig.suptitle("Milestone 4i: a reference from the unit's own linearised bundle adjustment", fontsize=10)
    fig.tight_layout()
    fig.savefig(path, dpi=130)


if __name__ == "__main__":
    main()
