"""Hedge / LMSR routing when new modules join the pool.

A pool starts with n0 experts (equal weight).  Arrival j = 1..K joins after round t_j and is given a posterior share
pi_j of the routing mass (its weight is set to pi_j/(1-pi_j) times the total incumbent weight).  Learning rate eta
(LMSR liquidity b = 1/eta), losses in [0,1].  Facts used and checked here:
  * regret of the mixture against expert i, measured from its own arrival, is at most c_i/eta + eta*(T - t_i)/8 with
        c_i = ln(1/pi_i) + sum_{j>i} ln(1/(1-pi_j))            (arrival i pays its own entry, later arrivals tax it);
    the initial experts have pi = 1/n0, so c_init = ln n0 + sum_j ln(1/(1-pi_j));
  * Kraft identity: for ANY share sequence, sum_i exp(-c_i) = 1 over all n0+K experts, hence max_i c_i >= ln(n0+K)
    with equality iff every c_i is equal, i.e. iff pi_j = 1/(n0+j) (uniform entry) -- the unique minimax rule;
  * for a prior P over which expert is the eventual champion, the shares minimising sum P_i c_i are pi_j = P_j/S_j,
    S_j = sum_{i<=j} P_i (S includes the initial pool), with value H(P);
  * in the two-level deterministic game (incumbents constant loss, arrival better/worse by delta) the continuous-time
    price of entry is exactly ln(1/pi)/eta (good arrival) or ln(1/(1-pi))/eta (bad arrival), independent of delta.
"""
import math, random

__all__ = ["run", "regret_from_arrival", "certificate", "uniform_shares", "prior_shares", "kraft_sum", "entropy",
           "exact_entry_cost", "catchup_time", "random_run"]


def uniform_shares(n0, K):
    return [1.0 / (n0 + j) for j in range(1, K + 1)]


def prior_shares(P, n0):
    """P: prior over champion index, first entry the initial pool as a whole (mass split equally over the n0 experts),
    then one entry per arrival.  Returns arrival shares pi_j = P_j / S_j."""
    S, out = P[0], []
    for p in P[1:]:
        S += p
        out.append(p / S)
    return out


def entropy(P):
    return -sum(p * math.log(p) for p in P if p > 0)


def certificate(n0, shares):
    """Coefficients c_i (nats; regret from own arrival <= c_i/eta + eta*T_i/8): first entry is each initial expert,
    then one per arrival.  c = own entry cost + tax from every LATER arrival."""
    K = len(shares)
    tax = [0.0] * (K + 1)          # tax[j] = sum of ln(1/(1-pi_k)) over arrivals k >= j (0-based)
    for j in range(K - 1, -1, -1):
        tax[j] = tax[j + 1] + (math.log(1.0 / (1.0 - shares[j])) if shares[j] < 1 else math.inf)
    return [math.log(n0) + tax[0]] + [math.log(1.0 / shares[j]) + tax[j + 1] for j in range(K)]


def kraft_sum(n0, shares):
    c = certificate(n0, shares)
    return n0 * math.exp(-c[0]) + sum(math.exp(-x) for x in c[1:])


def run(loss_rows, n0, arrivals, shares, eta):
    """loss_rows[t] = list of losses for all n0+K experts at round t (entries for not-yet-arrived experts ignored).
    Returns learner per-round expected loss and per-round weight vectors (normalised) as lists."""
    K = len(arrivals)
    T = len(loss_rows)
    w = [1.0] * n0
    learner, paths = [], []
    nxt = 0
    for t in range(T):
        while nxt < K and arrivals[nxt] == t:
            tot = sum(w)
            w.append(tot * shares[nxt] / (1.0 - shares[nxt]))
            nxt += 1
        tot = sum(w)
        p = [x / tot for x in w]
        paths.append(p)
        row = loss_rows[t]
        learner.append(sum(pi * row[i] for i, pi in enumerate(p)))
        for i in range(len(w)):
            w[i] *= math.exp(-eta * row[i])
        m = max(w)
        w = [x / m for x in w]
    return learner, paths


def regret_from_arrival(learner, loss_rows, i, start):
    return sum(learner[t] - loss_rows[t][i] for t in range(start, len(loss_rows)))


def exact_entry_cost(pi, eta, good=True):
    """Continuous-time price of entry (nats/eta): a better arrival costs ln(1/pi)/eta of regret to it, a worse one
    costs ln(1/(1-pi))/eta to the incumbents; both independent of the loss gap."""
    return (math.log(1.0 / pi) if good else math.log(1.0 / (1.0 - pi))) / eta


def catchup_time(pi, eta, delta):
    """Rounds until an arrival with per-round advantage delta over identical incumbents holds half the mass."""
    return max(0.0, math.log((1.0 - pi) / pi) / (eta * delta))


def random_run(rng, n0, K, spacing, champion, gap, base=0.5, noise=True):
    """Bernoulli-style losses: everyone has mean `base`, expert `champion` has mean base-gap.  Arrivals every `spacing`
    rounds, the last one `spacing` rounds before the end."""
    arrivals = [spacing * (j + 1) for j in range(K)]
    T = spacing * (K + 1)
    rows = []
    for t in range(T):
        row = []
        for i in range(n0 + K):
            mu = base - gap if i == champion else base
            row.append((1.0 if rng.random() < mu else 0.0) if noise else mu)
        rows.append(row)
    return rows, arrivals
