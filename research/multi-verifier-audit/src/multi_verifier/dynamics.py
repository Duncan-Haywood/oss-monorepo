"""Hedge (expected payoffs) and importance-weighted bandit learning for solver and m verifiers.
Each player keeps a log-odds theta; probability = sigmoid(theta). Two-action Hedge moves theta by eta * advantage."""
import math
import random
from .game import solver_adv, verifier_adv, detect_prob


def sig(t):
    t = max(-40.0, min(40.0, t))
    return 1 / (1 + math.exp(-t))


def logit(p):
    return math.log(p / (1 - p))


def hedge_run(P, m, T, eta, x0, y0s, record_every=1):
    """Full-information Hedge on expected payoffs. Returns list of (x, ys) samples and final theta."""
    th_x = logit(x0)
    th_y = [logit(y) for y in y0s]
    out = []
    for t in range(T):
        x = sig(th_x)
        ys = [sig(v) for v in th_y]
        if t % record_every == 0:
            out.append((x, ys))
        gx = solver_adv(P, ys)
        gy = [verifier_adv(P, x, ys, i) for i in range(m)]
        th_x += eta * gx
        for i in range(m):
            th_y[i] += eta * gy[i]
    return out


def bandit_run(P, m, T, eta0, x0, y0s, seed=0, record_every=1, gamma=0.0):
    """Bandit feedback: each player sees only the realised payoff of the action it played and updates with an
    importance-weighted estimate; step eta0/sqrt(t). gamma is an EXP3-style exploration floor: played probabilities
    are gamma + (1-2*gamma)*sigmoid(theta), so every action keeps probability >= gamma."""
    rng = random.Random(seed)
    th_x = logit(x0)
    th_y = [logit(y) for y in y0s]
    out = []
    for t in range(1, T + 1):
        x = gamma + (1 - 2 * gamma) * sig(th_x)
        ys = [gamma + (1 - 2 * gamma) * sig(v) for v in th_y]
        if (t - 1) % record_every == 0:
            out.append((x, ys))
        cheat = rng.random() < x
        aud = [rng.random() < y for y in ys]
        n = sum(aud)
        eta = eta0 / math.sqrt(t)
        # solver: honest pays 0, cheat pays realised gain/loss
        if cheat:
            pay = -P.S if n > 0 else P.s
            th_x += eta * pay / max(x, 1e-9)
        for i in range(m):
            if aud[i]:
                r = -P.k
                if cheat:
                    r += (P.lam * P.S / n) if P.scheme == "split" else P.lam * P.S
                th_y[i] += eta * r / max(ys[i], 1e-9)
            else:
                r = -P.h if (cheat and n == 0) else 0.0
                th_y[i] -= eta * r / max(1 - ys[i], 1e-9)
        # keep logits finite
        th_x = max(-40, min(40, th_x))
        th_y = [max(-40, min(40, v)) for v in th_y]
    return out
