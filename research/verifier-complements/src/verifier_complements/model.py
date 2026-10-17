"""Value of a committee of conditionally independent binary verifiers for an accept/slash decision.
State theta in {faulty=1, good=0}, prior pi=P(faulty). Verifier i flags with prob q_i if faulty and 1-q_i if good
(accuracy q_i>1/2). Loss: accepting a faulty job costs 1, slashing a good one costs c. Value = drop in Bayes risk."""
import math, itertools

def prior_risk(pi, c):
    return min(pi, c * (1 - pi))          # accept risks pi, slash risks c(1-pi)

def bayes_risk(qs, pi, c):
    """expected Bayes risk after observing all verifiers in qs (enumerates 2^n outcomes)"""
    r = 0.0
    for obs in itertools.product((0, 1), repeat=len(qs)):
        lf, lg = pi, 1 - pi
        for q, o in zip(qs, obs):
            lf *= q if o else 1 - q
            lg *= 1 - q if o else q
        r += min(lf, c * lg)
    return r

def value(qs, pi, c):
    return prior_risk(pi, c) - bayes_risk(qs, pi, c)

def mutual_info(qs, pi):
    """I(theta; signals) in nats"""
    h = lambda ps: -sum(p * math.log(p) for p in ps if p > 0)
    pm = {}
    for obs in itertools.product((0, 1), repeat=len(qs)):
        lf, lg = pi, 1 - pi
        for q, o in zip(qs, obs):
            lf *= q if o else 1 - q
            lg *= 1 - q if o else q
        pm[obs] = (lf, lg)
    hs = h([lf + lg for lf, lg in pm.values()])
    hcond = pi * h([lf / pi for lf, _ in pm.values()]) + (1 - pi) * h([lg / (1 - pi) for _, lg in pm.values()])
    return hs - hcond

def min_committee(q, pi, c):
    """smallest n of identical verifiers for which unanimous 'flag' (n flags) flips the prior action, i.e. V(n)>0.
    Log-odds of faulty after n flags: ln(pi/(1-pi)) + n ln(q/(1-q)) vs threshold ln(c)."""
    lam0 = math.log(pi / (1 - pi)); tau = math.log(c)
    # prior action accept iff lam0 < tau (pi < c(1-pi)); else slash. Flags push toward slash; if prior is slash, flags never flip.
    if lam0 >= tau: return None          # prior already says slash; only unflagged evidence could flip it
    return max(1, math.floor((tau - lam0) / math.log(q / (1 - q))) + 1)

def submodularity_violations(pool, pi, c, tol=1e-12):
    """all (S, i, j) with S subset of pool, i,j not in S: marginal of i given S+j exceeds marginal of i given S"""
    n = len(pool); bad = tot = 0; worst = (0.0, None)
    memo = {}
    def V(mask):
        if mask not in memo: memo[mask] = value([pool[k] for k in range(n) if mask >> k & 1], pi, c)
        return memo[mask]
    for mask in range(1 << n):
        rest = [k for k in range(n) if not mask >> k & 1]
        for i in rest:
            for j in rest:
                if i < j:
                    gi = V(mask | 1 << i) - V(mask)
                    gi_j = V(mask | 1 << i | 1 << j) - V(mask | 1 << j)
                    tot += 1
                    if gi_j > gi + tol:
                        bad += 1
                        if gi_j - gi > worst[0]: worst = (gi_j - gi, (mask, i, j))
    return bad, tot, worst

def best_committee(pool, costs, budget, pi, c):
    best = (0.0, ())
    for mask in range(1 << len(pool)):
        idx = [k for k in range(len(pool)) if mask >> k & 1]
        if sum(costs[k] for k in idx) <= budget + 1e-12:
            v = value([pool[k] for k in idx], pi, c)
            if v > best[0] + 1e-15: best = (v, tuple(idx))
    return best

def greedy_committee(pool, costs, budget, pi, c):
    """myopic marginal-value-per-cost greedy (what marginal-contribution hiring does)"""
    chosen, spent = [], 0.0
    while True:
        cur = value([pool[k] for k in chosen], pi, c); pick = None; bestr = 1e-15
        for k in range(len(pool)):
            if k in chosen or spent + costs[k] > budget + 1e-12: continue
            r = (value([pool[j] for j in chosen] + [pool[k]], pi, c) - cur) / costs[k]
            if r > bestr: bestr, pick = r, k
        if pick is None: return value([pool[k] for k in chosen], pi, c), tuple(chosen)
        chosen.append(pick); spent += costs[pick]

def loo_payment(n, q, pi, c):
    """leave-one-out marginal value of one verifier in an n-committee of identical verifiers"""
    return value([q] * n, pi, c) - value([q] * (n - 1), pi, c) if n > 1 else value([q], pi, c)

def value_hom(n, q, pi, c):
    """same as value([q]*n, pi, c) via the flag count (binomial), O(n)"""
    r = 0.0
    for k in range(n + 1):
        b = math.comb(n, k)
        r += min(pi * b * q ** k * (1 - q) ** (n - k), c * (1 - pi) * b * (1 - q) ** k * q ** (n - k))
    return prior_risk(pi, c) - r
