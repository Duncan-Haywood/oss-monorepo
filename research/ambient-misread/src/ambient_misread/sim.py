"""Stylised model: the ambient-urgency utility model (copied so this project is self-contained)
plus an urgency classifier that makes errors. Every number is a round figure chosen by the author."""
from dataclasses import dataclass, replace
import numpy as np

MODES = ("none", "speech", "glance", "chime_glance")
# urgency class -> (deadline in s, value weight, probability in the mix)
URGENCY = {"low": (120.0, 0.5, 0.5), "normal": (20.0, 1.0, 0.35), "high": (6.0, 2.0, 0.15)}


@dataclass(frozen=True)
class Params:
    speech_rate: float = 2.5
    speech_latency: float = 1.0
    mask_per_noise: float = 0.6
    c_speech: float = 0.15
    c_speech_per_s: float = 0.05
    others_mult: float = 1.0
    look_rate: float = 0.10        # spontaneous glances per s, eyes free
    eyes_busy_factor: float = 0.1
    max_words: int = 8
    read_rate: float = 4.0
    c_glance: float = 0.05
    c_glance_per_s: float = 0.02
    busy_glance_mult: float = 4.0
    chime_cost: float = 0.04       # annoyance of a short tone, scaled by (1 + others_mult*others)
    chime_mask: float = 0.5        # P(chime not noticed) = chime_mask * noise
    react_rate: float = 0.5        # look rate per s after a noticed chime, eyes free
    react_busy_factor: float = 0.3  # multiplier on react_rate when eyes busy


def speech_utility(p, words, noise, others, deadline, weight):
    dur = p.speech_latency + words / p.speech_rate
    value = 0.0 if dur > deadline else weight * (1.0 - p.mask_per_noise * noise)
    return value - (p.c_speech + p.c_speech_per_s * dur) * (1.0 + p.others_mult * others)


def _rate(p, eyes_busy):
    return p.look_rate * (p.eyes_busy_factor if eyes_busy else 1.0)


def _glance_cost(p, shown, eyes_busy):
    return p.c_glance + p.c_glance_per_s * shown / p.read_rate * (p.busy_glance_mult if eyes_busy else 1.0)


def glance_utility(p, words, eyes_busy, deadline, weight):
    shown = min(words, p.max_words)
    seen = 1.0 - np.exp(-_rate(p, eyes_busy) * deadline)
    return weight * seen * shown / words - _glance_cost(p, shown, eyes_busy)


def p_seen_chime(p, noise, eyes_busy, deadline):
    """Chime noticed with prob 1 - chime_mask*noise, then a look at the boosted rate; if the chime
    is missed the wearer falls back on the spontaneous look rate."""
    pn = 1.0 - p.chime_mask * noise
    boosted = p.react_rate * (p.react_busy_factor if eyes_busy else 1.0) + _rate(p, eyes_busy)
    return pn * (1.0 - np.exp(-boosted * deadline)) + (1.0 - pn) * (1.0 - np.exp(-_rate(p, eyes_busy) * deadline))


def chime_glance_utility(p, words, noise, others, eyes_busy, deadline, weight):
    shown = min(words, p.max_words)
    cost = p.chime_cost * (1.0 + p.others_mult * others) + _glance_cost(p, shown, eyes_busy)
    return weight * p_seen_chime(p, noise, eyes_busy, deadline) * shown / words - cost


def utilities(p, words, noise, others, eyes_busy, urgency):
    d, w, _ = URGENCY[urgency]
    return {"none": 0.0,
            "speech": speech_utility(p, words, noise, others, d, w),
            "glance": glance_utility(p, words, eyes_busy, d, w),
            "chime_glance": chime_glance_utility(p, words, noise, others, eyes_busy, d, w)}


def best_mode(p, words, noise, others, eyes_busy, urgency, modes=MODES):
    u = utilities(p, words, noise, others, eyes_busy, urgency)
    return max(modes, key=lambda m: (u[m], -MODES.index(m)))  # ties go to the earlier (quieter) mode


def simulate_utility(p, mode, words, noise, others, eyes_busy, urgency, n, rng):
    """Monte Carlo mean utility of always using `mode` for n messages in this context."""
    d, w, _ = URGENCY[urgency]
    if mode == "none":
        return 0.0
    shown = min(words, p.max_words)
    if mode == "speech":
        dur = p.speech_latency + words / p.speech_rate
        heard = (rng.random(n) >= p.mask_per_noise * noise) & (dur <= d)
        return float(w * heard.mean() - (p.c_speech + p.c_speech_per_s * dur) * (1 + p.others_mult * others))
    if mode == "glance":
        t = rng.exponential(1.0 / _rate(p, eyes_busy), n)
        return float(w * (t <= d).mean() * shown / words - _glance_cost(p, shown, eyes_busy))
    noticed = rng.random(n) >= p.chime_mask * noise
    spont = rng.exponential(1.0 / _rate(p, eyes_busy), n)
    boosted = p.react_rate * (p.react_busy_factor if eyes_busy else 1.0)
    react = rng.exponential(1.0 / boosted, n)
    t = np.where(noticed, np.minimum(spont, react), spont)
    cost = p.chime_cost * (1 + p.others_mult * others) + _glance_cost(p, shown, eyes_busy)
    return float(w * (t <= d).mean() * shown / words - cost)


def contexts(word_grid=(3, 6, 12, 24), noise_grid=(0.0, 0.5, 1.0)):
    return [(wd, nz, o, e) for wd in word_grid for nz in noise_grid for o in (0, 1) for e in (False, True)]


def mix_utility(p, mode_for, ctxs):
    """Mean utility over contexts and the urgency mix; mode_for(ctx, urgency) -> mode."""
    tot = 0.0
    for c in ctxs:
        for u, (_, _, pr) in URGENCY.items():
            tot += pr * utilities(p, *c, u)[mode_for(c, u)]
    return tot / len(ctxs)


def regret(p_true, p_assumed, ctxs, modes=MODES):
    """Mean utility lost per message (urgency mix) when modes are chosen with p_assumed but scored with p_true."""
    return mix_utility(p_true, lambda c, u: best_mode(p_true, *c, u, modes), ctxs) - \
        mix_utility(p_true, lambda c, u: best_mode(p_assumed, *c, u, modes), ctxs)


def with_(p, **kw):
    return replace(p, **kw)
