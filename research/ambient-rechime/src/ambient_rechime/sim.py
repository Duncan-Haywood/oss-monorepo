"""Stylised model: extends ambient-urgency with repeated chimes. A chime-plus-glance message plays up to
n tones, `gap` seconds apart, each noticed independently; once a tone is noticed the look rate is boosted.
If the wearer's look is detected the remaining tones are cancelled. Every number is a round figure chosen
by the author."""
from dataclasses import dataclass, replace
import numpy as np

# urgency class -> (deadline in s, value weight, probability in the mix)
URGENCY = {"low": (120.0, 0.5, 0.5), "normal": (20.0, 1.0, 0.35), "high": (6.0, 2.0, 0.15)}


@dataclass(frozen=True)
class Params:
    mask_per_noise: float = 0.6
    others_mult: float = 1.0
    look_rate: float = 0.10
    eyes_busy_factor: float = 0.1
    max_words: int = 8
    read_rate: float = 4.0
    c_glance: float = 0.05
    c_glance_per_s: float = 0.02
    busy_glance_mult: float = 4.0
    chime_cost: float = 0.04
    chime_mask: float = 0.5        # P(a tone is not noticed) = chime_mask * noise
    react_rate: float = 0.5
    react_busy_factor: float = 0.3
    gap: float = 3.0               # seconds between repeated tones
    stop_on_look: bool = True      # remaining tones cancelled once the wearer looks


def _rate(p, busy):
    return p.look_rate * (p.eyes_busy_factor if busy else 1.0)


def _boost(p, busy):
    return p.react_rate * (p.react_busy_factor if busy else 1.0)


def _glance_cost(p, shown, busy):
    return p.c_glance + p.c_glance_per_s * shown / p.read_rate * (p.busy_glance_mult if busy else 1.0)


def chime_times(p, n, deadline):
    return [k * p.gap for k in range(n) if k * p.gap < deadline]


def p_unseen(p, t, times, noise, busy):
    """P(no look before time t) given tones at `times` (only those before t count)."""
    pn = 1.0 - p.chime_mask * noise
    r, b = _rate(p, busy), _boost(p, busy)
    prior = [s for s in times if s < t]
    out = (1.0 - pn) ** len(prior) * np.exp(-r * t)
    for j, s in enumerate(prior):
        out += (1.0 - pn) ** j * pn * np.exp(-r * s) * np.exp(-(r + b) * (t - s))
    return out


def expected_tones(p, n, noise, busy, deadline):
    times = chime_times(p, n, deadline)
    if not p.stop_on_look:
        return float(len(times))
    return float(sum(p_unseen(p, s, times, noise, busy) for s in times))


def utility(p, n, words, noise, others, busy, deadline, weight):
    """n = 0 is plain glance; n >= 1 is chime+glance with n tones."""
    shown = min(words, p.max_words)
    times = chime_times(p, n, deadline)
    seen = 1.0 - p_unseen(p, deadline, times, noise, busy)
    cost = _glance_cost(p, shown, busy) + p.chime_cost * (1.0 + p.others_mult * others) * expected_tones(p, n, noise, busy, deadline)
    return weight * seen * shown / words - cost


def simulate(p, n, words, noise, others, busy, deadline, weight, draws, rng):
    shown = min(words, p.max_words)
    times = chime_times(p, n, deadline)
    pn = 1.0 - p.chime_mask * noise
    r, b = _rate(p, busy), _boost(p, busy)
    t_look = np.full(draws, np.inf)
    first = np.full(draws, np.inf)           # time of first noticed tone
    for s in times:
        hit = (rng.random(draws) < pn) & np.isinf(first) & (s < t_look)
        first = np.where(hit, s, first)
    # look time: spontaneous at rate r until `first`, then rate r + b
    e1 = rng.exponential(1.0 / r, draws)
    e2 = rng.exponential(1.0 / (r + b), draws)
    t_look = np.where(e1 < first, e1, first + e2)
    # tones actually played: those before the look (all, if stop_on_look is False)
    played = sum(((s <= t_look) if p.stop_on_look else np.ones(draws, bool)).astype(float) for s in times) if times else 0.0
    cost = _glance_cost(p, shown, busy) + p.chime_cost * (1.0 + p.others_mult * others) * np.mean(played)
    return float(weight * (t_look <= deadline).mean() * shown / words - cost)


def contexts(word_grid=(3, 6, 12, 24), noise_grid=(0.0, 0.5, 1.0)):
    return [(wd, nz, o, e) for wd in word_grid for nz in noise_grid for o in (0, 1) for e in (False, True)]


def best_n(p, ctx, urgency, ns):
    d, w, _ = URGENCY[urgency]
    return max(ns, key=lambda n: (utility(p, n, *ctx, d, w), -n))  # ties go to fewer tones


def mean_utility(p, ns, ctxs=None):
    """Mean utility per message (urgency mix, context grid) when each cell picks its best n from ns."""
    ctxs = ctxs or contexts()
    tot = 0.0
    for c in ctxs:
        for u, (d, w, pr) in URGENCY.items():
            tot += pr * utility(p, best_n(p, c, u, ns), *c, d, w)
    return tot / len(ctxs)


def with_(p, **kw):
    return replace(p, **kw)
