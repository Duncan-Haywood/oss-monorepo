"""Milestone 4t: withhold the update decision when either small-set solve is far from the fleet prior.

    OMP_NUM_THREADS=1 python3 experiments/m4t_withhold/analyse.py       # ~5 min on 4 cores, no new solve
    python3 experiments/m4t_withhold/analyse.py --figure                # redraw withhold.png from summary.json

Pools A, B and C of each TUM unit (milestones 4j, 4p, 4s), their solves, twins and thresholds exactly as
milestone 4s builds them (its unit_arm's code, run here over all nine pairings rather than the five
holding C). Rule W (LOG.md, 2026-11-16, milestone 4t planned): at focal scale s the decision is withheld
when |f_old / F_P - 1| > WIN or |s f_new / F_P - 1| > WIN, with F_P = 527.1 px, milestone 4k's fleet
prior, and WIN = 0.05 (milestone 4q's FAR). R, the twin and the per-split threshold are untouched.
False alarms (S0) are over decided splits; detections count a withheld split as not detected.
Arms: "jit" (scored, each pool's own fitted tau) and "resid" (tau = 0, unscored). Scores H113-H117 and
writes summary.json and withhold.png.
"""
import importlib.util, json, os, sys
from multiprocessing import Pool
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
_spec = importlib.util.spec_from_file_location("m4s_for_m4t", os.path.join(ROOT, "experiments", "m4s_third", "analyse.py"))
m4s = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(m4s)
m4r, m4p, m4q, m4n = m4s.m4r, m4s.m4p, m4s.m4q, m4s.m4n
sys.path.insert(0, os.path.join(ROOT, "experiments", "m4j_tum"))
import tumunit as tu  # noqa: E402

UNITS, POOLS, STREAM = m4s.UNITS, m4s.POOLS, m4s.STREAM
PAIRS = ("AA", "BB", "CC", "AB", "BA", "AC", "CA", "BC", "CB")
CPAIRS = m4s.CPAIRS
S_LIST, PM2 = m4p.S_LIST, m4p.PM2
ARMS = ("resid", "jit")
WIN = 0.05
F_P = sum((tu.TUM_CALIB[u][0] + tu.TUM_CALIB[u][1]) / 2 for u in tu.UNITS) / len(tu.UNITS)
M4S_CHECK = dict(jit_CC_fr1_S0=0.0747, jit_C_pooled_S0=0.0260)    # milestone 4s (LOG.md)


def withheld(fo, fn, s, win=WIN, fp=F_P):
    """Rule W: either solve the robot sees (old f, scaled new f) more than win from the fleet prior."""
    return (np.abs(fo / fp - 1) > win) | (np.abs(s * fn / fp - 1) > win)


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
        fo, fn = T[po]["f"][o], T[pn]["f"][n]
        fired = {s: m4p.decide(m4g, T[po], T[pn], om, nm, s)["z2_R"] > qR for s in S_LIST}
        held = {s: withheld(fo, fn, s) for s in S_LIST}
        cells[pair] = dict(fired=fired, held=held, far=FAR[po][o] | FAR[pn][n])
    return (unit, arm), dict(cells=cells, tau={p: info[p]["tau_rel"] for p in POOLS},
                             f13={p: info[p]["f13"] for p in POOLS})


def false_alarm(R, arm, cl, mask="held"):
    """S0 over decided splits: fired at s = 1 and not withheld, over not withheld."""
    n = det = 0
    for u, p in cl:
        a = R[(u, arm)]["cells"][p]
        keep = ~a[mask][1.0] if mask == "held" else (~a["far"] if mask == "far" else np.ones_like(a["far"]))
        n += int(keep.sum()); det += int(a["fired"][1.0][keep].sum())
    return det / n if n else float("nan")


def detect(R, arm, cl, s_set, use_w=True):
    """Detections over every usable split; a withheld split is not detected."""
    n = det = 0
    for u, p in cl:
        a = R[(u, arm)]["cells"][p]
        for s in s_set:
            f = a["fired"][s] & ~a["held"][s] if use_w else a["fired"][s]
            n += len(f); det += int(f.sum())
    return det / n


def held_share(R, arm, cl, s=1.0):
    n = h = 0
    for u, p in cl:
        a = R[(u, arm)]["cells"][p]
        n += len(a["held"][s]); h += int(a["held"][s].sum())
    return h / n


def main():
    jobs = [(u, a) for a in ARMS for u in UNITS]
    with Pool(4) as pool:
        R = dict(pool.map(unit_arm, jobs, chunksize=1))
    C = [(u, p) for u in UNITS for p in CPAIRS]
    ALL = [(u, p) for u in UNITS for p in PAIRS]
    check = dict(jit_CC_fr1_S0=false_alarm(R, "jit", [("fr1", "CC")], "none"),
                 jit_C_pooled_S0=false_alarm(R, "jit", C, "none"))
    for k, v in M4S_CHECK.items():
        assert abs(check[k] - v) < 5e-5, check
    H = {}
    cells = {f"{u}/{p}": false_alarm(R, "jit", [(u, p)]) for u, p in ALL}
    H["H113"] = dict(cells=cells, holds=bool(all(v <= 0.025 for v in cells.values())))
    r = false_alarm(R, "jit", ALL); H["H114"] = dict(pooled=r, holds=bool(r <= 0.01))
    c = {f"fr1/{p}": cells[f"fr1/{p}"] for p in CPAIRS}
    H["H115"] = dict(cells=c, holds=bool(all(v <= 0.01 for v in c.values())))
    h = held_share(R, "jit", ALL); H["H116"] = dict(withheld=h, holds=bool(h <= 0.10))
    w, u0 = detect(R, "jit", ALL, PM2), detect(R, "jit", ALL, PM2, False)
    H["H117"] = dict(W=w, ungated=u0, ratio=w / u0, holds=bool(w / u0 >= 0.8))
    table = []
    for arm in ARMS:
        for u, p in ALL:
            a = R[(u, arm)]["cells"][p]
            row = dict(arm=arm, unit=u, pair=p, n=len(a["far"]),
                       S0_W=false_alarm(R, arm, [(u, p)]), S0_oracle=false_alarm(R, arm, [(u, p)], "far"),
                       S0_ungated=false_alarm(R, arm, [(u, p)], "none"),
                       n_far=int(a["far"].sum()), n_held=int(a["held"][1.0].sum()),
                       agree=float(np.mean(a["far"] == a["held"][1.0])),
                       held={str(s): float(a["held"][s].mean()) for s in S_LIST},
                       detect_W={str(s): float((a["fired"][s] & ~a["held"][s]).mean()) for s in S_LIST},
                       detect_ungated={str(s): float(a["fired"][s].mean()) for s in S_LIST})
            table.append(row)
    pooled = {}
    for arm in ARMS:
        for name, cl in (("all", ALL), ("C", C), ("AB", [(u, p) for u in UNITS for p in ("AA", "BB", "AB", "BA")])):
            pooled[f"{arm}/{name}"] = dict(
                S0_W=false_alarm(R, arm, cl), S0_oracle=false_alarm(R, arm, cl, "far"),
                S0_ungated=false_alarm(R, arm, cl, "none"), held_s1=held_share(R, arm, cl),
                **{f"{k}_{m}": detect(R, arm, cl, ss, m == "W") for k, ss in
                   (("pm1", (0.99, 1.01)), ("pm2", PM2), ("pm4", (0.96, 1.04))) for m in ("W", "ungated")},
                max_cell_S0_W=max(false_alarm(R, arm, [x]) for x in cl))
    out = dict(F_P=F_P, win=WIN, check=check, hypotheses=H, pooled=pooled,
               tau={f"{u}": R[(u, "jit")]["tau"] for u in UNITS}, f13={u: R[(u, "jit")]["f13"] for u in UNITS},
               table=table)
    with open(os.path.join(HERE, "summary.json"), "w") as fh:
        json.dump(out, fh, indent=1, default=float)
    print(json.dumps({k: v for k, v in out.items() if k != "table"}, indent=1, default=float))
    for k, v in H.items():
        print(k, "holds" if v["holds"] else "REFUTED")
    figure(out, os.path.join(HERE, "withhold.png"))


def figure(summary, path):
    """Left: S0 per cell, ungated against rule W (jit twin). Right: detection against the focal change,
    pooled over the 18 cells, ungated and under W."""
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(10.4, 3.9), gridspec_kw=dict(width_ratios=(1.7, 1)))
    rows = [r for r in summary["table"] if r["arm"] == "jit"]
    x = np.arange(len(rows))
    a1.bar(x - 0.2, [100 * r["S0_ungated"] for r in rows], 0.4, color="#7f8c8d", label="every split decided")
    a1.bar(x + 0.2, [100 * r["S0_W"] for r in rows], 0.4, color="#1b2f6b", label="rule W: withhold far solves")
    a1.axhline(2.5, color="#c0392b", lw=0.8, ls="--")
    a1.set_xticks(x, [f"{r['unit']}\n{r['pair']}" for r in rows], fontsize=6.5)
    a1.set_ylabel("S0 false alarms (% of decided splits)"); a1.legend(fontsize=7, frameon=False)
    for key, c, ls, name in (("detect_ungated", "#7f8c8d", "--", "every split decided"),
                             ("detect_W", "#1b2f6b", "-", "rule W (withheld = not detected)")):
        ys = [sum(r[key][str(s)] * r["n"] for r in rows) / sum(r["n"] for r in rows) for s in S_LIST]
        a2.plot([100 * (s - 1) for s in S_LIST], [100 * y for y in ys], ls, marker="o", ms=3.5, color=c, label=name)
    a2.axhline(1, color="grey", lw=0.6, ls=":")
    a2.set_xlabel("focal change applied to the new views (%)"); a2.set_ylabel("splits where the test fires (%)")
    a2.legend(fontsize=7, frameon=False, loc="upper center")
    fig.suptitle("Milestone 4t: withholding the update decision when a small-set solve is >5% from the fleet prior (TUM RGB-D, 7 + 6)", fontsize=9)
    fig.tight_layout(); fig.savefig(path, dpi=130)


if __name__ == "__main__":
    if sys.argv[1:] == ["--figure"]:
        with open(os.path.join(HERE, "summary.json")) as fh:
            figure(json.load(fh), os.path.join(HERE, "withhold.png"))
    else:
        main()
