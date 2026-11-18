"""Wing-sail drone polar from a force balance (stdlib only).

Aerodynamics: thin-wing lift slope with finite-aspect-ratio correction (Prandtl),
stall at CL_MAX, induced drag CL^2/(pi e AR) + CD0. Hydrodynamics: ITTC-1957 friction
line times a form factor, a Froude-number wave term (coefficient unsourced, swept) and the
keel's lifting-line induced drag for the side force. Leeway angle is neglected.
"""
import math

RHO_AIR = 1.225
RHO_W = 1025.0


class Craft:
    def __init__(self, area=2.0, ar=4.0, cd0=0.012, e=0.85, cl_max=1.3,
                 wetted=1.8, length=4.0, form=1.5, cw_k=0.16, keel_span=0.8, keel_e=0.8):
        self.area, self.ar, self.cd0, self.e = area, ar, cd0, e
        self.cl_max, self.wetted, self.length, self.form = cl_max, wetted, length, form
        self.cw_k, self.keel_span, self.keel_e = cw_k, keel_span, keel_e
        self.cl_slope = 2 * math.pi / (1 + 2 / ar)  # per rad, finite wing

    def hull_drag(self, v):
        if v <= 0:
            return 0.0
        re = max(v * self.length / 1.14e-6, 1e5)
        cf = 0.075 / (math.log10(re) - 2) ** 2
        fr = v / math.sqrt(9.81 * self.length)
        cw = self.cw_k * max(0.0, fr - 0.25) ** 2   # unsourced wave-making term, swept
        return 0.5 * RHO_W * self.wetted * (cf * self.form + cw) * v * v

    def coeffs(self, alpha):
        cl = self.cl_slope * alpha
        if abs(cl) > self.cl_max:
            cl = math.copysign(self.cl_max, alpha) * 0.8  # post-stall drop
            cd = self.cd0 + 1.2 * math.sin(abs(alpha)) ** 2 + cl * cl / (math.pi * self.e * self.ar)
        else:
            cd = self.cd0 + cl * cl / (math.pi * self.e * self.ar)
        return cl, cd

    def drive(self, v, twa, tws, alpha):
        """Net force along the heading minus hull drag. twa: angle of the TRUE wind from
        the bow (rad, 0..pi, the wind comes FROM that angle). alpha: sail angle of attack."""
        # apparent wind in boat frame (x forward): wind blows toward direction twa+pi
        wx = -tws * math.cos(twa) - v   # wind velocity relative to boat, minus boat velocity
        wy = -tws * math.sin(twa)
        aw = math.hypot(wx, wy)
        if aw < 1e-9:
            return -self.hull_drag(v)
        flow_dir = math.atan2(wy, wx)           # direction air moves relative to boat
        cl, cd = self.coeffs(alpha)
        q = 0.5 * RHO_AIR * self.area * aw * aw
        lift, drag = q * cl, q * cd
        # drag along flow, lift 90 deg to flow (sign chosen so a positive lift pushes forward)
        fx = drag * math.cos(flow_dir) - lift * math.sin(flow_dir)
        fy = drag * math.sin(flow_dir) + lift * math.cos(flow_dir)
        # keel carries the side force; its induced drag (lifting-line, span b, efficiency e)
        di = 0.0
        if v > 0.05:
            di = fy * fy / (0.5 * RHO_W * v * v * math.pi * self.keel_span ** 2 * self.keel_e)
        return fx - self.hull_drag(v) - di

    def best_alpha(self, v, twa, tws):
        best, ba = -1e9, 0.0
        for i in range(-60, 61):
            a = math.radians(i * 0.5)
            f = self.drive(v, twa, tws, a)
            if f > best:
                best, ba = f, a
        return best, ba

    def speed(self, twa, tws):
        """Steady boat speed (m/s) at true wind angle twa (rad from the bow, 0..pi)."""
        lo, hi = 0.0, 0.9 * tws + 3.0
        if self.best_alpha(0.0, twa, tws)[0] <= 0:
            return 0.0
        for _ in range(40):
            mid = 0.5 * (lo + hi)
            if self.best_alpha(mid, twa, tws)[0] > 0:
                lo = mid
            else:
                hi = mid
        return lo


class Polar:
    """Tabulated polar for one true wind speed, interpolated over TWA."""
    def __init__(self, craft, tws, step_deg=5):
        self.tws = tws
        self.angles = [math.radians(a) for a in range(0, 181, step_deg)]
        self.speeds = [craft.speed(a, tws) for a in self.angles]

    def at(self, twa):
        twa = abs(twa) % (2 * math.pi)
        if twa > math.pi:
            twa = 2 * math.pi - twa
        x = twa / self.angles[1]
        i = min(int(x), len(self.angles) - 2)
        f = x - i
        return self.speeds[i] * (1 - f) + self.speeds[i + 1] * f

    def best_vmg(self):
        """(vmg, twa) upwind and downwind: maximise v*cos(twa) and -v*cos(twa)."""
        up = max(((v * math.cos(a), a) for a, v in zip(self.angles, self.speeds)))
        dn = max(((-v * math.cos(a), a) for a, v in zip(self.angles, self.speeds)))
        return up, dn

    def no_go(self, frac=0.5):
        """Largest TWA below which speed is under `frac` of the best-VMG course speed."""
        top = max(self.speeds)
        for a, v in zip(self.angles, self.speeds):
            if v > frac * top:
                return a
        return math.pi
