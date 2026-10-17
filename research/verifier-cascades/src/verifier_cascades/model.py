"""Sequential verifiers who see earlier verdicts (Bikhchandani-Hirshleifer-Welch cascades).

A fair-coin binary fault state; each verifier gets an independent private signal correct with probability a > 1/2,
sees all earlier public verdicts, and issues the verdict that maximises the probability of being right (ties: own
signal).  With the public tally d = (#revealed correct signals) - (#revealed wrong ones) the rule is: |d| >= 2 means
everyone copies the sign of d and signals stop being revealed (a cascade); |d| <= 1 means verdict = own signal and d
moves by one.  `bayes_run` re-derives this from Bayes' rule with no walk assumption; `sequential_law` is the exact DP.
An optional committed batch of m verifiers reports simultaneously (sealed) before the sequential phase starts.
"""
import math, random

__all__ = ["cascade_wrong_prob", "expected_agents_to_cascade", "majority_accuracy", "sequential_law", "batch_start",
           "herd_accuracy", "bayes_run", "agents_used"]


def cascade_wrong_prob(a):
    """P(the cascade is on the wrong verdict) for pure sequential play: (1-a)^2 / (a^2 + (1-a)^2)."""
    return (1 - a) ** 2 / (a * a + (1 - a) ** 2)


def expected_agents_to_cascade(a):
    """expected number of verifiers whose signal is revealed before the cascade: 2 / (a^2 + (1-a)^2)."""
    return 2 / (a * a + (1 - a) ** 2)


def majority_accuracy(a, n):
    """P(majority of n independent signals is right); ties broken by a fair coin."""
    tot = 0.0
    for k in range(n + 1):
        pk = math.comb(n, k) * a ** k * (1 - a) ** (n - k)
        tot += pk if 2 * k > n else (pk / 2 if 2 * k == n else 0.0)
    return tot


def batch_start(a, m):
    """distribution over states after m sealed simultaneous signals: dict d -> prob, d in {-1,0,1} live, +2/-2 = cascade
    on the right/wrong verdict (any |d| >= 2 is a cascade)."""
    st = {}
    for k in range(m + 1):
        d = 2 * k - m
        key = d if abs(d) <= 1 else (2 if d > 0 else -2)
        st[key] = st.get(key, 0.0) + math.comb(m, k) * a ** k * (1 - a) ** (m - k)
    return st


def sequential_law(a, n, m=0):
    """exact law after n sequential verifiers (following a sealed batch of m, which does not count in n).
    Returns dict: p_right_cascade, p_wrong_cascade, p_live, p_last_right (prob the n-th verdict is right)."""
    st = batch_start(a, m) if m else {0: 1.0}
    last = 0.0
    for _ in range(n):
        nxt, last = {}, 0.0
        for d, p in st.items():
            if d >= 2:
                nxt[2] = nxt.get(2, 0.0) + p; last += p
            elif d <= -2:
                nxt[-2] = nxt.get(-2, 0.0) + p
            else:
                for step, q in ((1, a), (-1, 1 - a)):
                    d2 = d + step
                    key = d2 if abs(d2) <= 1 else (2 if d2 > 0 else -2)
                    nxt[key] = nxt.get(key, 0.0) + p * q
                last += p * a
        st = nxt
    return {"p_right_cascade": st.get(2, 0.0), "p_wrong_cascade": st.get(-2, 0.0),
            "p_live": sum(v for k, v in st.items() if abs(k) <= 1), "p_last_right": last}


def herd_accuracy(a, m=0, n=400):
    """long-run probability the final herd verdict is right: cascades are absorbing so p_right_cascade converges."""
    L = sequential_law(a, n, m)
    return L["p_right_cascade"] + 0.5 * L["p_live"]


def agents_used(a, m=0, n=400):
    """expected number of paid verifiers if the designer stops asking once a cascade is visible (batch m + sequential)."""
    st = batch_start(a, m) if m else {0: 1.0}
    used = float(m)
    for _ in range(n):
        live = sum(v for k, v in st.items() if abs(k) <= 1)
        used += live
        nxt = {}
        for d, p in st.items():
            if abs(d) >= 2:
                nxt[d] = nxt.get(d, 0.0) + p
            else:
                for step, q in ((1, a), (-1, 1 - a)):
                    d2 = d + step
                    key = d2 if abs(d2) <= 1 else (2 if d2 > 0 else -2)
                    nxt[key] = nxt.get(key, 0.0) + p * q
        st = nxt
    return used


def bayes_run(a, n, rng, m=0):
    """Full Bayesian simulation with no walk assumption.  Public log-odds are counted in units of ln(a/(1-a)) so ties are exact.  A verifier with
    signal s has posterior from pi and s; verdict = argmax (tie -> own signal).  Observers update pi from the verdict:
    if both signals would give the same verdict it is uninformative; otherwise it reveals the signal.  The first m
    verifiers are sealed (their signals all become public at once).  Returns the list of verdicts (True = yes) and the
    state."""
    state = rng.random() < 0.5
    sig = lambda: (rng.random() < a) == state           # True = signal says yes
    lr = a / (1 - a)
    pi_lo = 0.0                                             # public log-odds, kept as an exact multiple of ln(lr)
    for _ in range(m):
        pi_lo += 1 if sig() else -1
    verdicts = []
    for _ in range(n):
        s = sig()
        v = (pi_lo + (1 if s else -1)) > 0 if (pi_lo + (1 if s else -1)) != 0 else s
        yes_if = {t: ((pi_lo + (1 if t else -1)) > 0 if (pi_lo + (1 if t else -1)) != 0 else t) for t in (True, False)}
        if yes_if[True] != yes_if[False]:                   # verdict reveals the signal
            pi_lo += 1 if v else -1
        verdicts.append(v)
    return verdicts, state
