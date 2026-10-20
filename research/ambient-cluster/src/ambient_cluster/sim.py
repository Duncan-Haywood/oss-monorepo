"""Clustered needs and stateful interruption policies.

Time is cut into 10 s windows. A hidden two-state chain (episode / quiet) makes moments of need
cluster; the overall need rate stays fixed so only the clustering changes. Signals are drawn
from distributions I choose (nothing is fitted to real conversations). The assistant sees a wake
flag and an intent score per window, and after it speaks it learns whether help was wanted
(accepted) or not (dismissed).
"""
from dataclasses import dataclass

import numpy as np

WINDOWS_PER_HOUR = 360


@dataclass(frozen=True)
class World:
    prevalence: float = 0.03   # long-run P(need) per window
    pi_episode: float = 0.10   # share of windows inside an episode
    mean_episode: float = 12.0  # mean episode length in windows (2 min)
    p_need_episode: float = 0.15  # P(need | episode); 0.03 = no clustering
    d_prime: float = 2.0
    p_wake_need: float = 0.15
    p_wake_other: float = 0.002

    @property
    def p_need_quiet(self) -> float:
        return (self.prevalence - self.pi_episode * self.p_need_episode) / (1 - self.pi_episode)


def simulate(world: World, hours: float, rng: np.random.Generator) -> dict:
    n = int(round(hours * WINDOWS_PER_HOUR))
    leave = 1.0 / world.mean_episode
    enter = world.pi_episode / (1 - world.pi_episode) * leave
    u = rng.random(n)
    ep = np.empty(n, bool)
    s = rng.random() < world.pi_episode
    for i in range(n):
        ep[i] = s
        s = (u[i] >= leave) if s else (u[i] < enter)
    pn = np.where(ep, world.p_need_episode, world.p_need_quiet)
    need = rng.random(n) < pn
    wake = rng.random(n) < np.where(need, world.p_wake_need, world.p_wake_other)
    score = rng.normal(np.where(need, world.d_prime, 0.0), 1.0)
    return dict(need=need, wake=wake, score=score, hours=float(hours), episode=ep)


def run_policy(d: dict, tau: float, kind: str = "plain", k: int = 0, delta: float = 0.0) -> np.ndarray:
    """Sequential policy. The wake phrase always gets an answer. Returns the speak mask.

    plain:    speak if score > tau.
    cooldown: after any utterance stay silent (except for the wake phrase) for k windows.
    boost:    after an accepted utterance lower the threshold by delta for k windows.
    backoff:  after a dismissed utterance raise the threshold by delta for k windows.
    """
    need, wake, score = d["need"], d["wake"], d["score"]
    n = len(need)
    speak = np.zeros(n, bool)
    quiet_left = 0
    mod_left = 0
    for i in range(n):
        thr = tau
        if kind == "boost" and mod_left > 0:
            thr = tau - delta
        elif kind == "backoff" and mod_left > 0:
            thr = tau + delta
        silent = kind == "cooldown" and quiet_left > 0
        s = bool(wake[i]) or (not silent and score[i] > thr)
        speak[i] = s
        quiet_left = max(quiet_left - 1, 0)
        mod_left = max(mod_left - 1, 0)
        if s:
            if kind == "cooldown":
                quiet_left = k
            elif kind == "boost" and need[i]:
                mod_left = k
            elif kind == "backoff" and not need[i]:
                mod_left = k
    return speak


def metrics(d: dict, speak: np.ndarray) -> dict:
    need = d["need"]
    tp = int(np.sum(speak & need)); fp = int(np.sum(speak & ~need)); fn = int(np.sum(~speak & need))
    return dict(recall=tp / (tp + fn) if tp + fn else float("nan"), fp_per_hour=fp / d["hours"],
                hits_per_hour=tp / d["hours"])


def tune_tau(d: dict, budget: float, kind: str, k: int, delta: float, lo=-2.0, hi=7.0, steps=14) -> float:
    """Smallest threshold (most speech) whose false interruptions per hour stay within budget.

    Bisection; false interruptions fall as tau rises for every policy here up to simulation noise.
    """
    for _ in range(steps):
        mid = (lo + hi) / 2
        if metrics(d, run_policy(d, mid, kind, k, delta))["fp_per_hour"] <= budget:
            hi = mid
        else:
            lo = mid
    return hi
