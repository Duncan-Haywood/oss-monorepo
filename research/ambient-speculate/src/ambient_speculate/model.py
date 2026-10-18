"""Reply latency when the pipeline starts before the end-of-speech hangover expires.

Times are milliseconds measured from the true end of the user's last word.

Baseline(H): the endpoint fires at H + delta, then ASR + LLM first sentence + TTS first chunk
(the chain C_i of utterance i) run, so reply = H + delta + C_i.
Hold(S, H):  after only S ms of silence the chain starts speculatively on the transcript so far;
the reply is held until the full hangover H confirms the turn is over: reply = max(H + delta, S + delta + C_i).
Eager(S):    the reply is spoken as soon as the speculative chain finishes: reply = S + delta + C_i,
and it talks over the speaker if speech resumes before then.

Within-turn pauses are an assumption, not data: n_pauses per turn, each lognormal(median, sigma).
A pause longer than the hangover H splits the turn (a cut-off); a pause longer than S starts a
speculative run that is wasted if speech resumes before H.
"""
from dataclasses import dataclass
from math import erf, log, sqrt
import numpy as np


@dataclass(frozen=True)
class Pauses:
    n_pauses: float = 2.0   # expected within-turn pauses per turn (Poisson)
    median_ms: float = 250.0
    sigma: float = 0.8      # lognormal shape


def sf(p: Pauses, t_ms: float) -> float:
    """P(pause duration > t)."""
    if t_ms <= 0:
        return 1.0
    z = (log(t_ms) - log(p.median_ms)) / p.sigma
    return 0.5 * (1.0 - erf(z / sqrt(2.0)))


def p_any(p: Pauses, t_ms: float) -> float:
    """P(a turn has at least one pause longer than t) with Poisson pause counts."""
    return 1.0 - np.exp(-p.n_pauses * sf(p, t_ms))


def chains(inp: dict) -> np.ndarray:
    return (np.array(inp["asr_ms"]) + np.array(inp["llm_first_sentence_ms"]) + np.array(inp["tts_first_chunk_ms"])).astype(float)


def delta(inp: dict) -> float:
    return float(np.mean(inp["endpoint_offset_ms"]))


def baseline(C, d, H):
    return H + d + np.asarray(C)


def hold(C, d, S, H):
    return np.maximum(H + d, S + d + np.asarray(C)) if S < H else baseline(C, d, H)


def eager(C, d, S):
    return S + d + np.asarray(C)


def extra_runs_hold(p: Pauses, S, H):
    """Expected speculative runs per turn that baseline(H) would not have started: pauses in (S, H]."""
    return p.n_pauses * (sf(p, S) - sf(p, H)) if S < H else 0.0


def talkover_eager(p: Pauses, C, d, S):
    """P(turn has a pause that resumes after the speculative run starts but before its audio plays),
    averaged over the measured chains C."""
    out = []
    for c in np.asarray(C):
        lo, hi = S + d, S + d + c
        out.append(1.0 - np.exp(-p.n_pauses * max(sf(p, lo) - sf(p, hi), 0.0)))
    return float(np.mean(out))


def simulate(p: Pauses, C, d, S, H, n=200000, seed=0):
    """Monte Carlo check of the closed forms: returns (cutoff rate, extra runs per turn, talk-over rate for eager(S))."""
    rng = np.random.default_rng(seed)
    C = np.asarray(C)
    counts = rng.poisson(p.n_pauses, n)
    cut = ext = tov = 0
    for k, c in zip(counts, C[rng.integers(0, len(C), n)]):
        if k == 0:
            continue
        dur = rng.lognormal(log(p.median_ms), p.sigma, k)
        cut += bool((dur > H).any())
        ext += int(((dur > S) & (dur <= H)).sum()) if S < H else 0
        tov += bool(((dur > S + d) & (dur < S + d + c)).any())
    return cut / n, ext / n, tov / n
