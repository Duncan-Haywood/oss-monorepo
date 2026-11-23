"""Milestone 7zza: strip motions driven by the exciting force of the strip's own sectional diffraction flow, zero
speed, head waves, against Capytaine's exciting forces, motions and the 3D near field.

    PYTHONPATH=src:experiments python3 experiments/run_consistent_excitation.py > experiments/results_consistent_excitation.txt

Needs `capytaine` 3.0.0 (with numpy, scipy, xarray). Plan and expectations: LOG.md, 7zza, committed before this script
(3ff1f6c29). Variants: def (today's strip flow and motions); rv-s (rv flow, exciting force by pressure integration with
the strip's Froude-Krylov: reproduces def); rv-e (rv flow, exact Froude-Krylov on the panels); sdx-o (7zz's sdx flow,
today's motions); sdx-e (sdx flow, motions from the sdx exciting force with exact Froude-Krylov).
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
# name: (flow for the near field, excitation (diffraction, fk) or None for the relative-motion force)
VARIANTS = (("def", None, None), ("rv-s", "rv", ("rv", "strip")), ("rv-e", "rv", ("rv", "exact")),
            ("sdx-o", "sdx", None), ("sdx-e", "sdx", ("sdx", "exact")))


def pr(*a):
    print(*a)
    sys.stdout.flush()


def trap(xs, ys):
    return sum(0.5 * (ys[i] + ys[i + 1]) * (xs[i + 1] - xs[i]) for i in range(len(xs) - 1))


def run_hull(key, name, dims, modified, rho, kyy):
    l, b, t = dims
    h = st.ModifiedWigleyStrip(*dims, kyy=kyy, rho=rho) if modified else st.WigleyStrip(*dims, kyy=kyy, rho=rho)
    c33, c55 = h.restoring()
    norm = rho * G * b * b / l
    t0 = time.time()
    m = pnf.PanelNearField(*dims, rho=rho, nx=MESH[0], nz=MESH[1], modified=modified)
    nfs = nfm.NearField(h)
    pr(f"\n== {name}: mesh {MESH[0]}x{MESH[1]} per half ({m.n_panels} hull panels); sigma = R / (rho g zeta^2 B^2 / L);"
       f" zero speed, free; forces and motions over the panel's (Capytaine, single-mode RAOs) ==")
    rows = []
    for lam in LAMS:
        w = math.sqrt(2.0 * math.pi * G / (lam * l))
        sol, res = m.solve_nf(w)
        x3 = pn.rao(None, h.mass, c33, w, sol["F3"], sol["A33"], sol["B33"])
        x5 = pn.rao(None, h.iyy, c55, w, sol["F5"], sol["A55"], sol["B55"])
        zp, tp = pn.to_strip(x3, x5)
        f3p, f5p = pn.to_strip(sol["F3"], sol["F5"])      # same phase and sign flips as the motions
        nf3, _ = m.near_field(res, w, x3, x5, h.mass)
        sp3 = m.velocity_split(res, x3, x5)
        r = {"lam": lam, "3D": {"nf": nf3["nf"] / norm, "wl": nf3["wl"] / norm, "vel": nf3["vel"] / norm,
                                "id": sum(sp3["ID_" + c] for c in "xyz") / norm,
                                "f3": abs(sol["F3"]), "f5": abs(sol["F5"]), "z": abs(zp), "th": abs(tp)},
             "f3p": f3p, "f5p": f5p}
        sf = pn.strip_zero_speed(h, w)
        for vname, flow, exc in VARIANTS:
            if exc is None:
                f3, f5 = sf["F3"], sf["F5"]
                z, th, _, _ = h.response(w, 0.0)
            else:
                f3, f5 = nfs.excitation(w, *exc)
                z, th, _, _ = h.response(w, 0.0, excitation=(f3, f5))
            o = nfs.response(w, 0.0, diffraction=None if vname == "def" else flow, motions=(z, th))
            r[vname] = {"nf": o["nf_pg"] / norm, "wl": o["wl"] / norm, "vel": o["vel"] / norm,
                        "id": sum(o["vel_split"]["ID_" + c] for c in "xyz") / norm,
                        "f3": abs(f3), "f5": abs(f5), "z": abs(z), "th": abs(th), "f3c": f3, "f5c": f5}
        rows.append(r)
    pr(f"({time.time() - t0:.0f} s)")
    names = [v[0] for v in VARIANTS]
    pr(f"\n{'lam/L':>6} {'model':>6} {'|F3|/p':>8} {'|F5|/p':>8} {'|z|/p':>8} {'|th|/p':>8} {'NF':>9} {'WL':>9} "
       f"{'VEL':>9} {'ID':>9}")
    for r in rows:
        q = r["3D"]
        pr(f"{r['lam']:6.2f} {'3D':>6} {q['f3']:8.1f} {q['f5']:8.1f} {q['z']:8.4f} {q['th']:8.4f} {q['nf']:9.5f} "
           f"{q['wl']:9.5f} {q['vel']:9.5f} {q['id']:9.5f}   (3D row: |F3| N/m, |F5| N, |z|, |theta| rad/m)")
        for v in names:
            s = r[v]
            pr(f"{r['lam']:6.2f} {v:>6} {s['f3'] / q['f3']:8.4f} {s['f5'] / q['f5']:8.4f} {s['z'] / q['z']:8.4f} "
               f"{s['th'] / q['th']:8.4f} {s['nf']:9.5f} {s['wl']:9.5f} {s['vel']:9.5f} {s['id']:9.5f}")
    pr("\nexciting-force phase, strip minus panel (deg), F3 / F5:")
    for r in rows:
        pr(f"{r['lam']:6.2f} " + "  ".join(
            f"{v} {math.degrees(math.atan2((r[v]['f3c'] / r['f3p']).imag, (r[v]['f3c'] / r['f3p']).real)):7.1f}"
            f"/{math.degrees(math.atan2((r[v]['f5c'] / r['f5p']).imag, (r[v]['f5c'] / r['f5p']).real)):7.1f}"
            for v in ("def", "sdx-e")))
    band = [r for r in rows if r["lam"] in BAND]
    xs = [r["lam"] for r in band]
    area = lambda mdl, f: trap(xs, [r[mdl][f] for r in band])
    out = {}
    for f in ("f3", "f5", "z", "th", "nf"):
        out[f] = {v: area(v, f) / area("3D", f) for v in names}
        pr(f"band area over 3D/panel, {f}: " + ", ".join(f"{v} {out[f][v]:.3f}" for v in names))
    e0 = max(abs(r["rv-s"][f] - r["def"][f]) / abs(r["def"][f]) for r in rows for f in ("f3", "f5", "z", "th", "nf"))
    e1 = abs(out["f3"]["rv-e"] / out["f3"]["def"] - 1)
    e2 = abs(out["f3"]["sdx-e"] - 1) < abs(out["f3"]["def"] - 1)
    lng = [r for r in rows if r["lam"] in LONG]
    e3 = max(abs(r["sdx-e"]["nf"] / r["sdx-o"]["nf"]) for r in lng)
    e4 = max(abs(r["sdx-e"]["nf"] / r["def"]["nf"]) for r in lng)
    e5 = out["nf"]["sdx-e"]
    e6 = all(abs(out[f]["sdx-e"] - 1) < abs(out[f]["def"] - 1) for f in ("z", "th"))
    pr(f"E0 largest |rv-s - def| / |def| (F3, F5, z, theta, NF): {e0:.5f}")
    pr(f"E1 |F3| area rv-e / def - 1: {e1:.4f}")
    pr(f"E3 largest |sdx-e / sdx-o| NF at lambda/L 4, 8: {e3:.3f}; E4 over def: {e4:.3f}")
    return dict(e0=e0, e1=e1, e2=e2, e3=e3, e4=e4, e5=e5, e6=e6)


def main():
    t0 = time.time()
    pr("Milestone 7zza: strip motions driven by the sectional diffraction exciting force, strip against 3D panel "
       "(Capytaine), zero speed, head waves")
    import capytaine
    capytaine.set_logging("ERROR")
    pr(f"capytaine {capytaine.__version__}")
    s = {key: run_hull(key, *rest) for key, *rest in HULLS}
    t, m = s["T"], s["M"]
    ok = lambda c: "held" if c else "refuted"
    pr("\n== expectations ==")
    pr(f"E0 rv-s reproduces def to 2%: T {t['e0']:.5f}, M {m['e0']:.5f} -> {ok(max(t['e0'], m['e0']) < 0.02)}")
    pr(f"E1 exact FK moves |F3| area by < 5%: T {t['e1']:.4f}, M {m['e1']:.4f} -> {ok(max(t['e1'], m['e1']) < 0.05)}")
    pr(f"E2 sdx-e |F3| area closer to panel than def: T {t['e2']}, M {m['e2']} -> {ok(t['e2'] and m['e2'])}")
    pr(f"E3 sdx-e long-wave NF under half of sdx-o: T {t['e3']:.3f}, M {m['e3']:.3f} -> {ok(max(t['e3'], m['e3']) < 0.5)}")
    pr(f"E4 sdx-e long-wave NF under 20% of def: T {t['e4']:.3f}, M {m['e4']:.3f} -> {ok(max(t['e4'], m['e4']) < 0.2)}")
    pr(f"E5 sdx-e free band area / 3D in 0.9-1.1: T {t['e5']:.3f}, M {m['e5']:.3f} -> "
       f"{ok(all(0.9 <= v <= 1.1 for v in (t['e5'], m['e5'])))}")
    pr(f"E6 sdx-e |z|, |theta| areas closer to panel than def: T {t['e6']}, M {m['e6']} -> {ok(t['e6'] and m['e6'])}")
    pr(f"\nrun time {time.time() - t0:.0f} s")


if __name__ == "__main__":
    main()
