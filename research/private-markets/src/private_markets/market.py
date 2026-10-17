"""Binary LMSR whose public state is a privately released running total.

Trader t buys x_t in [-1,1] yes-shares at cost C(q~+x_t)-C(q~) where q~ is the
*released* (noisy) state. Payout is x_t*1[yes]. Path-wise, with e_t = q~_t - q_t,
  MM loss <= b ln2 + sum_t |x_t| |e_{t-1}| / (4b)
because the true-state LMSR loss is <= b ln2 and C'' <= 1/(4b).
"""
import math
import random
from dataclasses import dataclass
from .counter import TreeCounter, NaiveCounter


def lmsr_cost(q, b):
    z = q / b
    return b * (max(z, 0.0) + math.log1p(math.exp(-abs(z))))


def lmsr_price(q, b):
    z = q / b
    return 1 / (1 + math.exp(-z)) if z >= 0 else math.exp(z) / (1 + math.exp(z))


def logit(p):
    return math.log(p / (1 - p))


@dataclass
class RunResult:
    mm_loss: float
    bound: float
    final_logit_err: float
    mean_logit_err: float
    trades: list


def loss_bound(b, xs, errs):
    return b * math.log(2) + sum(abs(x) * abs(e) for x, e in zip(xs, errs)) / (4 * b)


def simulate(T, b, eps, seed, sigma=1.0, ell_star=None, counter="tree"):
    """One market. Traders hold noisy log-odds beliefs and trade myopically toward
    them (capped at 1 share). Returns loss, path-wise bound and price error."""
    rng = random.Random(seed)
    if ell_star is None:
        ell_star = rng.uniform(-1.5, 1.5)
    y = rng.random() < 1 / (1 + math.exp(-ell_star))
    C = (TreeCounter if counter == "tree" else NaiveCounter)(T, eps, seed=seed + 7)
    q_true = q_rel = 0.0
    collected = payout = 0.0
    xs, errs, lerr = [], [], []
    for _ in range(T):
        belief = ell_star + rng.gauss(0, sigma)
        x = max(-1.0, min(1.0, b * (belief - q_rel / b)))
        collected += lmsr_cost(q_rel + x, b) - lmsr_cost(q_rel, b)
        payout += x if y else 0.0
        xs.append(x); errs.append(q_rel - q_true)   # e_{t-1}
        q_true += x
        q_rel = C.push(x)
        lerr.append(abs(q_rel / b - ell_star))
    loss = payout - collected
    return RunResult(loss, loss_bound(b, xs, errs), lerr[-1], sum(lerr) / T, xs)
