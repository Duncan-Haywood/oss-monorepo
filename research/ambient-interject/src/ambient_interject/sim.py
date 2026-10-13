"""Simulated listening windows, interruption policies and scoring.

The assistant looks at one window (10 s) at a time and decides whether to speak. A window either
has a moment where help is wanted (``need``) or does not. Observed signals are drawn from
class-conditional distributions that I choose; nothing here is fitted to real conversations.
"""
from dataclasses import dataclass, replace
from math import erf, sqrt

import numpy as np

WINDOWS_PER_HOUR = 360  # 10 s windows


@dataclass(frozen=True)
class World:
    prevalence: float = 0.03      # P(need) per window (~11 per hour)
    d_prime: float = 2.0          # separation of the intent-score classifier (unit variance)
    p_wake_need: float = 0.15     # user explicitly asks (wake phrase) when help is wanted
    p_wake_other: float = 0.002   # wake phrase said when no help is wanted
    p_kw_need: float = 0.45       # trigger keyword present when help is wanted
    p_kw_other: float = 0.08      # ... when not
    p_others: float = 0.30        # other people are talking in the window
    others_cost: float = 2.0      # an interruption costs this much more then
    null_sd: float = 1.0          # spread of the intent score when no help is wanted (need class: 1)


def simulate(world: World, hours: float, rng: np.random.Generator) -> dict:
    n = int(round(hours * WINDOWS_PER_HOUR))
    need = rng.random(n) < world.prevalence
    wake = rng.random(n) < np.where(need, world.p_wake_need, world.p_wake_other)
    kw = rng.random(n) < np.where(need, world.p_kw_need, world.p_kw_other)
    score = rng.normal(np.where(need, world.d_prime, 0.0), np.where(need, 1.0, world.null_sd))
    others = rng.random(n) < world.p_others
    return dict(need=need, wake=wake, kw=kw, score=score, others=others, hours=float(hours),
                others_cost=world.others_cost)


def features(d: dict) -> np.ndarray:
    return np.column_stack([d["score"], d["kw"], d["wake"], d["others"], np.ones(len(d["need"]))]).astype(float)


def fit_logistic(X: np.ndarray, y: np.ndarray, iters: int = 50, ridge: float = 1e-3) -> np.ndarray:
    """Newton iterations for L2-regularised logistic regression."""
    w = np.zeros(X.shape[1])
    for _ in range(iters):
        p = 1 / (1 + np.exp(-X @ w))
        g = X.T @ (p - y) + ridge * w
        H = (X * (p * (1 - p))[:, None]).T @ X + ridge * np.eye(len(w))
        step = np.linalg.solve(H, g)
        w -= step
        if np.max(np.abs(step)) < 1e-9:
            break
    return w


def prob(w: np.ndarray, d: dict) -> np.ndarray:
    return 1 / (1 + np.exp(-features(d) @ w))


def speak_wake(d): return d["wake"].copy()
def speak_keyword(d): return d["wake"] | d["kw"]
def speak_threshold(d, tau): return d["wake"] | (d["score"] > tau)
def speak_learned(d, w, thr): return d["wake"] | (prob(w, d) > thr)


def score_policy(d: dict, speak: np.ndarray, c_fp: float = 1.0, b_tp: float = 1.0) -> dict:
    """Interruption metrics. Annoyance is c_fp per false interruption, x others_cost when others talk."""
    need = d["need"]
    tp = int(np.sum(speak & need)); fp = int(np.sum(speak & ~need)); fn = int(np.sum(~speak & need))
    mult = np.where(d["others"], d["others_cost"], 1.0)
    annoy = float(c_fp * np.sum(mult[speak & ~need]))
    return dict(tp=tp, fp=fp, fn=fn,
                precision=tp / (tp + fp) if tp + fp else float("nan"),
                recall=tp / (tp + fn) if tp + fn else float("nan"),
                fp_per_hour=fp / d["hours"], missed_per_hour=fn / d["hours"],
                annoyance_per_hour=annoy / d["hours"],
                utility_per_hour=(b_tp * tp - annoy) / d["hours"])


def tune_to_budget(d: dict, scorefn, fp_per_hour: float, grid: np.ndarray) -> float:
    """Largest-recall threshold whose false interruptions per hour on ``d`` stay within budget."""
    best = grid[-1]
    for t in grid:  # grid ascending: higher t = fewer interruptions
        s = d["wake"] | (scorefn(d) > t)
        if np.sum(s & ~d["need"]) / d["hours"] <= fp_per_hour:
            return float(t)
    return float(best)


def q(x: float) -> float:
    """Standard normal upper tail."""
    return 0.5 * (1 - erf(x / sqrt(2)))


def threshold_theory(world: World, tau: float) -> tuple:
    """Per-window (P(speak | no need), P(speak | need)) for the score-threshold policy with wake."""
    fp = 1 - (1 - world.p_wake_other) * (1 - q(tau / world.null_sd))
    tp = 1 - (1 - world.p_wake_need) * (1 - q(tau - world.d_prime))
    return fp, tp
