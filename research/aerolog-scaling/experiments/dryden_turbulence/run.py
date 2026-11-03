"""Milestone 9s: rms response of the Froude model to continuous Dryden vertical turbulence, similar and non-similar.

    python3 experiments/dryden_turbulence/run.py > experiments/dryden_turbulence/results.txt

Reuses experiments/gust_response/run.py (its source, minus the final main() call): same four-state model, polars and
power-matched grid. Input alpha_g = w_g / V with Dryden vertical PSD (per unit spatial frequency Omega = omega / V)
    Phi(Omega) = sigma^2 L / pi * (1 + 3 (L Omega)^2) / (1 + (L Omega)^2)^2,
L = l_chords full-size chords (times n for the model), sigma_w / V equal at every scale (Froude-invariant).
Outputs: rms load-factor increment, rms pitch rate q sqrt(L/g), rms pitch attitude, from the exact frequency
response of the linear model. Deterministic; reported as percent difference from n = 1. Only ratios are meaningful.
"""
import pathlib
import numpy as np

HERE = pathlib.Path(__file__).resolve().parent
src = (HERE.parent / "gust_response" / "run.py").read_text().rsplit("\nmain()", 1)[0]
exec(compile(src, "gust_response", "exec"))  # defines modes, cd_at, polar, constants (sys.path insert uses cwd: run from the project root)

LS = (25, 62.5, 125)  # Dryden L in full-size chords


def rms(r, l_chords, c_full):
    A, v = r["A"], r["v"]
    b = A[:, 1].copy()
    n = r["l_f"] / B_FULL
    L = l_chords * c_full * n
    k_n = r["q"] * r["s_w"] / (r["m"] * G)
    sc = np.sqrt(r["l_f"] / G)
    # spectrum in omega: Phi_w(omega) = Phi(Omega) / V ; sigma_alpha = 1 (ratios only)
    w = np.logspace(-4, 3, 6000) / sc * 1.0  # rad/s, spans the Froude-nondimensional range 1e-4 .. 1e3
    Om = w / v
    phi = (L / np.pi) * (1 + 3 * (L * Om) ** 2) / (1 + (L * Om) ** 2) ** 2 / v
    I4 = np.eye(4)
    out = np.zeros(3)
    H = np.array([np.linalg.solve(1j * wi * I4 - A, b) for wi in w])  # state response to alpha_g
    dn = k_n * r["cla"] * (H[:, 1] + 1.0)
    for i, h in enumerate((dn, H[:, 2] * sc, H[:, 3])):
        out[i] = np.sqrt(np.trapezoid(np.abs(h) ** 2 * phi, w))
    return out


def main():
    full = airframe(M_FULL, B_FULL, AR0, CL0, 1.25, 2.1, E)
    ref_af = asb.Airfoil("naca4412")
    ref_pw = (cd_at(ref_af, full["re"], CL0) + CL0 ** 2 / (np.pi * E * AR0)) / CL0
    v_model = full["v"] * N ** 0.5
    s_sim = full["s_ref"] * N ** 2
    c_full = np.sqrt(full["s_ref"] / AR0)
    ref = modes(ref_af, 1.0, AR0, 1.0, CL0)
    sim = modes(ref_af, 1.0, AR0, N, CL0)
    print("Dryden vertical turbulence, L in full-size chords (scaled by n for the model); rms as percent difference from n = 1")
    cases = []
    for name in ("naca4412", "naca5406"):
        af = asb.Airfoil(name)
        for k in KS:
            for ar in ARS:
                s_w = k * s_sim
                re = RHO * v_model * (s_w / np.sqrt(ar * s_w)) / MU
                cl = CL0 / k
                cd = cd_at(af, re, cl)
                if np.isnan(cd):
                    continue
                pr = ((cd + cl ** 2 / (np.pi * E * ar)) / cl) / ref_pw
                if abs(pr - 1) > 0.05:
                    continue
                r = modes(af, k, ar, N, cl)
                if r["ok"]:
                    cases.append((name, k, ar, r))
    worst = {c[:3]: 0.0 for c in cases}
    for lc in LS:
        base = rms(ref, lc, c_full)
        print(f"\nL = {lc} chords. reference n=1: rms dn {base[0]:.4f}, q sqrt(L/g) {base[1]:.4f}, theta {base[2]:.4f} (per unit rms alpha_g)")
        s = rms(sim, lc, c_full)
        d = [100 * (a / b - 1) for a, b in zip(s, base)]
        print(f"  similar n=0.2 (4412, k 1, AR 10): d(dn) {d[0]:6.1f}%  d(q) {d[1]:6.1f}%  d(theta) {d[2]:6.1f}%")
        rows = []
        for name, k, ar, r in cases:
            g = rms(r, lc, c_full)
            dd = [100 * (a / b - 1) for a, b in zip(g, base)]
            rows.append((name, k, ar, dd))
            worst[(name, k, ar)] = max(worst[(name, k, ar)], max(abs(y) for y in dd))
        for name, k, ar, dd in sorted(rows, key=lambda x: max(abs(y) for y in x[3]))[:3]:
            print(f"  best  {name:>9} k {k:4.2f} AR {ar:2d}: d(dn) {dd[0]:6.1f}%  d(q) {dd[1]:6.1f}%  d(theta) {dd[2]:6.1f}%")
        print(f"  {len(rows)} power-matched cases: worst of three within 5%: {sum(max(abs(y) for y in x[3]) <= 5 for x in rows)}; within 10%: {sum(max(abs(y) for y in x[3]) <= 10 for x in rows)}")
    ok10 = sum(v <= 10 for v in worst.values())
    ok5 = sum(v <= 5 for v in worst.values())
    bk = min(worst, key=worst.get)
    print(f"\nacross all three L: cases within 5% on all metrics: {ok5} of {len(worst)}; within 10%: {ok10}; best worst-case {worst[bk]:.1f}% ({bk})")


main()
