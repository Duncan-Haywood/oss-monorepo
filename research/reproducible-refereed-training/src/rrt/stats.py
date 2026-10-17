"""Small statistics helpers and the drift-sampling routine (stdlib only)."""
import math
import random

from .fp32 import f32, ORDERS, dot

U = 2.0 ** -24  # float32 unit roundoff


def quantile(xs, q):
    s = sorted(xs)
    return s[min(len(s) - 1, int(q * len(s)))]


def excess_kurtosis(xs):
    m = sum(xs) / len(xs)
    v = sum((x - m) ** 2 for x in xs) / len(xs)
    return sum((x - m) ** 4 for x in xs) / len(xs) / (v * v) - 3 if v > 0 else float("nan")


def make_inputs(kind, n, rng):
    if kind == "positive":
        x = [f32(rng.random()) for _ in range(n)]
        y = [f32(rng.random()) for _ in range(n)]
    elif kind == "gaussian":
        x = [f32(rng.gauss(0, 1)) for _ in range(n)]
        y = [f32(rng.gauss(0, 1)) for _ in range(n)]
    elif kind == "heavy":  # Cauchy-ish magnitudes: a few dominant terms
        x = [f32(rng.gauss(0, 1) / max(1e-3, abs(rng.gauss(0, 1)))) for _ in range(n)]
        y = [f32(rng.gauss(0, 1)) for _ in range(n)]
    else:
        raise ValueError(kind)
    return x, y


def sample_drift(kind, n, order_a, order_b, trials, seed=0):
    """Normalised drift |a-b| / (u * sum|x_i y_i|) between two reduction orders."""
    rng = random.Random(seed)
    out = []
    for _ in range(trials):
        x, y = make_inputs(kind, n, rng)
        scale = sum(abs(a * b) for a, b in zip(x, y))
        a = dot(x, y, order_a, rng)
        b = dot(x, y, order_b, rng)
        out.append(abs(a - b) / (U * scale))
    return out


def sample_drift_pair(kind, n, order_a, order_b, trials, seed=0):
    """Returns (abs_norm, rel): drift normalised by u*sum|p| and by u*|exact result|."""
    from .fp32 import exact_dot
    rng = random.Random(seed)
    ab, rel = [], []
    for _ in range(trials):
        x, y = make_inputs(kind, n, rng)
        scale = sum(abs(a * b) for a, b in zip(x, y))
        d = abs(dot(x, y, order_a, rng) - dot(x, y, order_b, rng))
        ex = abs(exact_dot(x, y))
        ab.append(d / (U * scale))
        rel.append(d / (U * ex) if ex > 0 else float("inf"))
    return ab, rel


def hill(xs, k):
    """Hill tail-index estimate from the k largest finite values (smaller = heavier tail)."""
    s = sorted((x for x in xs if 0 < x < float("inf")), reverse=True)
    if len(s) <= k:
        return float("nan")
    return k / sum(math.log(s[i] / s[k]) for i in range(k))


def gauss_tail_quantile(xs, q):
    """q-quantile of |N(0, sigma^2)| with sigma matched to the sample RMS."""
    rms = math.sqrt(sum(x * x for x in xs) / len(xs))
    lo, hi = 0.0, 50.0
    for _ in range(80):
        mid = (lo + hi) / 2
        if math.erf(mid / math.sqrt(2)) < q:
            lo = mid
        else:
            hi = mid
    return rms * lo
