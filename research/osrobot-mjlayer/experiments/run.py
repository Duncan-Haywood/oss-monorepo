"""osrobot-mjlayer: how much force a feeding-arm tip can apply before a bonded soft-tissue layer bottoms out.
Spherical indentation of a layer of thickness h bonded to rigid bone, using two published bottom-effect
polynomials (Dimitriadis 2002 as corrected by Garcia, and Garcia 2018), both as tabulated in Dal Fabbro et al.
(arXiv 2406.17157, Eqs. 9a and 12a). nu = 0.5. Stdlib only. Writes experiments/results.txt.

    python experiments/run.py
"""
import math
from pathlib import Path

HERE = Path(__file__).resolve().parent
NU = 0.5
# F = F_hertz(delta) * poly(chi), chi = sqrt(R*delta)/h; coefficients c1..c4
DIMITRIADIS = (1.133, 1.283, 0.769, -0.0975)   # Eq. 9a, 4th-order sign as changed by Garcia et al.
GARCIA = (1.133, 1.497, 1.469, 0.755)          # Eq. 12a
MODELS = (("dimitriadis", DIMITRIADIS), ("garcia", GARCIA))
MODULI_KPA = (4.0, 10.0, 45.0)                 # span of the in-vivo values in osrobot-mjmodulus
THICK_MM = (5.0, 10.0, 15.0, 20.0)             # 14.5 to 16.3 mm lip thickness (cephalometric, Nepal); 5 to 20 swept
RADII_MM = (4.0, 8.0, 15.0)
FORCES_N = (53.30, 20.20, 12.63)               # worst peaks from osrobot-mjpress (via osrobot-mjmodulus)
D_OVER_H_MAX = 0.3                             # my small-strain limit: indentation under 30 % of layer thickness


def poly(chi, c):
    return 1 + sum(ci * chi ** (i + 1) for i, ci in enumerate(c))


def force(delta, r, e_pa, h, c=DIMITRIADIS, nu=NU):
    """Force [N] for indentation delta [m] of a sphere R on a bonded layer of thickness h [m]."""
    fh = 4 * e_pa * math.sqrt(r) * delta ** 1.5 / (3 * (1 - nu * nu))
    return fh * poly(math.sqrt(r * delta) / h, c)


def depth(f, r, e_pa, h, c=DIMITRIADIS):
    """Indentation [m] that carries force f, by bisection; may exceed h (model out of range)."""
    lo, hi = 0.0, 10 * h
    if force(hi, r, e_pa, h, c) < f:
        return math.inf
    for _ in range(100):
        mid = (lo + hi) / 2
        lo, hi = (mid, hi) if force(mid, r, e_pa, h, c) < f else (lo, mid)
    return (lo + hi) / 2


def budget(r, e_pa, h, c=DIMITRIADIS, frac=D_OVER_H_MAX):
    """Force [N] at which indentation reaches frac * h."""
    return force(frac * h, r, e_pa, h, c)


if __name__ == "__main__":
    out = ["# osrobot-mjlayer: sphere on a bonded layer, nu=0.5, Dimitriadis (D) and Garcia (G) bottom-effect polynomials",
           "# Part 1: depth (mm) at the trial forces. R(mm) E(kPa) h(mm) F(N) depth_D depth_G  (inf = deeper than 10 h)"]
    for r in RADII_MM:
        for ek in MODULI_KPA:
            for h in THICK_MM:
                for f in FORCES_N:
                    ds = [depth(f, r * 1e-3, ek * 1e3, h * 1e-3, c) * 1e3 for _, c in MODELS]
                    out.append("%.0f %.0f %.0f %.2f %s" % (r, ek, h, f, " ".join("inf" if math.isinf(d) else "%.1f" % d for d in ds)))
    out.append("# Part 2: force budget (N) at which indentation reaches %.0f %% of the layer. R(mm) E(kPa) h(mm) F_D F_G" % (100 * D_OVER_H_MAX))
    for r in RADII_MM:
        for ek in MODULI_KPA:
            for h in THICK_MM:
                out.append("%.0f %.0f %.0f %s" % (r, ek, h, " ".join("%.2f" % budget(r * 1e-3, ek * 1e3, h * 1e-3, c) for _, c in MODELS)))
    (HERE / "results.txt").write_text("\n".join(out) + "\n")
    print("\n".join(out))
