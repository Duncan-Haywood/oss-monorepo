"""Milestone 7zm: the Gerritsma-Beukelman added-resistance formula against Maruo's 3D far-field formula, zero speed.

    PYTHONPATH=src:experiments python3 experiments/run_maruo_check.py > experiments/results_maruo_check.txt

Needs `capytaine` (3.0.0, with numpy, scipy and xarray; pip). Code check: a fixed vertical cylinder against the exact
deep-water drift force. Then, on Kashiwagi's modified Wigley tank hull (T, L/B 6.67) and the programme's 4 m Wigley
monohull (M, L/B 10), over lambda/L 0.3 to 2.5 at zero speed in head waves, heave and pitch free, surge restrained:
Maruo's far-field added resistance with the hull restrained and free (panel motions from the panel coefficients with
the strip mass, inertia and restoring), against GB on the strip sections (strip motions, and panel motions) and GB
plus Faltinsen's zero-speed reflection term. The energy identity of the far-field Kochin function is checked at
every frequency. Two panel meshes.

Expectations (committed to LOG.md before the full run, d04243c99): Q0 cylinder within 3% of exact at ka 1, 2, 4;
Q1 energy identity within 2% everywhere (fine mesh, restrained and free); Q2 coarse -> fine moves the free Maruo area
on lambda/L 0.5-2.0 by < 3%; Q3 free Maruo at lambda/L 2.5 < 5% of restrained; Q4 GB strip / Maruo free area on
0.5-2.0 above 1.5 on both hulls; Q5 the monohull's Q4 ratio within 0.7-1.3 of the tank hull's; Q6 GB + Faltinsen over
Maruo free on 0.3-0.6 above 1.5 on both hulls; Q7 restrained Maruo at lambda/L 0.3 is 1.5-4 times Faltinsen's
zero-speed reflection term on both hulls.
"""
import math
import sys
import time

from marine_hull import maruo as mr
from marine_hull import panel as pn
from marine_hull import reflection as rf
from marine_hull import strip as st

G = st.G
LAMS = (0.3, 0.35, 0.4, 0.45, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.25, 1.4, 1.6, 1.8, 2.0, 2.25, 2.5)
BAND = (0.5, 2.0)
SHORT = (0.3, 0.6)
MESHES = ((40, 8), (80, 16))
HULLS = (
    # key, name, (L, B, T), modified form, rho, kyy
    ("T", "T (tank, modified Wigley, L/B 6.67)", (2.0, 0.3, 0.125), True, 1000.0, 0.248),
    ("M", "M (4 m monohull, Wigley, L/B 10)", (4.0, 0.4, 0.274390243902439), False, 1025.0, 0.25),
)


def pr(*a):
    print(*a)
    sys.stdout.flush()


def trap(xs, ys):
    return sum(0.5 * (ys[i] + ys[i + 1]) * (xs[i + 1] - xs[i]) for i in range(len(xs) - 1))


def area(rows, key, lo, hi):
    sel = [r for r in rows if lo - 1e-9 <= r["lam"] <= hi + 1e-9]
    return trap([r["lam"] for r in sel], [r[key] for r in sel])


def code_check():
    pr("\n== Q0 code check: fixed vertical cylinder, radius a 1 m, draft 4a, waves along -x, deep water ==")
    pr("exact: MacCamy-Fuchs series, near-field mean force over the infinite-draft wall (marine_hull.maruo)")
    pr(f"{'ka':>4} {'exact':>7} {'panel 48x16':>11} {'panel 96x32':>11} {'fine/exact':>10}")
    worst = 0.0
    for ka in (1.0, 2.0, 4.0):
        ex = mr.cylinder_drift_exact(ka)
        c = mr.cylinder_drift_panel(1.0, 4.0, ka, n_theta=48, n_z=16)
        f = mr.cylinder_drift_panel(1.0, 4.0, ka, n_theta=96, n_z=32)
        worst = max(worst, abs(f / ex - 1))
        pr(f"{ka:4.1f} {ex:7.4f} {c:11.4f} {f:11.4f} {f / ex:10.4f}")
    pr(f"large-ka limit 2/3; exact at ka 30: {mr.cylinder_drift_exact(30.0):.4f}")
    pr(f"Q0: largest |fine/exact - 1| {worst:.4f} -> {'held' if worst < 0.03 else 'refuted'} (< 0.03)")
    return worst


def hull_rows(key, name, dims, modified, rho, kyy):
    l, b, t = dims
    h = st.ModifiedWigleyStrip(*dims, kyy=kyy, rho=rho) if modified else st.WigleyStrip(*dims, kyy=kyy, rho=rho)
    c33, c55 = h.restoring()
    slope = rf.modified_wigley_slope(l, b) if modified else rf.wigley_slope(l, b)
    integral = rf.waterline_integral(slope, l)
    norm = rho * G * b * b / l
    pr(f"\n== {name}: L {l} m, B {b} m, T {t:.4f} m, rho {rho}, kyy {kyy} L; mass {h.mass:.2f} kg, "
       f"Iyy {h.iyy:.3f} kg m2, C33 {c33:.1f} N/m, C55 {c55:.1f} N m; waterline integral I/B {integral / b:.4f}; "
       f"sigma = R_aw / (rho g zeta^2 B^2 / L) ==")
    out = {}
    for nx, nz in MESHES:
        mh = mr.MaruoHull(*dims, rho=rho, nx=nx, nz=nz, modified=modified)
        rows = []
        for lam in LAMS:
            w = math.sqrt(2.0 * math.pi * G / (lam * l))
            sol = mh.solve(w)
            x3 = pn.rao(None, h.mass, c33, w, sol["F3"], sol["A33"], sol["B33"])
            x5 = pn.rao(None, h.iyy, c55, w, sol["F5"], sol["A55"], sol["B55"])
            zs, ts, _, _ = h.response(w, 0.0)
            zp, tp = pn.to_strip(x3, x5)
            refl = rf.rao(w, 0.0, integral, t, rho=rho)
            rows.append({
                "lam": lam, "w": w,
                "fixed": mh.added_resistance(sol) / norm,
                "free": mh.added_resistance(sol, x3, x5) / norm,
                "gb_s": pn.gb_added_resistance(h, w, zs, ts) / norm,
                "gb_p": pn.gb_added_resistance(h, w, zp, tp) / norm,
                "falt": refl / norm,
                "e_fixed": mh.energy_identity(sol),
                "e_free": mh.energy_identity(sol, x3, x5),
                "e_2x": mh.energy_identity(sol, 2 * x3, 2 * x5),
                "z": abs(x3), "t": abs(x5) / (w * w / G),
            })
        out[(nx, nz)] = (mh.n_panels, rows)
    return out


def report(key, name, meshes, summary):
    (nc, coarse), (nf, fine) = meshes[MESHES[0]], meshes[MESHES[1]]
    pr(f"\n-- {name}: fine mesh {MESHES[1][0]}x{MESHES[1][1]} per half ({nf} hull panels, both halves solved) --")
    pr(f"{'lam/L':>6} {'omega':>6} {'|z|':>6} {'|t|/k':>6} {'Maruo fix':>9} {'Maruo free':>10} {'GB strip':>9} "
       f"{'GB panel':>9} {'Falt U0':>8} {'GB+Falt':>8} {'GBs/free':>8} {'E fix':>6} {'E free':>6} {'E 2X':>6}")
    for r in fine:
        r["gbf"] = r["gb_s"] + r["falt"]
        rat = r["gb_s"] / r["free"] if r["free"] > 1e-9 else float("nan")
        pr(f"{r['lam']:6.2f} {r['w']:6.3f} {r['z']:6.3f} {r['t']:6.3f} {r['fixed']:9.4f} {r['free']:10.4f} "
           f"{r['gb_s']:9.4f} {r['gb_p']:9.4f} {r['falt']:8.4f} {r['gbf']:8.4f} {rat:8.3f} "
           f"{r['e_fixed']:6.3f} {r['e_free']:6.3f} {r['e_2x']:6.3f}")
    for r in coarse:
        r["gbf"] = r["gb_s"] + r["falt"]
    e_worst = max(max(abs(r["e_fixed"] - 1), abs(r["e_free"] - 1)) for r in fine)
    e_2x = min(abs(r["e_2x"] - 1) for r in fine)
    pr(f"energy identity (1 = conserved): largest |E - 1| restrained or free {e_worst:.4f}; with doubled motions the "
       f"smallest |E - 1| is {e_2x:.3f} (the check can fail)")
    conv = abs(area(coarse, "free", *BAND) / area(fine, "free", *BAND) - 1)
    pr(f"mesh: coarse ({nc}) / fine ({nf}) free Maruo area on lambda/L 0.5-2.0 differs by {conv * 100:.2f}%; "
       f"restrained {abs(area(coarse, 'fixed', *BAND) / area(fine, 'fixed', *BAND) - 1) * 100:.2f}%")
    a = {k: area(fine, k, *BAND) for k in ("fixed", "free", "gb_s", "gb_p", "gbf")}
    s = {k: area(fine, k, *SHORT) for k in ("fixed", "free", "gb_s", "gbf", "falt")}
    pr("areas on lambda/L 0.5-2.0: " + ", ".join(f"{k} {v:.4f}" for k, v in a.items()))
    pr(f"ratios on 0.5-2.0: GB strip / Maruo free {a['gb_s'] / a['free']:.3f}; GB panel motions / Maruo free "
       f"{a['gb_p'] / a['free']:.3f}; GB + Faltinsen / Maruo free {a['gbf'] / a['free']:.3f}; "
       f"coarse mesh GB strip / Maruo free {area(coarse, 'gb_s', *BAND) / area(coarse, 'free', *BAND):.3f}")
    pr(f"ratios on 0.3-0.6: GB strip / Maruo free {s['gb_s'] / s['free']:.3f}; GB + Faltinsen / Maruo free "
       f"{s['gbf'] / s['free']:.3f}; Maruo restrained / Maruo free {s['fixed'] / s['free']:.3f}")
    pk_free = max(fine, key=lambda r: r["free"])
    pk_gb = max(fine, key=lambda r: r["gb_s"])
    pr(f"peaks: Maruo free {pk_free['free']:.3f} at lambda/L {pk_free['lam']}; GB strip {pk_gb['gb_s']:.3f} at "
       f"{pk_gb['lam']} (ratio {pk_gb['gb_s'] / pk_free['free']:.3f})")
    r03, r25 = fine[0], fine[-1]
    pr(f"lambda/L 0.3: Maruo restrained {r03['fixed']:.4f}, Faltinsen U0 {r03['falt']:.4f} "
       f"(ratio {r03['fixed'] / r03['falt']:.3f}); lambda/L 2.5: free / restrained {r25['free'] / r25['fixed']:.4f}")
    summary[key] = dict(e=e_worst, conv=conv, long=r25["free"] / r25["fixed"], q4=a["gb_s"] / a["free"],
                        q6=s["gbf"] / s["free"], q7=r03["fixed"] / r03["falt"])


def main():
    t0 = time.time()
    pr("Milestone 7zm: Gerritsma-Beukelman (strip sections) against Maruo's far-field formula (Capytaine), "
       "zero speed, head waves")
    import capytaine
    capytaine.set_logging("ERROR")
    pr(f"capytaine {capytaine.__version__}; compute_kochin + far_field_mean_drift_force as shipped; indirect method; "
       f"full meshes with a waterplane lid; theta 0-2 pi, 721 points; heave and pitch free, surge restrained")
    q0 = code_check()
    summary = {}
    for key, name, dims, modified, rho, kyy in HULLS:
        report(key, name, hull_rows(key, name, dims, modified, rho, kyy), summary)
    t, m = summary["T"], summary["M"]
    ok = lambda c: "held" if c else "refuted"
    pr("\n== expectations ==")
    pr(f"Q0 cylinder worst {q0:.4f} -> {ok(q0 < 0.03)}")
    pr(f"Q1 energy identity worst T {t['e']:.4f}, M {m['e']:.4f} -> {ok(max(t['e'], m['e']) < 0.02)} (< 0.02)")
    pr(f"Q2 mesh change T {t['conv'] * 100:.2f}%, M {m['conv'] * 100:.2f}% -> {ok(max(t['conv'], m['conv']) < 0.03)}")
    pr(f"Q3 free/restrained at 2.5: T {t['long']:.4f}, M {m['long']:.4f} -> {ok(max(t['long'], m['long']) < 0.05)}")
    pr(f"Q4 GB strip / Maruo free on 0.5-2.0: T {t['q4']:.3f}, M {m['q4']:.3f} -> {ok(min(t['q4'], m['q4']) > 1.5)}")
    q5 = m["q4"] / t["q4"]
    pr(f"Q5 monohull / tank Q4 ratio {q5:.3f} -> {ok(0.7 <= q5 <= 1.3)} (0.7-1.3)")
    pr(f"Q6 GB+Faltinsen / Maruo free on 0.3-0.6: T {t['q6']:.3f}, M {m['q6']:.3f} -> {ok(min(t['q6'], m['q6']) > 1.5)}")
    pr(f"Q7 restrained Maruo / Faltinsen U0 at 0.3: T {t['q7']:.3f}, M {m['q7']:.3f} -> "
       f"{ok(all(1.5 <= v <= 4 for v in (t['q7'], m['q7'])))} (1.5-4)")
    pr(f"\nrun time {time.time() - t0:.0f} s")


if __name__ == "__main__":
    main()
