"""Milestone 7zzd: grid convergence of the strip model's Journee peaks, Wigley I and III at Fn 0.2 to 0.4.

    PYTHONPATH=src:experiments python3 experiments/run_journee_grid.py > experiments/results_journee_grid.txt

No new physics: `marine_hull.strip.ModifiedWigleyStrip` and `marine_hull.nearfield.NearField` are unchanged, with
`n_panels` (per half section, used by both the motions' section table and the near field's panel-potential table)
and `n_stations` varied together, as 7zv. Plan and expectations G0 to G5 are in LOG.md (committed before this code).

Grids (16, 30), (24, 40), (32, 60); both Journee hulls (7zk's particulars) at Fn 0.2, 0.3, 0.4, 7zg damping
(zeta3 0.0375, zeta5 0). Per hull, speed and grid the peak of GB+F (Gerritsma-Beukelman plus Faltinsen
reflection), NF-P and NF-PG on lambda/L of plus or minus 0.12 by 0.01 around 7zu's peak location. The tables are
built in the parent (they parallelise themselves); the per-wavelength responses are then spread over a forked pool.
"""
import math
import multiprocessing
import sys
import time

from marine_hull import nearfield as nf
from marine_hull import reflection as rf
from marine_hull import strip as st
import run_journee_lb10 as jl
import run_nearfield_pdstrip as npd

G = st.G
Z3, Z5 = 0.0375, 0.0
GRIDS = ((16, 30), (24, 40), (32, 60))
FNS = (0.2, 0.3, 0.4)
HULLS = jl.HULLS  # (("I", 1.0), ("III", 0.0))
ROWS = (("GB+F", "gb"), ("NF-P", "nf_p"), ("NF-PG", "nf_pg"))
# 7zu section B peak locations and values at (16, 30) (results_nearfield_longwave.txt): window centres and G0
CENTRE = {("I", 0.2): 1.01, ("I", 0.3): 1.21, ("I", 0.4): 1.40,
          ("III", 0.2): 0.90, ("III", 0.3): 1.08, ("III", 0.4): 1.25}
REF_7ZU = {("I", 0.2): (22.25, 34.16, 22.72), ("I", 0.3): (27.48, 43.59, 29.05), ("I", 0.4): (27.97, 49.44, 33.25),
           ("III", 0.2): (17.38, 27.19, 18.01), ("III", 0.3): (25.39, 40.88, 27.03),
           ("III", 0.4): (27.80, 48.62, 31.69)}
HALF = 12
CLEAN = [(h, fn) for h, _ in HULLS for fn in FNS if (h, fn) != ("I", 0.4)]

_N = None  # the near field of the hull being evaluated, inherited by the forked workers


def window(centre):
    return [round(centre + 0.01 * i, 2) for i in range(-HALF, HALF + 1)]


def _one(task):
    fn, lam = task
    norm = jl.RHO * G * jl.B * jl.B / jl.L
    integral = rf.waterline_integral(rf.modified_wigley_slope(jl.L, jl.B), jl.L)
    r = npd.curve(_N, jl.L, fn * math.sqrt(G * jl.L), norm, [lam], integral, jl.D, jl.RHO)[0]
    return fn, lam, {k: r[k] for k in ("gb", "falt", "nf_p", "nf_pg")}


def hull_grid(name, alpha, npan, nst, processes=4):
    """{fn: {row: (peak, lam, on_edge)}} for one hull on one grid."""
    global _N
    if (npan, nst) == (16, 30):
        h = st.ModifiedWigleyStrip(jl.L, jl.B, jl.D, kyy=jl.KYY, rho=jl.RHO, alpha=alpha)
        n = nf.NearField(h)
    else:
        h = st.ModifiedWigleyStrip(jl.L, jl.B, jl.D, kyy=jl.KYY, rho=jl.RHO, alpha=alpha,
                                   n_stations=nst, n_panels=npan)
        n = nf.NearField(h, n_panels=npan)
    h.set_viscous(Z3, Z5)
    _N = n
    tasks = [(fn, lam) for fn in FNS for lam in window(CENTRE[(name, fn)])]
    with multiprocessing.get_context("fork").Pool(processes) as pool:
        got = pool.map(_one, tasks)
    out = {}
    for fn in FNS:
        rows = sorted([(lam, r) for f, lam, r in got if f == fn])
        lams = [lam for lam, _ in rows]
        out[fn] = {}
        for cname, key in ROWS:
            vals = [r[key] + (r["falt"] if key == "gb" else 0.0) for _, r in rows]
            i = max(range(len(vals)), key=vals.__getitem__)
            out[fn][cname] = (vals[i], lams[i], i in (0, len(vals) - 1))
    return out


def order(f1, f2, f3, r23=1.5):
    """Indicative observed order from three grids (f3 finest), using the (f2, f3) step of ratio r23 and the
    (f1, f2) step: p solves (f1 - f2) / (f2 - f3) = r23^p (exact only for a constant ratio); None if not monotone."""
    a, b = f1 - f2, f2 - f3
    if a == 0.0 or b == 0.0 or a * b < 0.0:
        return None
    return math.log(a / b) / math.log(r23)


def main(out=sys.stdout):
    pr = lambda s="": print(s, file=out, flush=True)
    t0 = time.time()
    pr("Milestone 7zzd: Journee's Wigley I and III peaks at Fn 0.2 to 0.4 on three grids (panels per half section, "
       "stations)")
    pr("7zg damping (zeta3 0.0375, zeta5 0); sigma = R / (rho g a^2 B^2 / L); peak on lambda/L +-0.12 by 0.01 "
       "around 7zu's; GB+F = GB plus Faltinsen reflection; measured peaks second-hand (7zk)")
    res = {}
    for name, alpha in HULLS:
        for g in GRIDS:
            t1 = time.time()
            r = hull_grid(name, alpha, *g)
            for fn in FNS:
                res[(name, fn, g)] = r[fn]
                meas = jl.MEASURED[(name, fn)]
                pr(f"{name:>3} Fn {fn} P{g[0]:>2} S{g[1]:>2}: measured {meas:.1f}; " + "; ".join(
                    f"{c} {v:.3f}@{lam:.2f}{' EDGE' if edge else ''} ({v / meas:.3f})"
                    for c, (v, lam, edge) in r[fn].items()))
            pr(f"  ({name} P{g[0]} S{g[1]}: {time.time() - t1:.0f} s)")

    pr("## G0. (16, 30) against 7zu's section B peaks (results_nearfield_longwave.txt)")
    worst = 0.0
    for (name, fn), ref in REF_7ZU.items():
        for (c, _), v_ref in zip(ROWS, ref):
            worst = max(worst, abs(res[(name, fn, GRIDS[0])][c][0] - v_ref))
    edges = [(k, c) for k, v in res.items() for c, x in v.items() if x[2]]
    pr(f"G0 worst |peak - 7zu| {worst:.4f} sigma (<= 0.01, 7zu printed 2 decimals) -> "
       f"{'held' if worst <= 0.01 + 1e-9 else 'refuted'}; peaks on a window edge: {edges if edges else 'none'}")

    pr("## per-peak change from (16, 30), and indicative observed order")
    lo, mid, hi = GRIDS
    ch = {}
    for name, _ in HULLS:
        for fn in FNS:
            parts = []
            for c, _ in ROWS:
                f1, f2, f3 = (res[(name, fn, g)][c][0] for g in GRIDS)
                ch[(name, fn, c)] = f3 / f1 - 1.0
                p = order(f1, f2, f3)
                parts.append(f"{c} {100 * (f2 / f1 - 1):+.2f}% / {100 * (f3 / f1 - 1):+.2f}% "
                             f"(order {'n/a' if p is None else '%.2f' % p})")
            pr(f"{name:>3} Fn {fn}: (24, 40) / (32, 60) over (16, 30): " + "; ".join(parts))

    big = [(k, v) for k, v in ch.items() if k[2] in ("GB+F", "NF-PG")]
    worst1 = max(abs(v) for _, v in big)
    pr(f"G1 largest |change| of a GB+F or NF-PG peak, (16, 30) to (32, 60): {100 * worst1:.2f}% (< 3%) -> "
       f"{'held' if worst1 < 0.03 else 'refuted'}")
    rising = sum(1 for _, v in big if v > 0.0)
    pr(f"G2 GB+F and NF-PG peaks that rise from (16, 30) to (32, 60): {rising} of {len(big)} (all) -> "
       f"{'held' if rising == len(big) else 'refuted'}")
    rat = {}
    for name, _ in HULLS:
        for fn in FNS:
            q = [res[(name, fn, g)]["NF-PG"][0] / res[(name, fn, g)]["GB+F"][0] for g in GRIDS]
            rat[(name, fn)] = (q, q[2] / q[0] - 1.0)
    pr("NF-PG / GB+F at the peak on the three grids: " + "; ".join(
        f"{k[0]} Fn {k[1]} " + "/".join(f"{x:.4f}" for x in v[0]) + f" ({100 * v[1]:+.2f}%)" for k, v in rat.items()))
    worst3 = max(abs(v[1]) for v in rat.values())
    pr(f"G3 largest |change| of NF-PG / GB+F, (16, 30) to (32, 60): {100 * worst3:.2f}% (< 1%) -> "
       f"{'held' if worst3 < 0.01 else 'refuted'}")

    pr("rms and mean of ln(peak / measured) over Journee's five clean peaks (I at Fn 0.4 noisy at source):")
    rms = {}
    for c, _ in ROWS:
        for g in GRIDS:
            ls = [math.log(res[(h, fn, g)][c][0] / jl.MEASURED[(h, fn)]) for h, fn in CLEAN]
            rms[(c, g)] = math.sqrt(sum(v * v for v in ls) / len(ls))
            pr(f"  {c:>6} P{g[0]:>2} S{g[1]:>2}: rms {rms[(c, g)]:.3f}, mean {sum(ls) / len(ls):+.3f}")
    d4 = {c: rms[(c, hi)] - rms[(c, lo)] for c in ("GB+F", "NF-PG")}
    pr(f"G4 rms change (16, 30) to (32, 60): " + ", ".join(f"{c} {v:+.3f}" for c, v in d4.items())
       + f" (each under 0.02 in magnitude) -> {'held' if all(abs(v) < 0.02 for v in d4.values()) else 'refuted'}")
    g5 = {h: (abs(ch[(h, 0.4, 'GB+F')]), abs(ch[(h, 0.2, 'GB+F')])) for h, _ in HULLS}
    pr("G5 |change| of GB+F's peak, Fn 0.4 against Fn 0.2: " + ", ".join(
        f"{h} {100 * a:.2f}% vs {100 * b:.2f}%" for h, (a, b) in g5.items())
       + f" (Fn 0.4 larger on both) -> {'held' if all(a > b for a, b in g5.values()) else 'refuted'}")
    pr("Fn 0.2 peak over Journee's measured on the three grids (Table III's quantity): " + "; ".join(
        f"{h} {c} " + "/".join(f"{res[(h, 0.2, g)][c][0] / jl.MEASURED[(h, 0.2)]:.3f}" for g in GRIDS)
        for h, _ in HULLS for c in ("GB+F", "NF-PG")))
    pr(f"(elapsed {time.time() - t0:.0f} s)")


if __name__ == "__main__":
    main()
