"""Wind uncertainty on top of osrobot-uavwind (imported from ../osrobot-uavwind/src and ../osrobot-uav/src).

The along-track wind that a mission meets is not known when the airframe is sized. It is modelled as one draw
w ~ Normal(mu, sigma) per mission, held steady during that mission (the steady-wind model of osrobot-uavwind cannot
represent a time-varying gust), and the out-and-back model is sign-symmetric, so the magnitude |w| is what matters.
The distribution is discretised exactly (normal CDF, bins of STEP m/s), so every probability below is deterministic.
A design "succeeds" in a wind if the frozen airframe still has at least the required stay on station.
mu and sigma are scenario inputs, not measurements of any real site.
"""
import math
from osrobot_uavwind import wind as W
from osrobot_uav import model as M

STEP = 0.25   # m/s, width of one wind bin
WMAX = 30.0   # m/s, tail beyond this is lumped into the last bin


def _cdf(x, mu, sigma):
    return 0.5 * (1 + math.erf((x - mu) / (sigma * math.sqrt(2))))


def wind_pmf(mu, sigma, step=STEP, wmax=WMAX):
    """[(|w| bin centre, probability)] for |Normal(mu, sigma)|; sums to 1."""
    n = int(round(wmax / step))
    pmf = []
    for i in range(n):
        lo, hi = i * step, (i + 1) * step
        # P(lo <= |w| < hi) = P(lo <= w < hi) + P(-hi < w <= -lo)
        p = _cdf(hi, mu, sigma) - _cdf(lo, mu, sigma) + _cdf(-lo, mu, sigma) - _cdf(-hi, mu, sigma)
        if i == n - 1:
            p += 1 - _cdf(hi, mu, sigma) + _cdf(-hi, mu, sigma)
        pmf.append((lo + step / 2, p))
    return pmf


def quantile(pmf, q):
    """Smallest bin centre whose cumulative probability reaches q."""
    c = 0.0
    for w, p in pmf:
        c += p
        if c >= q - 1e-12:
            return w
    return pmf[-1][0]


def stay(kind, design, ms, w, spend_reserve=False):
    """Seconds on station left for a frozen design in wind w (None: cannot make the trip or hold station).
    spend_reserve=True also counts the RESERVE fraction the sizing keeps back."""
    d = dict(design)
    if spend_reserve:
        d["m_bat"] = d["m_bat"] * (1 + M.RESERVE)
    return W.frozen_loiter(kind, d, W.WindMission(ms.dist, ms.loiter, ms.m_pay, ms.p_pay, wind=w))


def success_prob(kind, design, ms, pmf, spend_reserve=False):
    """P(stay >= the mission's required loiter) over the wind distribution."""
    tot = 0.0
    for w, p in pmf:
        s = stay(kind, design, ms, w, spend_reserve)
        if s is not None and s >= ms.loiter - 1e-6:
            tot += p
    return tot


def size_for(kind, ms, w):
    """Closed design for a steady wind w (no credit for translational lift)."""
    m = W.WindMission(ms.dist, ms.loiter, ms.m_pay, ms.p_pay, wind=w)
    return {"mr": W.size_multirotor, "fw": W.size_fixedwing}[kind](m)


def expected_stay(kind, design, ms, pmf, spend_reserve=False):
    """Mean seconds on station over the wind distribution, counting a failed trip as 0 and capping at the requirement."""
    tot = 0.0
    for w, p in pmf:
        s = stay(kind, design, ms, w, spend_reserve)
        tot += p * (0.0 if s is None else min(s, ms.loiter))
    return tot / ms.loiter
