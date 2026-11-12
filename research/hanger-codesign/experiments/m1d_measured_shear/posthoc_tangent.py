"""Post hoc (not predicted, written after run.py): what stretch stiffness do the KES tensile numbers
imply at the load a hanging garment puts on its shoulder, rather than at the tester's 500 gf/cm?

    python3 experiments/m1d_measured_shear/posthoc_tangent.py    (stdlib only, instant)

run.py's EA_kes is the secant Fm / EMT. LT < 1 says the load-extension curve is convex, so the
stiffness at a few N/m is lower. The curve's shape is not in the table; a power law F = Fm (e/EMT)^n
is the one-parameter curve that reproduces both LT and WT: WT = Fm EMT / (n + 1) and
LT = WT / (Fm EMT / 2) = 2 / (n + 1), so n = 2 / LT - 1. Its tangent at load F is n F / e(F) with
e(F) = EMT (F / Fm)^(1/n). The shoulder load is the model garment's whole hanging weight over the
sheet's 20 cm depth (the most any shoulder row carries; lower rows carry less). This is a model of
the curve, not a measurement: a real curve with a linear toe (common in wovens) is stiffer at low
load than the power law, which goes to zero stiffness at zero load.
"""
import math

FM = 500.0 * 9.80665e-3 / 1e-2                    # N/m (the KES-FB1 standard maximum, assumed)
LT = {"A": 0.632, "B": 0.849, "C": 0.597, "D": 0.667}
WT = {"A": 32.78, "B": 6.72, "C": 9.91, "D": 10.50}
# model garment mass (kg) from run.py's sheet (size M tee, mass scaled by W / W(A)), depth 0.20 m
MASS = {"A": 0.07545, "B": 0.09536, "C": 0.07527, "D": 0.14790}
DEPTH = 0.20


def tangent(code, F):
    emt = 2.0 * WT[code] / (LT[code] * 500.0)
    n = 2.0 / LT[code] - 1.0
    e = emt * (F / FM) ** (1.0 / n)
    return n, e, n * F / e


def main():
    out = ["fabric n F_shoulder_N/m strain_at_F tangent_EA@F tangent_EA@F/2 secant_EA_kes"]
    for c in "ABCD":
        F = MASS[c] * 9.80665 / DEPTH
        n, e, t = tangent(c, F)
        t2 = tangent(c, F / 2)[2]
        emt = 2.0 * WT[c] / (LT[c] * 500.0)
        out.append(f"{c} {n:.2f} {F:.2f} {e:.4f} {t:.0f} {t2:.0f} {FM / emt:.0f}")
    print("\n".join(out))
    return out


if __name__ == "__main__":
    from pathlib import Path
    (Path(__file__).resolve().parent / "posthoc_tangent.txt").write_text("\n".join(main()) + "\n")
