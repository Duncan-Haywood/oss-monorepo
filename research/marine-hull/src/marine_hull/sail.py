"""Milestone 5a: steady-state polar of a small wing-sail drone, and tack-controller routing on a wind series.

Force balance, stdlib only. A rigid wing sail (finite-wing lift with a stall roll-off) drives a displacement hull whose
resistance is hull.resistance (ITTC 1957 friction line, form factor, placeholder wave term). Side force is carried by a
keel as induced drag at a leeway angle. Heel, reefing, sea-state drag and sail-wake interaction are NOT modelled; the
polar is a first-order screening model, and every input is swept in experiments/run_sail_polar.py.
"""
import math
from .hull import cf_ittc57, RHO_SEA, NU_SEA
from .michell import wave_resistance_wigley, wigley_wetted

RHO_AIR = 1.225   # kg/m3, ISA sea level 15 C


def cl_cd(alpha_deg, ar, cl_max=1.2, cd0=0.012, e=0.85):
    """Wing lift and drag at angle of attack (deg, may be negative).

    Pre-stall: finite-wing slope 2 pi AR / (AR + 2) per rad (Prandtl lifting-line, elliptic-ish loading) up to the angle at
    which CL reaches cl_max; beyond it CL rolls off towards the flat-plate form sin(2a) and CD rises to the flat-plate
    value 2 sin^2(a) (Hoerner's bluff-plate limit). Induced drag CL^2 / (pi e AR) is added before stall only.
    """
    a = math.radians(abs(alpha_deg))
    slope = 2.0 * math.pi * ar / (ar + 2.0)
    a_stall = cl_max / slope
    if a <= a_stall:
        cl = slope * a
        cd = cd0 + cl * cl / (math.pi * e * ar)
    else:
        # blend from (a_stall, cl_max) to the flat plate: linear in angle over 10 degrees to full flat-plate values
        w = min(1.0, (a - a_stall) / math.radians(10.0))
        cl_fp, cd_fp = math.sin(2 * a), 2.0 * math.sin(a) ** 2
        cl_s = cl_max
        cd_s = cd0 + cl_max ** 2 / (math.pi * e * ar)
        cl, cd = (1 - w) * cl_s + w * cl_fp, (1 - w) * cd_s + w * cd_fp
    return math.copysign(cl, alpha_deg), cd


_TABLES = {}


def wigley_resistance_table(length, beam, draft, k_form, vmax=9.0, dv=0.1):
    """Still-water resistance (N) of a Wigley hull on a speed grid: ITTC 1957 friction x (1+k) plus Michell wave resistance."""
    key = (length, beam, draft, k_form, vmax, dv)
    if key not in _TABLES:
        s = wigley_wetted(length, beam, draft, n=60)
        tab = [0.0]
        for i in range(1, int(vmax / dv) + 1):
            v = i * dv
            rv = 0.5 * RHO_SEA * v * v * s * (1 + k_form) * cf_ittc57(v * length / NU_SEA)
            tab.append(rv + wave_resistance_wigley(v, length, beam, draft, nth=300))
        _TABLES[key] = (dv, tab)
    return _TABLES[key]


class Drone:
    """Wing-sail drone: sail area (m2) and aspect ratio, keel area/span, Wigley hull (length, beam, draft in m)."""
    def __init__(self, sail_area=5.0, sail_ar=3.0, keel_span=1.0, length=5.0, beam=0.5, draft=0.25,
                 k_form=0.2, cl_max=1.2, cd0=0.012, keel_e=0.8, hull_scale=1.0, fr_cap=0.5):
        self.__dict__.update(locals()); del self.__dict__['self']
        self._dv, self._tab = wigley_resistance_table(length, beam, draft, k_form)

    def hull_drag(self, v, side_force):
        if v <= 0:
            return 0.0
        q = 0.5 * RHO_SEA * v * v
        # induced drag of the keel; capped at the stalled-keel value (leeway about 20 degrees) so v -> 0 stays finite
        induced = min(side_force ** 2 / (math.pi * self.keel_e * self.keel_span ** 2 * q), side_force * math.tan(0.35))
        x = v / self._dv
        i = min(int(x), len(self._tab) - 2)
        r = self._tab[i] + (self._tab[i + 1] - self._tab[i]) * (x - i)
        return self.hull_scale * r + induced

    def forces(self, v, tws, twa_deg, alpha_deg):
        """Net forward force (N) on a boat moving at v (m/s) with true wind tws (m/s) from twa_deg off the bow, sail at alpha."""
        twa = math.radians(twa_deg)
        # apparent wind, boat frame: x forward, y to starboard-side of the wind source
        ax = tws * math.cos(twa) + v        # component of apparent wind coming from ahead
        ay = tws * math.sin(twa)
        va = math.hypot(ax, ay)
        if va < 1e-9:
            return -self.hull_drag(v, 0.0), 0.0
        beta = math.atan2(ay, ax)           # apparent wind angle from the bow
        cl, cd = cl_cd(alpha_deg, self.sail_ar, self.cl_max, self.cd0)
        q = 0.5 * RHO_AIR * va * va * self.sail_area
        lift, drag = q * cl, q * cd
        fx = lift * math.sin(beta) - drag * math.cos(beta)
        fy = lift * math.cos(beta) + drag * math.sin(beta)
        return fx - self.hull_drag(v, abs(fy)), fy

    def best_net(self, v, tws, twa_deg):
        best = (-1e18, 0.0)
        for a10 in range(0, 241):
            alpha = a10 / 10.0
            f, _ = self.forces(v, tws, twa_deg, alpha)
            if f > best[0]:
                best = (f, alpha)
        return best

    def speed(self, tws, twa_deg, vmax=15.0):
        """Steady boat speed (m/s) with the sail trimmed for maximum net force; 0 if it cannot move.

        Capped at Froude number fr_cap: beyond it the thin-ship wave term and the displacement hull stop being a valid model
        (the Wigley hull cannot plane), so the sail is taken to be depowered there. Capped cells are flagged by capped().
        """
        vcap = self.fr_cap * math.sqrt(9.80665 * self.length)
        return min(self._speed_free(tws, twa_deg, vmax), vcap)

    def capped(self, tws, twa_deg):
        return self._speed_free(tws, twa_deg, 15.0) > self.fr_cap * math.sqrt(9.80665 * self.length)

    def _speed_free(self, tws, twa_deg, vmax=15.0):
        if self.best_net(0.2, tws, twa_deg)[0] <= 0:
            return 0.0
        lo, hi = 0.0, vmax
        for _ in range(40):
            mid = 0.5 * (lo + hi)
            if self.best_net(mid, tws, twa_deg)[0] > 0:
                lo = mid
            else:
                hi = mid
        return lo


def vmg_up(drone, tws, twas=range(20, 91, 2)):
    """Best upwind velocity made good (m/s) and the true wind angle (deg) that gives it."""
    best = (0.0, 0)
    for t in twas:
        v = drone.speed(tws, t)
        m = v * math.cos(math.radians(t))
        if m > best[0]:
            best = (m, t)
    return best
