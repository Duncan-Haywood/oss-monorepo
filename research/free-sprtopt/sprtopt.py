"""The best possible capped sequential certification test, by backward induction.

Pure standard library. Convention as in free-sprtcert and free-sprtcut: H0 is the unacceptable failure rate p0, H1 the
acceptable p1 < p0, "accept" means deciding H1. A test may stop after any number of rollouts n with f failures, and must
stop at `cap`. Two errors: A = P(accept | p0) and B = P(reject | p1). The objective is the mean rollouts averaged over
p0 and p1, as in free-sprtcut.

Lagrangian: for multipliers c0, c1 >= 0 the Bayes problem
    minimise  E_p0[N] + E_p1[N] + c0 * P_p0(accept) + c1 * P_p1(reject)
is solved exactly by backward induction over (n, f). Any test with A <= alpha and B <= beta has
    E_p0[N] + E_p1[N] >= V(c0, c1) - c0 * alpha - c1 * beta,
so the best such bound over (c0, c1) is a lower bound on EVERY test (randomised ones included). A Bayes solution whose
achieved errors are within alpha and beta is a feasible deterministic test, an upper bound. Their gap brackets the optimum.
"""
import math


def bayes(p0, p1, c0, c1, cap):
    """Optimal stop/continue rule for multipliers (c0, c1). Returns (V, decision) with decision[n][f] in 'a','r','c'.
    A prefix with f failures in n rollouts has probability a = p1^f (1-p1)^(n-f) under p1 and b likewise under p0;
    continuing costs a + b (the expected rollouts spent there), accepting c0*b, rejecting c1*a."""
    q0, q1 = 1 - p0, 1 - p1
    dec = [[""] * (n + 1) for n in range(cap + 1)]
    nxt = None
    for n in range(cap, -1, -1):
        cur = []
        for f in range(n + 1):
            a = math.exp(f * math.log(p1) + (n - f) * math.log(q1))
            b = math.exp(f * math.log(p0) + (n - f) * math.log(q0))
            acc, rej = c0 * b, c1 * a
            best, d = (acc, "a") if acc <= rej else (rej, "r")
            if n < cap:
                cont = a + b + nxt[f] + nxt[f + 1]
                if cont < best:
                    best, d = cont, "c"
            cur.append(best)
            dec[n][f] = d
        nxt = cur
    return nxt[0], dec


def evaluate(dec, p, cap):
    """Exact (P(accept), mean rollouts) of a decision table at true failure rate p."""
    dist = [1.0]
    acc = 0.0
    mean_n = 0.0
    for n in range(cap + 1):
        nxt = [0.0] * (n + 2)
        for f, m in enumerate(dist):
            if m == 0.0:
                continue
            d = dec[n][f]
            if d == "a":
                acc += m
            elif d == "c":
                mean_n += m
                nxt[f] += m * (1 - p)
                nxt[f + 1] += m * p
        dist = nxt
    return acc, mean_n


def solve(p0, p1, alpha, beta, cap, tol=1e-3):
    """Dual search: maximise the lower bound over (log c0, log c1) by pattern search, remembering every feasible Bayes rule.
    Returns dict(lower, upper, c0, c1, ...) where lower/upper bound the mean rollouts averaged over p0 and p1;
    `upper` is None if no feasible rule turned up."""
    cache = {}
    feas = []

    def dual(lc0, lc1):
        key = (round(lc0, 9), round(lc1, 9))
        if key in cache:
            return cache[key]
        c0, c1 = math.exp(lc0), math.exp(lc1)
        v, dec = bayes(p0, p1, c0, c1, cap)
        lb = v - c0 * alpha - c1 * beta
        acc0, m0 = evaluate(dec, p0, cap)
        acc1, m1 = evaluate(dec, p1, cap)
        a_ach, b_ach = acc0, 1 - acc1
        if a_ach <= alpha and b_ach <= beta:
            feas.append(((m0 + m1) / 2, a_ach, b_ach, m0, m1, c0, c1))
        cache[key] = lb / 2
        return cache[key]

    x = [math.log(200.0), math.log(200.0)]
    best = dual(*x)
    step = 1.0
    dirs = [(1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, -1), (1, -1), (-1, 1)]
    while step > tol:
        moved = False
        for dx, dy in dirs:
            cand = (x[0] + dx * step, x[1] + dy * step)
            val = dual(*cand)
            if val > best + 1e-12:
                best, x, moved = val, list(cand), True
        if not moved:
            step /= 2
    for dx in (-0.02, -0.01, 0.0, 0.01, 0.02):
        for dy in (-0.02, -0.01, 0.0, 0.01, 0.02):
            dual(x[0] + dx, x[1] + dy)
    out = {"lower": best, "c0": math.exp(x[0]), "c1": math.exp(x[1]), "upper": None}
    if feas:
        mean, a_ach, b_ach, m0, m1, c0, c1 = min(feas)
        out.update(upper=mean, A=a_ach, B=b_ach, mean0=m0, mean1=m1)
    return out
