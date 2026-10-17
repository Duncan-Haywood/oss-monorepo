"""Stylised model: deliver a short message by speech (earbud), by glance (watch or small
display), or not at all. Every number in Params is a round figure chosen by the author."""
from dataclasses import dataclass, replace
import numpy as np

MODES = ("none", "speech", "glance")


@dataclass(frozen=True)
class Params:
    speech_rate: float = 2.5      # words per second spoken
    speech_latency: float = 1.0   # s before the first word
    mask_per_noise: float = 0.6   # P(speech not understood) = mask_per_noise * noise
    c_speech: float = 0.15        # fixed annoyance of a spoken interruption
    c_speech_per_s: float = 0.05  # annoyance per second of speech
    others_mult: float = 1.0      # extra annoyance factor when others are talking (x(1+m*others))
    look_rate: float = 0.10       # glances at the display per second when eyes are free
    eyes_busy_factor: float = 0.1  # look rate multiplier when eyes are busy (driving, carrying)
    max_words: int = 8            # words the display shows
    read_rate: float = 4.0        # words per second read
    c_glance: float = 0.05        # fixed annoyance of a glance notification (haptic buzz)
    c_glance_per_s: float = 0.02  # cost per second of eye time
    busy_glance_mult: float = 4.0  # eye-time cost multiplier when eyes are busy
    deadline: float = 20.0        # s within which the message must arrive to be worth anything


def speech_utility(p, words, noise, others):
    dur = p.speech_latency + words / p.speech_rate
    if dur > p.deadline:
        value = 0.0
    else:
        value = 1.0 - p.mask_per_noise * noise
    cost = (p.c_speech + p.c_speech_per_s * dur) * (1.0 + p.others_mult * others)
    return value - cost


def p_look(p, eyes_busy):
    rate = p.look_rate * (p.eyes_busy_factor if eyes_busy else 1.0)
    return 1.0 - np.exp(-rate * p.deadline)


def glance_utility(p, words, eyes_busy):
    shown = min(words, p.max_words)
    frac = shown / words
    read_t = shown / p.read_rate
    value = p_look(p, eyes_busy) * frac
    cost = p.c_glance + p.c_glance_per_s * read_t * (p.busy_glance_mult if eyes_busy else 1.0)
    return value - cost


def utilities(p, words, noise, others, eyes_busy):
    return {"none": 0.0, "speech": speech_utility(p, words, noise, others),
            "glance": glance_utility(p, words, eyes_busy)}


def best_mode(p, words, noise, others, eyes_busy):
    u = utilities(p, words, noise, others, eyes_busy)
    return max(MODES, key=lambda m: (u[m], -MODES.index(m)))  # ties go to the quieter mode


def simulate_utility(p, mode, words, noise, others, eyes_busy, n, rng):
    """Monte Carlo mean utility of always using `mode` for n messages with the given context."""
    if mode == "none":
        return 0.0
    if mode == "speech":
        dur = p.speech_latency + words / p.speech_rate
        heard = (rng.random(n) >= p.mask_per_noise * noise) & (dur <= p.deadline)
        return float(heard.mean() - (p.c_speech + p.c_speech_per_s * dur) * (1 + p.others_mult * others))
    shown = min(words, p.max_words)
    rate = p.look_rate * (p.eyes_busy_factor if eyes_busy else 1.0)
    t_look = rng.exponential(1.0 / rate, n)
    seen = t_look <= p.deadline
    cost = p.c_glance + p.c_glance_per_s * shown / p.read_rate * (p.busy_glance_mult if eyes_busy else 1.0)
    return float(seen.mean() * shown / words - cost)


def regret(p_true, p_assumed, contexts):
    """Mean utility lost per message when modes are chosen with p_assumed but scored with p_true."""
    loss = 0.0
    for ctx in contexts:
        u = utilities(p_true, *ctx)
        loss += max(u.values()) - u[best_mode(p_assumed, *ctx)]
    return loss / len(contexts)


def with_(p, **kw):
    return replace(p, **kw)
