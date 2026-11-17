"""Milestone 4u: centre the withhold window on the unit's own current calibration, not the fleet prior.

    OMP_NUM_THREADS=1 python3 experiments/m4u_owncal/analyse.py       # ~6 min on 4 cores, no new solve
    python3 experiments/m4u_owncal/analyse.py --figure                # redraw owncal.png from summary.json

Pools A, B and C of each TUM unit, their solves, twins and per-split thresholds exactly as milestone 4t
builds them (its code imported unchanged). Rule U (LOG.md, 2026-11-16, milestone 4u planned): at focal
scale s the decision is withheld when |f_old / f_U - 1| > 0.05 or |s f_new / f_U - 1| > 0.05, with f_U
the 13-view f of the old pool. Rule W (milestone 4t, anchor F_P = 527.1 px) and every split decided
("ungated") are computed alongside. Unscored variants: an out-of-sample anchor (the 13-view f of the pool
in neither role; the mean of the other two for same-pool cells) and windows of 3, 4, 6 and 8%.
Arms: "jit" (scored) and "resid" (unscored). Scores H118-H123 and writes summary.json and owncal.png.
"""
import importlib.util, json, os, sys
from multiprocessing import Pool
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
_spec = importlib.util.spec_from_file_location("m4t_for_m4u", os.path.join(ROOT, "experiments", "m4t_withhold", "analyse.py"))
m4t = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(m4t)
m4s, m4r, m4p, m4q, m4n = m4t.m4s, m4t.m4r, m4t.m4p, m4t.m4q, m4t.m4n

UNITS, POOLS, STREAM, PAIRS = m4t.UNITS, m4t.POOLS, m4t.STREAM, m4t.PAIRS
S_LIST, PM2, ARMS, F_P = m4t.S_LIST, m4t.PM2, m4t.ARMS, m4t.F_P
PM1, PM4 = (0.99, 1.01), (0.96, 1.04)
WIN = 0.05
WINS = (0.03, 0.04, 0.05, 0.06, 0.08)
M4T_CHECK = dict(W_S0=0.0030, ungated_S0=0.0161, W_pm2=0.0389)    # milestone 4t (LOG.md), rounded


def withheld(fo, fn, s, anchor, win=WIN):
    """Withhold when the old f or the scaled new f lies more than win from the anchor."""
    return (np.abs(fo / anchor - 1) > win) | (np.abs(s * fn / anchor - 1) > win)


def own_anchor(f13, po):
    """Rule U's anchor: the 13-view f of the old pool, the unit's current calibration."""
    return f13[po]


def oos_anchor(f13, po, pn):
    """Out-of-sample anchor: the 13-view f of the pool in neither role (mean of the other two if po == pn)."""
    rest = [p for p in POOLS if p not in (po, pn)]
    return float(np.mean([f13[p] for p in rest]))


def unit_arm(job):
    unit, arm = job
    m4j = m4n.m4j_module(2)
    m4g, m4i = m4j.m4g, m4j.m4i
    sols = m4p.load_sols(m4g)
    om, nm = m4g.splits(*m4p.DES)
    T, TW, IDX, FAR, info = {}, {}, {}, {}, {}
    for p in POOLS:
        cam = m4p.POOL[(p, unit)]
        T[p] = m4g.per_set(sols[cam])
        TW[p], IDX[p], rms, info[p] = m4r.pool_twin(m4j, cam, sols, T[p], STREAM[p] + UNITS.index(unit), arm)
        _, _, FAR[p] = m4q.set_stats(sols[cam], TW[p], IDX[p], rms, m4q.tilts(cam), m4g)
    cells = {}
    for pair in PAIRS:
        po, pn = pair
        row0 = m4p.decide(m4g, T[po], T[pn], om, nm, 1.0)
        o, n = row0["old"], row0["new"]
        qR, _, _, _ = m4i.references(TW[po], TW[pn], IDX[po], IDX[pn], o, n)
        fired = {s: m4p.decide(m4g, T[po], T[pn], om, nm, s)["z2_R"] > qR for s in S_LIST}
        cells[pair] = dict(fired=fired, fo=T[po]["f"][o], fn=T[pn]["f"][n], far=FAR[po][o] | FAR[pn][n])
    return (unit, arm), dict(cells=cells, tau={p: info[p]["tau_rel"] for p in POOLS},
                             f13={p: float(info[p]["f13"]) for p in POOLS})


def held_masks(R, rule, win=WIN):
    """{(unit, arm, pair): {s: withheld mask}} for rule 'U', 'oos', 'W' or 'none'."""
    out = {}
    for (u, arm), r in R.items():
        for pair, a in r["cells"].items():
            po, pn = pair
            if rule == "none":
                out[(u, arm, pair)] = {s: np.zeros(len(a["fo"]), bool) for s in S_LIST}
                continue
            anc = {"U": own_anchor(r["f13"], po), "oos": oos_anchor(r["f13"], po, pn), "W": F_P}[rule]
            out[(u, arm, pair)] = {s: withheld(a["fo"], a["fn"], s, anc, win) for s in S_LIST}
    return out


def false_alarm(R, H, arm, cl):
    n = det = 0
    for u, p in cl:
        keep = ~H[(u, arm, p)][1.0]
        n += int(keep.sum()); det += int(R[(u, arm)]["cells"][p]["fired"][1.0][keep].sum())
    return det / n if n else float("nan")


def detect(R, H, arm, cl, s_set):
    n = det = 0
    for u, p in cl:
        for s in s_set:
            f = R[(u, arm)]["cells"][p]["fired"][s] & ~H[(u, arm, p)][s]
            n += len(f); det += int(f.sum())
    return det / n


def held_share(H, arm, cl, s=1.0):
    n = h = 0
    for u, p in cl:
        m = H[(u, arm, p)][s]; n += len(m); h += int(m.sum())
    return h / n


def summarise(R, H, arm, cl):
    return dict(S0=false_alarm(R, H, arm, cl), held_s1=held_share(H, arm, cl),
                held={str(s): held_share(H, arm, cl, s) for s in S_LIST},
                pm1=detect(R, H, arm, cl, PM1), pm2=detect(R, H, arm, cl, PM2), pm4=detect(R, H, arm, cl, PM4),
                max_cell_S0=max(false_alarm(R, H, arm, [x]) for x in cl))


def main():
    jobs = [(u, a) for a in ARMS for u in UNITS]
    with Pool(4) as pool:
        R = dict(pool.map(unit_arm, jobs, chunksize=1))
    ALL = [(u, p) for u in UNITS for p in PAIRS]
    HU, HW, H0 = held_masks(R, "U"), held_masks(R, "W"), held_masks(R, "none")
    HO = held_masks(R, "oos")
    # reproduce milestone 4t's rule-W figures first
    check = dict(W_S0=false_alarm(R, HW, "jit", ALL), ungated_S0=false_alarm(R, H0, "jit", ALL),
                 W_pm2=detect(R, HW, "jit", ALL, PM2))
    for k, v in M4T_CHECK.items():
        assert abs(check[k] - v) < 5e-5, check
    Hy = {}
    cells = {f"{u}/{p}": false_alarm(R, HU, "jit", [(u, p)]) for u, p in ALL}
    Hy["H118"] = dict(cells=cells, holds=bool(all(v <= 0.025 for v in cells.values())))
    r = false_alarm(R, HU, "jit", ALL); Hy["H119"] = dict(pooled=r, holds=bool(r <= 0.01))
    h = held_share(HU, "jit", ALL); Hy["H120"] = dict(withheld=h, holds=bool(h <= 0.10))
    sym = {}
    for u in UNITS:
        cl = [(u, p) for p in PAIRS]
        hp, hm = held_share(HU, "jit", cl, 1.04), held_share(HU, "jit", cl, 0.96)
        sym[u] = dict(plus4=hp, minus4=hm, ratio=max(hp, hm) / max(min(hp, hm), 1e-12))
    Hy["H121"] = dict(units=sym, holds=bool(all(v["ratio"] <= 2 for v in sym.values())))
    du, d0 = detect(R, HU, "jit", ALL, PM2), detect(R, H0, "jit", ALL, PM2)
    Hy["H122"] = dict(U=du, ungated=d0, ratio=du / d0, holds=bool(du / d0 >= 0.8))
    u4, w4 = detect(R, HU, "jit", ALL, PM4), detect(R, HW, "jit", ALL, PM4)
    Hy["H123"] = dict(U=u4, W=w4, ratio=u4 / w4, holds=bool(u4 / w4 >= 1.25))
    rules = dict(U=HU, W=HW, oos=HO, none=H0)
    pooled = {f"{arm}/{name}/{unit}": summarise(R, H, arm, [x for x in ALL if unit == "all" or x[0] == unit])
              for arm in ARMS for name, H in rules.items() for unit in ("all",) + UNITS}
    sweep = {}
    for rule in ("U", "oos", "W"):
        for w in WINS:
            sweep[f"{rule}/{w}"] = summarise(R, held_masks(R, rule, w), "jit", ALL)
    table = []
    for arm in ARMS:
        for u, p in ALL:
            a = R[(u, arm)]["cells"][p]
            row = dict(arm=arm, unit=u, pair=p, n=len(a["far"]), n_far=int(a["far"].sum()),
                       anchor_U=own_anchor(R[(u, arm)]["f13"], p[0]),
                       anchor_oos=oos_anchor(R[(u, arm)]["f13"], p[0], p[1]))
            for name, H in rules.items():
                row[name] = dict(S0=false_alarm(R, H, arm, [(u, p)]),
                                 held={str(s): float(H[(u, arm, p)][s].mean()) for s in S_LIST},
                                 detect={str(s): float((a["fired"][s] & ~H[(u, arm, p)][s]).mean()) for s in S_LIST})
            row["agree_U_W"] = float(np.mean(HU[(u, arm, p)][1.0] == HW[(u, arm, p)][1.0]))
            row["agree_U_oracle"] = float(np.mean(HU[(u, arm, p)][1.0] == a["far"]))
            table.append(row)
    out = dict(F_P=F_P, win=WIN, check=check, hypotheses=Hy, pooled=pooled, sweep=sweep,
               f13={u: R[(u, "jit")]["f13"] for u in UNITS}, table=table)
    with open(os.path.join(HERE, "summary.json"), "w") as fh:
        json.dump(out, fh, indent=1, default=float)
    print(json.dumps({k: v for k, v in out.items() if k not in ("table", "pooled")}, indent=1, default=float))
    for k, v in Hy.items():
        print(k, "holds" if v["holds"] else "REFUTED")
    figure(out, os.path.join(HERE, "owncal.png"))


def figure(summary, path):
    """Left: share withheld against the focal change per unit, rule W against rule U. Right: detection
    against the focal change, pooled over the 18 cells, ungated, W and U."""
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(10.4, 3.9))
    xs = [100 * (s - 1) for s in S_LIST]
    P = summary["pooled"]
    for u, mk in zip(UNITS, ("o", "s")):
        for rule, c, ls in (("W", "#7f8c8d", "--"), ("U", "#1b2f6b", "-")):
            a1.plot(xs, [100 * P[f"jit/{rule}/{u}"]["held"][str(s)] for s in S_LIST], ls, marker=mk, ms=3.5,
                    color=c, label=f"{u}, rule {rule} ({'fleet prior' if rule == 'W' else 'own calibration'})")
    a1.set_xlabel("focal change applied to the new views (%)"); a1.set_ylabel("splits withheld (%)")
    a1.legend(fontsize=7, frameon=False, loc="upper center")
    rows = [r for r in summary["table"] if r["arm"] == "jit"]
    N = sum(r["n"] for r in rows)
    for rule, c, ls, name in (("none", "#bdc3c7", ":", "every split decided"),
                              ("W", "#7f8c8d", "--", "rule W: window on fleet prior"),
                              ("U", "#1b2f6b", "-", "rule U: window on own calibration")):
        ys = [sum(r[rule]["detect"][str(s)] * r["n"] for r in rows) / N for s in S_LIST]
        a2.plot(xs, [100 * y for y in ys], ls, marker="o", ms=3.5, color=c, label=name)
    a2.axhline(1, color="grey", lw=0.6, ls=":")
    a2.set_xlabel("focal change applied to the new views (%)"); a2.set_ylabel("splits where the test fires (%)")
    a2.legend(fontsize=7, frameon=False, loc="upper center")
    fig.suptitle("Milestone 4u: centring the 5% withhold window on the unit's own calibration (TUM RGB-D, 7 + 6, 18 pairings)", fontsize=9)
    fig.tight_layout(); fig.savefig(path, dpi=130)


if __name__ == "__main__":
    if sys.argv[1:] == ["--figure"]:
        with open(os.path.join(HERE, "summary.json")) as fh:
            figure(json.load(fh), os.path.join(HERE, "owncal.png"))
    else:
        main()
