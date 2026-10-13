"""Conditional (decision) markets that route between K models, stdlib only.

Each arm a has an unknown loss theta_a ~ N(0, s^2). Its market trader sees x_a = theta_a + N(0, sig^2), so
its honest report is the posterior mean m_a = lam*x_a with lam = s^2/(s^2+sig^2) and posterior variance
v = lam*sig^2. The router picks arm a with probability softmax(-m/t). Only the chosen arm's loss is revealed.
The trader of arm a is paid  1[chosen] * (c - k (r_a - theta_a)^2 / pi_a)  (inverse-propensity Brier).
For two arms D = m_1 - m_0 ~ N(0, w^2) with w^2 = 2*lam*s^2 and pi_0 = sigmoid(D/t).
"""
import math, random

SQ2PI = math.sqrt(2 * math.pi)
SIGMOID_DD_MAX = 1 / (6 * math.sqrt(3))  # max of s(1-s)(1-2s) = max |sigmoid''|


def sigmoid(x):
    if x >= 0:
        return 1 / (1 + math.exp(-x))
    e = math.exp(x)
    return e / (1 + e)


def dsig(x):
    s = sigmoid(x)
    return s * (1 - s)


def Phi(x):
    return 0.5 * math.erfc(-x / math.sqrt(2))


def posterior(s, sig):
    """(lam, v, w): shrinkage, posterior variance, std of the gap D of two arms' honest reports."""
    lam = s * s / (s * s + sig * sig)
    return lam, lam * sig * sig, math.sqrt(2 * lam * s * s)


def expect_normal(f, w, L=9.0, n=4000):
    """E f(D), D~N(0,w^2), Simpson on [-L w, L w]."""
    h = 2 * L * w / n
    tot = 0.0
    for i in range(n + 1):
        d = -L * w + i * h
        c = 1 if i in (0, n) else (4 if i % 2 else 2)
        tot += c * f(d) * math.exp(-d * d / (2 * w * w)) / (w * SQ2PI)
    return tot * h / 3


# ---- expected loss and exploration regret ------------------------------------------------------------------
def expected_loss(pi0, w, **kw):
    """E[theta of the chosen arm] when arm 0 is chosen w.p. pi0(D): E[(D/2)(1-2 pi0(D))] (means of M cancel)."""
    return expect_normal(lambda d: d / 2 * (1 - 2 * pi0(d)), w, **kw)


def greedy_gain(w):
    """Expected loss of always picking the lower reported loss: -w/sqrt(2 pi)."""
    return -w / SQ2PI


def logistic_regret(t, w):
    """Regret of softmax(-m/t) versus greedy on the reports: E[|D| sigmoid(-|D|/t)]."""
    return expect_normal(lambda d: abs(d) * sigmoid(-abs(d) / t), w)


def regret_constant():
    """sup_u u/(1+e^u) = 0.2785; regret <= 0.2785 t for any gap distribution."""
    return max(u / (1 + math.exp(u)) for u in (i / 10000 for i in range(1, 60000)))


# ---- inverse-propensity payments ---------------------------------------------------------------------------
def inv_propensity_mean(K, t, w):
    """E[1/pi_a] = 1 + (K-1) exp(w^2/(2 t^2)) for softmax over K arms with iid honest reports (gap std w)."""
    return 1 + (K - 1) * math.exp(w * w / (2 * t * t))


def payment_moments(k, v, K, t, w):
    """(mean, second moment) of one arm's IPW payment k*S/pi (honest, S=(m-theta)^2, E S = v, E S^2 = 3v^2)."""
    return k * v, 3 * k * k * v * v * inv_propensity_mean(K, t, w)


def payment_rel_std(K, t, w):
    """std/mean of the IPW payment = sqrt(3 E[1/pi] - 1)."""
    return math.sqrt(3 * inv_propensity_mean(K, t, w) - 1)


def temperature_for_rel_std(target, w, K=2):
    """Smallest t with payment relative std <= target (inf if even t=inf, where the value is sqrt(3K-1), fails)."""
    e = (target * target + 1) / 3
    if e <= K:
        return math.inf
    return w / math.sqrt(2 * math.log((e - 1) / (K - 1)))


def inv_pi_probit_truncated(t, w, L):
    """E[1/Phi(D/t)] truncated to |D| <= L w: converges iff t > w (probit) -- compare 1+exp(w^2/2t^2) (logistic)."""
    return expect_normal(lambda d: 1 / max(Phi(d / t), 1e-300), w, L=L, n=20000)


def simulate_payments(k, s, sig, t, n, seed=0):
    """Monte Carlo of the two-arm IPW payment to arm 0: returns (mean, second moment)."""
    rng = random.Random(seed)
    lam, v, w = posterior(s, sig)
    m1 = m2 = 0.0
    for _ in range(n):
        th0, th1 = rng.gauss(0, s), rng.gauss(0, s)
        m0, mm1 = lam * (th0 + rng.gauss(0, sig)), lam * (th1 + rng.gauss(0, sig))
        p0 = sigmoid((mm1 - m0) / t)
        if rng.random() < p0:
            pay = k * (m0 - th0) ** 2 / p0
            m1 += pay
            m2 += pay * pay
    return m1 / n, m2 / n


# ---- propriety ---------------------------------------------------------------------------------------------
def ipw_expected_score(r, m, v, k, pi_of_r):
    """Expected penalty of reporting r, exactly, when the policy reads the report: the chosen branch has
    probability pi(r) and weight 1/pi(r), so pi cancels: k((r-m)^2+v) for any pi(.)>0."""
    p = pi_of_r(r)
    return p * (k * ((r - m) ** 2 + v) / p)


def unscaled_expected_payoff(r, m, v, k, A, pi_of_r):
    """Payoff pi(r)(A - k((r-m)^2+v)) of the same score *without* the 1/pi weight."""
    return pi_of_r(r) * (A - k * ((r - m) ** 2 + v))


def argmax_1d(f, lo, hi, n=4001, iters=60):
    xs = [lo + (hi - lo) * i / (n - 1) for i in range(n)]
    j = max(range(n), key=lambda i: f(xs[i]))
    a, b = xs[max(j - 1, 0)], xs[min(j + 1, n - 1)]
    g = (math.sqrt(5) - 1) / 2
    for _ in range(iters):
        c, d = b - g * (b - a), a + g * (b - a)
        if f(c) > f(d):
            b = d
        else:
            a = c
    return (a + b) / 2


def unscaled_best_report(m, v, k, A, t, r_other, span=6.0):
    """Report maximising the unscaled payoff when the policy is sigmoid((r_other - r)/t)."""
    f = lambda r: unscaled_expected_payoff(r, m, v, k, A, lambda x: sigmoid((r_other - x) / t))
    return argmax_1d(f, m - span, m + span)


# ---- stakes: a trader who also gains B when its arm is chosen ----------------------------------------------
def stake_best_report(m, k, B, t, r_other, span=None):
    """argmax_r  B*sigmoid((r_other - r)/t) - k (r-m)^2 : an arm-0 trader with stake B (global max)."""
    span = span or (B / k) ** 0.5 + 3 * t + abs(r_other - m)
    f = lambda r: B * sigmoid((r_other - r) / t) - k * (r - m) ** 2
    return argmax_1d(f, m - span, m + span, n=8001)


def concavity_stake_limit(k, t):
    """Each trader's problem is strictly concave for every opponent report iff B <= 12 sqrt(3) k t^2."""
    return 2 * k * t * t / SIGMOID_DD_MAX


def distorted_gap(D, dB, k, t):
    """Equilibrium reported gap D_r solving D_r = D + dB*sig'(D_r/t)/(2 k t) (dB = B_0 - B_1)."""
    c = dB / (2 * k * t)
    f = lambda x: x - c * dsig(x / t) - D
    lo, hi = D - abs(c) - 1e-9, D + abs(c) + 1e-9
    for _ in range(200):
        mid = (lo + hi) / 2
        if f(mid) < 0:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


def equilibrium_reports(D, B0, B1, k, t, iters=20000):
    """Simultaneous best responses of both stakeholders by damped iteration on (b0, b1); returns (b0, b1, Dr)."""
    b0 = b1 = 0.0
    for _ in range(iters):
        Dr = D + b0 - b1
        n0, n1 = B0 * dsig(Dr / t) / (2 * k * t), B1 * dsig(Dr / t) / (2 * k * t)
        b0, b1 = 0.5 * b0 + 0.5 * n0, 0.5 * b1 + 0.5 * n1
    return b0, b1, D + b0 - b1


def distorted_loss(dB, k, t, w):
    """Expected loss of the routed model when the reports are distorted by asymmetric stakes."""
    return expected_loss(lambda d: sigmoid(distorted_gap(d, dB, k, t) / t), w, n=600)


def design(w, K, dB, k, rel_std_cap):
    """Take the smallest temperature the payment cap allows and report the loss it leaves under stake
    asymmetry dB. Returns (t, honest loss, distorted loss)."""
    t = temperature_for_rel_std(rel_std_cap, w, K)
    hon = expected_loss(lambda d: sigmoid(d / t), w, n=600)
    if abs(dB) >= concavity_stake_limit(k, t):  # best responses can jump: no unique fixed point
        return t, hon, math.nan
    return t, hon, distorted_loss(dB, k, t, w)
