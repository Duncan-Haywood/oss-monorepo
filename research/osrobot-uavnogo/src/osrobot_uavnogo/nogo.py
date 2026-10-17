"""Launch go/no-go wind limit on top of osrobot-uavgust (imported from ../osrobot-uavgust/src and its siblings).

The airframe is sized for a limit wind L. The crew launches only if the forecast of the mission wind is at most L.
The forecast of |w| is |w| + e with e ~ Normal(0, sf) (sf = 0 is a perfect forecast). The wind per mission is the
steady draw of osrobot-uavgust. Outcomes per attempted mission, from the discretised wind distribution:
  scrub     = no launch (forecast above L)
  failure   = launched but the frozen design cannot hold the required stay (reserve kept)
  completed = launched and held the stay
All inputs are scenario assumptions, not site data.
"""
import math
from osrobot_uavgust.gust import wind_pmf, quantile, size_for, stay


TOL = 0.01  # s; sizing closes the stay only to about 1e-4 s, so a design exactly at its limit wind is not a failure


def _phi(x):
    return 0.5 * (1 + math.erf(x / math.sqrt(2)))


def p_launch(w, limit, sf):
    """P(forecast of |w| <= limit) when the true magnitude is w."""
    if sf <= 0:
        return 1.0 if w <= limit else 0.0
    return _phi((limit - w) / sf)


def outcomes(kind, design, ms, pmf, limit, sf, spend_reserve=False):
    """(P(scrub), P(failure), P(completed)) per attempt; they sum to 1."""
    scrub = fail = done = 0.0
    for w, p in pmf:
        pl = p_launch(w, limit, sf)
        s = stay(kind, design, ms, w, spend_reserve)
        ok = s is not None and s >= ms.loiter - TOL
        scrub += p * (1 - pl)
        if ok:
            done += p * pl
        else:
            fail += p * pl
    return scrub, fail, done


def design_for_limit(kind, ms, limit):
    return size_for(kind, ms, limit)
