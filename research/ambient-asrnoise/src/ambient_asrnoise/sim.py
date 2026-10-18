"""Interruption policies when the transcript comes from an ASR with word error rate ``wer``.

Same listening-window world as ``ambient-interject`` (10 s windows, need prevalence 0.03), with the
ASR's effect added by assumption: nothing here is fitted to real speech recognition.

* wake phrase (``wake_words`` words): heard only if every word is recognised, plus a small chance
  that errors in other speech spell it;
* trigger keyword (one word): recognised with probability 1 - wer, plus a confusion rate;
* transcript intent score (a model reading the transcript): separation d' * (1 - wer) ** k;
* acoustic score (no transcript, e.g. prosody and addressee cues): fixed separation, unaffected.
"""
from dataclasses import dataclass

import numpy as np

WINDOWS_PER_HOUR = 360


@dataclass(frozen=True)
class World:
    prevalence: float = 0.03
    d_prime: float = 2.0          # transcript score separation at wer = 0
    d_acoustic: float = 1.0       # acoustic-only score separation, independent of wer
    p_wake_need: float = 0.15
    p_wake_other: float = 0.002
    wake_words: int = 2
    wake_confuse: float = 0.002   # extra false wake per unit wer (errors spelling the phrase)
    p_kw_need: float = 0.45
    p_kw_other: float = 0.08
    kw_confuse: float = 0.02      # extra false keyword per unit wer
    k: float = 1.0                # transcript score separation scales as (1 - wer) ** k
    p_others: float = 0.30
    others_cost: float = 2.0


def simulate(world: World, wer: float, hours: float, rng: np.random.Generator) -> dict:
    n = int(round(hours * WINDOWS_PER_HOUR))
    need = rng.random(n) < world.prevalence
    ok = 1.0 - wer
    p_wake = np.where(need, world.p_wake_need * ok ** world.wake_words,
                      world.p_wake_other * ok ** world.wake_words + world.wake_confuse * wer)
    p_kw = np.where(need, world.p_kw_need * ok, world.p_kw_other * ok + world.kw_confuse * wer)
    d_eff = world.d_prime * ok ** world.k
    return dict(need=need, hours=float(hours), others_cost=world.others_cost,
                wake=rng.random(n) < p_wake, kw=rng.random(n) < p_kw,
                text=rng.normal(np.where(need, d_eff, 0.0), 1.0),
                acoustic=rng.normal(np.where(need, world.d_acoustic, 0.0), 1.0),
                others=rng.random(n) < world.p_others)


def score_policy(d: dict, speak: np.ndarray) -> dict:
    need = d["need"]
    tp = int(np.sum(speak & need)); fp = int(np.sum(speak & ~need))
    mult = np.where(d["others"], d["others_cost"], 1.0)
    return dict(recall=tp / max(int(need.sum()), 1), fp_per_hour=fp / d["hours"],
                annoyance_per_hour=float(np.sum(mult[speak & ~need])) / d["hours"])


def speak_wake(d): return d["wake"].copy()
def speak_keyword(d): return d["wake"] | d["kw"]
def speak_text(d, tau): return d["wake"] | (d["text"] > tau)
def speak_acoustic(d, tau): return d["wake"] | (d["acoustic"] > tau)


def tune(d: dict, signal: str, budget: float, grid: np.ndarray) -> float:
    """Lowest threshold on ``signal`` whose false interruptions per hour (wake included) fit the budget."""
    best = grid[-1]
    for tau in grid:  # grid ascending; false rate falls as tau rises
        if score_policy(d, d["wake"] | (d[signal] > tau))["fp_per_hour"] <= budget:
            return float(tau)
    return float(best)
