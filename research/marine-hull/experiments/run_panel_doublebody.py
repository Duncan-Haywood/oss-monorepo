"""Milestone 7zo: does linearising about the double-body flow (not the uniform stream) fix the forward-speed panel
model's heave force due to pitch, and with it the tank and Journee gaps of 7zn?

    PYTHONPATH=src:experiments python3 experiments/run_panel_doublebody.py > experiments/results_panel_doublebody.txt

Needs `capytaine` and `numpy`. Same model as 7zn (`run_panel_speed.py`: Capytaine's zero-speed free-surface Green
function at the encounter frequency) with the steady flow W taken as the double-body flow past the hull
(`doublebody.PanelHullDoubleBody`): Ogilvie-Tuck/Newman m-terms -(n . grad) W and -(n . grad)(r x W) in the radiation
condition, rho (i omega_e phi - W . grad phi) in the pressure, the steady disturbance term on the incident-wave pressure.
The m-terms come from on-surface velocities only, G n - n tr(G) with G the surface gradient of W.

Sections: (D0) the m-term formula on a hemisphere (sphere in the double body) against the exact flow; (D1) the class
in "uniform" mode against Capytaine's own forward-speed option; (D2) mesh; then 7zn's sections A (cross-coupling
against Kashiwagi's measured data), B and C (tank motions and added resistance), D (Journee L/B 10) and E (monohull),
by swapping the hull class into `run_panel_speed`.

Expectations committed to LOG.md before the full run (H1..H6 and the code checks there).
"""
import math
import time

import numpy as np

from marine_hull import doublebody as db
from marine_hull import panel as pn
from marine_hull import strip as st
import run_kashiwagi_baselines as kb
import run_panel_speed as rps

G = st.G
L, B, D, RHO, FN = rps.L, rps.B, rps.D, rps.RHO, rps.FN
pr = rps.pr
# 7zn's panel (uniform-stream) and strip values, from experiments/results_panel_speed.txt, for the comparison lines
ZN = dict(B35=0.142, A35=0.060, A53=0.040, B53=0.043, heave_mid=0.360, area=1.222, jI=0.821, jIII=0.849,
          heave03=2.260, loss=3.80)
STRIP = dict(B35=0.053, A35=0.031, A53=0.047, B53=0.050, jI=0.700, jIII=0.783)


def sphere_check():
    pr("== D0 m-terms on a hemisphere (double body: sphere radius 1, stream -1) against the exact flow ==")

    def w_exact(p):
        x, y, z = p.T
        r2 = (p ** 2).sum(1)
        r3, r5 = r2 ** 1.5, r2 ** 2.5
        return np.stack([-(1 + 1 / (2 * r3)) + 1.5 * x * x / r5, 1.5 * x * y / r5, 1.5 * x * z / r5], 1)

    out = []
    for nu, nv in ((20, 6), (40, 10), (60, 16)):
        half = db.structured_half_mesh(db.hemisphere_surface(1.0), nu, nv)
        _, w = db.double_body_velocity(half, 1.0)
        nh = half.nb_faces
        c, n = half.faces_centers, half.faces_normals
        we = w_exact(c)
        dne = (w_exact(c + 1e-6 * n) - w_exact(c - 1e-6 * n)) / 2e-6
        m3, m5 = db.m_terms(c, n, w[:nh], db.normal_derivative(c, n, w[:nh], nu, nv))
        m3e, m5e = db.m_terms(c, n, we, dne)
        rel = lambda e, r: float(np.sqrt(np.mean(e ** 2)) / np.sqrt(np.mean(r ** 2)))
        e3, e5 = rel(m3 - m3e, m3e), float(np.sqrt(np.mean((m5 - m5e) ** 2)))
        ew = rel(w[:nh] - we, we)
        out.append((2 * nh, e3, e5))
        pr(f"  {2 * nh} panels: W rms rel error {ew:.4f}; m_heave rms rel error {e3:.4f}; m_pitch rms abs error "
           f"{e5:.4f} U/a (exact m_pitch rms {float(np.sqrt(np.mean(m5e ** 2))):.4f}, zero by symmetry up to the "
           f"panel-centre offset)")
    return out


def uniform_check():
    pr("== D1 'uniform' mode against Capytaine's forward-speed option, tank hull Fn 0.2 ==")
    u = FN * math.sqrt(G * L)
    h = db.PanelHullDoubleBody(L, B, D, rho=RHO, modified=True, mode="uniform")
    worst = 0.0
    for lam in (0.6, 1.1, 2.0):
        w = rps.omega_of(lam, L)
        q, q0 = h.at_speed(w, u), h.speed_twin.at_speed(w, u)
        scale_a = max(abs(q0["A"][i][j]) for i in range(2) for j in range(2))
        scale_b = max(abs(q0["B"][i][j]) for i in range(2) for j in range(2))
        d = max([abs(q["A"][i][j] - q0["A"][i][j]) / scale_a for i in range(2) for j in range(2)] +
                [abs(q["B"][i][j] - q0["B"][i][j]) / scale_b for i in range(2) for j in range(2)] +
                [abs(q["F3"] - q0["F3"]) / abs(q0["F3"]), abs(q["F5"] - q0["F5"]) / abs(q0["F5"])])
        worst = max(worst, d)
    pr(f"largest difference in A, B (over each matrix's largest entry), F3, F5 at lambda/L 0.6, 1.1, 2.0: {worst:.1e}")
    return worst


def mesh_check(u):
    pr("== D2 mesh: 40x8 vs 80x16 per half (double-body model), tank hull Fn 0.2 ==")
    nd_b = RHO * st.ModifiedWigleyStrip(L, B, D).vol * L * math.sqrt(G / L)
    c = db.PanelHullDoubleBody(L, B, D, rho=RHO, modified=True)
    f = db.PanelHullDoubleBody(L, B, D, rho=RHO, modified=True, nx=80, nz=16)
    worst = 0.0
    for kl in (3, 10, 20):
        we = math.sqrt(kl * G / L)
        w = rps.omega_from_we(we, u)
        bc, bf = c.at_speed(w, u)["B"][0][1] / nd_b, f.at_speed(w, u)["B"][0][1] / nd_b
        worst = max(worst, abs(bc / bf - 1))
        pr(f"  KL {kl}: B35 {bc:+.4f} / {bf:+.4f} ({100 * (bc / bf - 1):+.2f}%)")
    pr(f"D2 largest B35 change {100 * worst:.2f}% ({c.n_panels} -> {f.n_panels} hull panels)")
    return worst, f


def main():
    t0 = time.time()
    import capytaine
    capytaine.set_logging("ERROR")
    pr("Milestone 7zo: the forward-speed panel model linearised about the double-body flow (Capytaine zero-speed "
       "Green function at omega_e; double-body m-terms and steady velocity in the pressure), head waves")
    pr(f"capytaine {capytaine.__version__}; quads cosine-spaced in x and z, one half mirrored, waterplane lid; "
       "40x8 per half unless stated")
    sph = sphere_check()
    d1 = uniform_check()
    u = FN * math.sqrt(G * L)
    d2, _ = mesh_check(u)

    pn.PanelHullSpeed = db.PanelHullDoubleBody        # rps uses pn.PanelHullSpeed for every hull it builds
    h = st.ModifiedWigleyStrip(L, B, D)
    h.set_viscous(0.0375, 0.0)
    pair = rps.Pair(h, db.PanelHullDoubleBody(L, B, D, rho=RHO, modified=True), u)
    pr(f"tank hull: modified Wigley L {L} B {B} d {D}, Fn {FN} (U {u:.3f} m/s), {pair.p.n_panels} hull panels")
    rel, gbd = rps.code_checks(pair)
    cp = rps.coupling(pair)
    tk = rps.tank(pair)
    h.set_viscous(0.0375, 0.0)
    jn = rps.journee()
    mo = rps.monohull()

    pr("\n== expectations (LOG.md, before the full run) ==")
    ok = lambda c: "held" if c else "refuted"
    pr(f"C0 sphere: m_heave error {sph[1][1]:.4f} < 0.03 at {sph[1][0]} panels and falling ({sph[0][1]:.4f} -> "
       f"{sph[2][1]:.4f}); m_pitch abs error {sph[1][2]:.4f} < 0.02 -> "
       f"{ok(sph[1][1] < 0.03 and sph[2][1] < sph[1][1] < sph[0][1] and sph[1][2] < 0.02)}")
    pr(f"C1 uniform mode {d1:.1e} < 1e-9 -> {ok(d1 < 1e-9)}")
    pr(f"C2 U->0 {rel:.1e} < 1e-4 and GB {gbd:.1e} < 1e-9 -> {ok(rel < 1e-4 and gbd < 1e-9)}")
    pr(f"C3 mesh B35 {100 * d2:.2f}% < 5% -> {ok(d2 < 0.05)}")
    b35 = cp["B35"]
    h1 = b35["panel"] < 0.10 and b35["panel"] >= STRIP["B35"] and abs(b35["med_p"] - b35["med_m"]) < abs(0.160 - b35["med_m"])
    pr(f"H1 B35 rms {b35['panel']:.4f} (7zn {ZN['B35']}, strip {STRIP['B35']}) in [strip, 0.10), median {b35['med_p']:+.4f} "
       f"closer to measured {b35['med_m']:+.4f} than 7zn's +0.160 -> {ok(h1)}")
    h2 = cp["A53"]["panel"] <= ZN["A53"] + 0.01 and cp["B53"]["panel"] <= ZN["B53"] + 0.01
    pr(f"H2 A53 {cp['A53']['panel']:.4f} (7zn {ZN['A53']}), B53 {cp['B53']['panel']:.4f} (7zn {ZN['B53']}) within +0.01; "
       f"A35 {cp['A35']['panel']:.4f} (7zn {ZN['A35']}) reported -> {ok(h2)}")
    hv = tk[("7zg", "heave")]
    pr(f"H3 tank mean heave error 1.0-1.3 {100 * hv['mid_p']:+.1f}% in (+10%, +30%) (7zn +36.0%, strip "
       f"{100 * hv['mid_s']:+.1f}%) -> {ok(0.10 < hv['mid_p'] < 0.30)}")
    sg = tk[("7zg", "sigma")]
    pr(f"H4 tank area over measured {sg['area_p']:.3f} in [0.95, 1.15] (7zn 1.222, strip {sg['area_s']:.3f}) -> "
       f"{ok(0.95 <= sg['area_p'] <= 1.15)}")
    h5 = all(STRIP["j" + n] < jn[n]["panel"] < ZN["j" + n] for n in ("I", "III"))
    pr(f"H5 Journee ratios I {jn['I']['panel']:.3f}, III {jn['III']['panel']:.3f} between strip ({STRIP['jI']}, "
       f"{STRIP['jIII']}) and 7zn ({ZN['jI']}, {ZN['jIII']}); heave at Fn 0.3 {jn['heave']['panel']:.3f} "
       f"(measured 2.52, 7zn {ZN['heave03']}) -> {ok(h5)}")
    h6 = 3.4 <= mo["loss"] <= 4.2 and mo["scope"]
    pr(f"H6 monohull 30 W loss {mo['loss']:.2f}% in the 3.4-4.2% bracket (7zn {ZN['loss']}%), motion-term ratio "
       f"{mo['ratio']:.3f}, scope {mo['scope']} -> {ok(h6)}")
    pr(f"\nrun time {time.time() - t0:.0f} s")


if __name__ == "__main__":
    main()
