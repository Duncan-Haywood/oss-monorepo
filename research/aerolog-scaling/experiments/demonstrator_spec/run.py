"""Milestone 7h: the sub-scale demonstrator specification for aerolog-sitl, dimensioned from 7d to 7g.

    python3 experiments/demonstrator_spec/run.py > experiments/demonstrator_spec/results.txt

Pure arithmetic on the design the programme found (no new simulation): the n = 0.2 Froude model of the 1,000 kg,
AR 10 reference (experiments/nonsimilar_modes constants), wing scale k = 1.0, AR 12, CL 0.8 / k, tail and CG tolerance
from experiments/tail_search and experiments/fixed_tail. Every length is the same formula those runs use.
"""
import math
import sys

sys.path.insert(0, "src")
from aerolog_scaling.scaling import isa, G

CL0, AR0, N = 0.8, 10.0, 0.2
M_FULL, B_FULL = 1000.0, 3.0 * 10 ** 0.5
RHO, MU = isa(0.0)[2], isa(0.0)[3]

# (wing section, wing AR, k, tail section, tail area fraction of S_sim, tail AR, arm in similar-wing chords, h tolerance)
# tolerances are fixed_tail's widest symmetric interval: +/-0.035 chords (4412), +/-0.030 (5406)
DESIGNS = [
    ("NACA 4412", 12, 1.0, "NACA 0015", 0.15, 5.0, 3.5, 0.035),
    ("NACA 5406", 12, 1.0, "NACA 0015", 0.15, 5.0, 3.5, 0.030),
]


def main():
    m, l_f = M_FULL * N ** 3, B_FULL * N
    s_sim = l_f ** 2 / AR0
    print(f"full-size reference: {M_FULL:.0f} kg, span {B_FULL:.2f} m, AR {AR0:.0f}, CL {CL0}; Froude model n = {N}")
    print(f"model mass {m:.2f} kg, similar-wing span {l_f:.3f} m, area {s_sim:.4f} m^2, density {RHO:.3f} kg/m^3\n")
    for sec, ar, k, tsec, frac, art, arm, tol in DESIGNS:
        s_w = k * s_sim
        b = math.sqrt(ar * s_w)
        c = s_w / b
        cl = CL0 / k
        v = math.sqrt(2 * m * G / (RHO * s_w * cl))
        s_t = frac * s_sim
        b_t = math.sqrt(art * s_t)
        c_t = s_t / b_t
        l_t = arm * (l_f / AR0)
        print(f"wing {sec}, AR {ar}, k {k}; tail {tsec}, {frac:.2f} of S_sim, AR_t {art}, arm {arm} similar chords")
        print(f"  wing: span {1e3*b:.0f} mm, chord {1e3*c:.1f} mm, area {s_w:.4f} m^2, wing loading {m*G/s_w:.1f} N/m^2, CL {cl:.2f}")
        print(f"  tail: span {1e3*b_t:.0f} mm, chord {1e3*c_t:.1f} mm, area {s_t:.4f} m^2, arm from wing AC {1e3*l_t:.0f} mm")
        print(f"  trim speed {v:.2f} m/s (full size {v/N**0.5:.2f} m/s); Re wing {RHO*v*c/MU:.3g}, Re tail {RHO*v*c_t/MU:.3g}")
        print(f"  CG tolerance for the 5% mode band: +/-{tol} chords = +/-{1e3*tol*c:.1f} mm of the design CG "
              f"(reference CG is the wing aerodynamic centre, about 25% chord = {1e3*0.25*c:.1f} mm behind the leading edge)")
        print(f"  mass tolerance: none derived here (mass enters the modes through Froude inertia, not swept for a built model)\n")


main()
