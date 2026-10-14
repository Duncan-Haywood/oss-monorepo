"""Self-enforcing milestone schedules for a job paid without external enforcement.

A job has total cost C to the worker, total value V > C to the requester, and price P in [C, V].
Cost and value accrue pro rata over milestones: milestone k costs c_k and is paid p_k = (P/C) c_k.
Each milestone is a stage game: the requester pre-pays a fraction theta of p_k, the worker works
(or shirks and keeps the pre-payment), the requester then pays the rest (or refuses and keeps the
output). Any defection ends the relationship (grim trigger). Cooperating keeps a continuation value:
the surplus of the remaining milestones plus an outside-relationship value W = W_r + W_w.
"""
from math import ceil, log, log1p

__all__ = ["stage_feasible", "theta_range", "schedule_feasible", "greedy_schedule",
           "n_geometric", "n_equal", "n_pay_after", "n_pay_before", "first_fraction",
           "effective_w", "remaining_after"]

EPS = 1e-9


def stage_feasible(c, p, theta, F_r, F_w):
    """Backward induction on one stage. F_r, F_w: continuation values after the stage if all cooperate.
    Returns True iff cooperation is subgame perfect (ties cooperate)."""
    late = (1 - theta) * p
    requester_pays = late <= F_r + EPS            # refusing keeps `late`, forfeits the continuation
    worker_gets = late if requester_pays else 0.0
    worker_works = worker_gets - c + (F_w if requester_pays else 0.0) >= -EPS   # shirking: keeps pre-payment only
    return requester_pays and worker_works


def theta_range(c, p, F_r, F_w):
    """Set of pre-payment fractions theta in [0,1] making the stage self-enforcing, as (lo, hi) or None.
    late payment x=(1-theta)p must satisfy  c - F_w <= x <= min(p, F_r)."""
    x_lo, x_hi = max(0.0, c - F_w), min(p, F_r)
    if x_lo > x_hi + EPS:
        return None
    return (1 - x_hi / p, 1 - x_lo / p)


def remaining_after(costs, k, C):
    return C - sum(costs[:k + 1])


def schedule_feasible(costs, C, V, P, W_r, W_w):
    """Every stage of the schedule (list of milestone costs summing to C) admits a self-enforcing split,
    with continuation values computed from the remaining milestones, not from a closed form."""
    if abs(sum(costs) - C) > 1e-7 * max(1, C):
        raise ValueError("costs must sum to C")
    for k, c in enumerate(costs):
        rem = remaining_after(costs, k, C) / C
        F_r = W_r + (V - P) * rem
        F_w = W_w + (P - C) * rem
        if theta_range(c, P / C * c, F_r, F_w) is None:
            return False
    return True


def greedy_schedule(C, V, W, cap=100000):
    """Largest self-enforcing milestone at each step: c_k = (W + s R_{k-1})/(1+s), s=(V-C)/C, R = remaining cost."""
    s, R, out = (V - C) / C, C, []
    while R > EPS * C and len(out) < cap:
        c = min(R, (W + s * R) / (1 + s))
        out.append(c)
        R -= c
    return out


def n_geometric(C, V, W):
    """Fewest milestones: ceil( ln(1+(V-C)/W) / ln(V/C) ); C/W (equal split) in the V->C limit."""
    if V - C < 1e-12 * C:
        return ceil(C / W - EPS)
    return ceil(log1p((V - C) / W) / log1p((V - C) / C) - 1e-7)


def n_equal(C, W):
    """Equal milestones: the last stage binds, c <= W."""
    return ceil(C / W - EPS)


def n_pay_after(P, W_r):
    """Equal milestones, worker always paid after delivery (theta=0): the requester's last refusal must not pay."""
    return ceil(P / W_r - EPS)


def n_pay_before(C, W_w):
    """Equal milestones, requester always pays before work (theta=1): the worker's last shirk must not pay."""
    return ceil(C / W_w - EPS)


def first_fraction(C, V, W):
    """Share of the job's cost in the first milestone: 1 - (C - W)/V."""
    return min(1.0, 1 - (C - W) / V)


def effective_w(W, entry_cost):
    """Continuation from the relationship is worth no more than the cost of re-entering under a new identity."""
    return min(W, entry_cost)
