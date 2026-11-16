"""Milestone 4q: a gate, from the twin alone, on when to run the 7 + 6 update test.

    OMP_NUM_THREADS=1 python3 experiments/m4q_gate/analyse.py            # ~5 min, no new solve
    python3 experiments/m4q_gate/analyse.py --figure                     # redraw gate.png from summary.json

Pools A (milestone 4j's views, milestone 4n's k1 + k2 solves) and B (milestone 4p's fresh views and
solves) of each TUM unit. Everything up to the per-split threshold is milestone 4p's analysis, imported
unchanged (its twin_pool with the same seeds and streams, decide, and milestone 4i's references). Added:
each view set's first-order sd of f, sd_S = std over the twin's 10,000 resid draws of the set's f, times
the pool's 13-view fit rms; a split is scored only if hypot(sd_old, sd_new) <= CUT * the old pool's
13-view f. CUT = 1% (a 2% change at two twin sd's) is fixed in LOG.md (milestone 4q planned) before
anything here was computed. Scores H96-H99 and writes summary.json and gate.png.
"""
import importlib.util, json, os, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
M4P = os.path.join(ROOT, "experiments", "m4p_fresh")
_spec = importlib.util.spec_from_file_location("m4p_for_m4q", os.path.join(M4P, "analyse.py"))
m4p = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(m4p)
tu, m4n = m4p.tu, m4p.m4n

UNITS = m4p.UNITS
PAIRS = ("AA", "BB", "AB", "BA")
CUT = 0.01                                  # pre-registered
CUTS = (0.005, 0.0075, 0.01, 0.0125, 0.015, 0.02)   # reported, unscored
S_LIST = m4p.S_LIST
PM2 = m4p.PM2
FAR = 0.05
M4P_CHECK = dict(BB_fr3_S0=0.0444, X_pm2=0.0796)    # milestone 4p (LOG.md)


def tilts(cam):
    path = (os.path.join(ROOT, "experiments", "m4j_tum", f"corners_{cam}.json") if cam in UNITS
            else os.path.join(M4P, f"corners_{cam}.json"))
    with open(path) as fh:
        return np.array([v["tilt"] for v in json.load(fh)["views"]], float)


def set_stats(sols, TW, idx, rms, tilt, m4g):
    """Per view mask (sizes 5-7): twin sd of f in px, median view tilt, far-solve flag."""
    size = 1 << 13
    sd = np.full(size, np.nan); med_tilt = np.full(size, np.nan); far = np.zeros(size, bool)
    F = TW[0]
    for msk, i in idx.items():
        sd[msk] = float(np.std(F[i].astype(np.float64))) * rms
        med_tilt[msk] = float(np.median(tilt[[v for v in range(13) if msk >> v & 1]]))
    for n in (5, 6, 7):
        f = {m4g.mask(v): s["f"] for v, s in sols.items() if len(v) == n and m4g.ok(s)}
        med = np.median(list(f.values()))
        for m, x in f.items():
            far[m] = abs(x / med - 1) > FAR
    return sd, med_tilt, far


def unit_arm(m4j, sols, unit):
    m4g, m4i = m4j.m4g, m4j.m4i
    om, nm = m4g.splits(*m4p.DES)
    T, TW, IDX, SD, TILT, FARS, f13 = {}, {}, {}, {}, {}, {}, {}
    for p in ("A", "B"):
        cam = m4p.POOL[(p, unit)]
        T[p] = m4g.per_set(sols[cam])
        obs, size, _ = m4p.fresh.load(cam)
        stream = UNITS.index(unit) + (0 if p == "A" else 2)      # milestone 4p's streams
        tw, TW[p], IDX[p], _ = m4p.twin_pool(m4j, obs, size, sols["_f0"][cam], T[p]["f13"], stream)
        SD[p], TILT[p], FARS[p] = set_stats(sols[cam], TW[p], IDX[p], tw["rms"], tilts(cam), m4g)
        f13[p] = float(T[p]["f13"])
    out, info = {}, {}
    for pair in PAIRS:
        po, pn = pair
        row0 = m4p.decide(m4g, T[po], T[pn], om, nm, 1.0)
        o, n = row0["old"], row0["new"]
        qR, _, _, _ = m4i.references(TW[po], TW[pn], IDX[po], IDX[pn], o, n)
        rel = np.hypot(SD[po][o], SD[pn][n]) / f13[po]
        held = FARS[po][o] | FARS[pn][n]
        tilt_ok = TILT[pn][n] >= TILT[po][o]
        fired = {s: m4p.decide(m4g, T[po], T[pn], om, nm, s)["z2_R"] > qR for s in S_LIST}
        out[pair] = dict(rel=rel, far=held, tilt_ok=tilt_ok, fired=fired)
    for p in ("A", "B"):
        six = [m for m in IDX[p] if bin(m).count("1") == 6]
        info[p] = dict(median_sd6_rel=float(np.median(SD[p][six]) / f13[p]),
                       median_sd7_rel=float(np.median(SD[p][[m for m in IDX[p] if bin(m).count("1") == 7]]) / f13[p]))
    del TW
    return out, info


def rate(arms, cells, s_set=(1.0,), cut=None, gate="sd"):
    """Firing rate over scored splits, and the number scored; cells: (unit, pair) tuples."""
    n = det = 0
    for u, pr in cells:
        a = arms[u][pr]
        keep = (np.ones(len(a["rel"]), bool) if cut is None and gate == "sd"
                else a["tilt_ok"] if gate == "tilt" else a["rel"] <= cut)
        for s in s_set:
            n += int(keep.sum()); det += int(a["fired"][s][keep].sum())
    return (det / n if n else float("nan")), n


def main():
    m4j = m4n.m4j_module(2)
    sols = m4p.load_sols(m4j.m4g)
    arms, info = {}, {}
    for u in UNITS:
        arms[u], info[u] = unit_arm(m4j, sols, u)
    ALL = [(u, p) for u in UNITS for p in PAIRS]
    X = [(u, p) for u in UNITS for p in ("AB", "BA")]
    check = dict(BB_fr3_S0=rate(arms, [("fr3", "BB")])[0], X_pm2=rate(arms, X, PM2)[0])
    assert abs(check["BB_fr3_S0"] - M4P_CHECK["BB_fr3_S0"]) < 5e-5, check
    assert abs(check["X_pm2"] - M4P_CHECK["X_pm2"]) < 5e-5, check
    H = {}
    r, k = rate(arms, [("fr3", "BB")], cut=CUT)
    H["H96"] = dict(gated=r, scored=k, holds=bool(r <= 0.025))
    cells = {f"{u}/{p}": rate(arms, [(u, p)], cut=CUT)[0] for u, p in ALL}
    H["H97"] = dict(cells=cells, holds=bool(all(v <= 0.025 for v in cells.values())))
    g, _ = rate(arms, ALL, PM2, cut=CUT); ug, _ = rate(arms, ALL, PM2)
    H["H98"] = dict(gated=g, ungated=ug, ratio=g / ug, holds=bool(g / ug >= 1.2))
    share = {f"{u}/{p}": rate(arms, [(u, p)], cut=CUT)[1] / len(arms[u][p]["rel"]) for u, p in ALL}
    H["H99"] = dict(share=share, holds=bool(all(v >= 0.2 for v in share.values())))
    table = []
    for u, p in ALL:
        a = arms[u][p]
        for cut, gate in [(None, "sd")] + [(c, "sd") for c in CUTS] + [(None, "tilt")]:
            row = dict(unit=u, pair=p, gate=gate, cut=cut, n=len(a["rel"]))
            row["scored"] = rate(arms, [(u, p)], cut=cut, gate=gate)[1]
            for s in S_LIST:
                row[f"s{s}"] = rate(arms, [(u, p)], (s,), cut=cut, gate=gate)[0]
            row["pm2"] = rate(arms, [(u, p)], PM2, cut=cut, gate=gate)[0]
            keep = (a["rel"] <= cut) if cut is not None else (a["tilt_ok"] if gate == "tilt" else np.ones(len(a["rel"]), bool))
            row["far_splits"] = int(a["far"].sum()); row["far_scored"] = int((a["far"] & keep).sum())
            table.append(row)
    sweep = {}
    for c in (None,) + CUTS:
        key = "none" if c is None else str(c)
        sweep[key] = dict(S0=rate(arms, ALL, cut=c)[0], pm2=rate(arms, ALL, PM2, cut=c)[0],
                          pm1=rate(arms, ALL, (0.99, 1.01), cut=c)[0], pm4=rate(arms, ALL, (0.96, 1.04), cut=c)[0],
                          share=rate(arms, ALL, cut=c)[1] / sum(len(arms[u][p]["rel"]) for u, p in ALL),
                          max_cell_S0=max(rate(arms, [cl], cut=c)[0] for cl in ALL))
    sweep["tilt"] = dict(S0=rate(arms, ALL, gate="tilt")[0], pm2=rate(arms, ALL, PM2, gate="tilt")[0],
                         share=rate(arms, ALL, gate="tilt")[1] / sum(len(arms[u][p]["rel"]) for u, p in ALL),
                         max_cell_S0=max(rate(arms, [cl], gate="tilt")[0] for cl in ALL))
    out = dict(check=check, cut=CUT, hypotheses=H, sd_by_pool=info, sweep=sweep, table=table)
    with open(os.path.join(HERE, "summary.json"), "w") as fh:
        json.dump(out, fh, indent=1)
    print(json.dumps({k: v for k, v in out.items() if k != "table"}, indent=1))
    for k, v in H.items():
        print(k, "holds" if v["holds"] else "REFUTED")
    figure(out, os.path.join(HERE, "gate.png"))


def figure(summary, path):
    """Left: S0 false alarms per cell, ungated and gated. Right: the cut-off sweep (pooled)."""
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(9.0, 3.8))
    rows = [r for r in summary["table"] if r["gate"] == "sd" and r["cut"] in (None, summary["cut"])]
    cells = sorted({(r["unit"], r["pair"]) for r in rows}, key=lambda c: (c[0], PAIRS.index(c[1])))
    x = np.arange(len(cells))
    for off, cut, c, name in ((-0.2, None, "#7f8c8d", "every split"), (0.2, summary["cut"], "#1b2f6b", "gated (twin sd ≤ 1% of f)")):
        ys = [next(r["s1.0"] for r in rows if (r["unit"], r["pair"]) == cl and r["cut"] == cut) for cl in cells]
        a1.bar(x + off, [100 * y for y in ys], 0.4, color=c, label=name)
    a1.axhline(2.5, color="#c0392b", lw=0.8, ls="--")
    a1.set_xticks(x, [f"{u}\n{p}" for u, p in cells], fontsize=7.5)
    a1.set_ylabel("S0 false alarms (% of scored splits)"); a1.legend(fontsize=7.5, frameon=False)
    sw = summary["sweep"]
    cuts = [k for k in sw if k not in ("none", "tilt")]
    xs = [100 * float(k) for k in cuts]
    a2.plot(xs, [100 * sw[k]["pm2"] for k in cuts], "-o", ms=3.5, color="#1b2f6b", label="±2% detected")
    a2.plot(xs, [100 * sw[k]["share"] for k in cuts], "--s", ms=3.5, color="#7f8c8d", label="splits scored")
    a2.plot(xs, [100 * sw[k]["max_cell_S0"] for k in cuts], ":^", ms=3.5, color="#c0392b", label="worst cell's S0 false alarms")
    a2.axhline(100 * sw["none"]["pm2"], color="#1b2f6b", lw=0.6, ls=":")
    a2.set_xlabel("gate: twin sd of the difference ≤ this % of f"); a2.set_ylabel("%")
    a2.set_yscale("log"); a2.legend(fontsize=7.5, frameon=False)
    fig.suptitle("Milestone 4q: abstaining when the twin says the views cannot resolve 2% (TUM RGB-D, k1 + k2, 7 + 6)", fontsize=9)
    fig.tight_layout(); fig.savefig(path, dpi=130)


if __name__ == "__main__":
    if sys.argv[1:] == ["--figure"]:
        with open(os.path.join(HERE, "summary.json")) as fh:
            figure(json.load(fh), os.path.join(HERE, "gate.png"))
    else:
        main()
