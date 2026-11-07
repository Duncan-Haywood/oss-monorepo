"""Milestone 10g: 10f swept AR 8-12 independently of wing area.  The manufacturer page lists the 198's dimensions
as 198 x 152 x 65 cm (the 198 is the wingspan; Wikipedia's infobox gives span 1.98 m for the 198), so span b = 1.98 m
is sourced and AR = b^2 / S follows from S.  Everything else as 10f: 25 kg, 25 m/s, sea level, e = 0.8 (assumed).
Predictions fixed before the run (LOG.md 10g), hand-worked from 10f's formulas:
P1 CD0 needed for L/D 6.8 is about 0.105 at S 0.5, 0.075 at S 0.7, 0.052 at S 1.0 (each +-0.005);
P2 a clean CD0 of 0.035 gives L/D 9 to 11 at S 0.7 (10f's AR 10 gave 13.4), below 12 for all S in 0.3-1.0;
P3 no S in 0.3-1.0 reaches L/D 6.8 with CD0 under 0.04."""
import math
W, G, RHO, V, E, B = 25.0, 9.80665, 1.225, 25.0, 0.8, 1.98
Q = 0.5 * RHO * V * V
def parts(S):
    cl = W * G / (Q * S); ar = B * B / S
    return cl, ar, cl * cl / (math.pi * E * ar)
def ld(cd0, S):
    cl, ar, k = parts(S); return cl / (cd0 + k)
def cd0_needed(t, S):
    cl, ar, k = parts(S); return cl / t - k
print("A. CD0 needed (span 1.98 m fixed, AR = b^2/S); chord = S/b")
for S in (0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 1.0):
    cl, ar, k = parts(S)
    print(f"   S {S:.1f} m2 AR {ar:.1f} chord {S/B:.2f} m CL {cl:.2f} CDi {k:.3f}: CD0 {cd0_needed(6.8,S):+.3f} (L/D 6.8)  {cd0_needed(5.4,S):+.3f} (L/D 5.4)")
print("B. L/D at clean CD0 0.035 and 0.05")
for S in (0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 1.0):
    print(f"   S {S:.1f}: {ld(0.035,S):.1f}  {ld(0.05,S):.1f}")
print("C. smallest CD0 that gives L/D 6.8 anywhere on S 0.3-1.0:", end=" ")
best = min(((cd0_needed(6.8, S/100), S/100) for S in range(30, 101)))
print(f"CD0 {best[0]:.3f} at S {best[1]:.2f} m2")
