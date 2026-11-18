"""Milestone 10h: how much idle-rotor drag would close 10g's gap?  10g: with span 1.98 m fixed, a clean airframe
(CD0 0.035) gives L/D 8.4-12.3, but the 94 km claim needs L/D 6.8, so extra zero-lift drag is needed.  Convert the
shortfall into an equivalent flat-plate area f = (CD0_needed - 0.035) * S (m2, drag = q f), then into the number of
stopped lift-rotor blades of frontal area a (Cd 1.0 broadside-to-flow, an ASSUMED upper-ish value; blade count, size
and fold are NOT sourced) that would carry it.  Everything else as 10g (25 kg, 25 m/s, sea level, e = 0.8).
Predictions fixed before the run (hand-worked from 10g's CD0 needed 0.105 / 0.075 / 0.053 at S 0.5 / 0.7 / 1.0):
P1 f needed is 0.018-0.035 m2 across S 0.5-1.0 ((0.105-0.035)*0.5, (0.075-0.035)*0.7, (0.053-0.035)*1.0);
P2 8 stopped blades of 0.003 m2 frontal area each (Cd 1, 0.024 m2) lie inside P1's range, so L/D lands near 6.8 at S 0.7;
P3 no S in 0.5-1.0 needs f above 0.04 m2."""
import math
W, G, RHO, V, E, B = 25.0, 9.80665, 1.225, 25.0, 0.8, 1.98
Q = 0.5 * RHO * V * V
CLEAN = 0.035
def need(S, t=6.8):
    cl = W * G / (Q * S); k = cl * cl / (math.pi * E * B * B / S)
    return cl / t - k
print("A. equivalent flat-plate area f for L/D 6.8 beyond a clean 0.035")
fs = {}
for S in (0.4, 0.5, 0.6, 0.7, 0.8, 1.0):
    f = (need(S) - CLEAN) * S; fs[S] = f
    print(f"   S {S:.1f}: dCD0 {need(S)-CLEAN:+.3f}  f {f:.4f} m2  drag {Q*f:.1f} N (of {W*G/6.8:.1f} N total)")
print("B. stopped blades (Cd 1, frontal area a each) needed")
for a in (0.002, 0.003, 0.005):
    print("   a %.3f m2: " % a + "  ".join(f"S{S}: {fs[S]/a:.1f}" for S in fs))
print("C. 8 blades x 0.003 m2 x Cd 1 = 0.024 m2 -> L/D at each S")
for S in (0.5, 0.7, 1.0):
    cl = W*G/(Q*S); k = cl*cl/(math.pi*E*B*B/S)
    print(f"   S {S}: {cl/(CLEAN+0.024/S+k):.1f}")
