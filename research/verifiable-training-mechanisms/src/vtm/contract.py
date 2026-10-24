"""Hidden-action contract design as a linear programme (needs numpy and scipy).

A worker picks one action a with private cost c[a]. The requester wants action `target` and observes a
signal drawn from P[a] (rows: actions, columns: signal values). A contract pays w[signal]. Pay is bounded
below by -stake (limited liability: a caught worker can only lose what is staked). The cheapest contract
that makes `target` a best response and leaves the worker no worse off than not working is a linear
programme; `basis` restricts w to a subspace (e.g. linear in a score) with w = basis @ theta."""
import numpy as np
from scipy.optimize import linprog

__all__ = ["optimal_contract", "brute_force_two_signal"]


def optimal_contract(P, c, target=0, stake=np.inf, basis=None, upper=np.inf):
    """Minimum expected payment E_target[w] subject to incentive compatibility, individual rationality
    and w >= -stake. Returns (expected payment, w) or (inf, None) when no contract implements `target`."""
    P = np.asarray(P, float)
    c = np.asarray(c, float)
    k = P.shape[1]
    B = np.eye(k) if basis is None else np.asarray(basis, float)
    p_t = P[target]
    A_ub, b_ub = [], []
    for a in range(len(c)):
        if a != target:  # E_t[w] - c_t >= E_a[w] - c_a
            A_ub.append(-(p_t - P[a]) @ B)
            b_ub.append(-(c[target] - c[a]))
    A_ub.append(-p_t @ B)  # individual rationality: E_t[w] - c_t >= 0
    b_ub.append(-c[target])
    lo = -stake if np.isfinite(stake) else None
    if lo is not None or np.isfinite(upper):  # bounds on w itself, as rows of B theta
        for j in range(k):
            if lo is not None:
                A_ub.append(-B[j])
                b_ub.append(stake)
            if np.isfinite(upper):
                A_ub.append(B[j])
                b_ub.append(upper)
    r = linprog(p_t @ B, A_ub=np.array(A_ub), b_ub=np.array(b_ub), bounds=[(None, None)] * B.shape[1],
                method="highs")
    if r.status != 0:
        return float("inf"), None
    return float(r.fun), B @ r.x


def brute_force_two_signal(p_pass, c_cheat, c_honest, stake, grid=400, wmax=None):
    """Two actions (honest, cheat), signal pass/caught; p_pass = (P_honest(pass), P_cheat(pass)).
    Exhaustive search over a grid of (w_pass, w_caught): the independent check of the LP."""
    wmax = wmax if wmax is not None else 3 * (c_honest + stake)
    wp, wc = np.meshgrid(np.linspace(-stake, wmax, grid), np.linspace(-stake, wmax, grid))
    u_h = p_pass[0] * wp + (1 - p_pass[0]) * wc - c_honest
    u_c = p_pass[1] * wp + (1 - p_pass[1]) * wc - c_cheat
    ok = (u_h >= u_c - 1e-9) & (u_h >= -1e-9)
    return float((u_h + c_honest)[ok].min()) if ok.any() else float("inf")
