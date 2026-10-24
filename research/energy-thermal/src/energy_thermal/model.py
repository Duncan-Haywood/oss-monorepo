"""Transient heat-store model: a sphere of storage medium inside a spherical insulation shell.

Finite-volume conduction in spherical shells, backward Euler in time (unconditionally stable),
surroundings at a fixed temperature through a surface film. Everything is in SI units and
temperatures are in degrees C (differences only matter). Stdlib only.

A sphere has the least surface per volume of any shape, so its losses are a best case for a
real (cylindrical or box) store. Radial conduction only: no ground contact, no pipes, no fans.
"""
import math

__all__ = ["Medium", "SAND", "WATER", "INSULATION", "Store", "lumped_decay", "heat_pump_cop",
           "energy_kwh", "size_for_delivery"]


class Medium:
    def __init__(self, name, rho, c, k):
        self.name, self.rho, self.c, self.k = name, rho, c, k  # kg/m3, J/kgK, W/mK


# Values are assumed typical figures (not checked against a primary source); see the README.
SAND = Medium("dry sand (bulk)", 1600.0, 800.0, 0.30)
# Well-mixed water: a large effective k stands in for convection inside the tank.
WATER = Medium("water (well mixed)", 970.0, 4180.0, 100.0)
INSULATION = Medium("mineral wool", 100.0, 840.0, 0.08)  # k is a hot-side average, assumed


def energy_kwh(joules):
    return joules / 3.6e6


class Store:
    """`volume` m3 of `medium` in a sphere, wrapped in `ins_t` m of `insulation`.

    n_med and n_ins are the numbers of shells; all shells of a layer have equal thickness.
    """

    def __init__(self, medium, volume, ins_t, insulation=INSULATION, t_amb=10.0, h_out=10.0,
                 n_med=30, n_ins=12):
        self.medium, self.insulation, self.t_amb, self.h_out = medium, insulation, t_amb, h_out
        self.r_med = (3 * volume / (4 * math.pi)) ** (1 / 3)
        self.ins_t = ins_t
        self.r_out = self.r_med + ins_t
        edges = [self.r_med * i / n_med for i in range(n_med + 1)]
        if ins_t > 0:
            edges += [self.r_med + ins_t * j / n_ins for j in range(1, n_ins + 1)]
        self.edges = edges
        self.n_med = n_med
        n = len(edges) - 1
        self.mat = [medium if i < n_med else insulation for i in range(n)]
        vol = [4 / 3 * math.pi * (edges[i + 1] ** 3 - edges[i] ** 3) for i in range(n)]
        self.cap = [vol[i] * self.mat[i].rho * self.mat[i].c for i in range(n)]
        mid = [(edges[i] + edges[i + 1]) / 2 for i in range(n)]
        # conductance between node i and i+1, through the shared face at edges[i+1]
        self.g = []
        for i in range(n - 1):
            rf = edges[i + 1]
            res = ((1 / mid[i] - 1 / rf) / (4 * math.pi * self.mat[i].k)
                   + (1 / rf - 1 / mid[i + 1]) / (4 * math.pi * self.mat[i + 1].k))
            self.g.append(1 / res)
        ro = edges[-1]
        res_out = ((1 / mid[-1] - 1 / ro) / (4 * math.pi * self.mat[-1].k)
                   + 1 / (h_out * 4 * math.pi * ro * ro))
        self.g_out = 1 / res_out
        self.T = [t_amb] * n
        self.n = n

    def charge(self, t_hot):
        """Set the medium to a uniform t_hot (an instantaneous charge); insulation stays ambient."""
        for i in range(self.n_med):
            self.T[i] = t_hot

    def step(self, dt):
        n, g, T, cap = self.n, self.g, self.T, self.cap
        a = [0.0] * n  # sub, diag, super of (C/dt + G)
        b = [cap[i] / dt for i in range(n)]
        c = [0.0] * n
        d = [cap[i] / dt * T[i] for i in range(n)]
        for i in range(n - 1):
            b[i] += g[i]; b[i + 1] += g[i]
            c[i] = -g[i]; a[i + 1] = -g[i]
        b[-1] += self.g_out
        d[-1] += self.g_out * self.t_amb
        for i in range(1, n):  # Thomas algorithm
            w = a[i] / b[i - 1]
            b[i] -= w * c[i - 1]
            d[i] -= w * d[i - 1]
        T[-1] = d[-1] / b[-1]
        for i in range(n - 2, -1, -1):
            T[i] = (d[i] - c[i] * T[i + 1]) / b[i]

    def run(self, days, dt_h=6.0):
        dt = dt_h * 3600
        for _ in range(int(round(days * 24 / dt_h))):
            self.step(dt)

    def mean_medium_temp(self):
        cap = self.cap[:self.n_med]
        return sum(cap[i] * self.T[i] for i in range(self.n_med)) / sum(cap)

    def usable_kwh(self, t_cut):
        """Heat the medium could still give before its mean temperature falls to t_cut.

        Assumes a heat exchanger that reaches the whole medium (optimistic for a conductive bed).
        """
        c = sum(self.cap[:self.n_med])
        return max(0.0, energy_kwh(c * (self.mean_medium_temp() - t_cut)))

    def ua(self):
        """Steady conductance medium-surface to ambient, W/K (series of all layers)."""
        n = self.n
        return 1 / (sum(1 / x for x in self.g[self.n_med - 1:]) + 1 / self.g_out)


def lumped_decay(ua, capacity, t0, t_amb, seconds):
    """Exact temperature of a single lumped capacity (J/K) losing heat through ua (W/K)."""
    return t_amb + (t0 - t_amb) * math.exp(-ua * seconds / capacity)


def heat_pump_cop(t_sink, t_source, carnot_fraction=0.45):
    """Carnot COP times an assumed fraction. Temperatures in degrees C."""
    ts = t_sink + 273.15
    return carnot_fraction * ts / (ts - (t_source + 273.15))


def size_for_delivery(medium, kwh, standby_days, t_hot, t_cut, ins_t, **kw):
    """Smallest volume (m3) whose store, charged to t_hot and left standby_days, still holds `kwh`
    above t_cut. Bisection on volume; returns (volume, store after standby)."""
    def held(v):
        s = Store(medium, v, ins_t, **kw)
        s.charge(t_hot)
        s.run(standby_days)
        return s.usable_kwh(t_cut), s

    lo, hi = 0.1, 1.0
    while held(hi)[0] < kwh:
        hi *= 2
        if hi > 1e6:
            return None, None
    for _ in range(40):
        mid = (lo + hi) / 2
        if held(mid)[0] < kwh:
            lo = mid
        else:
            hi = mid
    return hi, held(hi)[1]
