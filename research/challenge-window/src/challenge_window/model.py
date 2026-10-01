"""Challenge-window model. A fraudster gains G if a challenge is not included within w blocks and
loses S if it is. Each block's proposer is attacker-controlled w.p. rho (censors for free); otherwise
the attacker must pay b to censor. The attacker sees each proposer before choosing to pay."""
import math, random

__all__ = ["dp_values", "value", "window_dp", "window_closed", "window_luck", "window_bribe",
           "prefix_value", "stake_for_window", "simulate_policy"]


def dp_values(w, G, S, rho, b):
    """V[n] = attacker's optimal expected payoff with n blocks left, fraud already committed and
    undetected: V0=G; V(n)=rho*V(n-1)+(1-rho)*max(-S, V(n-1)-b)."""
    V = [G]
    for _ in range(w):
        x = V[-1]
        V.append(rho * x + (1 - rho) * max(-S, x - b))
    return V


def value(w, G, S, rho, b):
    return dp_values(w, G, S, rho, b)[-1]


def window_dp(G, S, rho, b, cap=10**6):
    """Smallest w with V(w) <= 0 (fraud unprofitable), by the exact recursion."""
    x, n = G, 0
    while x > 1e-12:
        x = rho * x + (1 - rho) * max(-S, x - b)
        n += 1
        if n > cap:
            raise ValueError("no deterrence within cap")
    return n


def window_luck(G, S, rho):
    """Window if the attacker can only gamble (b = infinity is impossible; b -> 0 is the opposite):
    (G+S) rho^w <= S."""
    return max(0, math.ceil(math.log((G + S) / S) / math.log(1 / rho) - 1e-12))


def window_bribe(G, rho, b):
    """Window if the attacker can only bribe every block: G - (1-rho) b w <= 0."""
    return max(0, math.ceil(G / ((1 - rho) * b) - 1e-12))


def window_closed(G, S, rho, b):
    """Closed form of window_dp. Phase 1 (last j blocks): bribe, V=G-a n with a=(1-rho)b, while
    V(n-1) >= b-S. Phase 2 (earlier blocks): gamble, V=(V_j+S) rho^m - S."""
    a = (1 - rho) * b
    thr = b - S
    j = int(math.floor(1 + (G - thr) / a + 1e-12)) if G >= thr else 0
    Vj = G - a * j
    if Vj <= 1e-12:
        return max(0, math.ceil(G / a - 1e-12))
    m = math.ceil(math.log((Vj + S) / S) / math.log(1 / rho) - 1e-12)
    return j + max(m, 0)


def prefix_value(w, G, S, rho, b):
    """Best value of the non-adaptive 'bribe the first k blocks, gamble the rest' plan."""
    return max((G + S) * rho ** (w - k) - S - (1 - rho) * b * k for k in range(w + 1))


def stake_for_window(w, G, rho, b_fn, hi=1e9):
    """Smallest S (bisection) whose deterrence window is <= w; b_fn(S) gives the bribe price."""
    lo = 1e-9
    if window_closed(G, hi, rho, b_fn(hi)) > w:
        return math.inf
    for _ in range(200):
        mid = math.sqrt(lo * hi)
        if window_closed(G, mid, rho, b_fn(mid)) <= w:
            hi = mid
        else:
            lo = mid
    return hi


def simulate_policy(w, G, S, rho, b, trials, seed=0):
    """Monte Carlo of the DP-optimal policy: returns (mean payoff, standard error)."""
    V = dp_values(w, G, S, rho, b)
    rng = random.Random(seed)
    tot = tot2 = 0.0
    for _ in range(trials):
        pay, n = G, w
        cost = 0.0
        caught = False
        while n > 0:
            owned = rng.random() < rho
            if not owned:
                if V[n - 1] - b >= -S:
                    cost += b
                else:
                    caught = True
                    break
            n -= 1
        r = -S - cost if caught else G - cost
        tot += r
        tot2 += r * r
    m = tot / trials
    return m, math.sqrt(max(tot2 / trials - m * m, 0) / trials)
