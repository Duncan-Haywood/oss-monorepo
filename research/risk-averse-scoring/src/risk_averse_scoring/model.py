"""Risk-averse (CARA / general concave utility) reporting under proper scoring rules.

Binary event y in {0,1}, verifier believes P(y=1)=p, reports r, is paid
S(r,y) = a + b*s(r,y) with s = ln r / ln(1-r) (log) or 1-(r-y)^2 (Brier),
and maximises expected utility E u(S).
"""
import math, random


def logit(p):
    return math.log(p / (1 - p))


def expit(x):
    return 1 / (1 + math.exp(-x))


def cara(alpha):
    return lambda x: -math.exp(-alpha * x) if alpha > 0 else x


def score(kind, r, y):
    if kind == "log":
        return math.log(r if y else 1 - r)
    if kind == "brier":
        return 1 - (r - y) ** 2
    raise ValueError(kind)


def expected_utility(p, r, kind, u, a=0.0, b=1.0):
    return p * u(a + b * score(kind, r, 1)) + (1 - p) * u(a + b * score(kind, r, 0))


def _argmax(f, lo=1e-9, hi=1 - 1e-9, it=200):
    """Golden-section search for a unimodal maximum on (0,1)."""
    g = (math.sqrt(5) - 1) / 2
    c, d = hi - g * (hi - lo), lo + g * (hi - lo)
    fc, fd = f(c), f(d)
    for _ in range(it):
        if fc > fd:
            hi, d, fd = d, c, fc
            c = hi - g * (hi - lo)
            fc = f(c)
        else:
            lo, c, fc = c, d, fd
            d = lo + g * (hi - lo)
            fd = f(d)
    return (lo + hi) / 2


def best_report(p, kind, u, a=0.0, b=1.0):
    """Numerical utility-maximising report."""
    return _argmax(lambda r: expected_utility(p, r, kind, u, a, b))


# ---- exact laws (CARA, k = alpha*b) ----
def log_report(p, k):
    """Log score: reported odds = true odds^(1/(1+k))."""
    return expit(logit(p) / (1 + k))


def brier_debias(r, k):
    """Brier: true belief implied by report r, logit p = logit r + k(2r-1)."""
    return expit(logit(r) + k * (2 * r - 1))


def brier_report(p, k):
    """Invert the (monotone) Brier law by bisection."""
    lo, hi = 1e-12, 1 - 1e-12
    target = logit(p)
    for _ in range(200):
        mid = (lo + hi) / 2
        if logit(mid) + k * (2 * mid - 1) < target:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


def brier_first_order(p, k):
    return p - k * p * (1 - p) * (2 * p - 1)


# ---- binarised (lottery) rule: prize Pi w.p. Brier score in [0,1] ----
def binarised_win_prob(p, r):
    return 1 - p * (1 - r) ** 2 - (1 - p) * r ** 2


def binarised_utility(p, r, u, prize=1.0):
    P = binarised_win_prob(p, r)
    return P * u(prize) + (1 - P) * u(0.0)


def binarised_report(p, u, prize=1.0):
    return _argmax(lambda r: binarised_utility(p, r, u, prize))


def cara_certainty_equivalent(P, prize, alpha):
    """CE of a lottery paying `prize` w.p. P, else 0, under CARA(alpha)."""
    return -math.log(P * math.exp(-alpha * prize) + 1 - P) / alpha


# ---- decisions ----
def log_decision_threshold(tau, k):
    """True belief needed for the tempered log report to reach tau."""
    return expit((1 + k) * logit(tau))


def decision_regret_band(tau, k):
    """Under p ~ U(0,1) with regret |p - tau| for a wrong accept/reject call,
    expected regret of thresholding tempered log reports at tau."""
    t2 = log_decision_threshold(tau, k)
    return 0.5 * (t2 - tau) ** 2 if t2 > tau else 0.5 * (tau - t2) ** 2


def max_scale_for_distortion(alpha, delta):
    """Largest score scale b with odds exponent 1/(1+alpha b) >= 1-delta."""
    return delta / ((1 - delta) * alpha)


# ---- aggregation ----
def simulate_aggregation(n, mu, ks, trials=20000, seed=0):
    """y~Bern(1/2); verifier i sees x_i~N((2y-1)mu,1); posterior logit L_i=2 mu x_i.
    Log-scored CARA verifier i reports logit L_i/(1+k_i). Returns mean log-loss of
    Bayes, naive sum of reports, sum corrected with mean k, sum corrected with true k_i."""
    rng = random.Random(seed)
    kbar = sum(ks) / n
    tot = {"bayes": 0.0, "naive": 0.0, "kbar": 0.0, "true_k": 0.0}

    def ll(L, y):
        # -ln P(y) with P(y=1)=expit(L), numerically stable
        z = L if y else -L
        return math.log1p(math.exp(-z)) if z > -30 else -z

    for _ in range(trials):
        y = rng.random() < 0.5
        L = [2 * mu * (rng.gauss((1 if y else -1) * mu, 1)) for _ in range(n)]
        rep = [L[i] / (1 + ks[i]) for i in range(n)]
        tot["bayes"] += ll(sum(L), y)
        tot["naive"] += ll(sum(rep), y)
        tot["kbar"] += ll((1 + kbar) * sum(rep), y)
        tot["true_k"] += ll(sum((1 + ks[i]) * rep[i] for i in range(n)), y)
    return {k: v / trials for k, v in tot.items()}
