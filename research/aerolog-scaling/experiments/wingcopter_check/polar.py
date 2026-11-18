"""Milestone 10f: can a drag polar (wing area, speed, CD0, AR) explain the Wingcopter 198's implied cruise L/D?
10e implied L/D x eta_c of 5.7 (L/D 6.8 at eta_c 0.85) for 94 km.  Wing area and span are NOT sourced here, so
S, AR and CD0 are swept.  Cruise 90 km/h = 25 m/s (published), W = 25 kg, sea level, e = 0.8 (assumed).
Predictions fixed before the run (LOG.md 10f): P1 CD0 needed for L/D 6.8 exceeds 0.07 at every S in 0.5-1.0 m2
and AR 8-12; P2 a clean-aircraft CD0 of 0.035 gives L/D above 12 at S 0.5-1.0; P3 L/D is insensitive to S
(under 20% across 0.5-1.0 m2) at CD0 0.07."""
import math
W, G, RHO, V, E = 25.0, 9.80665, 1.225, 25.0, 0.8
Q = 0.5 * RHO * V * V

def ld(cd0, S, AR):
    cl = W * G / (Q * S)
    return cl / (cd0 + cl * cl / (math.pi * E * AR))

def cd0_needed(target, S, AR):
    cl = W * G / (Q * S)
    return cl / target - cl * cl / (math.pi * E * AR)

print("A. CD0 needed for L/D 6.8 (and 5.4 for the 75 km @ 6 kg case); negative = unreachable even with CD0 = 0")
for S in (0.5, 0.7, 1.0):
    for AR in (8, 10, 12):
        print(f"   S {S} m2 AR {AR:2d} CL {W*G/(Q*S):.2f}: CD0 {cd0_needed(6.8,S,AR):+.3f} (L/D 6.8)  {cd0_needed(5.4,S,AR):+.3f} (L/D 5.4)")
print("B. L/D at a clean-aircraft CD0 0.035 (AR 10)")
for S in (0.5, 0.7, 1.0):
    print(f"   S {S}: {ld(0.035,S,10):.1f}")
print("C. sensitivity to S at CD0 0.07, AR 10")
v = [ld(0.07, S, 10) for S in (0.5, 0.7, 1.0)]
print("   L/D", [f"{x:.1f}" for x in v], f"spread {(max(v)-min(v))/min(v)*100:.0f}%")
print("D. L/D of a clean polar at 0.7 m2 vs CD0 (AR 10)")
for c in (0.03, 0.05, 0.07, 0.09, 0.11):
    print(f"   CD0 {c}: {ld(c,0.7,10):.1f}")
