"""Mutual radar interference between K robots near a victim radar.

Interferer i sits at distance d_i from the victim, uniform in the annulus d0 <= d <= R (so d^2 ~ U[d0^2, R^2]),
and delivers power c / d_i^2 when its chirp overlaps the victim's frame, which happens w.p. q independently per frame.
The victim detects a target of echo power S iff S / (1 + I) >= T (noise power = 1)."""
import math
import random


def echo_power(r, snr0, r0):
    return snr0 * (r0 / r) ** 4


def clear_range(snr0, r0, T):
    """Largest range with S/1 >= T."""
    return r0 * (snr0 / T) ** 0.25


def mean_inv_d2(d0, R):
    return math.log(R * R / (d0 * d0)) / (R * R - d0 * d0)


def mean_interference(c, d0, R, q, K):
    """E[total interference power] = K q c E[1/d^2]."""
    return K * q * c * mean_inv_d2(d0, R)


def mean_rise_range(snr0, r0, T, c, d0, R, q, K):
    """Range of the twin whose noise floor is raised by the mean interference, always on."""
    return r0 * (snr0 / (T * (1 + mean_interference(c, d0, R, q, K)))) ** 0.25


def draw_d2(d0, R, rng):
    return d0 * d0 + (R * R - d0 * d0) * rng.random()


def draw_geometry(K, d0, R, rng):
    return [c_inv for c_inv in (1.0 / draw_d2(d0, R, rng) for _ in range(K))]  # list of 1/d^2


def frame_interference(inv_d2, c, q, rng):
    return sum(c * x for x in inv_d2 if rng.random() < q)


def detect(S, I, T):
    return S >= T * (1 + I)


def pd_one_interferer(S, T, c, d0, R, q):
    """Exact per-frame detection probability, K = 1: clear w.p. 1-q; else need c/d^2 <= S/T - 1."""
    x = S / T - 1.0
    if x < 0:
        return 0.0
    if x == 0:
        p_ok = 0.0
    else:
        p_ok = min(1.0, max(0.0, (R * R - c / x) / (R * R - d0 * d0)))  # P(d^2 >= c/x)
    return (1 - q) + q * p_ok


def pd_frame_mc(S, T, c, d0, R, q, K, n, rng):
    """Per-frame detection prob with geometry redrawn every frame (marginal over geometry)."""
    ok = 0
    for _ in range(n):
        g = draw_geometry(K, d0, R, rng)
        ok += detect(S, frame_interference(g, c, q, rng), T)
    return ok / n


def pd_given_geometry(S, T, inv_d2, c, q):
    """Exact per-frame Pd for a fixed geometry: sum over hit subsets (K small)."""
    K = len(inv_d2)
    tot = 0.0
    for mask in range(1 << K):
        p, I = 1.0, 0.0
        for i in range(K):
            if mask >> i & 1:
                p *= q
                I += c * inv_d2[i]
            else:
                p *= 1 - q
        if S >= T * (1 + I):
            tot += p
    return tot


def binom_tail(n, m, p):
    """P(Binomial(n, p) >= m)."""
    return sum(math.comb(n, j) * p ** j * (1 - p) ** (n - j) for j in range(m, n + 1))


def mission_success_fixed(S, T, inv_d2, c, q, n, m):
    """P(>= m of n frames detect) for one mission with fixed geometry."""
    return binom_tail(n, m, pd_given_geometry(S, T, inv_d2, c, q))


def range_at_pd(pd_fn, target, lo, hi, it=40):
    """Largest r in [lo, hi] with pd_fn(r) >= target, assuming pd_fn non-increasing in r."""
    if pd_fn(lo) < target:
        return lo
    if pd_fn(hi) >= target:
        return hi
    for _ in range(it):
        mid = 0.5 * (lo + hi)
        if pd_fn(mid) >= target:
            lo = mid
        else:
            hi = mid
    return lo
