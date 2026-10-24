"""osrobot-mjmodulus: Hertz contact pressure of the feeding-arm tip at measured face/lip moduli.
Reads the worst peak forces from ../osrobot-mjpress/experiments/results.txt. Stdlib only.
Writes experiments/results.txt.

    python experiments/run.py
"""
import math
from pathlib import Path

HERE = Path(__file__).resolve().parent
PRESS = HERE.parents[1] / "osrobot-mjpress" / "experiments" / "results.txt"

NU = 0.5                                   # incompressible soft tissue (assumed, as osrobot-mjpress)
# measured in-vivo moduli, kPa (sources in README)
MODULI_KPA = (("cheek (Takemoto, 1 subject)", 4.0), ("cheek (Takemoto, 1 subject)", 9.9),
              ("skin, Hertz fits (Journal of Cosmetic Science), low", 7.0),
              ("skin, Hertz fits (Journal of Cosmetic Science), high", 33.0),
              ("face, aspiration (Then et al.), low", 31.0), ("face, aspiration, high", 42.0),
              ("upper lip (Takemoto, 1 subject)", 45.0))
RADII_MM = (2.0, 4.0, 8.0, 15.0, 25.0)     # tip radius sweep; 4 mm is the osrobot-mjfeed tip
P_LIMITS = (20.0, 55.0, 110.0)             # N/cm2, unconfirmed (osrobot-mjpress)
A_OVER_R_MAX = 0.5                         # Hertz small-strain rule of thumb: contact radius a well under R


def hertz(f, r, e_pa, nu=NU):
    """Return (contact radius a [m], depth delta [m], mean pressure [N/cm2]) for sphere R on a half-space."""
    estar = e_pa / (1 - nu * nu)
    a = (3 * f * r / (4 * estar)) ** (1 / 3)
    delta = a * a / r
    return a, delta, f / (math.pi * a * a) / 1e4


def valid(a, r):
    return a / r <= A_OVER_R_MAX


def worst_peaks():
    """{(b, v): worst peak N} parsed from osrobot-mjpress Part 1."""
    out, part = {}, 0
    for line in PRESS.read_text().splitlines():
        if line.startswith("# Part"):
            part = int(line.split()[2].rstrip(":"))
        elif not line.startswith("#") and part == 1:
            t = line.split()
            out[(int(t[0]), float(t[1]))] = float(t[4])
    return out


if __name__ == "__main__":
    pk = worst_peaks()
    cases = (("b=1000 v=0.20 (worst of 12)", pk[(1000, 0.20)]), ("b=4 v=0.20 (worst light-damping)", pk[(4, 0.20)]),
             ("b=100 v=0.10", pk[(100, 0.10)]))
    out = ["# osrobot-mjmodulus: Hertz sphere on a half-space, nu=%.1f; forces = worst peaks from osrobot-mjpress" % NU]
    for name, f in cases:
        out.append("# Case %s F=%.2f N. R(mm) E(kPa) a(mm) a/R depth(mm) p(N/cm2) hertz_valid(a/R<=%.1f)" % (name, f, A_OVER_R_MAX))
        for r in RADII_MM:
            for _, ek in MODULI_KPA:
                a, d, p = hertz(f, r * 1e-3, ek * 1e3)
                out.append("%.0f  %.1f  %.1f  %.2f  %.1f  %.1f  %s" % (r, ek, a * 1e3, a / (r * 1e-3), d * 1e3, p, "yes" if valid(a, r * 1e-3) else "no"))
    f = pk[(1000, 0.20)]
    out.append("# Smallest valid tip radius (mm) with a/R<=%.1f, and its pressure, at F=%.2f N, by modulus (kPa): E  R_min  p@R_min  within20 within55 within110" % (A_OVER_R_MAX, f))
    for ek in sorted({e for _, e in MODULI_KPA}):
        # a/R = (3F/(4E*))^(1/3) R^(-2/3) <= c  ->  R >= (3F/(4E*))^(1/2) / c^(3/2)
        estar = ek * 1e3 / (1 - NU * NU)
        rmin = math.sqrt(3 * f / (4 * estar)) / A_OVER_R_MAX ** 1.5
        _, _, p = hertz(f, rmin, ek * 1e3)
        out.append("%.1f  %.1f  %.1f  %s" % (ek, rmin * 1e3, p, "  ".join("yes" if p <= lim else "no" for lim in P_LIMITS)))
    (HERE / "results.txt").write_text("\n".join(out) + "\n")
    print("\n".join(out))
