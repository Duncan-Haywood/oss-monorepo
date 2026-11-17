"""Milestone 4n, step 2: milestone 4j's 7 + 6 update test with a k1 + k2 lens model, side by side with k1.

    python3 experiments/m4n_k2/analyse.py      # ~10 min, after run.py

For each lens model (nk = 1: milestone 4j's stored solves; nk = 2: run.py's) this builds the unit's
twin with that model (milestone 4i's twin.py, a private copy with NK set), draws 10,000 resid-model
noise patterns per unit (seed 20261114, the same draws for both models, so the k1 arm reproduces
milestone 4j's 7 + 6 figures), and scores every 7 + 6 split exactly as milestone 4j did (4g's splits,
scenarios, J and R; 4i's per-split references; all imported unchanged). Scores H82-H85 (LOG.md,
2026-11-15, milestone 4n planned) and writes summary.json and k2.png.
"""
import gzip, importlib.util, json, os, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
M4J = os.path.join(ROOT, "experiments", "m4j_tum")
sys.path.insert(0, M4J)
import tumunit as tu  # noqa: E402

RESULTS = {1: os.path.join(M4J, "results.json.gz"), 2: os.path.join(HERE, "results.json.gz")}
CAMS = tu.UNITS
DES = (7, 6)
FAR = 0.05
PM2 = (0.98, 1.02)
TESTS = ("R_geom", "J_geom", "R_chi2")


def m4j_module(nk):
    """A fresh private copy of milestone 4j's analysis (and through it 4g, 4i and the twin), with
    the twin's lens model set to nk radial terms."""
    spec = importlib.util.spec_from_file_location(f"m4j_for_m4n_{nk}", os.path.join(M4J, "analyse.py"))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    m.twin.NK, m.twin.NI = nk, 3 + nk
    return m


def twin_sets(m4g, G, index, E):
    """milestone 4i's twin_sets, but a set whose delete-one sets are not in the index (sizes below 5
    are not built here) gets no J or R. f of every set; J, R of every set of 6 and 7 views."""
    F = (G @ E).astype(np.float32)
    Jm = np.full((len(index), E.shape[1]), np.nan, np.float32)
    Rm = np.full_like(Jm, np.nan)
    for msk, i in index.items():
        views = [v for v in range(13) if msk >> v & 1]
        n = len(views)
        sub = [msk & ~(1 << v) for v in views]
        if n < 4 or any(s not in index for s in sub):
            continue
        loo = F[[index[s] for s in sub]].astype(np.float64)
        Jm[i] = (n - 1) / n * ((loo - loo.mean(0)) ** 2).sum(0)
        med = np.median(loo, 0)
        Rm[i] = (n - 1) ** 2 / n * (m4g.MAD * np.median(np.abs(loo - med), 0)) ** 2
    return F, Jm, Rm


def spread(sols, ok, n):
    """Robust spread (1.4826 MAD over the median), far-solve count, converged and total, for size n."""
    f = np.array([s["f"] for v, s in sols.items() if len(v) == n and ok(s)])
    med = np.median(f)
    dev = np.abs(f / med - 1)
    return dict(rel_mad=float(1.4826 * np.median(np.abs(f - med)) / med), far=int((dev > FAR).sum()),
                converged=int(len(f)), total=int(sum(1 for v in sols if len(v) == n)), median=float(med),
                max_dev=float(dev.max()))


def arm(nk):
    m4j = m4j_module(nk)
    m4g, m4i, twin = m4j.m4g, m4j.m4i, m4j.twin
    sols = m4g.load(RESULTS[nk])
    T = {cam: m4g.per_set(sols[cam]) for cam in CAMS}
    D = m4g.decisions(T, *DES)
    with gzip.open(RESULTS[nk], "rt") as fh:
        f0 = json.load(fh)["cams"]
    tw, G, IDX, TWS = {}, {}, {}, {}
    for cam in CAMS:
        obs, size, _ = tu.load(cam)
        tw[cam] = twin.fit_all(obs, size, f0[cam]["f0"])
        assert abs(tw[cam]["intr"][0] / T[cam]["f13"] - 1) < 1e-8, (nk, cam, tw[cam]["intr"][0], T[cam]["f13"])
        G[cam], IDX[cam] = twin.gain_matrix(tw[cam], sizes=range(5, 8))
        rng = np.random.default_rng([m4i.SEED, m4i.MODELS.index("resid"), CAMS.index(cam)])
        parts = [twin_sets(m4g, G[cam], IDX[cam], twin.noise(rng, "resid", m4i.CHUNK, tw[cam]))
                 for _ in range(m4i.N_DRAWS // m4i.CHUNK)]
        TWS[cam] = tuple(np.concatenate([p[j] for p in parts], axis=1) for j in range(3))
    REF = {}
    for cam in CAMS:
        for old_cam, tag in ((cam, "own"), (tu.OTHER[cam], "swap")):
            row = D[(cam, "S0" if tag == "own" else "S3", 1.0)]
            qR, qJ, pR, pJ = m4i.references(TWS[old_cam], TWS[cam], IDX[old_cam], IDX[cam], row["old"], row["new"])
            REF[(cam, tag)] = dict(qR=qR, qJ=qJ)
    del TWS
    fired = {}
    for cam in CAMS:
        for name, s in m4g.SCEN:
            tag = "swap" if name == "S3" else "own"
            row, ref = D[(cam, name, s)], REF[(cam, tag)]
            for test, z, q in (("R_geom", row["z2_R"], ref["qR"]), ("J_geom", row["z2_J"], ref["qJ"]),
                               ("R_chi2", row["z2_R"], m4g.CHI2_1_99)):
                fired[(cam, name, s, test)] = dict(f=z > q, old=row["old"], new=row["new"])
    anchors = {}
    for cam in CAMS:
        c = tu.TUM_CALIB[cam]
        anchors[cam] = dict(f13=float(T[cam]["f13"]), rel_tum=float(T[cam]["f13"] / ((c[0] + c[1]) / 2) - 1),
                            rms13=tw[cam]["rms"], intr=[float(x) for x in tw[cam]["intr"]],
                            qR_median=float(np.median(REF[(cam, "own")]["qR"])))
    sizes = {cam: {n: spread(sols[cam], m4g.ok, n) for n in (5, 6, 7)} for cam in CAMS}
    return dict(fired=fired, anchors=anchors, sizes=sizes, SCEN=m4g.SCEN)


def rate(A, test, cams=CAMS, scen="S0", s_set=(1.0,)):
    n = det = 0
    for cam in cams:
        for s in s_set:
            f = A["fired"][(cam, scen, s, test)]["f"]
            n, det = n + len(f), det + int(f.sum())
    return det / n if n else float("nan")


def paired(A1, A2, cam, scen, s, test="R_geom"):
    """On splits usable under both models: agreement and the two models' rates."""
    a, b = A1["fired"][(cam, scen, s, test)], A2["fired"][(cam, scen, s, test)]
    ka = {(int(o), int(n)): bool(x) for o, n, x in zip(a["old"], a["new"], a["f"])}
    kb = {(int(o), int(n)): bool(x) for o, n, x in zip(b["old"], b["new"], b["f"])}
    both = sorted(set(ka) & set(kb))
    x = np.array([ka[k] for k in both]); y = np.array([kb[k] for k in both])
    return dict(n=len(both), agree=float(np.mean(x == y)), k1=float(x.mean()), k2=float(y.mean()),
                only_k1=int((x & ~y).sum()), only_k2=int((~x & y).sum()))


def zhang_k3(cam):
    """Flat-board Zhang on the 13 views with k1, k2 and k3 (TUM's own model order, no tangential)."""
    import cv2
    obs, size, _ = tu.load(cam)
    obj = [tu.sc.board_points().astype(np.float32)] * len(obs)
    img = [c.astype(np.float32).reshape(-1, 1, 2) for c in obs]
    K0 = np.array([[size[0], 0, size[0] / 2], [0, size[0], size[1] / 2], [0, 0, 1.0]])
    out = {}
    for name, extra in (("k1", cv2.CALIB_FIX_K2 | cv2.CALIB_FIX_K3), ("k1k2", cv2.CALIB_FIX_K3), ("k1k2k3", 0)):
        rms, K, d, *_ = cv2.calibrateCamera(obj, img, size, K0.copy(), np.zeros(5),
                                            flags=cv2.CALIB_USE_INTRINSIC_GUESS | cv2.CALIB_FIX_ASPECT_RATIO
                                            | cv2.CALIB_ZERO_TANGENT_DIST | extra)
        out[name] = dict(f=float(K[0, 0]), d=[float(x) for x in d.ravel()[[0, 1, 4]]], rms=float(rms))
    return out


def main():
    A = {nk: arm(nk) for nk in (1, 2)}
    H = {}
    h = {cam: A[2]["sizes"][cam][6]["rel_mad"] / A[1]["sizes"][cam][6]["rel_mad"] for cam in CAMS}
    h["holds"] = bool(all(h[c] >= 1.2 for c in CAMS))
    H["H82"] = h
    h = dict(fr1_k2=A[2]["sizes"]["fr1"][6]["far"], fr1_k1=A[1]["sizes"]["fr1"][6]["far"])
    h["holds"] = bool(h["fr1_k2"] > 8)
    H["H83"] = h
    h = {cam: rate(A[2], "R_geom", cams=(cam,)) for cam in CAMS}
    h["holds"] = bool(all(h[c] <= 0.025 for c in CAMS))
    H["H84"] = h
    h = dict(k2=rate(A[2], "R_geom", scen="S1", s_set=PM2), k1=rate(A[1], "R_geom", scen="S1", s_set=PM2))
    h["holds"] = bool(h["k2"] < 0.100)
    H["H85"] = h
    table = []
    for name, s in A[1]["SCEN"]:
        for test in TESTS:
            r = dict(scen=name, s=s, test=test)
            for nk in (1, 2):
                for cam in CAMS:
                    r[f"k{nk}_{cam}"] = rate(A[nk], test, cams=(cam,), scen=name, s_set=(s,))
            table.append(r)
    pair = {f"{cam}/{name}/{s}": paired(A[1], A[2], cam, name, s)
            for cam in CAMS for name, s in (("S0", 1.0), ("S1", 0.98), ("S1", 1.02), ("S3", 1.0))}
    out = dict(hypotheses=H, anchors={f"k{nk}": A[nk]["anchors"] for nk in (1, 2)},
               sizes={f"k{nk}": A[nk]["sizes"] for nk in (1, 2)}, zhang={cam: zhang_k3(cam) for cam in CAMS},
               paired=pair, table=table,
               pm4={f"k{nk}": rate(A[nk], "R_geom", scen="S1", s_set=(0.96, 1.04)) for nk in (1, 2)},
               pm1={f"k{nk}": rate(A[nk], "R_geom", scen="S1", s_set=(0.99, 1.01)) for nk in (1, 2)},
               swap={f"k{nk}": {cam: rate(A[nk], "R_geom", cams=(cam,), scen="S3") for cam in CAMS} for nk in (1, 2)})
    with open(os.path.join(HERE, "summary.json"), "w") as fh:
        json.dump(out, fh, indent=1)
    print(json.dumps({k: v for k, v in out.items() if k not in ("table",)}, indent=1))
    for k, v in H.items():
        print(k, "holds" if v["holds"] else "REFUTED", json.dumps({a: b for a, b in v.items() if a != "holds"}))
    figure(A, os.path.join(HERE, "k2.png"))


def figure(A, path):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    col = {"fr1": "#1b2f6b", "fr3": "#c0392b"}
    lab = {"fr1": "fr1 (Kinect)", "fr3": "fr3 (Xtion)"}
    fig, ax = plt.subplots(figsize=(6.4, 4.2))
    xs = sorted({s for _, s in A[1]["SCEN"]})
    for cam in CAMS:
        for nk, ls in ((1, "--"), (2, "-")):
            ys = [rate(A[nk], "R_geom", cams=(cam,), scen="S0" if s == 1.0 else "S1", s_set=(s,)) for s in xs]
            ax.plot([100 * (s - 1) for s in xs], ys, ls, marker="o", ms=3, color=col[cam],
                    label=f"{lab[cam]}, {'k1' if nk == 1 else 'k1 + k2'}")
    ax.axhline(0.01, color="grey", lw=0.8, ls=":")
    ax.set_xlabel("focal change applied to the new views (%)"); ax.set_ylabel("share of 7 + 6 splits where the test fires")
    ax.set_ylim(-0.02, 1.02); ax.legend(fontsize=8, frameon=False)
    ax.set_title("Milestone 4n: the update test with k1 and with k1 + k2 (TUM RGB-D)", fontsize=9)
    fig.tight_layout()
    fig.savefig(path, dpi=130)


if __name__ == "__main__":
    main()
