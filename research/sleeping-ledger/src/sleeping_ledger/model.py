"""A self-financed wealth ledger for sleeping (specialist) experts.

Modules i = 1..N hold wealth w_i (initially pi_i, sum 1).  In round t only the awake set A_t reports a loss l_i in [0,1].
Price p_i = w_i / W_A with W_A = sum_{A_t} w_j, market loss lhat = sum_A p_i l_i (the loss of the mixture is <= lhat by
convexity).  Linear ledger:   w_i <- w_i (1 + eta (lhat - l_i))  for i in A_t;  sleepers are untouched.
  * Budget balance (exact): sum_A w_i (lhat - l_i) = W_A (lhat - lhat) = 0, so total wealth stays 1 forever, and sleeping wealth
    never moves: each awake set is a separate ledger, and a regime's ledger is frozen while another regime runs.
  * Regret: for eta <= 1/2, ln(1+x) >= x - x^2 on x >= -1/2, and w_i(T) <= 1, hence for every module i and every loss sequence
        sum_{t: i in A_t} (lhat_t - l_it)  <=  ln(1/pi_i)/eta + eta * sum_{t: i in A_t} (lhat_t - l_it)^2  <=  ln(1/pi_i)/eta + eta n_i,
    where n_i is module i's own awake time: a rarely awake specialist pays only for the rounds it plays.
Exponential ledger (sleeping Hedge): w_i <- w_i exp(eta (lhat - l_i)); Hoeffding gives regret <= ln(1/pi_i)/eta + eta T/8 with T
the total number of rounds (a convex combination (1-a)+a e^s <= e^s so asleep rounds cost the full eta^2/8), and it is not
budget balanced (total wealth only grows).
Entry: a module admitted with wealth eps, funded by scaling every incumbent by (1-eps), leaves every incumbent's bound at
ln(1/(pi_i (1-eps)))/eta + eta n_i, i.e. an additive ln(1/(1-eps))/eta, and the entrant's bound is ln(1/eps)/eta + eta n from its entry.
"""
import math, random

__all__ = ["run_ledger", "regret_bound_linear", "regret_bound_exp", "forced_hedge", "fixed_share_forced", "regime_instance",
           "admit", "per_module_regret", "oracle_loss", "full_losses_for_forced"]


def run_ledger(pi, awake, losses, eta, rule="linear"):
    """awake[t] = list of module indices, losses[t][i] for i awake.  Returns dict with mixture loss per round, lhat, wealth history."""
    w = list(pi)
    mix, hist = [], []
    for A, l in zip(awake, losses):
        W = sum(w[i] for i in A)
        p = {i: w[i] / W for i in A}
        lh = sum(p[i] * l[i] for i in A)
        mix.append(lh)
        for i in A:
            if rule == "linear":
                w[i] *= 1 + eta * (lh - l[i])
            else:
                w[i] *= math.exp(eta * (lh - l[i]))
        hist.append(list(w))
    return {"lhat": mix, "w": w, "hist": hist}


def per_module_regret(out, awake, losses, i):
    """sum over rounds where i is awake of (lhat_t - l_it) and (n_i, sum of squares)."""
    r, n, s2 = 0.0, 0, 0.0
    for lh, A, l in zip(out["lhat"], awake, losses):
        if i in A:
            d = lh - l[i]
            r += d; n += 1; s2 += d * d
    return r, n, s2


def regret_bound_linear(pi_i, n_i, eta):
    assert 0 < eta <= 0.5
    return math.log(1 / pi_i) / eta + eta * n_i


def regret_bound_exp(pi_i, T, eta):
    return math.log(1 / pi_i) / eta + eta * T / 8


def oracle_loss(awake, losses, specialists):
    """Loss of the best awake module in each round (a per-round oracle over the given module set)."""
    tot = 0.0
    for A, l in zip(awake, losses):
        tot += min(l[i] for i in A)
    return tot


def forced_hedge(N, losses_all, eta, filler=0.5, awake=None):
    """Plain Hedge over all N modules, each forced to report every round: a sleeping module incurs the filler loss (it predicts the
    prior).  Returns the mixture loss sequence (measured on awake modules' true loss / filler for sleepers)."""
    w = [1.0 / N] * N
    out = []
    for A, l in zip(awake, losses_all):
        full = [l[i] if i in A else filler for i in range(N)]
        W = sum(w)
        lh = sum(w[i] * full[i] for i in range(N)) / W
        out.append(lh)
        w = [w[i] * math.exp(-eta * full[i]) for i in range(N)]
        s = sum(w); w = [x / s for x in w]
    return out


def fixed_share_forced(N, losses_all, eta, alpha, filler=0.5, awake=None):
    w = [1.0 / N] * N
    out = []
    for A, l in zip(awake, losses_all):
        full = [l[i] if i in A else filler for i in range(N)]
        lh = sum(w[i] * full[i] for i in range(N))
        out.append(lh)
        v = [w[i] * math.exp(-eta * full[i]) for i in range(N)]
        s = sum(v)
        w = [(1 - alpha) * x / s + alpha / N for x in v]
    return out


def regime_instance(K, cycles, L, good=0.1, bad=0.6, gen=0.3, noise=0.05, seed=0):
    """K specialists (0..K-1), each awake only in its own regime, plus generalist K always awake.  Regime r lasts L rounds and the
    schedule cycles through the K regimes `cycles` times.  In its own regime a specialist has mean loss `good`, the generalist `gen`;
    (a specialist is asleep, not bad, outside its regime; `bad` is the loss a forced-to-report specialist would face outside it).
    Returns awake, losses (dict per round over awake modules), regime index per round."""
    rng = random.Random(seed)
    awake, losses, reg = [], [], []
    for _ in range(cycles):
        for r in range(K):
            for _ in range(L):
                A = [r, K]
                l = {r: min(1.0, max(0.0, good + rng.uniform(-noise, noise))), K: min(1.0, max(0.0, gen + rng.uniform(-noise, noise)))}
                awake.append(A); losses.append(l); reg.append(r)
    return awake, losses, reg


def full_losses_for_forced(awake, losses, K, bad):
    """Losses a forced-to-report module would incur outside its regime (specialist r outside its regime: `bad`)."""
    out = []
    for A, l in zip(awake, losses):
        d = dict(l)
        for r in range(K):
            if r not in d:
                d[r] = bad
        out.append(d)
    return out


def admit(w, eps):
    """Admit a new module with wealth eps funded pro rata from incumbents (each scaled by 1-eps); returns new wealth list (last = entrant)."""
    return [x * (1 - eps) for x in w] + [eps]
