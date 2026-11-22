"""Milestone 7zx: Pinkster's near-field mean drift on Capytaine's 3D panel solution against Maruo's far field, zero speed,
and the strip near field (7zs to 7zw) term by term against it.

    PYTHONPATH=src:experiments python3 experiments/run_panel_nearfield.py > experiments/results_panel_nearfield.txt

Needs `capytaine` (3.0.0, with numpy, scipy and xarray; pip). Plan and expectations: LOG.md, 7zx, committed before
this script (c2de7aef4). P0a radiation boundary condition residual < 2%; P0b cylinder near field within 5% of exact
and of the far field at ka 1, 2, 4; P1 restrained NF3D / Maruo area on lambda/L 0.5-2.0 in 0.9-1.1; P2 free in
0.85-1.15; P3 coarse -> fine moves NF3D's free area more than Maruo's; P4 free NF3D at lambda/L 4, 6, 8 under 2% of
its peak, none below -1%; P5 strip NF-PG at zero speed negative at lambda/L 8 on the monohull; P6 at lambda/L 8 the
strip's velocity term is the furthest of the four from its 3D counterpart.
"""
import math
import sys
import time

from marine_hull import maruo as mr
from marine_hull import nearfield as nfm
from marine_hull import panel as pn
from marine_hull import panel_nearfield as pnf
from marine_hull import strip as st

G = st.G
LAMS = (0.3, 0.35, 0.4, 0.45, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.25, 1.4, 1.6, 1.8, 2.0, 2.25, 2.5, 3.0, 4.0,
        6.0, 8.0)
BAND = (0.5, 2.0)
LONG = (4.0, 6.0, 8.0)
STRIP_LAMS = (0.5, 1.0, 2.0, 4.0, 8.0)
MESHES = ((40, 8), (80, 16))
HULLS = (
    ("T", "T (tank, modified Wigley, L/B 6.67)", (2.0, 0.3, 0.125), True, 1000.0, 0.248),
    ("M", "M (4 m monohull, Wigley, L/B 10)", (4.0, 0.4, 0.274390243902439), False, 1025.0, 0.25),
)
TERMS = ("wl", "vel", "grad", "rot")


def pr(*a):
    print(*a)
    sys.stdout.flush()


def trap(xs, ys):
    return sum(0.5 * (ys[i] + ys[i + 1]) * (xs[i + 1] - xs[i]) for i in range(len(xs) - 1))


def area(rows, key, lo, hi):
    sel = [r for r in rows if lo - 1e-9 <= r["lam"] <= hi + 1e-9]
    return trap([r["lam"] for r in sel], [r[key] for r in sel])


def code_check():
    pr("\n== P0b code check: fixed vertical cylinder, radius 1 m, draft 4 m, waves along -x; near field (WL + VEL) "
       "against the exact infinite-draft drift and Capytaine's far field on the same mesh ==")
    pr(f"{'ka':>4} {'exact':>7} {'NF 48x16':>9} {'FF 48x16':>9} {'NF 96x32':>9} {'FF 96x32':>9} {'NF/exact':>8} "
       f"{'NF/FF':>7}")
    worst = 0.0
    for ka in (1.0, 2.0, 4.0):
        ex = mr.cylinder_drift_exact(ka)
        nc, fc = pnf.cylinder_near_field(1.0, 4.0, ka, n_theta=48, n_z=16)
        nf, ff = pnf.cylinder_near_field(1.0, 4.0, ka, n_theta=96, n_z=32)
        worst = max(worst, abs(nf / ex - 1), abs(nf / ff - 1))
        pr(f"{ka:4.1f} {ex:7.4f} {nc:9.4f} {fc:9.4f} {nf:9.4f} {ff:9.4f} {nf / ex:8.4f} {nf / ff:7.4f}")
    pr(f"P0b: largest |NF/exact - 1| or |NF/FF - 1| on the fine mesh {worst:.4f} -> "
       f"{'held' if worst < 0.05 else 'refuted'} (< 0.05)")
    return worst


def hull_rows(name, dims, modified, rho, kyy):
    l, b, t = dims
    h = st.ModifiedWigleyStrip(*dims, kyy=kyy, rho=rho) if modified else st.WigleyStrip(*dims, kyy=kyy, rho=rho)
    c33, c55 = h.restoring()
    norm = rho * G * b * b / l
    pr(f"\n== {name}: L {l} m, B {b} m, T {t:.4f} m, rho {rho}, kyy {kyy} L; mass {h.mass:.2f} kg, Iyy {h.iyy:.3f} "
       f"kg m2, C33 {c33:.1f} N/m, C55 {c55:.1f} N m; sigma = R_aw / (rho g zeta^2 B^2 / L) ==")
    out = {}
    for nx, nz in MESHES:
        t0 = time.time()
        m = pnf.PanelNearField(*dims, rho=rho, nx=nx, nz=nz, modified=modified)
        rows, resid = [], 0.0
        for lam in LAMS:
            w = math.sqrt(2.0 * math.pi * G / (lam * l))
            sol, res = m.solve_nf(w)
            x3 = pn.rao(None, h.mass, c33, w, sol["F3"], sol["A33"], sol["B33"])
            x5 = pn.rao(None, h.iyy, c55, w, sol["F5"], sol["A55"], sol["B55"])
            fix, _ = m.near_field(res, w)
            free, rr = m.near_field(res, w, x3, x5, h.mass)
            resid = max(resid, *rr.values())
            row = {"lam": lam, "w": w, "ff_fix": m.added_resistance(sol) / norm,
                   "ff_free": m.added_resistance(sol, x3, x5) / norm, "nf_fix": fix["nf"] / norm,
                   "nf_free": free["nf"] / norm, "x3": x3, "x5": x5}
            for k in TERMS:
                row["fix_" + k] = fix[k] / norm
                row["free_" + k] = free[k] / norm
            rows.append(row)
        out[(nx, nz)] = (m.n_panels, rows, resid, time.time() - t0)
    return h, norm, out


def report(key, name, h, norm, meshes, summary):
    (nc, coarse, rc, tc), (nf, fine, rf_, tf) = meshes[MESHES[0]], meshes[MESHES[1]]
    pr(f"\n-- {name}: fine mesh {MESHES[1][0]}x{MESHES[1][1]} per half ({nf} hull panels), {tf:.0f} s; coarse "
       f"{MESHES[0][0]}x{MESHES[0][1]} ({nc}), {tc:.0f} s --")
    pr(f"P0a: largest rms radiation boundary-condition residual |v.n - BC| / |BC|: fine {rf_:.2e}, coarse {rc:.2e}")
    pr(f"{'lam/L':>6} {'FF fix':>8} {'NF fix':>8} {'FF free':>8} {'NF free':>8} {'WL':>8} {'VEL':>8} {'GRAD':>8} "
       f"{'ROT':>8} {'NFc free':>8}")
    for r, q in zip(fine, coarse):
        pr(f"{r['lam']:6.2f} {r['ff_fix']:8.4f} {r['nf_fix']:8.4f} {r['ff_free']:8.4f} {r['nf_free']:8.4f} "
           f"{r['free_wl']:8.4f} {r['free_vel']:8.4f} {r['free_grad']:8.4f} {r['free_rot']:8.4f} {q['nf_free']:8.4f}")
    a = {k: area(fine, k, *BAND) for k in ("ff_fix", "nf_fix", "ff_free", "nf_free")}
    ac = {k: area(coarse, k, *BAND) for k in ("ff_fix", "nf_fix", "ff_free", "nf_free")}
    pr("areas on lambda/L 0.5-2.0, fine: " + ", ".join(f"{k} {v:.4f}" for k, v in a.items()))
    pr("areas on lambda/L 0.5-2.0, coarse: " + ", ".join(f"{k} {v:.4f}" for k, v in ac.items()))
    p1, p2 = a["nf_fix"] / a["ff_fix"], a["nf_free"] / a["ff_free"]
    m_nf = abs(ac["nf_free"] / a["nf_free"] - 1)
    m_ff = abs(ac["ff_free"] / a["ff_free"] - 1)
    pr(f"NF3D / Maruo area: restrained {p1:.4f}, free {p2:.4f}; coarse -> fine free area change NF3D "
       f"{m_nf * 100:.2f}%, Maruo {m_ff * 100:.2f}%")
    pk = max(r["nf_free"] for r in fine)
    longv = [r["nf_free"] for r in fine if r["lam"] in LONG]
    pr(f"free NF3D peak {pk:.4f}; at lambda/L {LONG}: " + ", ".join(f"{v:.6f}" for v in longv)
       + f" ({max(abs(v) for v in longv) / pk * 100:.3f}% of the peak at most)")
    # strip near field at zero speed, no viscous damping, the strip's own motions
    nfs = nfm.NearField(h)
    pr(f"\nstrip near field at zero speed, zeta 0, strip motions (nearfield.NearField) against NF3D free, fine mesh; "
       f"sigma units; strip rot = rot_newton")
    pr(f"{'lam/L':>6} {'row':>6} {'total':>9} {'WL':>9} {'VEL':>9} {'GRAD':>9} {'ROT':>9} {'GB':>9}")
    strip = {}
    for lam in STRIP_LAMS:
        w = math.sqrt(2.0 * math.pi * G / (lam * h.l))
        o = nfs.response(w, 0.0)
        s = {"wl": o["wl"] / norm, "vel": o["vel"] / norm, "grad": o["grad"] / norm, "rot": o["rot_newton"] / norm}
        s["nf_pg"] = o["nf_pg"] / norm
        s["nf_p"] = o["nf_p"] / norm
        s["nf"] = o["nf"] / norm
        strip[lam] = s
        r = next(q for q in fine if q["lam"] == lam)
        pr(f"{lam:6.2f} {'3D':>6} {r['nf_free']:9.5f} {r['free_wl']:9.5f} {r['free_vel']:9.5f} {r['free_grad']:9.5f} "
           f"{r['free_rot']:9.5f} {'':>9}")
        pr(f"{'':6} {'strip':>6} {s['nf_pg']:9.5f} {s['wl']:9.5f} {s['vel']:9.5f} {s['grad']:9.5f} {s['rot']:9.5f} "
           f"{o['gb'] / norm:9.5f}")
        pr(f"{'':6} {'':>6} strip NF (PDSTRIP rot) {s['nf']:.5f}, NF-P {s['nf_p']:.5f}; motions |z| strip "
           f"{abs(o['z']):.4f} panel {abs(r['x3']):.4f}, |theta|/k strip {abs(o['theta']) / (w * w / G):.4f} panel "
           f"{abs(r['x5']) / (w * w / G):.4f}")
    r8 = next(q for q in fine if q["lam"] == 8.0)
    d8 = {k: abs(strip[8.0][k] - r8["free_" + k]) for k in TERMS}
    pr("lambda/L 8, |strip - 3D| per term: " + ", ".join(f"{k} {v:.5f}" for k, v in d8.items()))
    summary[key] = dict(p1=p1, p2=p2, m_nf=m_nf, m_ff=m_ff, resid=rf_,
                        long=max(abs(v) for v in longv) / pk, low=min(longv) / pk,
                        s8=strip[8.0]["nf_pg"], worst8=max(d8, key=d8.get), d8=d8)


def main():
    t0 = time.time()
    pr("Milestone 7zx: Pinkster's near field on Capytaine's 3D panel solution against Maruo's far field, zero speed, "
       "head waves, and the strip near field term by term")
    import capytaine
    capytaine.set_logging("ERROR")
    pr(f"capytaine {capytaine.__version__}; indirect method; full meshes with a waterplane lid; compute_potential and "
       f"compute_velocity on the hull faces; heave and pitch free (7zm panel motions) or restrained")
    p0b = code_check()
    summary = {}
    for key, name, dims, modified, rho, kyy in HULLS:
        h, norm, meshes = hull_rows(name, dims, modified, rho, kyy)
        report(key, name, h, norm, meshes, summary)
    t, m = summary["T"], summary["M"]
    ok = lambda c: "held" if c else "refuted"
    pr("\n== expectations ==")
    pr(f"P0a BC residual T {t['resid']:.2e}, M {m['resid']:.2e} -> {ok(max(t['resid'], m['resid']) < 0.02)}")
    pr(f"P0b cylinder worst {p0b:.4f} -> {ok(p0b < 0.05)}")
    pr(f"P1 restrained NF3D/Maruo T {t['p1']:.4f}, M {m['p1']:.4f} -> "
       f"{ok(all(0.9 <= v <= 1.1 for v in (t['p1'], m['p1'])))} (0.9-1.1)")
    pr(f"P2 free NF3D/Maruo T {t['p2']:.4f}, M {m['p2']:.4f} -> "
       f"{ok(all(0.85 <= v <= 1.15 for v in (t['p2'], m['p2'])))} (0.85-1.15)")
    pr(f"P3 mesh change NF3D vs Maruo: T {t['m_nf'] * 100:.2f}% vs {t['m_ff'] * 100:.2f}%, M {m['m_nf'] * 100:.2f}% "
       f"vs {m['m_ff'] * 100:.2f}% -> {ok(t['m_nf'] > t['m_ff'] and m['m_nf'] > m['m_ff'])}")
    pr(f"P4 long-wave free NF3D / peak: T max {t['long'] * 100:.3f}% min {t['low'] * 100:.3f}%, M max "
       f"{m['long'] * 100:.3f}% min {m['low'] * 100:.3f}% -> "
       f"{ok(max(t['long'], m['long']) < 0.02 and min(t['low'], m['low']) > -0.01)}")
    pr(f"P5 strip NF-PG at lambda/L 8, monohull, zero speed: {m['s8']:.6f} -> {ok(m['s8'] < 0)}")
    pr(f"P6 term furthest from 3D at lambda/L 8: T {t['worst8']}, M {m['worst8']} -> "
       f"{ok(t['worst8'] == 'vel' and m['worst8'] == 'vel')}")
    pr(f"\nrun time {time.time() - t0:.0f} s")


if __name__ == "__main__":
    main()
