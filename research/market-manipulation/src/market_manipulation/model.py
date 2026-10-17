"""Manipulating an LMSR verification market (Hanson-Oprea style) with endogenous informed entry.

Event Y=1 means "the claimed training result is valid", prior q < 1/2. A market maker runs a binary LMSR with liquidity b.
With probability mu a manipulator (no information) buys YES until the price reaches tau >= 1/2. Then N potential informed
traders, each able to learn Y perfectly at cost c, decide whether to enter; the first entrant trades the price to 1-eps (Y=1)
or eps (Y=0) and the rent is shared equally in expectation among entrants. The decision is 'accept' iff the final price >= 1/2.
"""
import math, random

__all__ = ["kl", "cross_entropy", "lmsr_cost", "lmsr_price", "trade_profit", "manip_loss", "informed_rent", "entry_prob",
           "accuracy", "accuracy_gain", "helps", "help_band", "informed_manip_cost", "b_upper", "simulate"]


def kl(r, p):
    """Bernoulli KL(r||p) in nats, with 0 ln 0 = 0."""
    t = 0.0
    if r > 0: t += r * math.log(r / p)
    if r < 1: t += (1 - r) * math.log((1 - r) / (1 - p))
    return t


def cross_entropy(q, p):
    """-q ln p - (1-q) ln(1-p)."""
    return -(q * math.log(p) + (1 - q) * math.log(1 - p))


def lmsr_cost(x, y, b):
    """LMSR cost function of outstanding (yes, no) shares."""
    m = max(x, y)
    return m + b * math.log(math.exp((x - m) / b) + math.exp((y - m) / b))


def lmsr_price(x, y, b):
    """Price of YES."""
    return 1.0 / (1.0 + math.exp((y - x) / b))


def trade_profit(r, p0, p1, b):
    """Expected profit (belief r) of moving the LMSR price from p0 to p1 and holding to resolution: b(KL(r||p0)-KL(r||p1))."""
    return b * (kl(r, p0) - kl(r, p1))


def manip_loss(q, p0, p1, b):
    """Expected loss of an uninformed manipulator (whose expected value of Y is q) pushing p0 -> p1: b(KL(q||p1)-KL(q||p0))."""
    return -trade_profit(q, p0, p1, b)


def informed_rent(q, p, b, eps):
    """Expected rent of a perfectly informed trader who arrives at price p and trades to 1-eps or eps:
    b(H(q,p) - ln(1/(1-eps))), H the cross entropy."""
    return b * (cross_entropy(q, p) - math.log(1.0 / (1 - eps)))


def entry_prob(R, c, N):
    """Symmetric mixed-entry equilibrium: each of N potential informed traders enters w.p. s with rent R shared equally
    among entrants, R(1-(1-s)^N)/(N s) = c. Returns P(at least one enters) = 1-(1-s)^N = cNs/R (0 if R <= c; s in (0,1],
    and if R >= N c everyone enters: probability 1)."""
    if R <= c:
        return 0.0
    if R >= N * c:
        return 1.0
    lo, hi = 0.0, 1.0
    f = lambda s: R * (1 - (1 - s) ** N) / (N * s) - c
    for _ in range(200):
        mid = (lo + hi) / 2
        if f(mid) > 0: lo = mid
        else: hi = mid
    s = (lo + hi) / 2
    return 1 - (1 - s) ** N


def _entry(q, p, b, c, N, eps):
    return entry_prob(informed_rent(q, p, b, eps), c, N)


def accuracy(mu, q, tau, b, c, N, eps):
    """P(decision correct). Without manipulation the price q < 1/2 is 'reject'; with it the price tau >= 1/2 is 'accept'."""
    e0 = _entry(q, q, b, c, N, eps)
    e1 = _entry(q, tau, b, c, N, eps)
    a0 = e0 + (1 - e0) * (1 - q)
    a1 = e1 + (1 - e1) * q
    return (1 - mu) * a0 + mu * a1


def accuracy_gain(q, tau, b, c, N, eps):
    """d accuracy / d mu = e1(1-q) - e0 q - (1-2q)."""
    e0 = _entry(q, q, b, c, N, eps)
    e1 = _entry(q, tau, b, c, N, eps)
    return e1 * (1 - q) - e0 * q - (1 - 2 * q)


def helps(q, tau, b, c, N, eps):
    """Manipulation raises accuracy iff e1(1-q) - e0 q > 1-2q."""
    return accuracy_gain(q, tau, b, c, N, eps) > 0


def help_band(q, tau, c, N, eps, lo=1e-4, hi=1e3, grid=4000):
    """Interval (b_lo, b_hi) of liquidity over which manipulation *strictly* raises accuracy, scanned on a log grid.
    Below b_lo nobody enters either way (manipulation hurts); above b_hi entry is certain either way (neutral)."""
    on = [lo * (hi / lo) ** (i / grid) for i in range(grid + 1) if accuracy_gain(q, tau, lo * (hi / lo) ** (i / grid), c, N, eps) > 1e-12]
    return (min(on), max(on)) if on else None


def _solve_s(R, c, N):
    e = entry_prob(R, c, N)
    return 1 - (1 - e) ** (1.0 / N) if e < 1 else 1.0


def simulate(mu, q, tau, b, c, N, eps, trials, seed=0):
    """Monte Carlo on an executable LMSR. Returns dict with accuracy, mean manipulator loss (per manipulation),
    entry rates with and without manipulation, and mean net profit per entrant given manipulation."""
    rng = random.Random(seed)
    correct = 0; n0 = e0 = n1 = e1 = 0; mloss = 0.0; nm = 0; ent_profit = 0.0; ent_count = 0
    for _ in range(trials):
        Y = 1 if rng.random() < q else 0
        x = y = 0.0                       # LMSR shares outstanding; price = q needs an initial offset
        # start at price q: x - y = b*logit(q)
        x = b * math.log(q / (1 - q)); y = 0.0
        c0 = lmsr_cost(x, y, b)
        manip = rng.random() < mu
        if manip:
            tgt = b * math.log(tau / (1 - tau))
            dx = tgt - (x - y)
            cost = lmsr_cost(x + dx, y, b) - c0
            x += dx
            mloss_i = cost - (dx if Y == 1 else 0.0)   # shares pay 1 if Y=1
            mloss += mloss_i; nm += 1
        p = lmsr_price(x, y, b)
        R = informed_rent(q, p, b, eps)
        s = _solve_s(R, c, N)
        entrants = [i for i in range(N) if rng.random() < s]
        if manip: n1 += 1
        else: n0 += 1
        if entrants:
            if manip: e1 += 1
            else: e0 += 1
            # first entrant trades price to 1-eps (Y=1) or eps (Y=0); realised profit
            pf = 1 - eps if Y == 1 else eps
            tgt = b * math.log(pf / (1 - pf))
            cur = x - y
            cost = lmsr_cost(x + (tgt - cur), y, b) - lmsr_cost(x, y, b)
            gain = (tgt - cur) * (1.0 if Y == 1 else 0.0) if tgt > cur else 0.0
            if tgt < cur:                       # sells YES / buys NO: modelled as buying NO shares
                dn = (cur - tgt)
                cost = lmsr_cost(x, y + dn, b) - lmsr_cost(x, y, b)
                gain = dn if Y == 0 else 0.0
                y += dn
            else:
                x += tgt - cur
            profit = gain - cost
            ent_profit += profit - c * len(entrants); ent_count += len(entrants)
            x_final = x; y_final = y
            price = lmsr_price(x_final, y_final, b)
        else:
            price = p
        accept = price >= 0.5
        correct += int(accept == (Y == 1))
    return {"accuracy": correct / trials, "manip_loss": mloss / max(1, nm), "entry0": e0 / max(1, n0),
            "entry1": e1 / max(1, n1), "entrant_net": ent_profit / max(1, ent_count)}


def informed_manip_cost(q, tau, b):
    """Cost of a manipulator who *knows* Y=0 and pushes the price q -> tau on YES: b ln((1-q)/(1-tau)), logarithmic in tau
    and linear in b; no expected recoup. Compare with the uninformed manipulator's expected loss b KL(q||tau)."""
    return b * math.log((1 - q) / (1 - tau))


def b_upper(q, c, N, eps):
    """Liquidity above which entry is certain even without manipulation (R(q) >= N c), so manipulation is neutral:
    N c / (H(q) - ln(1/(1-eps)))."""
    return N * c / (cross_entropy(q, q) - math.log(1.0 / (1 - eps)))
