"""Milestone 4s: milestone 4r's per-view focal jitter, tested on a third disjoint pool of views (C).

    OMP_NUM_THREADS=1 python3 experiments/m4s_third/analyse.py            # ~5 min on 3 cores, after run.py
    python3 experiments/m4s_third/analyse.py --figure                     # redraw third.png from summary.json

Pools A (milestone 4j's views), B (milestone 4p's) and C (this milestone's, prepare.py and run.py) of
each TUM unit. Every pool's twin is milestone 4r's pool_twin, imported unchanged (A's and B's resid
streams are 4p's, C's is unit index + 4; the jitter stream is 4r's tag 7). Arms: "resid" (tau = 0),
"jit" (each pool's own fitted tau, 4r's rule), "jit_pp" (4r's f + principal-point variant, unscored)
and "borrow" (A and B as in "jit"; C jittered with the mean of A's and B's fitted tau as a share of f,
never C's own scatter). Milestone 4r's per-split threshold, milestone 4p's decide and milestone 4q's
gate are applied unchanged to the 7 + 6 design in every pairing of the three pools. The A/B cells must
reproduce milestone 4r first. Scores H108-H112 (LOG.md, 2026-11-16, milestone 4s planned) and writes
summary.json and third.png.
"""
import importlib.util, json, os, sys
from multiprocessing import Pool
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
_spec = importlib.util.spec_from_file_location("m4r_for_m4s", os.path.join(ROOT, "experiments", "m4r_jitter", "analyse.py"))
m4r = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(m4r)
import third  # noqa: E402

third.patch(m4r)
m4p, m4q, m4n = m4r.m4p, m4r.m4q, m4r.m4n

UNITS = m4p.UNITS
POOLS = ("A", "B", "C")
STREAM = {"A": 0, "B": 2, "C": 4}                      # + unit index; A and B are milestone 4p's
AB = ("AA", "BB", "AB", "BA")
CPAIRS = ("CC", "AC", "CA", "BC", "CB")                 # the scored cells
PAIRS = AB + CPAIRS
S_LIST, PM2, CUT = m4p.S_LIST, m4p.PM2, m4q.CUT
ARMS = ("resid", "jit", "jit_pp", "borrow")
M4R_CHECK = dict(jit_BB_fr3_S0=0.0058, resid_all_pm2=0.0908)   # milestone 4r (LOG.md)


def fixed_tau(tau_rel, real):
    """A stand-in for milestone 4r's fit_tau that returns tau_rel (share of f) in the rms units pool_twin
    uses: its target is real * f13 / rms, so tau = tau_rel * target / real."""
    return lambda F_r, F_j, target: tau_rel * target / real


def unit_arm(job):
    unit, arm = job
    m4j = m4n.m4j_module(2)
    m4g, m4i = m4j.m4g, m4j.m4i
    sols = m4p.load_sols(m4g)
    om, nm = m4g.splits(*m4p.DES)
    T, TW, IDX, SD, FAR, info = {}, {}, {}, {}, {}, {}
    fit = m4r.fit_tau
    for p in POOLS:
        cam = m4p.POOL[(p, unit)]
        T[p] = m4g.per_set(sols[cam])
        twin_arm = "jit" if arm == "borrow" else arm
        if arm == "borrow" and p == "C":
            tau_rel = 0.5 * (info["A"]["tau_rel"] + info["B"]["tau_rel"])
            m4r.fit_tau = fixed_tau(tau_rel, m4n.spread(sols[cam], m4g.ok, 6)["rel_mad"])
        try:
            TW[p], IDX[p], rms, info[p] = m4r.pool_twin(m4j, cam, sols, T[p], STREAM[p] + UNITS.index(unit), twin_arm)
        finally:
            m4r.fit_tau = fit
        SD[p], _, FAR[p] = m4q.set_stats(sols[cam], TW[p], IDX[p], rms, m4q.tilts(cam), m4g)
    if arm == "borrow":
        assert abs(info["C"]["tau_rel"] - 0.5 * (info["A"]["tau_rel"] + info["B"]["tau_rel"])) < 1e-9
    cells = {}
    for pair in PAIRS:
        po, pn = pair
        row0 = m4p.decide(m4g, T[po], T[pn], om, nm, 1.0)
        o, n = row0["old"], row0["new"]
        qR, _, _, _ = m4i.references(TW[po], TW[pn], IDX[po], IDX[pn], o, n)
        rel = np.hypot(SD[po][o], SD[pn][n]) / info[po]["f13"]
        fired = {s: m4p.decide(m4g, T[po], T[pn], om, nm, s)["z2_R"] > qR for s in S_LIST}
        # unscored diagnostic: does the split hold a far solve (milestone 4q's flag) in the old or new set?
        far = FAR[po][o] | FAR[pn][n]
        cells[pair] = dict(rel=rel, fired=fired, qR_median=float(np.median(qR)), far=far)
    gap = {}
    for a, b in (("A", "C"), ("B", "C"), ("A", "B")):
        x, y = info[a], info[b]
        gap[a + b] = dict(rel=y["f13"] / x["f13"] - 1,
                          in_sd=(y["f13"] - x["f13"]) / float(np.hypot(x["twin_sd_f13"], y["twin_sd_f13"])))
    for p in POOLS:
        c = m4p.tu.TUM_CALIB[unit]
        info[p]["rel_tum"] = info[p]["f13"] / ((c[0] + c[1]) / 2) - 1
        info[p]["median_tilt"] = float(np.median(m4q.tilts(m4p.POOL[(p, unit)])))
        info[p]["spread"] = {n: m4n.spread(sols[m4p.POOL[(p, unit)]], m4g.ok, n) for n in (5, 6, 7)}
    return (unit, arm), dict(cells=cells, pools=info, gap=gap)


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
    with Pool(3) as pool:
        R = dict(pool.map(unit_arm, jobs, chunksize=1))
    ALL_AB = [(u, p) for u in UNITS for p in AB]
    C = [(u, p) for u in UNITS for p in CPAIRS]
    check = dict(jit_BB_fr3_S0=rate(R, "jit", [("fr3", "BB")])[0], resid_all_pm2=rate(R, "resid", ALL_AB, PM2)[0])
    assert abs(check["jit_BB_fr3_S0"] - M4R_CHECK["jit_BB_fr3_S0"]) < 5e-5, check
    assert abs(check["resid_all_pm2"] - M4R_CHECK["resid_all_pm2"]) < 5e-4, check
    for u in UNITS:        # the borrow arm's A and B are the jit arm's, draw for draw
        for p in AB:
            assert all(np.array_equal(R[(u, "borrow")]["cells"][p]["fired"][s], R[(u, "jit")]["cells"][p]["fired"][s]) for s in S_LIST)
    H = {}
    cell = lambda arm: {f"{u}/{p}": rate(R, arm, [(u, p)])[0] for u, p in C}  # noqa: E731
    c = cell("jit"); H["H108"] = dict(cells=c, holds=bool(all(v <= 0.025 for v in c.values())))
    r = rate(R, "jit", C)[0]; H["H109"] = dict(pooled=r, holds=bool(r <= 0.01))
    c = cell("borrow"); H["H110"] = dict(cells=c, holds=bool(all(v <= 0.025 for v in c.values())))
    c = cell("resid"); H["H111"] = dict(cells=c, holds=bool(any(v > 0.025 for v in c.values())))
    g = {f"{u}/{k}": R[(u, "jit")]["gap"][k]["in_sd"] for u in UNITS for k in ("AC", "BC")}
    H["H112"] = dict(gap_in_sd=g, holds=bool(all(abs(v) <= 2 for v in g.values())))
    table = []
    for arm in ARMS:
        for u, p in [(u, p) for u in UNITS for p in PAIRS]:
            for cut in (None, CUT):
                row = dict(arm=arm, unit=u, pair=p, cut=cut, n=len(R[(u, arm)]["cells"][p]["rel"]),
                           scored=rate(R, arm, [(u, p)], cut=cut)[1], qR_median=R[(u, arm)]["cells"][p]["qR_median"])
                for s in S_LIST:
                    row[f"s{s}"] = rate(R, arm, [(u, p)], (s,), cut)[0]
                row["pm2"] = rate(R, arm, [(u, p)], PM2, cut)[0]
                if cut is None:      # unscored: S0 on splits without / with a far solve, and their counts
                    a = R[(u, arm)]["cells"][p]
                    f0 = a["fired"][1.0]
                    row["n_far"] = int(a["far"].sum())
                    row["s1.0_nofar"] = float(f0[~a["far"]].mean()) if (~a["far"]).any() else None
                    row["s1.0_far"] = float(f0[a["far"]].mean()) if a["far"].any() else None
                    row["fired_far_share"] = float(a["far"][f0].mean()) if f0.any() else None
                table.append(row)
    pooled = {}
    for arm in ARMS:
        for name, cl in (("C", C), ("AB", ALL_AB)):
            for cut in (None, CUT):
                k = f"{arm}/{name}/{'gated' if cut else 'ungated'}"
                sc = [x for x in cl if rate(R, arm, [x], cut=cut)[1]]
                pooled[k] = dict(S0=rate(R, arm, cl, cut=cut)[0], pm1=rate(R, arm, cl, (0.99, 1.01), cut)[0],
                                 pm2=rate(R, arm, cl, PM2, cut)[0], pm4=rate(R, arm, cl, (0.96, 1.04), cut)[0],
                                 share=rate(R, arm, cl, cut=cut)[1] / sum(len(R[(u, arm)]["cells"][p]["rel"]) for u, p in cl),
                                 max_cell_S0=max(rate(R, arm, [x], cut=cut)[0] for x in sc) if sc else None)
    nofar = {}
    for arm in ARMS:     # unscored: S0 over splits holding no far solve, per unit, over the C cells
        for u in UNITS:
            n = det = nf = 0
            for p in CPAIRS:
                a = R[(u, arm)]["cells"][p]
                n += int((~a["far"]).sum()); det += int(a["fired"][1.0][~a["far"]].sum()); nf += int(a["far"].sum())
            nofar[f"{arm}/{u}"] = dict(S0=det / n if n else None, n=n, n_far=nf)
    power = {arm:pooled[f"{arm}/C/ungated"]["pm2"] / pooled["resid/C/ungated"]["pm2"] for arm in ARMS}
    out = dict(check=check, hypotheses=H, pooled=pooled, power_ratio_C=power, nofar_C=nofar,
               pools={f"{u}/{arm}": R[(u, arm)]["pools"] for u in UNITS for arm in ARMS},
               gap={f"{u}/{arm}": R[(u, arm)]["gap"] for u in UNITS for arm in ARMS}, table=table)
    with open(os.path.join(HERE, "summary.json"), "w") as fh:
        json.dump(out, fh, indent=1, default=float)
    print(json.dumps({k: v for k, v in out.items() if k not in ("table", "pools")}, indent=1, default=float))
    for k, v in H.items():
        print(k, "holds" if v["holds"] else "REFUTED")
    figure(out, os.path.join(HERE, "third.png"))


def figure(summary, path):
    """Left: ungated S0 false alarms in the ten cells holding C, per arm. Right: firing rate against
    the focal change, pooled over those cells, per arm."""
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(9.6, 3.9), gridspec_kw=dict(width_ratios=(1.5, 1)))
    rows = [r for r in summary["table"] if r["cut"] is None and r["pair"] in CPAIRS]
    cells = [(u, p) for u in UNITS for p in CPAIRS]
    x = np.arange(len(cells))
    arms = (("resid", "#7f8c8d", "twin: residual patterns only"),
            ("jit", "#1b2f6b", "+ jitter, each pool's own tau"),
            ("borrow", "#c0392b", "+ jitter, C's tau borrowed from A and B"))
    for k, (arm, c, name) in enumerate(arms):
        ys = [next(r["s1.0"] for r in rows if (r["unit"], r["pair"]) == cl and r["arm"] == arm) for cl in cells]
        a1.bar(x + (k - 1) * 0.27, [100 * y for y in ys], 0.27, color=c, label=name)
    a1.axhline(2.5, color="#c0392b", lw=0.8, ls="--")
    a1.set_xticks(x, [f"{u}\n{p}" for u, p in cells], fontsize=7.5)
    a1.set_ylabel("S0 false alarms (% of splits)"); a1.legend(fontsize=7, frameon=False)
    for (arm, c, name), ls, mk in zip(arms, ("--", "-", ":"), ("o", "s", "^")):
        rr = [r for r in rows if r["arm"] == arm]
        ys = [sum(r[f"s{s}"] * r["n"] for r in rr) / sum(r["n"] for r in rr) for s in S_LIST]
        a2.plot([100 * (s - 1) for s in S_LIST], [100 * y for y in ys], ls, marker=mk, ms=3.5, color=c, label=name)
    a2.axhline(1, color="grey", lw=0.6, ls=":")
    a2.set_xlabel("focal change applied to the new views (%)"); a2.set_ylabel("splits where the test fires (%)")
    fig.suptitle("Milestone 4s: the update test on a third pool of views (C) the jitter was not fitted to (TUM RGB-D, 7 + 6)", fontsize=9)
    fig.tight_layout(); fig.savefig(path, dpi=130)


if __name__ == "__main__":
    if sys.argv[1:] == ["--figure"]:
        with open(os.path.join(HERE, "summary.json")) as fh:
            figure(json.load(fh), os.path.join(HERE, "third.png"))
    else:
        main()
