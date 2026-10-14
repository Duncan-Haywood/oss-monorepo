"""Replicated execution of a job on k randomly assigned workers, with a dispute that slashes the deviator.

n workers, m of them colluders. A job goes to k distinct workers drawn uniformly. Results are compared; any disagreement
triggers a dispute that an honest worker wins (one honest replica suffices) and the losing cheater forfeits stake S.
A colluder who cheats and is *not* caught (every replica returned the same wrong answer) earns gain G.
Colluders cannot see who else was assigned (secret assignment), so a colluder that cheats is caught unless all k-1 other
replicas are colluders that also cheat.
"""
import math, random

__all__ = ["theta", "p_others", "cheat_payoff", "pi_star", "unique_honest", "min_stake", "min_stake_basin",
           "attack_rate_secret", "attack_rate_public", "attack_rate_leaky", "min_k_public", "optimal_k",
           "simulate_focal", "replicator", "simulate_corruption"]


def theta(G, S):
    """Break-even success probability: cheating pays iff P(success) > S/(G+S)."""
    return S / (G + S)


def p_others(n, m, k):
    """P(the k-1 co-assigned workers of a focal colluder are all colluders): C(m-1,k-1)/C(n-1,k-1). n=inf -> (m/n)^(k-1)."""
    if k == 1:
        return 1.0
    if n is None or math.isinf(n):
        raise ValueError("pass beta via n=m*..., use p_beta for the infinite pool")
    return math.comb(m - 1, k - 1) / math.comb(n - 1, k - 1) if m >= k else 0.0


def cheat_payoff(p, pi, k, G, S):
    """Expected payoff to a colluder of cheating when every other colluder cheats w.p. pi (independently).
    Success prob x = p*pi^(k-1); payoff = x*G - (1-x)*S."""
    x = p * pi ** (k - 1)
    return x * G - (1 - x) * S


def pi_star(p, k, G, S):
    """Unstable interior equilibrium of the cheating coordination game: cheat-indifference at
    p*pi^(k-1) = S/(G+S). Returns None if > 1 (cheating never pays) and 0 if S==0."""
    th = theta(G, S)
    if k == 1:
        return 0.0 if p > th else None
    v = (th / p) ** (1.0 / (k - 1)) if p > 0 else float("inf")
    return v if v <= 1 else None


def unique_honest(p, k, G, S):
    """All-honest is the unique equilibrium iff even universal cheating is unprofitable: p <= S/(G+S)."""
    return p <= theta(G, S)


def min_stake(p, G):
    """Least stake making honesty the unique equilibrium: S = G p/(1-p)."""
    return math.inf if p >= 1 else G * p / (1 - p)


def min_stake_basin(p, k, G, eps):
    """Stake such that the basin of attraction of cheating has measure eps (uniform initial pi): pi_star = 1-eps."""
    ps = 1 - eps
    th = p * ps ** (k - 1)
    return G * th / (1 - th)


def attack_rate_secret(beta, k, cheating_equilibrium):
    """Fraction of jobs whose result is corrupted and accepted. With secret assignment: beta^k if the coalition sits in the
    cheating equilibrium, else 0."""
    return beta ** k if cheating_equilibrium else 0.0


def attack_rate_public(beta, k):
    """Public assignment + free abstention: colluders cheat exactly when all k replicas are theirs, at zero risk.
    Stake is irrelevant."""
    return beta ** k


def attack_rate_leaky(beta, k, lam, cheating_equilibrium):
    """Coalition learns the true assignment with prob lam (safe attacks when all k are colluders); otherwise the secret game."""
    return lam * beta ** k + (1 - lam) * attack_rate_secret(beta, k, cheating_equilibrium)


def min_k_public(beta, eps):
    """Smallest replication k with beta^k <= eps."""
    return max(1, math.ceil(math.log(eps) / math.log(beta) - 1e-12))


def optimal_k(beta, G, c, r, kmax=40):
    """Minimise per-job cost k*c + r*S(k) with S(k)=G b^(k-1)/(1-b^(k-1)) (k>=2). Returns (k, cost, S) — stake cost r per unit."""
    best = None
    for k in range(2, kmax + 1):
        p = beta ** (k - 1); S = min_stake(p, G); cost = k * c + r * S
        if best is None or cost < best[1]:
            best = (k, cost, S)
    return best


def simulate_focal(n, m, k, pi, G, S, trials, seed=0):
    """Monte Carlo of the focal colluder's cheating payoff (conditional on cheating). Colluders are workers 0..m-1;
    the focal colluder is worker 0. Others in the job cheat w.p. pi."""
    rng = random.Random(seed); tot = 0.0
    for _ in range(trials):
        others = rng.sample(range(1, n), k - 1)
        ok = all(o < m and rng.random() < pi for o in others)
        tot += G if ok else -S
    return tot / trials


def replicator(p, k, G, S, pi0, steps=4000, dt=0.05):
    """Replicator dynamics dpi/dt = pi(1-pi)*cheat_payoff (honest payoff normalised to 0). Returns final pi."""
    pi = pi0
    for _ in range(steps):
        pi += dt * pi * (1 - pi) * cheat_payoff(p, pi, k, G, S) / max(G, S)
        pi = min(1.0, max(0.0, pi))
    return pi


def simulate_corruption(n, m, k, jobs, mode, lam=0.0, seed=0, cheat_prob=1.0):
    """Fraction of jobs whose accepted result is wrong under a coalition policy.
    mode 'blind': every colluder cheats w.p. cheat_prob per job (secret assignment, no info).
    mode 'informed': coalition cheats iff all k replicas are colluders and it learned the assignment (prob lam per job);
       otherwise plays honestly.
    Returns (corrupted_fraction, caught_fraction)."""
    rng = random.Random(seed); bad = caught = 0
    for _ in range(jobs):
        job = rng.sample(range(n), k)
        col = [w < m for w in job]
        if mode == "blind":
            cheat = [c and rng.random() < cheat_prob for c in col]
        else:
            learned = rng.random() < lam
            cheat = [c and learned and all(col) for c in col]
        if any(cheat):
            if all(cheat) and len(set(cheat)) == 1 and all(col):
                bad += 1
            else:
                caught += 1
    return bad / jobs, caught / jobs
