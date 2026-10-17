"""Backlash twin.  Real actuator: load y follows motor m through a gap of half-width h (the play operator),
y+ = max(m - h, min(m + h, y)).  Twin actuator: y = m (h = 0).

Loop (discrete PI on a velocity-commanded motor, load position measured): z+ = z + y, m+ = m - kp*y - ki*z+.
Twin (h = 0) characteristic polynomial z^2 - (2 - kp - ki) z + (1 - kp): stable iff spectral radius < 1, so the
twin says the loop converges to 0.  With h > 0 the loop is piecewise linear, hence positively homogeneous: a
limit cycle scales exactly with h.  Harmonic balance uses the backlash describing function N(A) (amplitude A of m)
against G(z) = (kp + ki z/(z-1))/(z-1):  1 + N(A) G(e^{jw}) = 0.
"""
import cmath
import math


def play(y, m, h):
    return max(m - h, min(m + h, y))


def run_loop(kp, ki, h, x0, n):
    """Real loop from load = motor = x0, z = 0.  Returns (ms, ys) of length n."""
    y = m = x0
    z = 0.0
    ms, ys = [], []
    for _ in range(n):
        z += y
        m += -(kp * y + ki * z)
        y = play(y, m, h)
        ms.append(m)
        ys.append(y)
    return ms, ys


def twin_radius(kp, ki):
    """Spectral radius of the h = 0 loop."""
    tr, det = 2 - kp - ki, 1 - kp
    disc = tr * tr - 4 * det
    if disc >= 0:
        s = math.sqrt(disc)
        return max(abs(tr + s), abs(tr - s)) / 2
    return math.sqrt(det)


def describing_function(A, h):
    """Closed-form backlash DF, amplitude A >= h of the motor sinusoid: complex N = (b1 + j a1)/A (load first harmonic)."""
    if A <= h:
        return 0j
    c = 1 - 2 * h / A
    b1 = (math.pi / 2 + math.asin(c) + c * math.sqrt(1 - c * c)) / math.pi
    a1 = -(4 * h / (math.pi * A)) * (1 - h / A)
    return complex(b1, a1)


def fourier_df(A, h, n=4096, cycles=6):
    """Numerical first harmonic of play(A sin) in steady state (last cycle), same normalisation as describing_function."""
    y = 0.0
    out = []
    for t in range(n * cycles):
        m = A * math.sin(2 * math.pi * t / n)
        y = play(y, m, h)
        if t >= n * (cycles - 1):
            out.append((t % n, y))
    b1 = sum(v * math.sin(2 * math.pi * t / n) for t, v in out) * 2 / n
    a1 = sum(v * math.cos(2 * math.pi * t / n) for t, v in out) * 2 / n
    return complex(b1 / A, a1 / A)


def G(w, kp, ki):
    z = cmath.exp(1j * w)
    return (kp + ki * z / (z - 1)) / (z - 1)


def _resid(A, w, kp, ki):
    return abs(1 + describing_function(A, 1.0) * G(w, kp, ki))


def predict_cycle(kp, ki, tol=1e-9):
    """Harmonic-balance limit cycle (A/h, w) with h = 1: coarse grid for the best start, then pattern search on
    (A, w).  Returns (A, w, residual); a residual above ~1e-6 means no solution was found."""
    best = (1e9, 2.0, 0.5)
    for i in range(1, 200):
        A = 1.0 + 0.05 * i ** 1.5 * 0.1
        for j in range(1, 300):
            w = math.pi * j / 300
            r = _resid(A, w, kp, ki)
            if r < best[0]:
                best = (r, A, w)
    r, A, w = best
    sa, sw = 0.05, 0.01
    while sa > tol and sw > tol:
        moved = False
        for da, dw in ((sa, 0), (-sa, 0), (0, sw), (0, -sw), (sa, sw), (sa, -sw), (-sa, sw), (-sa, -sw)):
            a2, w2 = A + da, w + dw
            if a2 <= 1.0 or not 0 < w2 < math.pi:
                continue
            r2 = _resid(a2, w2, kp, ki)
            if r2 < r:
                r, A, w, moved = r2, a2, w2, True
        if not moved:
            sa, sw = sa / 2, sw / 2
    return A, w, r


def measured_cycle(ms):
    """Amplitude of the motor signal and period from upward zero crossings over the given tail."""
    a = (max(ms) - min(ms)) / 2
    ups = [i for i in range(1, len(ms)) if ms[i - 1] < 0 <= ms[i]]
    period = (ups[-1] - ups[0]) / (len(ups) - 1) if len(ups) > 1 else None
    return a, period
