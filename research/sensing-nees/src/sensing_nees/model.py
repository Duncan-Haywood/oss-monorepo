"""1-D INS/GNSS Kalman filter whose accelerometer bias is 1/f ("flicker") noise.

The accelerometer measures m = b + w (the true acceleration is zero, so the filter's state
error is its state). w is white with density N (m/s^2/sqrt(Hz)). The truth bias b is a sum of
first-order Gauss-Markov processes with time constants TAUS and equal variance, which gives a
1/f spectrum over the decades they span and an Allan-deviation floor (the "bias instability").
GNSS gives position fixes at 1 Hz with noise sg (m); then it drops out for an outage.

A filter is a list of bias components: ("gm", sigma, tau) or ("rw", q) with q in (m/s^2)/sqrt(s).
Because the Kalman covariance does not depend on the data, it is computed once per filter; the
state errors are then run for R Monte Carlo paths in one array, with the same gains.
"""
import numpy as np
from dataclasses import dataclass
from scipy.signal import lfilter

G = 9.80665
DT = 0.1
TAUS = (1.0, 10.0, 100.0, 1000.0, 10000.0)


@dataclass(frozen=True)
class Spec:
    N: float            # white accel density the filter believes, m/s^2/sqrt(Hz)
    comps: tuple        # bias components, see module docstring


def truth_bias(scale, n, R, rng, dt=DT, taus=TAUS):
    """R paths of n samples of the flicker bias; each starts in its stationary distribution."""
    out = np.zeros((R, n))
    for tau in taus:
        a = np.exp(-dt / tau)
        s = scale / np.sqrt(len(taus))
        e = rng.standard_normal((R, n)) * s * np.sqrt(1 - a * a)
        e[:, 0] = rng.standard_normal(R) * s
        out += lfilter([1.0], [1.0, -a], e, axis=1)
    return out


def adev(x, tau, dt=DT):
    """Non-overlapping Allan deviation of an acceleration series x at averaging time tau."""
    m = int(round(tau / dt))
    k = len(x) // m
    if k < 3:
        return np.nan
    y = x[:k * m].reshape(k, m).mean(axis=1)
    return float(np.sqrt(0.5 * np.mean(np.diff(y) ** 2)))


def _series(scale, N, n, rng, dt=DT):
    return truth_bias(scale, n, 1, rng, dt)[0] + rng.standard_normal(n) * N / np.sqrt(dt)


def calibrate_scale(B, N, seed=1, n=2_000_000, grid=(1, 3, 10, 30, 100, 300, 1000)):
    """Scale of the flicker bias at which the minimum of the Allan curve of b + w equals B."""
    rng = np.random.default_rng(seed)
    base = _series(1.0, N, n, rng)
    z = np.random.default_rng(seed + 1).standard_normal(n) * N / np.sqrt(DT)
    flick = base - z

    def floor(s):
        return min(adev(s * flick + z, t) for t in grid)
    lo, hi = 1e-7, 1.0
    for _ in range(40):
        mid = np.sqrt(lo * hi)
        lo, hi = (mid, hi) if floor(mid) < B else (lo, mid)
    return float(np.sqrt(lo * hi))


def filter_spec_oracle(scale, N, taus=TAUS):
    s = scale / np.sqrt(len(taus))
    return Spec(N, tuple(("gm", s, t) for t in taus))


def filter_spec_white(N):
    return Spec(N, ())


def filter_spec_rw(q, N):
    return Spec(N, (("rw", q),))


def rw_from_allan(sig, tau, N):
    """Random-walk density that makes (white + random walk) match a read-off Allan value."""
    ex = sig ** 2 - N ** 2 / tau
    return float(np.sqrt(max(ex, 0.0) * 3.0 / tau))


def _build(spec, dt, sg, p0=(10.0, 1.0)):
    nb = len(spec.comps)
    n = 2 + nb
    F = np.eye(n)
    F[0, 1] = dt
    g = np.zeros(n)
    g[0], g[1] = dt * dt / 2, dt
    Q = np.outer(g, g) * spec.N ** 2 / dt
    P0 = np.zeros((n, n))
    P0[0, 0], P0[1, 1] = p0[0] ** 2, p0[1] ** 2
    for j, c in enumerate(spec.comps):
        i = 2 + j
        F[0, i], F[1, i] = -dt * dt / 2, -dt
        if c[0] == "gm":
            a = np.exp(-dt / c[2])
            F[i, i] = a
            Q[i, i] += c[1] ** 2 * (1 - a * a)
            P0[i, i] = c[1] ** 2
        else:
            Q[i, i] += c[1] ** 2 * dt
            P0[i, i] = (5e-3) ** 2
    return F, g, Q, P0


def covariance_run(spec, warm, outage, dt=DT, sg=2.0, fix_every=1.0):
    """Filter covariance and gains over warm seconds with GNSS and outage seconds without.
    Returns F, g, list of per-step gains (None when no fix), P trace of the (pos, vel) block."""
    F, g, Q, P = _build(spec, dt, sg)
    n = F.shape[0]
    steps = int(round((warm + outage) / dt))
    nw = int(round(warm / dt))
    every = int(round(fix_every / dt))
    gains, blocks = [], []
    for k in range(steps):
        P = F @ P @ F.T + Q
        K = None
        if k < nw and (k + 1) % every == 0:
            S = P[0, 0] + sg ** 2
            K = P[:, 0] / S
            P = P - np.outer(K, P[0, :])
        gains.append(K)
        blocks.append(P[:2, :2].copy())
    return F, g, gains, blocks, nw


def monte_carlo(spec, scale, N_true, warm=600.0, outage=300.0, R=400, seed=7, sg=2.0, dt=DT):
    """Run R paths. Returns time-into-outage axis, position errors (R, T), claimed (pos, vel)
    covariance blocks (T, 2, 2) and the vel error (R, T)."""
    rng = np.random.default_rng(seed)
    F, g, gains, blocks, nw = covariance_run(spec, warm, outage, dt, sg)
    steps = len(gains)
    n = F.shape[0]
    b = truth_bias(scale, steps, R, rng, dt)
    m = b + rng.standard_normal((R, steps)) * N_true / np.sqrt(dt)
    r = rng.standard_normal((R, steps)) * sg
    x = np.zeros((R, n))
    pe = np.zeros((R, steps - nw))
    ve = np.zeros((R, steps - nw))
    for k in range(steps):
        x = x @ F.T + m[:, k:k + 1] * g
        if gains[k] is not None:
            y = r[:, k] - x[:, 0]
            x = x + y[:, None] * gains[k][None, :]
        if k >= nw:
            pe[:, k - nw] = x[:, 0]
            ve[:, k - nw] = x[:, 1]
    t = (np.arange(steps - nw) + 1) * dt
    return t, pe, ve, np.array(blocks[nw:])


def nees(pe, ve, blocks, idx):
    """Mean NEES per degree of freedom of the (pos, vel) error at outage sample idx."""
    e = np.stack([pe[:, idx], ve[:, idx]], axis=1)
    Pinv = np.linalg.inv(blocks[idx])
    q = np.einsum("ri,ij,rj->r", e, Pinv, e)
    return float(q.mean() / 2.0)
