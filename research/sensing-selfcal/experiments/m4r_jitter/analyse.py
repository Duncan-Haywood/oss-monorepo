"""Milestone 4r: a per-view focal jitter in the twin, fitted per pool from its own 6-view solves.

    OMP_NUM_THREADS=1 python3 experiments/m4r_jitter/analyse.py            # ~2 min on 4 cores, no new solve
    python3 experiments/m4r_jitter/analyse.py --figure                     # redraw jitter.png from summary.json

Pools A (milestone 4j's views, milestone 4n's k1 + k2 solves) and B (milestone 4p's fresh views and
solves) of each TUM unit. The twin of each pool is milestone 4p's (its twin_pool's fit, gains, seeds and
resid streams, reproduced here draw for draw). Added: each view v sees its own effective focal length
f + df_v, df_v ~ N(0, tau^2) independent over views, entered as the corner shift (du/df)_v * df_v at the
twin (the f column of the 13-view Jacobian). tau is fitted per pool so that the twin's robust spread of
6-view f across the 1,716 sets (1.4826 MAD, median over the first FIT_DRAWS draws) equals the real one
(milestone 4n's spread, n = 6); tau = 0 if the twin already reaches it. The jitter draws are their own
stream (seed 20261114, tag 7). Then milestone 4i's per-split threshold, milestone 4p's decide and
milestone 4q's gate are applied unchanged. Arms: "resid" (tau = 0; must reproduce milestone 4q's ungated
figures), "jit" (scored), "jit_pp" (also df on cx and cy at the same tau; unscored). Scores H100-H103
(LOG.md, 2026-11-16, milestone 4r planned) and writes summary.json and jitter.png.
"""
import importlib.util, json, os, sys
from multiprocessing import Pool
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
_spec = importlib.util.spec_from_file_location("m4q_for_m4r", os.path.join(ROOT, "experiments", "m4q_gate", "analyse.py"))
m4q = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(m4q)
m4p, m4n, tu = m4q.m4p, m4q.m4n, m4q.tu

UNITS = m4p.UNITS
PAIRS = m4q.PAIRS
S_LIST = m4p.S_LIST
PM2 = m4p.PM2
CUT = m4q.CUT
JIT_TAG = 7
FIT_DRAWS = 2_000
ARMS = ("resid", "jit", "jit_pp")
COLS = {"resid": (), "jit": (0,), "jit_pp": (0, 1, 2)}      # f, cx, cy columns of the twin's Jacobian
M4Q_CHECK = dict(BB_fr3_S0=0.0444, all_pm2=0.0910)          # milestone 4q (LOG.md), ungated


def intr_columns(m4j, tw, cols):
    """(len(cols), nv, npt * 2): the corner shift per unit change of each intrinsic, view by view."""
    twin, sc = m4j.twin, m4j.twin.sc
    nv = tw["poses"].shape[0]
    p, fixed = twin.subset_params(tw, list(range(nv)))
    J = sc._fun_jac_fixed(p, np.zeros((nv, twin.NPT, 2)), twin.NK, fixed, 0, True).toarray()
    return np.stack([J[:, c].reshape(nv, twin.NPT * 2) for c in cols]) if cols else np.zeros((0, nv, twin.NPT * 2))


def jitter_noise(rng, C, m):
    """(nv * npt * 2, m): each view's intrinsics moved by independent N(0, 1) (one draw per column of C)."""
    k, nv, w = C.shape
    out = np.zeros((nv, w, m))
    for c in range(k):
        out += C[c][:, :, None] * rng.standard_normal((nv, 1, m))
    return out.reshape(nv * w, m)


def robust_spread(F6):
    """Per draw (column): 1.4826 MAD of the sets' f; F6 (n_sets, m)."""
    med = np.median(F6, 0)
    return 1.4826 * np.median(np.abs(F6 - med), 0)


def fit_tau(F_r, F_j, target):
    """tau (in units of the fit rms) with median_draws(robust_spread(F_r + tau F_j)) = target (same units)."""
    def s(t):
        return float(np.median(robust_spread(F_r + t * F_j)))
    if s(0.0) >= target:
        return 0.0
    lo, hi = 0.0, 1.0
    while s(hi) < target:
        hi *= 2
    for _ in range(40):
        mid = 0.5 * (lo + hi)
        lo, hi = (mid, hi) if s(mid) < target else (lo, mid)
    return 0.5 * (lo + hi)


def pool_twin(m4j, cam, sols, T, stream, arm):
    """milestone 4p's twin_pool with the jitter added; returns TW (in units of rms), idx, info."""
    m4g, m4i, twin = m4j.m4g, m4j.m4i, m4j.twin
    obs, size, _ = m4p.fresh.load(cam)
    tw = twin.fit_all(obs, size, sols["_f0"][cam])
    f13 = float(T["f13"])
    assert abs(tw["intr"][0] / f13 - 1) < 1e-8
    G, idx = twin.gain_matrix(tw, sizes=range(5, 8))
    rng = np.random.default_rng([m4i.SEED, m4i.MODELS.index("resid"), stream])
    jrng = np.random.default_rng([m4i.SEED, JIT_TAG, stream])
    C = intr_columns(m4j, tw, COLS[arm])
    six = np.array([i for m, i in idx.items() if bin(m).count("1") == 6])
    real = m4n.spread(sols[cam], m4g.ok, 6)["rel_mad"]
    g13 = twin.gain(tw, list(range(13)))
    tau, parts, f13_draws = 0.0, [], []
    for k in range(m4i.N_DRAWS // m4i.CHUNK):
        Er = twin.noise(rng, "resid", m4i.CHUNK, tw)
        Ej = jitter_noise(jrng, C, m4i.CHUNK) if C.shape[0] else None
        if k == 0 and Ej is not None:   # fit tau on the first FIT_DRAWS draws of the first chunk
            Fr6, Fj6 = G[six] @ Er[:, :FIT_DRAWS], G[six] @ Ej[:, :FIT_DRAWS]
            tau = fit_tau(Fr6, Fj6, real * f13 / tw["rms"])
        E = Er if Ej is None or tau == 0 else Er + tau * Ej
        parts.append(m4n.twin_sets(m4g, G, idx, E))
        f13_draws.append(g13 @ E)
    TW = tuple(np.concatenate([p[j] for p in parts], axis=1) for j in range(3))
    F6 = TW[0][six].astype(np.float64)
    info = dict(cam=cam, f13=f13, rms=tw["rms"], tau_px=tau * tw["rms"], tau_rel=tau * tw["rms"] / f13,
                real_spread6=real, twin_spread6=float(np.median(robust_spread(F6))) * tw["rms"] / f13,
                twin_sd_f13=float(np.std(np.concatenate(f13_draws))) * tw["rms"],
                twin_sd_f13_iid=float(np.linalg.norm(g13)) * tw["rms"])
    return TW, idx, tw["rms"], info


def unit_arm(job):
    unit, arm = job
    m4j = m4n.m4j_module(2)
    m4g, m4i = m4j.m4g, m4j.m4i
    sols = m4p.load_sols(m4g)
    om, nm = m4g.splits(*m4p.DES)
    T, TW, IDX, SD, info = {}, {}, {}, {}, {}
    for p in ("A", "B"):
        cam = m4p.POOL[(p, unit)]
        T[p] = m4g.per_set(sols[cam])
        stream = UNITS.index(unit) + (0 if p == "A" else 2)      # milestone 4p's streams
        TW[p], IDX[p], rms, info[p] = pool_twin(m4j, cam, sols, T[p], stream, arm)
        SD[p], _, _ = m4q.set_stats(sols[cam], TW[p], IDX[p], rms, m4q.tilts(cam), m4g)
    out = {}
    for pair in PAIRS:
        po, pn = pair
        row0 = m4p.decide(m4g, T[po], T[pn], om, nm, 1.0)
        o, n = row0["old"], row0["new"]
        qR, _, _, _ = m4i.references(TW[po], TW[pn], IDX[po], IDX[pn], o, n)
        rel = np.hypot(SD[po][o], SD[pn][n]) / info[po]["f13"]
        fired = {s: m4p.decide(m4g, T[po], T[pn], om, nm, s)["z2_R"] > qR for s in S_LIST}
        out[pair] = dict(rel=rel, fired=fired, qR_median=float(np.median(qR)))
    a, b = info["A"], info["B"]
    gap = dict(rel=b["f13"] / a["f13"] - 1, in_sd=(b["f13"] - a["f13"]) / float(np.hypot(a["twin_sd_f13"], b["twin_sd_f13"])),
               in_sd_iid=(b["f13"] - a["f13"]) / float(np.hypot(a["twin_sd_f13_iid"], b["twin_sd_f13_iid"])))
    return (unit, arm), dict(cells=out, pools=info, gap=gap)


def rate(R, arm, cells, s_set=(1.0,), cut=None):
    n = det = 0
    for u, pr in cells:
        a = R[(u, arm)]["cells"][pr]
        keep = np.ones(len(a["rel"]), bool) if cut is None else a["rel"] <= cut
        for s in s_set:
            n += int(keep.sum()); det += int(a["fired"][s][keep].sum())
    return (det / n if n else float("nan")), n


def main():
    jobs = [(u, a) for a in ARMS for u in UNITS]
    with Pool(min(4, len(jobs))) as pool:
        R = dict(pool.map(unit_arm, jobs))
    ALL = [(u, p) for u in UNITS for p in PAIRS]
    check = dict(BB_fr3_S0=rate(R, "resid", [("fr3", "BB")])[0], all_pm2=rate(R, "resid", ALL, PM2)[0])
    assert abs(check["BB_fr3_S0"] - M4Q_CHECK["BB_fr3_S0"]) < 5e-5, check
    assert abs(check["all_pm2"] - M4Q_CHECK["all_pm2"]) < 5e-4, check
    H = {}
    r = rate(R, "jit", [("fr3", "BB")])[0]
    H["H100"] = dict(S0=r, resid=check["BB_fr3_S0"], holds=bool(r <= 0.025))
    cells = {f"{u}/{p}": rate(R, "jit", [(u, p)])[0] for u, p in ALL}
    H["H101"] = dict(cells=cells, holds=bool(all(v <= 0.025 for v in cells.values())))
    g = rate(R, "jit", ALL, PM2)[0]
    H["H102"] = dict(jit=g, resid=check["all_pm2"], ratio=g / check["all_pm2"], holds=bool(g / check["all_pm2"] >= 0.8))
    gaps = {u: R[(u, "jit")]["gap"]["in_sd"] for u in UNITS}
    H["H103"] = dict(gap_in_sd=gaps, resid={u: R[(u, "resid")]["gap"]["in_sd"] for u in UNITS},
                     holds=bool(all(abs(v) <= 2 for v in gaps.values())))
    table = []
    for arm in ARMS:
        for u, p in ALL:
            for cut in (None, CUT):
                row = dict(arm=arm, unit=u, pair=p, cut=cut, n=len(R[(u, arm)]["cells"][p]["rel"]),
                           scored=rate(R, arm, [(u, p)], cut=cut)[1], qR_median=R[(u, arm)]["cells"][p]["qR_median"])
                for s in S_LIST:
                    row[f"s{s}"] = rate(R, arm, [(u, p)], (s,), cut)[0]
                row["pm2"] = rate(R, arm, [(u, p)], PM2, cut)[0]
                table.append(row)
    pooled = {}
    for arm in ARMS:
        for cut in (None, CUT):
            k = f"{arm}/{'gated' if cut else 'ungated'}"
            pooled[k] = dict(S0=rate(R, arm, ALL, cut=cut)[0], pm1=rate(R, arm, ALL, (0.99, 1.01), cut)[0],
                             pm2=rate(R, arm, ALL, PM2, cut)[0], pm4=rate(R, arm, ALL, (0.96, 1.04), cut)[0],
                             share=rate(R, arm, ALL, cut=cut)[1] / sum(len(R[(u, arm)]["cells"][p]["rel"]) for u, p in ALL),
                             max_cell_S0=max(rate(R, arm, [c], cut=cut)[0] for c in ALL if rate(R, arm, [c], cut=cut)[1]))
    out = dict(check=check, hypotheses=H, pooled=pooled,
               pools={f"{u}/{arm}": R[(u, arm)]["pools"] for u in UNITS for arm in ARMS},
               gap={f"{u}/{arm}": R[(u, arm)]["gap"] for u in UNITS for arm in ARMS}, table=table)
    with open(os.path.join(HERE, "summary.json"), "w") as fh:
        json.dump(out, fh, indent=1)
    print(json.dumps({k: v for k, v in out.items() if k != "table"}, indent=1))
    for k, v in H.items():
        print(k, "holds" if v["holds"] else "REFUTED")
    figure(out, os.path.join(HERE, "jitter.png"))


def figure(summary, path):
    """Left: ungated S0 false alarms per cell, resid-only twin against the jittered one.
    Right: firing rate against the focal change, pooled over the eight cells, for each arm."""
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(9.0, 3.8))
    rows = [r for r in summary["table"] if r["cut"] is None]
    cells = [(u, p) for u in UNITS for p in PAIRS]
    x = np.arange(len(cells))
    for off, arm, c, name in ((-0.2, "resid", "#7f8c8d", "twin: residual patterns (4p/4q)"),
                              (0.2, "jit", "#1b2f6b", "twin + per-view focal jitter (fitted)")):
        ys = [next(r["s1.0"] for r in rows if (r["unit"], r["pair"]) == cl and r["arm"] == arm) for cl in cells]
        a1.bar(x + off, [100 * y for y in ys], 0.4, color=c, label=name)
    a1.axhline(2.5, color="#c0392b", lw=0.8, ls="--")
    a1.set_xticks(x, [f"{u}\n{p}" for u, p in cells], fontsize=7.5)
    a1.set_ylabel("S0 false alarms (% of splits)"); a1.legend(fontsize=7.5, frameon=False)
    for arm, ls, mk, c, name in (("resid", "--", "o", "#7f8c8d", "residual patterns"),
                                 ("jit", "-", "s", "#1b2f6b", "+ focal jitter"),
                                 ("jit_pp", ":", "^", "#c0392b", "+ focal and principal-point jitter")):
        rr = [r for r in rows if r["arm"] == arm]
        ys = [sum(r[f"s{s}"] * r["n"] for r in rr) / sum(r["n"] for r in rr) for s in S_LIST]
        a2.plot([100 * (s - 1) for s in S_LIST], [100 * y for y in ys], ls, marker=mk, ms=3.5, color=c, label=name)
    a2.axhline(1, color="grey", lw=0.6, ls=":")
    a2.set_xlabel("focal change applied to the new views (%)"); a2.set_ylabel("splits where the test fires (%)")
    a2.legend(fontsize=7.5, frameon=False, loc="upper center")
    fig.suptitle("Milestone 4r: a per-view focal jitter in the twin, fitted from each pool's own solves (TUM RGB-D, 7 + 6)", fontsize=9)
    fig.tight_layout(); fig.savefig(path, dpi=130)


if __name__ == "__main__":
    if sys.argv[1:] == ["--figure"]:
        with open(os.path.join(HERE, "summary.json")) as fh:
            figure(json.load(fh), os.path.join(HERE, "jitter.png"))
    else:
        main()
