"""Milestone 10i: with the 198's sourced rotor count, how many stopped rotors does the 94 km claim need?
Sourced this session (web search summaries of Wikipedia's infobox and trade press; wingcopter.com did not resolve
from the session): 8 electric motors. NOT sourced: propeller diameter, blades per rotor, how many tilt or fold,
wing area.  Reuses 10h's setup (25 kg, 25 m/s, sea level, e 0.8, span 1.98 m, clean CD0 0.035, drag = q f, blade
frontal area a, Cd 1).  Rotors stopped in cruise r in {2,4,6,8}, blades per rotor 2 (assumed), a in {0.002,0.003}.
Predictions fixed before the run (hand-worked from 10h's f of 0.035/0.028/0.018 at S 0.5/0.7/1.0):
P1 r=4 (8 blades) at a=0.003 gives L/D 7.7/7.1/6.4 (10h's row C), bracketing the claimed 6.8;
P2 r=8 (16 blades, 0.048 m2) gives L/D below 6.0 at every S in 0.5-1.0, overshooting the claim;
P3 r=2 (4 blades, 0.012 m2) gives L/D above 8 at S 0.7."""
import math
W, G, RHO, V, E, B, CLEAN = 25.0, 9.80665, 1.225, 25.0, 0.8, 1.98, 0.035
Q = 0.5 * RHO * V * V
def ld(S, f):
    cl = W * G / (Q * S); k = cl * cl / (math.pi * E * B * B / S)
    return cl / (CLEAN + f / S + k)
for a in (0.002, 0.003):
    print(f"blade frontal area {a} m2, 2 blades per rotor, Cd 1")
    for r in (0, 2, 4, 6, 8):
        print(f"  {r} stopped rotors: " + "  ".join(f"S{S}: {ld(S, 2*r*a):.1f}" for S in (0.5, 0.7, 1.0)))
