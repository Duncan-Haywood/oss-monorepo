"""Milestone 7zm, post hoc (added after the main run, not in the plan): does wave interference between strips explain
why Gerritsma-Beukelman exceeds Maruo's far-field added resistance at zero speed?

    PYTHONPATH=src:experiments python3 experiments/run_maruo_posthoc.py > experiments/results_maruo_posthoc.txt

GB sums each strip's 2D radiated energy, b33(x) |V_z(x)|^2, as if the strips radiated independently. In 3D the waves
from different strips interfere in the far field. Treat each strip as a line source of far-field strength
q(x) = sqrt(b33(x)) V_z(x) (V_z the relative vertical velocity, with the incident-wave phase e^{ikx}); its 3D Kochin
function is Q(theta) = int q(x) e^{-i k x cos theta} dx, and the radiated energy is (k / 4 pi) int |Q|^2 dtheta, which
tends to int |q|^2 dx (GB's incoherent sum) when k L is large and q varies slowly (stationary phase at theta = +-pi/2).
So the coherence factor C = (k / 4 pi) int |Q|^2 dtheta / int |q|^2 dx says how much interference changes the
radiated energy, and GB_coh = C GB. Approximation: every strip's 2D far-field wave is given the same phase lag, which
holds for similar sections (the Wigley's are all the same shape up to scale in the parabolic form). Stdlib only;
Maruo numbers are read from `results_maruo_check.txt` (fine mesh).
"""
import cmath
import math
import os
import re
import sys

from marine_hull import panel as pn
from marine_hull import strip as st

G = st.G
HERE = os.path.dirname(os.path.abspath(__file__))
HULLS = (
    ("T", (2.0, 0.3, 0.125), True, 1000.0, 0.248),
    ("M", (4.0, 0.4, 0.274390243902439), False, 1025.0, 0.25),
)
N_THETA = 2000


def coherence(xs, dx, q, k):
    """C = (k / 4 pi) int_0^{2 pi} |sum q e^{-ikx cos th} dx|^2 dth / sum |q|^2 dx (midpoint rule in theta)."""
    tot = 0.0
    for j in range(N_THETA):
        c = math.cos(2.0 * math.pi * (j + 0.5) / N_THETA)
        s = sum(qi * cmath.exp(-1j * k * x * c) for qi, x in zip(q, xs)) * dx
        tot += abs(s) ** 2
    tot *= 2.0 * math.pi / N_THETA
    return k / (4.0 * math.pi) * tot / (sum(abs(v) ** 2 for v in q) * dx)


def maruo_rows(key):
    """lam -> (Maruo free, GB strip) from the fine-mesh table of results_maruo_check.txt."""
    txt = open(os.path.join(HERE, "results_maruo_check.txt")).read()
    head = "-- T (tank" if key == "T" else "-- M (4 m"
    block = txt[txt.index(head):]
    block = block[:block.index("energy identity")]
    out = {}
    for line in block.splitlines():
        p = line.split()
        if len(p) >= 9 and re.match(r"^\d+\.\d+$", p[0]):
            out[round(float(p[0]), 3)] = (float(p[5]), float(p[6]))
    return out


def main():
    print("Milestone 7zm post hoc: strip-interference coherence factor C for Gerritsma-Beukelman, zero speed")
    # check: a uniform line source of length L gives C -> 1 as k L grows
    xs = [-0.5 + (i + 0.5) / 200 for i in range(200)]
    print("check, uniform q on L = 1: " + ", ".join(
        f"kL {kl}: C {coherence(xs, 1 / 200, [1.0] * 200, float(kl)):.3f}" for kl in (5, 20, 80)))
    for key, dims, modified, rho, kyy in HULLS:
        h = st.ModifiedWigleyStrip(*dims, kyy=kyy, rho=rho) if modified else st.WigleyStrip(*dims, kyy=kyy, rho=rho)
        l, b = dims[0], dims[1]
        norm = rho * G * b * b / l
        mar = maruo_rows(key)
        print(f"\n== {key}: sigma = R_aw / (rho g zeta^2 B^2 / L); GB strip with strip motions ==")
        print(f"{'lam/L':>6} {'kL':>6} {'C':>6} {'GB':>8} {'GB_coh':>8} {'Maruo':>8} {'GB/Maruo':>8} {'GBcoh/Maruo':>11}")
        rows = []
        for lam in sorted(mar):
            w = math.sqrt(2.0 * math.pi * G / (lam * l))
            k = w * w / G
            z, th, _, _ = h.response(w, 0.0)
            _, bb = h.sections(w)
            smith = math.exp(-k * h.dm)
            q = [math.sqrt(bi) * 1j * w * (smith * cmath.exp(1j * k * x) - z - x * th) for bi, x in zip(bb, h.x)]
            c = coherence(h.x, h.dx, q, k)
            gb = pn.gb_added_resistance(h, w, z, th) / norm
            m = mar[lam][0]
            rows.append((lam, gb, c * gb, m))
            print(f"{lam:6.2f} {k * l:6.2f} {c:6.3f} {gb:8.4f} {c * gb:8.4f} {m:8.4f} {gb / m:8.3f} {c * gb / m:11.3f}")

        def ar(i, lo, hi):
            sel = [r for r in rows if lo - 1e-9 <= r[0] <= hi + 1e-9]
            return sum(0.5 * (sel[j][i] + sel[j + 1][i]) * (sel[j + 1][0] - sel[j][0]) for j in range(len(sel) - 1))
        for lo, hi in ((0.5, 2.0), (0.3, 0.6)):
            print(f"area on lambda/L {lo}-{hi}: GB / Maruo {ar(1, lo, hi) / ar(3, lo, hi):.3f}, "
                  f"GB_coh / Maruo {ar(2, lo, hi) / ar(3, lo, hi):.3f}")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
