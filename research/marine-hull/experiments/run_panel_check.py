"""Milestone 7zl: the in-house strip theory against a 3D panel code (Capytaine) at zero speed.

    PYTHONPATH=src:experiments python3 experiments/run_panel_check.py > experiments/results_panel_check.txt

Needs `capytaine` (pip; `python3 platform/ci/pyenv.py capytaine numpy` from the repo root). Three hulls:
S, an L/B 30 Wigley where strip theory should be near exact (code check); T, Kashiwagi's modified Wigley tank
hull (L/B 6.67); M, the programme's 4 m Wigley monohull (L/B 10). For T and M, over lambda/L 0.4 to 2.5:
heave and pitch added mass and damping, head-wave heave force and pitch moment, heave and pitch RAOs with the
same mass, inertia and restoring (strip's) and no viscous damping, and the Gerritsma-Beukelman added
resistance on the strip sections with each code's motions. Two panel meshes for convergence.

Expectations (committed to LOG.md before the first run, 9faf2f9a5): P0 hull S strip A33, B33 within 5% of
panel at nu T 0.5, 1, 2; P1 fine mesh moves the panel coefficient areas by < 2%; P2 strip A33 above panel at
lambda/L >= 1.5 and the strip/panel A33 area ratio on 0.5-2.0 in 1.0-1.2, both hulls; P3 strip B33 above panel
at lambda/L >= 1.5; P4 |F3| strip within 10% of panel over the band; P5 heave RAO peak within 15%, pitch RAO
area within 10%; P6 GB area with panel motions 0.8-1.2 of strip motions; P7 the monohull closer to 1 than the
tank hull in P2 and P6.
"""
import math
import sys
import time

from marine_hull import panel as pn
from marine_hull import strip as st

G = st.G
LAMS = (0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.25, 1.4, 1.6, 1.8, 2.0, 2.25, 2.5)
BAND = (0.5, 2.0)
MESHES = ((40, 8), (80, 16))
HULLS = (
    # name, (L, B, T), modified form, rho, kyy
    ("T (tank, modified Wigley, L/B 6.67)", (2.0, 0.3, 0.125), True, 1000.0, 0.248),
    ("M (4 m monohull, Wigley, L/B 10)", (4.0, 0.4, 0.274390243902439), False, 1025.0, 0.25),
)


def pr(*a):
    print(*a)
    sys.stdout.flush()


def trap(xs, ys):
    return sum(0.5 * (ys[i] + ys[i + 1]) * (xs[i + 1] - xs[i]) for i in range(len(xs) - 1))


def band_ratio(rows, f, g, lo=BAND[0], hi=BAND[1]):
    sel = [r for r in rows if lo - 1e-9 <= r["lam"] <= hi + 1e-9]
    xs = [r["lam"] for r in sel]
    return trap(xs, [f(r) for r in sel]) / trap(xs, [g(r) for r in sel])


def strip_hull(dims, modified, rho, kyy):
    if modified:
        return st.ModifiedWigleyStrip(*dims, kyy=kyy, rho=rho)
    return st.WigleyStrip(*dims, kyy=kyy, rho=rho)


def code_check():
    """Hull S: L/B 30, B/T 2.4 Wigley; strip and panel A33, B33 at nu T 0.5, 1, 2."""
    l, b = 6.0, 0.2
    t = b / 2.4
    h = st.WigleyStrip(l, b, t)
    pr(f"\n== P0 code check: hull S, Wigley L {l} m, B {b} m, T {t:.4f} m (L/B 30, B/T 2.4), sea water ==")
    pr(f"{'nu T':>6} {'mesh':>7} {'panels':>6} {'A33 strip':>10} {'A33 panel':>10} {'ratio':>6} "
       f"{'B33 strip':>10} {'B33 panel':>10} {'ratio':>6}")
    worst = 0.0
    for nx, nz in ((60, 8), (120, 12)):
        p = pn.PanelHull(l, b, t, rho=st.RHO, nx=nx, nz=nz)
        for nut in (0.5, 1.0, 2.0):
            w = math.sqrt(nut * G / t)
            s, q = pn.strip_zero_speed(h, w), p.at(w)
            ra, rb = s["A33"] / q["A33"], s["B33"] / q["B33"]
            if nx == 120:
                worst = max(worst, abs(ra - 1), abs(rb - 1))
            pr(f"{nut:6.2f} {nx:>3}x{nz:<3} {p.n_panels:6d} {s['A33']:10.3f} {q['A33']:10.3f} {ra:6.3f} "
               f"{s['B33']:10.3f} {q['B33']:10.3f} {rb:6.3f}")
    pr(f"P0: largest |strip/panel - 1| on the fine mesh {worst:.3f} -> {'held' if worst < 0.05 else 'refuted'} (< 0.05)")


def hull_rows(name, dims, modified, rho, kyy):
    h = strip_hull(dims, modified, rho, kyy)
    c33, c55 = h.restoring()
    l = dims[0]
    pr(f"\n== {name}: L {dims[0]} m, B {dims[1]} m, T {dims[2]:.4f} m, rho {rho}, kyy {kyy} L; strip: "
       f"{len(h.x)} stations; mass {h.mass:.2f} kg, Iyy {h.iyy:.3f} kg m2, C33 {c33:.1f} N/m, C55 {c55:.1f} N m ==")
    meshes = {}
    for nx, nz in MESHES:
        p = pn.PanelHull(*dims, rho=rho, nx=nx, nz=nz, modified=modified)
        rows = []
        for lam in LAMS:
            w = math.sqrt(2.0 * math.pi * G / (lam * l))
            k = w * w / G
            s, q = pn.strip_zero_speed(h, w), p.at(w)
            zs, ts, raws, _ = h.response(w, 0.0)
            x3 = pn.rao(None, h.mass, c33, w, q["F3"], q["A33"], q["B33"])
            x5 = pn.rao(None, h.iyy, c55, w, q["F5"], q["A55"], q["B55"])
            zp, tp = pn.to_strip(x3, x5)
            rows.append({"lam": lam, "w": w, "k": k, "s": s, "q": q, "zs": zs, "ts": ts, "zp": zp, "tp": tp,
                         "gb_s": pn.gb_added_resistance(h, w, zs, ts), "gb_p": pn.gb_added_resistance(h, w, zp, tp),
                         "gb_resp": raws})
        meshes[(nx, nz)] = (p.n_panels, rows)
    return h, meshes


def report(name, h, meshes, summary):
    (nc, coarse), (nf, fine) = meshes[MESHES[0]], meshes[MESHES[1]]
    pr(f"\n-- {name}: fine mesh {MESHES[1][0]}x{MESHES[1][1]} per half ({nf} hull panels), pointwise strip/panel --")
    pr(f"{'lam/L':>6} {'omega':>6} {'A33':>6} {'B33':>6} {'A55':>6} {'B55':>6} {'|F3|':>6} {'|F5|':>6} "
       f"{'|z|s':>6} {'|z|p':>6} {'|t|/k s':>7} {'|t|/k p':>7} {'GB s':>8} {'GB p':>8}")
    for r in fine:
        s, q = r["s"], r["q"]
        pr(f"{r['lam']:6.2f} {r['w']:6.3f} {s['A33'] / q['A33']:6.3f} {s['B33'] / q['B33']:6.3f} "
           f"{s['A55'] / q['A55']:6.3f} {s['B55'] / q['B55']:6.3f} {abs(s['F3']) / abs(q['F3']):6.3f} "
           f"{abs(s['F5']) / abs(q['F5']):6.3f} {abs(r['zs']):6.3f} {abs(r['zp']):6.3f} "
           f"{abs(r['ts']) / r['k']:7.3f} {abs(r['tp']) / r['k']:7.3f} {r['gb_s']:8.2f} {r['gb_p']:8.2f}")
    # consistency of the strip helpers with strip.py's own response
    dz = max(abs(r["gb_s"] - r["gb_resp"]) / max(abs(r["gb_resp"]), 1e-12) for r in fine)
    pr(f"check: GB with strip motions vs WigleyStrip.response at U 0, largest relative difference {dz:.2e}")
    # P1 mesh convergence
    keys = ("A33", "B33", "A55", "B55")
    conv = {}
    for key in keys:
        a = band_ratio(coarse, lambda r: r["q"][key], lambda r: 1.0)
        b = band_ratio(fine, lambda r: r["q"][key], lambda r: 1.0)
        conv[key] = abs(a / b - 1)
    pr("P1 mesh: coarse/fine panel area change on lambda/L 0.5-2.0: " +
       ", ".join(f"{k} {v * 100:.2f}%" for k, v in conv.items()) + f" ({nc} -> {nf} panels)")
    ratios = {}
    for key in keys:
        ratios[key] = band_ratio(fine, lambda r: r["s"][key], lambda r: r["q"][key])
    ratios["F3"] = band_ratio(fine, lambda r: abs(r["s"]["F3"]), lambda r: abs(r["q"]["F3"]))
    ratios["F5"] = band_ratio(fine, lambda r: abs(r["s"]["F5"]), lambda r: abs(r["q"]["F5"]))
    pr("strip/panel area ratios on lambda/L 0.5-2.0: " + ", ".join(f"{k} {v:.3f}" for k, v in ratios.items()))
    long_a = [r["s"]["A33"] / r["q"]["A33"] for r in fine if r["lam"] >= 1.5]
    long_b = [r["s"]["B33"] / r["q"]["B33"] for r in fine if r["lam"] >= 1.5]
    pr(f"lambda/L >= 1.5: strip/panel A33 {min(long_a):.3f} to {max(long_a):.3f}; B33 {min(long_b):.3f} to {max(long_b):.3f}")
    f3 = [abs(r["s"]["F3"]) / abs(r["q"]["F3"]) for r in fine if BAND[0] - 1e-9 <= r["lam"] <= BAND[1] + 1e-9]
    pk_s = max(abs(r["zs"]) for r in fine)
    pk_p = max(abs(r["zp"]) for r in fine)
    lam_s = max(fine, key=lambda r: abs(r["zs"]))["lam"]
    lam_p = max(fine, key=lambda r: abs(r["zp"]))["lam"]
    pitch = band_ratio(fine, lambda r: abs(r["ts"]) / r["k"], lambda r: abs(r["tp"]) / r["k"])
    heave = band_ratio(fine, lambda r: abs(r["zs"]), lambda r: abs(r["zp"]))
    gb = band_ratio(fine, lambda r: r["gb_p"], lambda r: r["gb_s"])
    gb_c = band_ratio(coarse, lambda r: r["gb_p"], lambda r: r["gb_s"])
    pr(f"|F3| strip/panel pointwise on the band: {min(f3):.3f} to {max(f3):.3f}")
    pr(f"heave RAO peak: strip {pk_s:.3f} at lambda/L {lam_s}, panel {pk_p:.3f} at {lam_p} (ratio {pk_s / pk_p:.3f}); "
       f"heave RAO area ratio {heave:.3f}; pitch RAO area ratio {pitch:.3f}")
    pr(f"GB added resistance area, panel motions / strip motions: {gb:.3f} (coarse mesh {gb_c:.3f})")
    summary[name] = dict(conv=max(conv.values()), a33=ratios["A33"], long_a=(min(long_a), max(long_a)),
                         long_b=(min(long_b), max(long_b)), f3=(min(f3), max(f3)), peak=pk_s / pk_p,
                         pitch=pitch, gb=gb, ratios=ratios)


def main():
    t0 = time.time()
    pr("Milestone 7zl: strip theory (strip.py) against Capytaine 3D panels, zero speed, head waves")
    import capytaine
    capytaine.set_logging("ERROR")      # mesh-quality notes (non-coplanar quads, panel size) are judged by P0 and P1
    pr(f"capytaine {capytaine.__version__}; panels: quads cosine-spaced in x and z, one half mirrored, waterplane lid")
    code_check()
    summary = {}
    for name, dims, modified, rho, kyy in HULLS:
        h, meshes = hull_rows(name, dims, modified, rho, kyy)
        report(name, h, meshes, summary)
    pr("\n== expectations ==")
    (nt, t), (nm, m) = list(summary.items())
    ok = lambda c: "held" if c else "refuted"
    pr(f"P1 largest mesh change {max(t['conv'], m['conv']) * 100:.2f}% -> {ok(max(t['conv'], m['conv']) < 0.02)} (< 2%)")
    p2 = all(v["long_a"][0] > 1.0 and 1.0 <= v["a33"] <= 1.2 for v in (t, m))
    pr(f"P2 A33 area ratio T {t['a33']:.3f}, M {m['a33']:.3f}; long-wave min T {t['long_a'][0]:.3f}, "
       f"M {m['long_a'][0]:.3f} -> {ok(p2)}")
    p3 = all(v["long_b"][0] > 1.0 for v in (t, m))
    pr(f"P3 long-wave B33 ratio min T {t['long_b'][0]:.3f}, M {m['long_b'][0]:.3f} -> {ok(p3)}")
    p4 = all(0.9 <= v["f3"][0] and v["f3"][1] <= 1.1 for v in (t, m))
    pr(f"P4 |F3| ratio T {t['f3'][0]:.3f}-{t['f3'][1]:.3f}, M {m['f3'][0]:.3f}-{m['f3'][1]:.3f} -> {ok(p4)}")
    p5 = all(abs(v["peak"] - 1) <= 0.15 and abs(v["pitch"] - 1) <= 0.10 for v in (t, m))
    pr(f"P5 heave peak ratio T {t['peak']:.3f}, M {m['peak']:.3f}; pitch area ratio T {t['pitch']:.3f}, "
       f"M {m['pitch']:.3f} -> {ok(p5)}")
    p6 = all(0.8 <= v["gb"] <= 1.2 for v in (t, m))
    pr(f"P6 GB area panel/strip motions T {t['gb']:.3f}, M {m['gb']:.3f} -> {ok(p6)}")
    p7 = abs(m["a33"] - 1) < abs(t["a33"] - 1) and abs(m["gb"] - 1) < abs(t["gb"] - 1)
    pr(f"P7 monohull closer to 1 in A33 ({abs(m['a33'] - 1):.3f} vs {abs(t['a33'] - 1):.3f}) and GB "
       f"({abs(m['gb'] - 1):.3f} vs {abs(t['gb'] - 1):.3f}) -> {ok(p7)}")
    pr(f"\nrun time {time.time() - t0:.0f} s")


if __name__ == "__main__":
    main()
