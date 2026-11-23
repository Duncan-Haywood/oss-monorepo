"""Milestone 7zy: the near-field velocity term split by pair (incident-incident II, incident-disturbance ID,
disturbance-disturbance PP) and by component, in 3D on Capytaine's panel solution and on the strip sections, zero
speed, head waves; plus two diagnostic strip variants (NC: ID removed; NX: disturbance x-velocity removed).

    PYTHONPATH=src:experiments python3 experiments/run_velocity_split.py > experiments/results_velocity_split.txt

Needs `capytaine` 3.0.0 (with numpy, scipy, xarray). Plan and expectations: LOG.md, 7zy, committed before this
script (1b8f52056). Q0 parts sum to the velocity term, II under 1e-3 of the peak; Q1 strip ID over 80% of strip VEL at
lambda/L 4 and 8; Q2 at lambda/L 1 |strip - 3D| larger in ID than PP; Q3 x the largest component of the strip ID error
at lambda/L 1; Q4 NC under 20% of NF-PG at lambda/L 4 and 8; Q5 / Q6 NC / NX band area closer to the 3D than NF-PG's.
"""
import math
import sys
import time

from marine_hull import nearfield as nfm
from marine_hull import panel as pn
from marine_hull import panel_nearfield as pnf
from marine_hull import strip as st

G = st.G
LAMS = (0.5, 0.7, 1.0, 1.4, 2.0, 4.0, 8.0)
BAND = (0.5, 0.7, 1.0, 1.4, 2.0)
LONG = (4.0, 8.0)
MESH = (80, 16)
HULLS = (
    ("T", "T (tank, modified Wigley, L/B 6.67)", (2.0, 0.3, 0.125), True, 1000.0, 0.248),
    ("M", "M (4 m monohull, Wigley, L/B 10)", (4.0, 0.4, 0.274390243902439), False, 1025.0, 0.25),
)
PAIRS = ("II", "ID", "PP")


def pr(*a):
    print(*a)
    sys.stdout.flush()


def trap(xs, ys):
    return sum(0.5 * (ys[i] + ys[i + 1]) * (xs[i + 1] - xs[i]) for i in range(len(xs) - 1))


def pair(d, p):
    return sum(d[p + "_" + c] for c in "xyz")


def run_hull(key, name, dims, modified, rho, kyy):
    l, b, t = dims
    h = st.ModifiedWigleyStrip(*dims, kyy=kyy, rho=rho) if modified else st.WigleyStrip(*dims, kyy=kyy, rho=rho)
    c33, c55 = h.restoring()
    norm = rho * G * b * b / l
    t0 = time.time()
    m = pnf.PanelNearField(*dims, rho=rho, nx=MESH[0], nz=MESH[1], modified=modified)
    nfs = nfm.NearField(h)
    pr(f"\n== {name}: mesh {MESH[0]}x{MESH[1]} per half ({m.n_panels} hull panels); sigma = R / (rho g zeta^2 B^2 / L);"
       f" 3D free with panel motions, strip zero speed zeta 0 with strip motions ==")
    rows = []
    for lam in LAMS:
        w = math.sqrt(2.0 * math.pi * G / (lam * l))
        sol, res = m.solve_nf(w)
        x3 = pn.rao(None, h.mass, c33, w, sol["F3"], sol["A33"], sol["B33"])
        x5 = pn.rao(None, h.iyy, c55, w, sol["F5"], sol["A55"], sol["B55"])
        nf3, _ = m.near_field(res, w, x3, x5, h.mass)
        sp3 = {k: v / norm for k, v in m.velocity_split(res, x3, x5).items()}
        o = nfs.response(w, 0.0)
        sps = {k: v / norm for k, v in o["vel_split"].items()}
        r = {"lam": lam, "nf3": nf3["nf"] / norm, "vel3": nf3["vel"] / norm, "sp3": sp3,
             "nfs": o["nf_pg"] / norm, "vels": o["vel"] / norm, "sps": sps}
        r["nc"] = r["nfs"] - pair(sps, "ID")
        # NX: drop the disturbance x-velocity b_x from |v_x|^2 = |a_x|^2 + 2 Re a_x b_x* + |b_x|^2
        r["nx"] = r["nfs"] - sps["ID_x"] - sps["PP_x"]
        r["sum3"] = sum(sp3.values()) - r["vel3"]
        r["sums"] = sum(sps.values()) - r["vels"]
        rows.append(r)
    pr(f"({time.time() - t0:.0f} s)")
    pr(f"{'lam/L':>6} {'model':>6} {'VEL':>9} {'II':>9} {'ID':>9} {'PP':>9} {'ID_x':>9} {'ID_y':>9} {'ID_z':>9} "
       f"{'PP_x':>9} {'PP_y':>9} {'PP_z':>9}")
    for r in rows:
        for tag, v, sp in (("3D", r["vel3"], r["sp3"]), ("strip", r["vels"], r["sps"])):
            pr(f"{r['lam']:6.2f} {tag:>6} {v:9.5f} " + " ".join(f"{pair(sp, p):9.5f}" for p in PAIRS) + " "
               + " ".join(f"{sp['ID_' + c]:9.5f}" for c in "xyz") + " "
               + " ".join(f"{sp['PP_' + c]:9.5f}" for c in "xyz"))
    pr(f"\n{'lam/L':>6} {'NF3D':>9} {'NF-PG':>9} {'NC':>9} {'NX':>9}   NF-PG/3D  NC/3D  NX/3D")
    for r in rows:
        pr(f"{r['lam']:6.2f} {r['nf3']:9.5f} {r['nfs']:9.5f} {r['nc']:9.5f} {r['nx']:9.5f}   "
           f"{r['nfs'] / r['nf3']:8.3f} {r['nc'] / r['nf3']:6.3f} {r['nx'] / r['nf3']:6.3f}")
    band = [r for r in rows if r["lam"] in BAND]
    xs = [r["lam"] for r in band]
    a = {k: trap(xs, [r[k] for r in band]) for k in ("nf3", "nfs", "nc", "nx")}
    pr("band areas (lambda/L 0.5-2.0, trapezoid on the 5 points): " + ", ".join(f"{k} {v:.4f}" for k, v in a.items())
       + f"; over 3D: NF-PG {a['nfs'] / a['nf3']:.3f}, NC {a['nc'] / a['nf3']:.3f}, NX {a['nx'] / a['nf3']:.3f}")
    peak3 = max(abs(r["vel3"]) for r in rows)
    peaks = max(abs(r["vels"]) for r in rows)
    q0sum = max(max(abs(r["sum3"]) / peak3, abs(r["sums"]) / peaks) for r in rows)
    q0ii = max(max(abs(pair(r["sp3"], "II")) / peak3, abs(pair(r["sps"], "II")) / peaks) for r in rows)
    q1 = min(pair(r["sps"], "ID") / r["vels"] for r in rows if r["lam"] in LONG)
    r1 = next(r for r in rows if r["lam"] == 1.0)
    e_id = abs(pair(r1["sps"], "ID") - pair(r1["sp3"], "ID"))
    e_pp = abs(pair(r1["sps"], "PP") - pair(r1["sp3"], "PP"))
    e_c = {c: abs(r1["sps"]["ID_" + c] - r1["sp3"]["ID_" + c]) for c in "xyz"}
    q4 = max(abs(r["nc"] / r["nfs"]) for r in rows if r["lam"] in LONG)
    pr(f"Q0: largest |sum of parts - VEL| / peak {q0sum:.1e}; largest |II| / peak {q0ii:.1e}")
    pr(f"Q1: smallest strip ID / VEL at lambda/L 4, 8: {q1:.3f}")
    pr(f"Q2: lambda/L 1 |strip - 3D|: ID {e_id:.5f}, PP {e_pp:.5f}")
    pr("Q3: lambda/L 1 |strip - 3D| in ID per component: " + ", ".join(f"{c} {v:.5f}" for c, v in e_c.items()))
    pr(f"Q4: largest |NC / NF-PG| at lambda/L 4, 8: {q4:.3f}")
    return dict(q0sum=q0sum, q0ii=q0ii, q1=q1, q2=e_id > e_pp, q3=max(e_c, key=e_c.get), q4=q4,
                q5=abs(a["nc"] / a["nf3"] - 1) < abs(a["nfs"] / a["nf3"] - 1),
                q6=abs(a["nx"] / a["nf3"] - 1) < abs(a["nfs"] / a["nf3"] - 1), a=a)


def main():
    t0 = time.time()
    pr("Milestone 7zy: the near-field velocity term split by pair and component, 3D panel (Capytaine) against strip, "
       "zero speed, head waves")
    import capytaine
    capytaine.set_logging("ERROR")
    pr(f"capytaine {capytaine.__version__}")
    s = {key: run_hull(key, *rest) for key, *rest in HULLS}
    t, m = s["T"], s["M"]
    ok = lambda c: "held" if c else "refuted"
    pr("\n== expectations ==")
    pr(f"Q0 sum T {t['q0sum']:.1e} M {m['q0sum']:.1e}; II T {t['q0ii']:.1e} M {m['q0ii']:.1e} -> "
       f"{ok(max(t['q0sum'], m['q0sum']) < 1e-9 and max(t['q0ii'], m['q0ii']) < 1e-3)}")
    pr(f"Q1 strip ID share at lambda/L 4, 8: T {t['q1']:.3f}, M {m['q1']:.3f} -> {ok(min(t['q1'], m['q1']) > 0.8)}")
    pr(f"Q2 ID error > PP error at lambda/L 1: T {t['q2']}, M {m['q2']} -> {ok(t['q2'] and m['q2'])}")
    pr(f"Q3 largest ID error component at lambda/L 1: T {t['q3']}, M {m['q3']} -> {ok(t['q3'] == 'x' == m['q3'])}")
    pr(f"Q4 |NC / NF-PG| at lambda/L 4, 8: T {t['q4']:.3f}, M {m['q4']:.3f} -> {ok(max(t['q4'], m['q4']) < 0.2)}")
    pr(f"Q5 NC band area closer to 3D than NF-PG: T {t['q5']}, M {m['q5']} -> {ok(t['q5'] and m['q5'])}")
    pr(f"Q6 NX band area closer to 3D than NF-PG: T {t['q6']}, M {m['q6']} -> {ok(t['q6'] and m['q6'])}")
    pr(f"\nrun time {time.time() - t0:.0f} s")


if __name__ == "__main__":
    main()
