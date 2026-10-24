"""Two redundant workers, an audit and an agreement test: cheapest contract by linear programme.

Each worker picks honest (cost 1) or a cheat (cost 1 - g, caught by an audit w.p. p; honest is never caught).
The pay w[audit, agree] is bounded below by -stake. Agreement probabilities depend on the pair of actions:
honest-honest 1 - delta, honest-cheat alpha, cheat-cheat kappa (kappa = 1: both submit one shared trajectory)."""
import numpy as np
from scipy.optimize import linprog

__all__ = ["peer_cost"]

H, K = 0, 1


def peer_cost(g, p, stake, delta=0.0, alpha=0.0, kappa=1.0, use_peer=True, exclude_copying=False, margin=1e-6):
    """Expected payment to one worker in the honest-honest equilibrium (lowest over contracts), or inf.

    use_peer=False forces w to ignore agreement (audit-only). exclude_copying=True also requires that
    (cheat, cheat) is not an equilibrium: U(honest | peer cheats) >= U(cheat | peer cheats) + margin."""
    agree = {(H, H): 1 - delta, (H, K): alpha, (K, K): kappa}
    caught = {H: 0.0, K: p}
    cost = {H: 1.0, K: 1.0 - g}
    # payment vector index: 2 * audit + agree, audit 0 = pass, 1 = caught
    def dist(a, b):
        q = agree[(min(a, b), max(a, b))]
        pc = caught[a]
        return np.array([(1 - pc) * (1 - q), (1 - pc) * q, pc * (1 - q), pc * q])

    def u(a, b):
        return dist(a, b)  # coefficient row of expected pay; subtract cost separately

    A, rhs = [], []
    # honest is a best response to honest: u(H,H).w - 1 >= u(K,H).w - (1 - g)
    A.append(-(u(H, H) - u(K, H))); rhs.append(-(cost[H] - cost[K]))
    A.append(-u(H, H)); rhs.append(-cost[H])  # individual rationality
    if exclude_copying:
        A.append(-(u(H, K) - u(K, K))); rhs.append(-(cost[H] - cost[K]) - margin)
    for j in range(4):  # w >= -stake
        e = np.zeros(4); e[j] = -1.0
        A.append(e); rhs.append(stake)
    Aeq = None
    if not use_peer:  # same pay whether or not the pair agreed
        Aeq = np.array([[1, -1, 0, 0], [0, 0, 1, -1]], float)
    r = linprog(u(H, H), A_ub=np.array(A), b_ub=np.array(rhs), A_eq=Aeq, b_eq=None if Aeq is None else np.zeros(2),
                bounds=[(None, None)] * 4, method="highs")
    return float(r.fun) if r.status == 0 else float("inf")
