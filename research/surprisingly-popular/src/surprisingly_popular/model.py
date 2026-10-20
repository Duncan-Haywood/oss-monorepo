"""Surprisingly-popular (SP) verdicts for a binary claim "faulty (A) / sound (B)".

State A has prior `pi`.  Each verifier sees one binary signal: 'a' (flags a fault) with probability `sens` under A
and `1-spec` under B, independently given the state.  A Bayesian verifier who holds the common model (pi, sens, spec)
reports its signal and predicts the fraction of verifiers who will flag: u = P(a|a) after seeing 'a', v = P(a|b) after
seeing 'b' (u > v whenever the signal is informative).  SP answers A iff the actual flag fraction beats the mean
predicted fraction.  With truthful reports the mean prediction is affine in the flag count n_a, so
    SP says A  <=>  n_a / n > theta = v / (1 - u + v),
a pure threshold on the vote fraction.  Majority is the threshold 1/2; Bayes (known sens, spec, pi) is the threshold
at which the log-likelihood ratio of the count vanishes.  All error rates below are exact binomial sums.
"""
import math, random

__all__ = ["cond_flag", "sp_threshold", "sp_correct_in_limit", "bayes_threshold", "pmf", "flag_prob", "decide_error",
           "error_at_threshold", "bayes_error", "sp_mean_prediction", "sp_decide", "byzantine_breakdown",
           "misspecified_threshold"]


def cond_flag(pi, sens, spec):
    """(u, v): a verifier's predicted flag probability after seeing 'a' and after seeing 'b'."""
    fA, fB = sens, 1 - spec
    pa = pi * fA + (1 - pi) * fB
    w_a = pi * fA / pa                       # P(A | a)
    w_b = pi * (1 - fA) / (1 - pa)           # P(A | b)
    return w_a * fA + (1 - w_a) * fB, w_b * fA + (1 - w_b) * fB


def sp_threshold(pi, sens, spec):
    u, v = cond_flag(pi, sens, spec)
    return v / (1 - u + v)


def misspecified_threshold(pi_b, sens_b, spec_b):
    """Threshold when the verifiers' *believed* model is (pi_b, sens_b, spec_b); identical formula."""
    return sp_threshold(pi_b, sens_b, spec_b)


def sp_correct_in_limit(pi, sens, spec, believed=None):
    """n -> infinity: true flag fractions are sens (state A) and 1-spec (state B); SP is right in both states iff
    1-spec < theta < sens (theta from the believed model, default the true one)."""
    th = sp_threshold(*(believed or (pi, sens, spec)))
    return 1 - spec < th < sens


def bayes_threshold(pi, sens, spec, n):
    """Smallest flag count k with log-LR(k) + prior log-odds > 0 (decide A iff n_a >= k)."""
    la, lb = math.log(sens / (1 - spec)), math.log((1 - sens) / spec)
    c = math.log(pi / (1 - pi))
    for k in range(n + 1):
        if k * la + (n - k) * lb + c > 0:
            return k
    return n + 1


def pmf(n, p):
    """Binomial pmf list, computed in log space."""
    if p <= 0:
        return [1.0] + [0.0] * n
    if p >= 1:
        return [0.0] * n + [1.0]
    lp, lq = math.log(p), math.log(1 - p)
    return [math.exp(math.lgamma(n + 1) - math.lgamma(k + 1) - math.lgamma(n - k + 1) + k * lp + (n - k) * lq)
            for k in range(n + 1)]


def flag_prob(state, sens, spec):
    return sens if state == "A" else 1 - spec


def error_at_threshold(n, theta, sens, spec, state):
    """P(wrong | state) for the rule 'say A iff n_a > theta*n' (ties resolved to B)."""
    p = pmf(n, flag_prob(state, sens, spec))
    say_a = sum(w for k, w in enumerate(p) if k > theta * n + 1e-12)
    return 1 - say_a if state == "A" else say_a


def bayes_error(n, pi, sens, spec):
    k0 = bayes_threshold(pi, sens, spec, n)
    pA, pB = pmf(n, sens), pmf(n, 1 - spec)
    eA = sum(pA[:k0])                        # said B in state A
    eB = sum(pB[k0:])                        # said A in state B
    return eA, eB


def decide_error(n, theta, pi, sens, spec):
    """(err|A, err|B, prior-weighted) for a fraction-threshold rule."""
    eA = error_at_threshold(n, theta, sens, spec, "A")
    eB = error_at_threshold(n, theta, sens, spec, "B")
    return eA, eB, pi * eA + (1 - pi) * eB


def sp_mean_prediction(signals, pi, sens, spec):
    """Brute-force SP ingredients from individual reports (used to test the threshold identity)."""
    u, v = cond_flag(pi, sens, spec)
    return sum(u if s else v for s in signals) / len(signals)


def sp_decide(signals, predictions):
    """Generic SP: A iff actual flag fraction exceeds mean predicted fraction."""
    return sum(signals) / len(signals) > sum(predictions) / len(predictions)


def byzantine_breakdown(pi, sens, spec):
    """Largest fraction rho of Byzantine verifiers (vote 'no flag' and predict flag-fraction 1) that leaves SP right in
    state A in the limit: (1-rho)(sens - m_A) > rho, m_A the honest mean prediction under A."""
    u, v = cond_flag(pi, sens, spec)
    gap = sens - (sens * u + (1 - sens) * v)
    return gap / (1 + gap)


def simulate(n, pi, sens, spec, state, rng, rho=0.0, believed=None, trim=0.0):
    """One SP verdict with a fraction rho of Byzantine verifiers (vote 'no flag', predict 1).  `trim` drops that
    fraction of the largest and smallest predictions before averaging.  Returns True iff SP says A."""
    u, v = cond_flag(*(believed or (pi, sens, spec)))
    nb = int(round(rho * n))
    votes, preds = [], []
    for _ in range(n - nb):
        s = rng.random() < flag_prob(state, sens, spec)
        votes.append(s)
        preds.append(u if s else v)
    votes += [False] * nb
    preds += [1.0] * nb
    preds.sort()
    cut = int(trim * n)
    kept = preds[cut:len(preds) - cut] or preds
    return sum(votes) / n > sum(kept) / len(kept)
