import random
from bisect import bisect_right


def max_window_admitted(times, window):
    """Largest number of admitted ticks in any rolling window of `window`
    ticks, i.e. in (t - window, t] for some t. `times` is sorted."""
    best, lo = 0, 0
    for hi, t in enumerate(times):
        while times[lo] <= t - window:
            lo += 1
        best = max(best, hi - lo + 1)
    return best


def _admitted(cls, limit, window, arrivals):
    lim = cls(limit, window)
    return [t for t in arrivals if lim.allow(t)]


def flood_pattern_search(cls, limit, window, horizon_windows=4):
    """Adversary: stay silent for `idle` ticks, then send one request every
    tick (a flood) for the rest of the horizon. Searches every idle in
    [0, 2*window). Returns the worst rolling-window count and its idle."""
    horizon = horizon_windows * window
    worst, arg = 0, 0
    for idle in range(2 * window):
        arrivals = range(idle, horizon)
        got = max_window_admitted(_admitted(cls, limit, window, arrivals), window)
        if got > worst:
            worst, arg = got, idle
    return worst, arg


def two_burst_search(cls, limit, window, horizon_windows=4):
    """Adversary: flood [a, a+d1), go silent, flood again from b to the end.
    Searches a in [0, window), d1 in 1..window, gap in 0..window."""
    horizon = horizon_windows * window
    worst = 0
    for a in range(window):
        for d1 in range(1, window + 1):
            for gap in range(window + 1):
                b = a + d1 + gap
                arrivals = list(range(a, a + d1)) + list(range(b, horizon))
                got = max_window_admitted(_admitted(cls, limit, window, arrivals), window)
                worst = max(worst, got)
    return worst


def poisson_overload(cls, limit, window, load, windows=2000, seed=1):
    """Poisson arrivals at `load` times the nominal rate limit/window per tick.
    Returns (admitted per window, share of rolling windows over `limit`)."""
    rng = random.Random(seed)
    rate = load * limit / window
    horizon = windows * window
    t, arrivals = 0.0, []
    while True:
        t += rng.expovariate(rate)
        if t >= horizon:
            break
        arrivals.append(int(t))
    adm = _admitted(cls, limit, window, arrivals)
    per_window = len(adm) / windows
    over, n = 0, 0
    lo = 0
    # rolling window evaluated at every admitted request
    for hi, x in enumerate(adm):
        while adm[lo] <= x - window:
            lo += 1
        if x >= window:
            n += 1
            over += (hi - lo + 1) > limit
    return per_window, (over / n if n else 0.0)
