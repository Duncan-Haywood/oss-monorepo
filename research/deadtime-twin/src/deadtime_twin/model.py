"""Dead-time (pile-up) model of a single-photon lidar detector vs an ideal linear counter twin. Pure Python."""
import math
import random

SQRT2PI = math.sqrt(2 * math.pi)


def phi(t):
    return math.exp(-0.5 * t * t) / SQRT2PI


def Phi(t):
    return 0.5 * math.erfc(-t / math.sqrt(2))


# ---- counting rate: x = n*tau (flux times dead time), y = m*tau (observed rate times dead time) ----
def rate_twin(x):
    """Ideal counter twin: observed = true."""
    return x


def rate_nonpar(x):
    """Non-paralyzable dead time: m = n / (1 + n tau)."""
    return x / (1 + x)


def rate_par(x):
    """Paralyzable dead time: m = n exp(-n tau)."""
    return x * math.exp(-x)


def invert_nonpar(y):
    """Exact flux from observed rate, y < 1."""
    if not 0 <= y < 1:
        raise ValueError("observed rate must satisfy m*tau < 1")
    return y / (1 - y)


def invert_par(y):
    """Both fluxes x with x exp(-x) = y: (low branch x<=1, high branch x>=1); None if y > 1/e."""
    if y < 0 or y > 1 / math.e:
        return None
    lo, hi = 0.0, 1.0
    for _ in range(200):
        mid = (lo + hi) / 2
        if rate_par(mid) < y:
            lo = mid
        else:
            hi = mid
    low = (lo + hi) / 2
    lo, hi = 1.0, 800.0
    for _ in range(300):
        mid = (lo + hi) / 2
        if rate_par(mid) > y:
            lo = mid
        else:
            hi = mid
    return low, (lo + hi) / 2


# ---- first-photon timing: pulse intensity N*phi(t) (sigma = 1), detector fires on the first photon ----
def first_photon_pdf(t, N):
    return N * phi(t) * math.exp(-N * Phi(t))


def _quad(f, a=-9.0, b=9.0, n=18000):
    h = (b - a) / n
    s = f(a) + f(b)
    for i in range(1, n):
        s += f(a + i * h) * (4 if i % 2 else 2)
    return s * h / 3


def p_detect(N):
    return 1 - math.exp(-N)


def first_photon_moments(N):
    """(mean, std) of the first-photon time in units of sigma, conditional on a detection (exact quadrature)."""
    z = _quad(lambda t: first_photon_pdf(t, N))
    m = _quad(lambda t: t * first_photon_pdf(t, N)) / z
    v = _quad(lambda t: t * t * first_photon_pdf(t, N)) / z - m * m
    return m, math.sqrt(v)


def first_photon_mode(N):
    """Histogram peak: argmax of N phi(t) exp(-N Phi(t)) (golden-section on a unimodal density)."""
    a, b = -9.0, 9.0
    g = (math.sqrt(5) - 1) / 2
    c, d = b - g * (b - a), a + g * (b - a)
    for _ in range(200):
        if first_photon_pdf(c, N) > first_photon_pdf(d, N):
            b, d = d, c
            c = b - g * (b - a)
        else:
            a, c = c, d
            d = a + g * (b - a)
    return (a + b) / 2


def sample_first_photons(N, pulses, rng):
    """Monte Carlo: per pulse draw Poisson(N) photons with N(0,1) times, keep the earliest (None if no photon)."""
    out = []
    for _ in range(pulses):
        k, L, p = 0, math.exp(-N), 1.0
        while True:  # Knuth Poisson
            p *= rng.random()
            if p <= L:
                break
            k += 1
        out.append(min(rng.gauss(0, 1) for _ in range(k)) if k else None)
    return out


def coates_mean(times, pulses, lo=-6.0, hi=6.0, width=0.1):
    """Coates pile-up-corrected mean arrival time from first-photon histogram: lambda_k = -ln(1 - h_k / (M - sum_{j<k} h_j))."""
    nb = int(round((hi - lo) / width))
    h = [0] * nb
    for t in times:
        if t is not None and lo <= t < hi:
            h[int((t - lo) / width)] += 1
    left, num, den = pulses, 0.0, 0.0
    for k in range(nb):
        if left <= 0:
            break
        lam = -math.log(1 - h[k] / left) if h[k] < left else 0.0
        c = lo + (k + 0.5) * width
        num += lam * c
        den += lam
        left -= h[k]
    return num / den
