"""Milestone 9t: a Froude model flown in real air. Dryden turbulence whose length does NOT scale with the model.

    python3 experiments/real_air_turbulence/run.py > experiments/real_air_turbulence/results.txt   (run from the project root)

9s scaled Dryden's L with n and held sigma_w / V equal at every scale, i.e. it assumed the air shrinks with the model.
Real air does not: L is the same number of metres for the aircraft and the model, so the model sees L / n chords, and
sigma_w is the same m/s while the model flies slower by sqrt(n), so sigma_w / V is larger by 1 / sqrt(n). Two separate effects:
  shape  : spectrum length L/(n c) instead of L/c   (ratio of rms response per unit rms alpha_g; reported as percent)
  level  : rms alpha_g larger by 1/sqrt(n) for the same sigma_w (a plain multiplier on every rms, applied at the end)
Reuses 9s / 9a (same model, polars, 17 power-matched cases). Deterministic. Only ratios are meaningful.
"""
import pathlib
import numpy as np

HERE = pathlib.Path(__file__).resolve().parent
src9s = (HERE.parent / "dryden_turbulence" / "run.py").read_text().rsplit("\nmain()", 1)[0]
ns = {"__file__": str(HERE.parent / "dryden_turbulence" / "run.py")}
exec(compile(src9s, "dryden_turbulence", "exec"), ns)  # also execs gust_response; needs cwd = project root
globals().update(ns)


def rms_real(r, l_chords, c_full):
    """As 9s `rms`, but L is the physical length l_chords * c_full for both aircraft (not multiplied by n)."""
    A, v = r["A"], r["v"]
    b = A[:, 1].copy()
    L = l_chords * c_full
    k_n = r["q"] * r["s_w"] / (r["m"] * G)
    sc = np.sqrt(r["l_f"] / G)
    w = np.logspace(-4, 3, 6000) / sc
    Om = w / v
    phi = (L / np.pi) * (1 + 3 * (L * Om) ** 2) / (1 + (L * Om) ** 2) ** 2 / v
    I4 = np.eye(4)
    H = np.array([np.linalg.solve(1j * wi * I4 - A, b) for wi in w])
    dn = k_n * r["cla"] * (H[:, 1] + 1.0)
    return np.array([np.sqrt(np.trapezoid(np.abs(h) ** 2 * phi, w)) for h in (dn, H[:, 2] * sc, H[:, 3])])


def main():
    full = airframe(M_FULL, B_FULL, AR0, CL0, 1.25, 2.1, E)
    ref_af = asb.Airfoil("naca4412")
    ref_pw = (cd_at(ref_af, full["re"], CL0) + CL0 ** 2 / (np.pi * E * AR0)) / CL0
    v_model = full["v"] * N ** 0.5
    s_sim = full["s_ref"] * N ** 2
    c_full = np.sqrt(full["s_ref"] / AR0)
    ref = modes(ref_af, 1.0, AR0, 1.0, CL0)
    sim = modes(ref_af, 1.0, AR0, N, CL0)
    level = 1 / np.sqrt(N)
    print(f"Real-air Dryden turbulence: L fixed in metres (full-size chords l; the model sees l/n chords); n = {N}")
    print(f"level factor for equal sigma_w (m/s): sigma_alpha(model)/sigma_alpha(full) = 1/sqrt(n) = {level:.3f}")
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
        base = rms_real(ref, lc, c_full)
        s = rms_real(sim, lc, c_full)
        d = [100 * (a / b - 1) for a, b in zip(s, base)]
        print(f"\nL = {lc} full-size chords (model sees {lc / N:.0f}). reference n=1 rms (dn, q sqrt(L/g), theta) per unit rms alpha_g: {base[0]:.4f} {base[1]:.4f} {base[2]:.4f}")
        print(f"  similar n=0.2, shape only:     d(dn) {d[0]:6.1f}%  d(q) {d[1]:6.1f}%  d(theta) {d[2]:6.1f}%")
        print(f"  similar n=0.2, same sigma_w:   d(dn) {100*((1+d[0]/100)*level-1):6.1f}%  d(q) {100*((1+d[1]/100)*level-1):6.1f}%  d(theta) {100*((1+d[2]/100)*level-1):6.1f}%")
        rows = []
        for name, k, ar, r in cases:
            g = rms_real(r, lc, c_full)
            dd = [100 * (a / b - 1) for a, b in zip(g, base)]
            rows.append((name, k, ar, dd))
            worst[(name, k, ar)] = max(worst[(name, k, ar)], max(abs(y) for y in dd))
        for name, k, ar, dd in sorted(rows, key=lambda x: max(abs(y) for y in x[3]))[:3]:
            print(f"  best  {name:>9} k {k:4.2f} AR {ar:2d}: d(dn) {dd[0]:6.1f}%  d(q) {dd[1]:6.1f}%  d(theta) {dd[2]:6.1f}%")
        print(f"  {len(rows)} power-matched cases (shape only): worst of three within 5%: {sum(max(abs(y) for y in x[3]) <= 5 for x in rows)}; within 10%: {sum(max(abs(y) for y in x[3]) <= 10 for x in rows)}")
    ok10 = sum(v <= 10 for v in worst.values())
    ok5 = sum(v <= 5 for v in worst.values())
    bk = min(worst, key=worst.get)
    print(f"\nacross all three L (shape only): cases within 5% on all metrics: {ok5} of {len(worst)}; within 10%: {ok10}; best worst-case {worst[bk]:.1f}% ({bk})")


main()
