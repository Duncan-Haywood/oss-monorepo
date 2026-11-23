"""Milestone 7zzb: the diffraction disturbance's own x-derivative restored in each section's body condition by fixed-
point passes, restrained and free, zero speed, head waves, against the 3D near field (Capytaine).

    PYTHONPATH=src:experiments python3 experiments/run_dx_fixed_point.py > experiments/results_dx_fixed_point.txt

Needs `capytaine` 3.0.0 (with numpy, scipy, xarray). Plan and expectations: LOG.md, 7zzb, committed before this script
(556c4bb28). Variants: sdx (passes 0: 7zz's flow; free with 7zza's sdx-e motions), dx1 (one pass), dxc (passes until the
near field changes by under 1e-4 sigma, at most 12), and, not planned, dx200 (200 passes, to show where the iteration
goes when 12 is not enough). Free rows: motions from the exciting force of the same flow (exact Froude-Krylov).
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
TOL, CAP, FAR = 1e-4, 12, 200
HULLS = (
    ("T", "T (tank, modified Wigley, L/B 6.67)", (2.0, 0.3, 0.125), True, 1000.0, 0.248),
    ("M", "M (4 m monohull, Wigley, L/B 10)", (4.0, 0.4, 0.274390243902439), False, 1025.0, 0.25),
)
NAMES = ("sdx", "dx1", "dxc", "dx200")


def pr(*a):
    print(*a)
    sys.stdout.flush()


def trap(xs, ys):
    return sum(0.5 * (ys[i] + ys[i + 1]) * (xs[i + 1] - xs[i]) for i in range(len(xs) - 1))


def strip_row(h, nfs, w, norm, passes, free):
    if free:
        f3, f5 = nfs.excitation(w, "sdx", "exact", dx_passes=passes)
        z, th, _, _ = h.response(w, 0.0, excitation=(f3, f5))
    else:
        f3 = f5 = z = th = 0j
    o = nfs.response(w, 0.0, diffraction="sdx", motions=(z, th), dx_passes=passes)
    return {"nf": o["nf_pg"] / norm, "wl": o["wl"] / norm, "vel": o["vel"] / norm,
            "id": sum(o["vel_split"]["ID_" + c] for c in "xyz") / norm, "f3": abs(f3), "z": abs(z), "th": abs(th),
            "passes": passes}


def converged(h, nfs, w, norm, free):
    """Passes 1, 2, ... until NF moves by under TOL sigma, at most CAP; returns the row and the per-pass changes."""
    prev = strip_row(h, nfs, w, norm, 0, free)
    steps = []
    for p in range(1, CAP + 1):
        cur = strip_row(h, nfs, w, norm, p, free)
        steps.append(abs(cur["nf"] - prev["nf"]))
        prev = cur
        if steps[-1] < TOL:
            break
    prev["ok"] = steps[-1] < TOL
    prev["steps"] = steps
    return prev


def run_hull(key, name, dims, modified, rho, kyy):
    l, b, t = dims
    h = st.ModifiedWigleyStrip(*dims, kyy=kyy, rho=rho) if modified else st.WigleyStrip(*dims, kyy=kyy, rho=rho)
    c33, c55 = h.restoring()
    norm = rho * G * b * b / l
    t0 = time.time()
    m = pnf.PanelNearField(*dims, rho=rho, nx=MESH[0], nz=MESH[1], modified=modified)
    nfs = nfm.NearField(h)
    pr(f"\n== {name}: mesh {MESH[0]}x{MESH[1]} per half ({m.n_panels} hull panels); sigma = R / (rho g zeta^2 B^2 / L);"
       f" zero speed; restrained (R) and free (F); strip |F3|, |z|, |theta| over the panel's ==")
    rows = []
    for lam in LAMS:
        w = math.sqrt(2.0 * math.pi * G / (lam * l))
        sol, res = m.solve_nf(w)
        x3 = pn.rao(None, h.mass, c33, w, sol["F3"], sol["A33"], sol["B33"])
        x5 = pn.rao(None, h.iyy, c55, w, sol["F5"], sol["A55"], sol["B55"])
        zp, tp = pn.to_strip(x3, x5)
        r = {"lam": lam}
        for mode, mot3 in (("R", (0j, 0j)), ("F", (x3, x5))):
            nf3, _ = m.near_field(res, w, mot3[0], mot3[1], h.mass if mode == "F" else 0.0)
            sp3 = m.velocity_split(res, *mot3)
            r[mode, "3D"] = {"nf": nf3["nf"] / norm, "wl": nf3["wl"] / norm, "vel": nf3["vel"] / norm,
                             "id": sum(sp3["ID_" + c] for c in "xyz") / norm,
                             "f3": abs(sol["F3"]), "z": abs(zp), "th": abs(tp), "passes": 0}
            free = mode == "F"
            r[mode, "sdx"] = strip_row(h, nfs, w, norm, 0, free)
            r[mode, "dx1"] = strip_row(h, nfs, w, norm, 1, free)
            r[mode, "dxc"] = converged(h, nfs, w, norm, free)
            r[mode, "dx200"] = strip_row(h, nfs, w, norm, FAR, free)
        rows.append(r)
    pr(f"({time.time() - t0:.0f} s)")
    out = {}
    for mode in ("R", "F"):
        pr(f"\n-- {'restrained' if mode == 'R' else 'free'} --")
        pr(f"{'lam/L':>6} {'model':>6} {'pass':>5} {'NF':>9} {'WL':>9} {'VEL':>9} {'ID':>9} {'|F3|/p':>8} {'|z|/p':>8} "
           f"{'|th|/p':>8}")
        for r in rows:
            q = r[mode, "3D"]
            for mdl in ("3D",) + NAMES:
                s = r[mode, mdl]
                fz = ("" if mode == "R" else
                      (f"{q['f3']:8.1f} {q['z']:8.4f} {q['th']:8.4f}" if mdl == "3D" else
                       f"{s['f3'] / q['f3']:8.4f} {s['z'] / q['z']:8.4f} {s['th'] / q['th']:8.4f}"))
                pr(f"{r['lam']:6.2f} {mdl:>6} {s['passes']:5d} {s['nf']:9.5f} {s['wl']:9.5f} {s['vel']:9.5f} "
                   f"{s['id']:9.5f} {fz}")
        pr("dxc convergence (NF change per pass, sigma):")
        for r in rows:
            s = r[mode, "dxc"]
            pr(f"  {r['lam']:5.2f} {'settled' if s['ok'] else 'NOT settled'} after {s['passes']}: "
               + " ".join(f"{v:.1e}" for v in s["steps"]))
        band = [r for r in rows if r["lam"] in BAND]
        xs = [r["lam"] for r in band]
        a = {mdl: trap(xs, [r[mode, mdl]["nf"] for r in band]) for mdl in ("3D",) + NAMES}
        pr("band areas (lambda/L 0.5-2.0): " + ", ".join(f"{k} {v:.4f}" for k, v in a.items())
           + "; over 3D: " + ", ".join(f"{k} {a[k] / a['3D']:.3f}" for k in NAMES))
        out[mode] = {k: a[k] / a["3D"] for k in NAMES}
        if mode == "F":
            for f in ("f3", "z", "th"):
                af = {mdl: trap(xs, [r["F", mdl][f] for r in band]) for mdl in ("3D",) + NAMES}
                out["F", f] = {k: af[k] / af["3D"] for k in NAMES}
                pr(f"band area over panel, {f}: " + ", ".join(f"{k} {out['F', f][k]:.3f}" for k in NAMES))
    r1 = next(r for r in rows if r["lam"] == 1.0)
    lng = [r for r in rows if r["lam"] in LONG]
    return dict(
        x1=all(r[mode, "dxc"]["ok"] for r in rows for mode in ("R", "F")),
        x1n=sum(not r[mode, "dxc"]["ok"] for r in rows for mode in ("R", "F")),
        x2=out["R"], id1={m_: r1["R", m_]["id"] for m_ in ("3D",) + NAMES},
        x4=max(abs(r["F", "dxc"]["nf"] / r["F", "sdx"]["nf"]) for r in lng),
        x4f=max(abs(r["F", "dx200"]["nf"] / r["F", "sdx"]["nf"]) for r in lng),
        x5=out["F"], x6=out["F", "f3"])


def main():
    t0 = time.time()
    pr("Milestone 7zzb: the diffraction disturbance's x-derivative in the sectional body condition by fixed-point "
       "passes, strip against 3D panel (Capytaine), zero speed, head waves, restrained and free")
    import capytaine
    capytaine.set_logging("ERROR")
    pr(f"capytaine {capytaine.__version__}")
    s = {key: run_hull(key, *rest) for key, *rest in HULLS}
    t, m = s["T"], s["M"]
    ok = lambda c: "held" if c else "refuted"
    closer = lambda d, a, b: abs(d[a] - 1) < abs(d[b] - 1)
    pr("\n== expectations ==")
    pr(f"X1 dxc settles (1e-4 sigma within {CAP} passes) everywhere: T {t['x1']} ({t['x1n']} of 14 not), "
       f"M {m['x1']} ({m['x1n']} of 14 not) -> {ok(t['x1'] and m['x1'])}")
    for k in ("x2", "x5"):
        pr(f"{k.upper()} {'restrained' if k == 'x2' else 'free'} band area / 3D: "
           + "; ".join(f"{n} " + ", ".join(f"{v} {d[k][v]:.3f}" for v in NAMES) for n, d in (("T", t), ("M", m))))
    pr(f"X2 restrained dxc closer to 1 than sdx: -> {ok(all(closer(d['x2'], 'dxc', 'sdx') for d in (t, m)))}"
       f" (dx200: {all(closer(d['x2'], 'dx200', 'sdx') for d in (t, m))})")
    pr("X3 restrained lambda/L 1 ID: " + "; ".join(f"{n} " + ", ".join(f"{v} {d['id1'][v]:.5f}" for v in d["id1"])
                                                 for n, d in (("T", t), ("M", m)))
       + f" -> {ok(all(d['id1']['dxc'] * d['id1']['3D'] > 0 for d in (t, m)))}")
    pr(f"X4 free dxc long-wave NF over sdx's: T {t['x4']:.3f}, M {m['x4']:.3f} -> {ok(max(t['x4'], m['x4']) < 0.5)}"
       f" (dx200: T {t['x4f']:.3f}, M {m['x4f']:.3f})")
    pr(f"X5 free dxc band area / 3D in 0.9-1.1 -> {ok(all(0.9 <= d['x5']['dxc'] <= 1.1 for d in (t, m)))}")
    pr(f"X6 dxc |F3| band area over panel moves < 2% from sdx: T {t['x6']['dxc'] / t['x6']['sdx'] - 1:+.4f}, "
       f"M {m['x6']['dxc'] / m['x6']['sdx'] - 1:+.4f} -> "
       f"{ok(all(abs(d['x6']['dxc'] / d['x6']['sdx'] - 1) < 0.02 for d in (t, m)))}")
    pr(f"\nrun time {time.time() - t0:.0f} s")


if __name__ == "__main__":
    main()
