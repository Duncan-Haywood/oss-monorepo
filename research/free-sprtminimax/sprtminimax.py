"""Minimax capped certification test as a linear programme.

Convention as in free-sprtcert / free-sprtopt: H0 is the unacceptable failure rate p0, H1 the acceptable p1 < p0, "accept"
means deciding H1, A = P(accept | p0), B = P(reject | p1). A (possibly randomised) test may stop after any (n, f) and must
stop at `cap`.

Occupation-measure form. Let r(n, f) be the sum, over the paths to (n, f), of the product of the probabilities of continuing
at the earlier nodes. Then P_p(visit (n, f)) = r(n, f) p^f (1-p)^(n-f) for every p, because every path to (n, f) has the same
probability. Split r into stop-accept A, stop-reject R and continue X; r(n+1, f) = X(n, f) + X(n, f-1). Every quantity
(P_p(accept), P_p(reject), E_p[N] = sum of P_p(visit) over the continue mass) is then LINEAR in (A, R, X), so "minimise the
largest E_p[N] over a grid of p subject to A <= alpha, B <= beta" is an LP whose optimum is the exact optimum over all
randomised tests. Variables are divided by the path count C(n, f), so each is the fraction of paths still running and its coefficient in every
constraint is a binomial pmf in [0, 1].
"""
import math
import numpy as np
from scipy.optimize import linprog
from scipy.sparse import coo_matrix, csr_matrix


PRUNE = 1e-9  # nodes that no controlled p reaches with probability above this are dropped (flow into them is lost)


def _index(cap, ps):
    """Nodes (n, f) kept in the LP: some p in `ps` has a binomial pmf of at least PRUNE there. Dropping the rest keeps the
    coefficients inside HiGHS's range; the mass lost is below about PRUNE per dropped node (disclosed in the README)."""
    idx = {}
    for n in range(cap + 1):
        for f in range(n + 1):
            lc = math.lgamma(n + 1) - math.lgamma(f + 1) - math.lgamma(n - f + 1)
            if any(lc + f * math.log(p) + (n - f) * math.log(1 - p) >= math.log(PRUNE) for p in ps):
                idx[(n, f)] = len(idx)
    return idx


def solve(p0, p1, alpha, beta, cap, ps, objective="minimax"):
    """Optimal randomised test. `ps` is the grid of failure rates whose mean rollouts are controlled (include p0 and p1).
    objective 'minimax' minimises max_p E_p[N]; 'average' minimises (E_p0[N] + E_p1[N]) / 2. Returns dict(value, A, B, policy)
    where policy[(n, f)] = (accept, reject, continue) fractions of the mass at that node."""
    idx = _index(cap, list(ps) + [p0, p1])
    N = len(idx)
    # variable layout: [A_0..A_N-1, R_0.., X_0.., t]
    nv = 3 * N + 1
    rows, cols, vals, rhs = [], [], [], []
    k = 0
    for (n, f), i in idx.items():  # flow: A + R + X at (n, f) = X(n-1, f) (n-f)/n + X(n-1, f-1) f/n  (divided by C(n, f))
        for off in (0, N, 2 * N):
            rows.append(k); cols.append(off + i); vals.append(1.0)
        if n > 0:
            if (n - 1, f) in idx:
                rows.append(k); cols.append(2 * N + idx[(n - 1, f)]); vals.append(-(n - f) / n)
            if (n - 1, f - 1) in idx:
                rows.append(k); cols.append(2 * N + idx[(n - 1, f - 1)]); vals.append(-f / n)
        rhs.append(1.0 if n == 0 else 0.0)
        k += 1
    Aeq = coo_matrix((vals, (rows, cols)), shape=(k, nv)).tocsr()
    beq = np.array(rhs)
    ub = np.full(nv, np.inf)
    for (n, f), i in idx.items():
        if n == cap:
            ub[2 * N + i] = 0.0
    nn = np.array([n for (n, f) in idx])
    ff = np.array([f for (n, f) in idx])

    def ratio(p):  # binomial pmf of f failures in n rollouts
        lc = np.array([math.lgamma(n + 1) - math.lgamma(f + 1) - math.lgamma(n - f + 1) for n, f in zip(nn, ff)])
        return np.exp(lc + ff * math.log(p) + (nn - ff) * math.log(1 - p))

    ub_rows, ub_b = [], []
    r0, r1 = ratio(p0), ratio(p1)
    row = np.zeros(nv); row[:N] = r0; ub_rows.append(row); ub_b.append(alpha)  # P_p0(accept)
    row = np.zeros(nv); row[N:2 * N] = r1; ub_rows.append(row); ub_b.append(beta)  # P_p1(reject)
    c = np.zeros(nv)
    if objective == "minimax":
        for p in ps:
            row = np.zeros(nv); row[2 * N:3 * N] = ratio(p); row[-1] = -1.0
            ub_rows.append(row); ub_b.append(0.0)
        c[-1] = 1.0
    else:
        c[2 * N:3 * N] = (r0 + r1) / 2
    res = linprog(c, A_ub=csr_matrix(np.array(ub_rows)), b_ub=np.array(ub_b), A_eq=Aeq, b_eq=beq,
                  bounds=np.column_stack([np.zeros(nv), ub]), method="highs")
    if res.status != 0:
        raise RuntimeError(f"{res.status} {res.message}")
    x = res.x
    A, R, X = x[:N], x[N:2 * N], x[2 * N:3 * N]
    policy = {}
    for (n, f), i in idx.items():
        tot = A[i] + R[i] + X[i]
        if tot > 1e-14:
            policy[(n, f)] = (A[i] / tot, R[i] / tot, X[i] / tot)
    return {"value": res.fun, "policy": policy}


def evaluate(policy, p, cap):
    """Exact (P(accept), P(reject), E[N]) of a randomised policy at failure rate p, by forward recursion.
    Nodes absent from the policy are never reached; at the cap everything stops (accept share, then reject)."""
    dist = {(0, 0): 1.0}
    acc = rej = mean_n = 0.0
    for n in range(cap + 1):
        nxt = {}
        for (m, f), mass in dist.items():
            pa, pr, pc = policy.get((m, f), (0.0, 1.0, 0.0))
            acc += mass * pa
            rej += mass * pr
            if pc > 0 and n < cap:
                mean_n += mass * pc
                nxt[(n + 1, f)] = nxt.get((n + 1, f), 0.0) + mass * pc * (1 - p)
                nxt[(n + 1, f + 1)] = nxt.get((n + 1, f + 1), 0.0) + mass * pc * p
        dist = nxt
    return acc, rej, mean_n


def worst_case(policy, cap, lo, hi, points=161):
    """Largest E_p[N] over an even grid on [lo, hi] and the p where it occurs."""
    best = (-1.0, lo)
    for i in range(points):
        p = lo + (hi - lo) * i / (points - 1)
        m = evaluate(policy, p, cap)[2]
        if m > best[0]:
            best = (m, p)
    return best


def minimax(p0, p1, alpha, beta, cap, lo, hi, rounds=8, tol=1e-3):
    """Minimax test over p in [lo, hi] by cutting planes: solve the LP on a grid of p, evaluate the policy exactly on a fine
    grid, add the worst p found to the grid, repeat until the fine-grid maximum is within `tol` of the LP value (a true upper
    bound on the max over the fine grid, a lower bound on the minimax value over [lo, hi]). Returns dict(value, worst, p_worst,
    policy, grid)."""
    grid = sorted({p0, p1, (p0 + p1) / 2, lo, hi} | {lo + (hi - lo) * i / 8 for i in range(9)})
    for _ in range(rounds):
        r = solve(p0, p1, alpha, beta, cap, grid, "minimax")
        w, pw = worst_case(r["policy"], cap, lo, hi)
        if w - r["value"] <= tol:
            break
        grid = sorted(set(grid) | {pw})
    r.update(worst=w, p_worst=pw, grid=grid)
    return r
