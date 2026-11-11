"""Quasi-steady wave-propulsion model of a two-body wave glider (milestone 6p).

A surface float follows the sea surface in heave; a rigid tether makes the submerged wing rack ("sub") follow it, so the
wings see a vertical velocity w(t) = d(eta)/dt. Each wing pitches passively to a stop at +-theta_stop from horizontal;
the inflow angle is phi = atan(|w| / U), the angle of attack is max(phi - theta_stop, 0), and the forward force is
    F_x = 1/2 rho S V^2 (C_L sin(phi) - C_D cos(phi)),  V^2 = U^2 + w^2,
with C_L = min(a alpha, C_L_max), a = 2 pi AR / (AR + 2) (a lifting-line slope for a low aspect-ratio wing) and
C_D = C_D0 + C_L^2 / (pi e AR). The vehicle's own drag is 1/2 rho (C_D A) U^2. The steady speed U solves
<F_x>(U) = drag(U), averaged over a random-phase JONSWAP sea (gamma 3.3) of significant height Hs and peak period Tp.

Only the ratio r = S / (C_D A) enters (rho cancels), so r is the one fitted parameter. Because every angle depends on
U / w only, the solution scales exactly: U(Hs, Tp) = Hs * U(1, Tp). That is the model's falsifiable shape: at a fixed
period, speed is linear in wave height. Left out: sub lag and tether compliance, float pitch and surge, the float's
wave-following failure at short wavelengths, umbilical drag varying with angle, wind and current on the float.
None of the foil coefficients is sourced; theta_stop, AR, C_L_max, C_D0 and e are swept in the run scripts."""
import math
import random

G = 9.81


def jonswap(hs, tp, f, gamma=3.3):
    """JONSWAP spectral density S(f) (m^2/Hz), scaled numerically to the given Hs by the caller."""
    fp = 1.0 / tp
    s = 0.07 if f <= fp else 0.09
    pm = (f ** -5) * math.exp(-1.25 * (fp / f) ** 4)
    return pm * gamma ** math.exp(-((f - fp) ** 2) / (2 * s * s * fp * fp))


def heave_velocity(tp, hs=1.0, n_freq=80, duration=600.0, dt=0.5, seed=0):
    """Surface vertical velocity series (m/s) of a random-phase JONSWAP sea, scaled so the elevation has Hs = hs."""
    fp = 1.0 / tp
    fs = [fp * (0.5 + 2.5 * (i + 0.5) / n_freq) for i in range(n_freq)]
    df = fp * 2.5 / n_freq
    spec = [jonswap(hs, tp, f) for f in fs]
    m0 = sum(spec) * df
    scale = (hs / 4.0) ** 2 / m0
    amps = [math.sqrt(2 * s * scale * df) for s in spec]
    rng = random.Random(seed)
    ph = [rng.uniform(0, 2 * math.pi) for _ in fs]
    n = int(duration / dt)
    out = []
    for k in range(n):
        t = k * dt
        out.append(sum(-a * 2 * math.pi * f * math.sin(2 * math.pi * f * t + p) for a, f, p in zip(amps, fs, ph)))
    return out


class Foils:
    def __init__(self, theta_stop=30.0, aspect=2.0, cl_max=1.0, cd0=0.02, e=0.9):
        self.ts = math.radians(theta_stop)
        self.ar = aspect
        self.a = 2 * math.pi * aspect / (aspect + 2)
        self.clm = cl_max
        self.cd0 = cd0
        self.k = 1.0 / (math.pi * e * aspect)

    def thrust(self, u, w):
        """Mean forward force per unit (1/2 rho S) over the heave series w, at forward speed u (m/s)."""
        tot = 0.0
        for wi in w:
            aw = abs(wi)
            phi = math.atan2(aw, u)
            al = phi - self.ts
            cl = min(self.a * al, self.clm) if al > 0 else 0.0
            cd = self.cd0 + self.k * cl * cl
            tot += (u * u + aw * aw) * (cl * math.sin(phi) - cd * math.cos(phi))
        return tot / len(w)


def speed(r, w, foils, lo=1e-3, hi=5.0, iters=40):
    """Steady forward speed (m/s): r <F_x>(U) = U^2 by bisection; 0 if the foils give no net thrust at the lowest speed."""
    def g(u):
        return r * foils.thrust(u, w) - u * u
    if g(lo) <= 0:
        return 0.0
    if g(hi) > 0:
        return hi
    for _ in range(iters):
        m = 0.5 * (lo + hi)
        if g(m) > 0:
            lo = m
        else:
            hi = m
    return 0.5 * (lo + hi)


class Table:
    """Speed of a 1 m sea at each grid period, for any r, from one pass over a speed grid.

    For each period node the ratio r(U) = U^2 / <F_x>(U) is computed on a log-spaced speed grid; the steady speed for a
    given r is the largest grid speed with r(U) below r (linear interpolation between grid points). speed(r, hs, tp) is
    then hs * U(1, tp), linear in tp between nodes. Agrees with `speed` (bisection) to the grid spacing (tested)."""

    def __init__(self, foils=None, tps=None, n_u=160, u_lo=0.005, u_hi=3.0, **kw):
        self.foils = foils or Foils()
        self.tps = tps or [3.0 + 0.5 * i for i in range(35)]   # 3 to 20 s
        self.us = [u_lo * (u_hi / u_lo) ** (i / (n_u - 1)) for i in range(n_u)]
        self.curves = []
        for tp in self.tps:
            w = heave_velocity(tp, **kw)
            rs = []
            for u in self.us:
                f = self.foils.thrust(u, w)
                rs.append(u * u / f if f > 0 else float("inf"))
            self.curves.append(rs)

    def u1(self, r, k):
        rs, us = self.curves[k], self.us
        if rs[0] >= r:
            return 0.0
        j = 0
        while j + 1 < len(us) and rs[j + 1] < r:
            j += 1
        if j + 1 == len(us):
            return us[-1]
        x = (r - rs[j]) / (rs[j + 1] - rs[j])
        return us[j] + x * (us[j + 1] - us[j])

    def speed(self, r, hs, tp):
        tps = self.tps
        if tp <= tps[0]:
            return hs * self.u1(r, 0)
        if tp >= tps[-1]:
            return hs * self.u1(r, len(tps) - 1)
        i = min(int((tp - tps[0]) / (tps[1] - tps[0])), len(tps) - 2)
        x = (tp - tps[i]) / (tps[i + 1] - tps[i])
        return hs * (self.u1(r, i) * (1 - x) + self.u1(r, i + 1) * x)
