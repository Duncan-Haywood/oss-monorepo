"""Rod diameter from an acceleration and ringing budget, instead of a bare frequency target (selfrep-alufreq).

Model: the carriage on the rod is a one-mode oscillator (selfrep-rodmodes: stiffness k, frequency f, damping ratio
zeta). A move accelerates at `a` with a linear force ramp of duration t_r. The static deflection is delta = M a / k.
For the ramp the residual ringing amplitude after the ramp is delta * |sin(w t_r/2) / (w t_r/2)| (exact for the
undamped oscillator; t_r -> 0 gives the abrupt-step worst case, amplitude delta). Ringing decays as exp(-zeta w t).
ASSUMPTIONS (all stylised, nothing measured): M = 0.3 kg, zeta = 0.01, ringing tolerance 0.05 mm, one mode only.
"""
import math
import pathlib
import sys

_R = pathlib.Path(__file__).resolve().parents[3]
for p in ("selfrep-rodmodes", "selfrep-rodbeam"):
    sys.path.insert(0, str(_R / p / "src"))
from selfrep_rodmodes import modes as m  # noqa: E402

L = m.L_LONG
ZETA = 0.01
TOL = 50e-6     # m, tolerated residual ringing amplitude


def omega(material, d, M=m.M_CARRIAGE):
    return 2 * math.pi * m.frequency(material, d, L, M)


def ring_amplitude(material, d, a, t_ramp=0.0, M=m.M_CARRIAGE):
    """Residual ringing amplitude (m) after an acceleration step of size a (m/s^2) with ramp time t_ramp (s)."""
    k = m.stiffness(material, d, L)
    x = omega(material, d, M) * t_ramp / 2
    shape = 1.0 if x == 0 else abs(math.sin(x) / x)
    return M * a / k * shape


def max_accel(material, d, t_ramp=0.0, tol=TOL, M=m.M_CARRIAGE):
    """Largest acceleration (m/s^2) whose residual ringing stays within tol."""
    unit = ring_amplitude(material, d, 1.0, t_ramp, M)
    return tol / unit if unit > 0 else math.inf


def min_diameter(material, a, t_ramp=0.0, tol=TOL, M=m.M_CARRIAGE, hi=0.1):
    """Smallest diameter (m) tolerating acceleration a, by bisection on a bracket where the budget holds.
    The sinc factor makes the constraint non-monotone for t_ramp > 0, so scan down from hi for the first failure."""
    n = 2000
    ds = [hi * (i + 1) / n for i in range(n)]
    if max_accel(material, hi, t_ramp, tol, M) < a:
        return None
    best = hi
    for d in reversed(ds):
        if max_accel(material, d, t_ramp, tol, M) >= a:
            best = d
        else:
            break
    return best


def settle_time(material, d, tol_fraction=0.1, M=m.M_CARRIAGE, zeta=ZETA):
    """Time (s) for ringing to decay to tol_fraction of its initial amplitude."""
    return math.log(1 / tol_fraction) / (zeta * omega(material, d, M))
