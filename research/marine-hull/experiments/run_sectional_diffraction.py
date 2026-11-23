"""Milestone 7zz: sectional diffraction with the incident wave's own body condition against the relative-velocity
shortcut, restrained and free, zero speed, head waves, against the 3D near field and its velocity split (Capytaine).

    PYTHONPATH=src:experiments python3 experiments/run_sectional_diffraction.py > experiments/results_sectional_diffraction.txt

Needs `capytaine` 3.0.0 (with numpy, scipy, xarray). Plan and expectations: LOG.md, 7zz, committed before this script
(2bcf29d8a). Strip variants (`nearfield.NearField.response(diffraction=...)`): def (today's interpolated relative-
velocity flow), rv (the same, solved directly), sd (diffraction condition n_z e^{kz}), sdx (sd plus the incident surge
velocity on the longitudinal normal). D0 rv reproduces def to 2%; D1 restrained lambda/L 1 def ID and 3D ID opposite
signs; D2 sd moves restrained ID by under 25% of the gap; D3 sdx restrained ID has the 3D sign; D4 sdx restrained band
area in 0.8 to 1.25 of the 3D; D5 free sdx long-wave values under 20% of def's; D6 free sdx band area closer to 3D.
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
VARIANTS = (None, "rv", "sd", "sdx")
NAME = {None: "def", "rv": "rv", "sd": "sd", "sdx": "sdx"}
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
       f" zero speed; restrained (R) and free (F: 3D panel motions, strip motions) ==")
    rows = []
    for lam in LAMS:
        w = math.sqrt(2.0 * math.pi * G / (lam * l))
        sol, res = m.solve_nf(w)
        x3 = pn.rao(None, h.mass, c33, w, sol["F3"], sol["A33"], sol["B33"])
        x5 = pn.rao(None, h.iyy, c55, w, sol["F5"], sol["A55"], sol["B55"])
        r = {"lam": lam}
        for mode, mot3 in (("R", (0j, 0j)), ("F", (x3, x5))):
            nf3, _ = m.near_field(res, w, mot3[0], mot3[1], h.mass if mode == "F" else 0.0)
            sp3 = {k: v / norm for k, v in m.velocity_split(res, *mot3).items()}
            r[mode, "3D"] = {"nf": nf3["nf"] / norm, "vel": nf3["vel"] / norm, "wl": nf3["wl"] / norm, "sp": sp3}
            for d in VARIANTS:
                o = nfs.response(w, 0.0, diffraction=d, motions=(0j, 0j) if mode == "R" else None)
                r[mode, NAME[d]] = {"nf": o["nf_pg"] / norm, "vel": o["vel"] / norm, "wl": o["wl"] / norm,
                                    "sp": {k: v / norm for k, v in o["vel_split"].items()}}
        rows.append(r)
    pr(f"({time.time() - t0:.0f} s)")
    models = ["3D"] + [NAME[d] for d in VARIANTS]
    out = {}
    for mode in ("R", "F"):
        pr(f"\n-- {'restrained' if mode == 'R' else 'free'} --")
        pr(f"{'lam/L':>6} {'model':>6} {'NF':>9} {'WL':>9} {'VEL':>9} {'II':>9} {'ID':>9} {'PP':>9} {'ID_x':>9} "
           f"{'ID_z':>9} {'PP_x':>9} {'PP_z':>9}")
        for r in rows:
            for mdl in models:
                q = r[mode, mdl]
                sp = q["sp"]
                pr(f"{r['lam']:6.2f} {mdl:>6} {q['nf']:9.5f} {q['wl']:9.5f} {q['vel']:9.5f} "
                   + " ".join(f"{pair(sp, p):9.5f}" for p in PAIRS) + " "
                   + " ".join(f"{sp[p + '_' + c]:9.5f}" for p in ("ID", "PP") for c in "xz"))
        band = [r for r in rows if r["lam"] in BAND]
        xs = [r["lam"] for r in band]
        a = {mdl: trap(xs, [r[mode, mdl]["nf"] for r in band]) for mdl in models}
        pr("band areas (lambda/L 0.5-2.0, trapezoid on the 5 points): " + ", ".join(f"{k} {v:.4f}" for k, v in a.items())
           + "; over 3D: " + ", ".join(f"{k} {a[k] / a['3D']:.3f}" for k in models[1:]))
        out[mode] = {"a": a}
    # expectations
    d0 = max(abs(r[mode, "rv"][f] - r[mode, "def"][f]) / abs(r[mode, "def"][f])
             for r in rows for mode in ("R", "F") for f in ("nf", "vel"))
    r1 = next(r for r in rows if r["lam"] == 1.0)
    idr = {mdl: pair(r1["R", mdl]["sp"], "ID") for mdl in models}
    d1 = idr["def"] * idr["3D"] < 0
    d2 = abs(idr["sd"] - idr["def"]) / abs(idr["def"] - idr["3D"])
    d3 = idr["sdx"] * idr["3D"] > 0
    d4 = out["R"]["a"]["sdx"] / out["R"]["a"]["3D"]
    d5 = max(abs(r["F", "sdx"]["nf"] / r["F", "def"]["nf"]) for r in rows if r["lam"] in LONG)
    af = out["F"]["a"]
    d6 = abs(af["sdx"] / af["3D"] - 1) < abs(af["def"] / af["3D"] - 1)
    pr(f"D0: largest |rv - def| / |def| (NF, VEL, R and F, all points): {d0:.4f}")
    pr("D1-D3: restrained lambda/L 1 ID: " + ", ".join(f"{k} {v:.5f}" for k, v in idr.items())
       + f"; |sd - def| / |def - 3D| {d2:.3f}")
    pr(f"D4: restrained sdx band area / 3D {d4:.3f}")
    pr(f"D5: largest |free sdx / free def| at lambda/L 4, 8: {d5:.3f}")
    pr(f"D6: free band area over 3D: def {af['def'] / af['3D']:.3f}, sdx {af['sdx'] / af['3D']:.3f}")
    return dict(d0=d0, d1=d1, d2=d2, d3=d3, d4=d4, d5=d5, d6=d6)


def main():
    t0 = time.time()
    pr("Milestone 7zz: sectional diffraction with the incident wave's own body condition, strip against 3D panel "
       "(Capytaine), zero speed, head waves, restrained and free")
    import capytaine
    capytaine.set_logging("ERROR")
    pr(f"capytaine {capytaine.__version__}")
    s = {key: run_hull(key, *rest) for key, *rest in HULLS}
    t, m = s["T"], s["M"]
    ok = lambda c: "held" if c else "refuted"
    pr("\n== expectations ==")
    pr(f"D0 rv against def: T {t['d0']:.4f}, M {m['d0']:.4f} -> {ok(max(t['d0'], m['d0']) < 0.02)}")
    pr(f"D1 restrained def ID and 3D ID opposite at lambda/L 1: T {t['d1']}, M {m['d1']} -> {ok(t['d1'] and m['d1'])}")
    pr(f"D2 sd moves restrained ID by < 25% of the gap: T {t['d2']:.3f}, M {m['d2']:.3f} -> "
       f"{ok(max(t['d2'], m['d2']) < 0.25)}")
    pr(f"D3 sdx restrained ID has the 3D sign: T {t['d3']}, M {m['d3']} -> {ok(t['d3'] and m['d3'])}")
    pr(f"D4 sdx restrained area / 3D in 0.8-1.25: T {t['d4']:.3f}, M {m['d4']:.3f} -> "
       f"{ok(all(0.8 <= v <= 1.25 for v in (t['d4'], m['d4'])))}")
    pr(f"D5 free sdx long-wave under 20% of def: T {t['d5']:.3f}, M {m['d5']:.3f} -> {ok(max(t['d5'], m['d5']) < 0.2)}")
    pr(f"D6 free sdx area closer to 3D than def: T {t['d6']}, M {m['d6']} -> {ok(t['d6'] and m['d6'])}")
    pr(f"\nrun time {time.time() - t0:.0f} s")


if __name__ == "__main__":
    main()
