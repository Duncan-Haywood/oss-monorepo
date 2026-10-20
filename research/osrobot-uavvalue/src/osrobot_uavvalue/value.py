"""Money value of a go/no-go rule, on top of osrobot-uavnogo (imported from ../osrobot-uavnogo/src and its siblings).

Per attempted mission the crew earns V for a completed observation, loses the aircraft (price P per kg times its mass)
on a failure, pays c_scrub for a scrubbed day, and carries the aircraft's price spread over N attempts.
Two knobs: the design limit L (airframe sized for wind L) and the launch threshold T (launch if forecast <= T).
All money figures are scenario assumptions, not prices or market data.
"""
from osrobot_uavnogo.nogo import outcomes, design_for_limit


def net_value(kind, ms, pmf, L, T, sf, V, P, c_scrub, N, _cache={}):
    key = (kind, tuple(sorted(vars(ms).items())), L)
    if key not in _cache:
        _cache[key] = design_for_limit(kind, ms, L)
    d = _cache[key]
    sc, fl, dn = outcomes(kind, d, ms, pmf, T, sf)
    m = d["mass"]
    return V * dn - P * m * fl - c_scrub * sc - P * m / N, (sc, fl, dn, m)


def best_rule(kind, ms, pmf, grid, sf, V, P, c_scrub, N, tied=False):
    """Maximise net value over L (and T, unless tied=True forces T = L). Returns (value, L, T, parts)."""
    best = None
    for L in grid:
        for T in ([L] if tied else grid):
            v, parts = net_value(kind, ms, pmf, L, T, sf, V, P, c_scrub, N)
            if best is None or v > best[0]:
                best = (v, L, T, parts)
    return best
