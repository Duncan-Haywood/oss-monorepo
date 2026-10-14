"""Pure-Python pieces: endpointing on VAD probabilities, WER, latency budget.

No model is needed here, so the unit tests run anywhere.
"""
from __future__ import annotations

from dataclasses import dataclass

FRAME_MS = 32.0  # 512 samples at 16 kHz, the Silero VAD window


def endpoint(probs, hangover_ms, threshold=0.5, frame_ms=FRAME_MS):
    """Segment a stream of per-frame speech probabilities.

    A segment starts at the first frame with p >= threshold and ends once
    `hangover_ms` of consecutive frames fall below it. Returns a list of
    dicts: start_ms, last_speech_ms (end of the last speech frame) and
    detect_ms (when the endpoint fires: the end of the last hangover frame).
    A segment still open at the end of the stream is closed there.
    """
    hang = max(1, int(round(hangover_ms / frame_ms)))
    segs, start, last, quiet = [], None, None, 0
    for i, p in enumerate(probs):
        if p >= threshold:
            if start is None:
                start = i
            last, quiet = i, 0
        elif start is not None:
            quiet += 1
            if quiet >= hang:
                segs.append(_seg(start, last, i, frame_ms))
                start, last, quiet = None, None, 0
    if start is not None:
        segs.append(_seg(start, last, len(probs) - 1, frame_ms))
    return segs


def _seg(start, last, fire, frame_ms):
    return {"start_ms": start * frame_ms, "last_speech_ms": (last + 1) * frame_ms,
            "detect_ms": (fire + 1) * frame_ms}


def wer(ref: str, hyp: str) -> float:
    """Word error rate after lower-casing and stripping punctuation."""
    norm = lambda s: "".join(c for c in s.lower() if c.isalnum() or c.isspace()).split()
    r, h = norm(ref), norm(hyp)
    if not r:
        return 0.0 if not h else 1.0
    d = list(range(len(h) + 1))
    for i, rw in enumerate(r, 1):
        prev, d[0] = d[0], i
        for j, hw in enumerate(h, 1):
            cur = min(d[j] + 1, d[j - 1] + 1, prev + (rw != hw))
            prev, d[j] = d[j], cur
    return d[len(h)] / len(r)


def first_sentence(text: str):
    """Return the text up to and including the first sentence end, or None."""
    for i, c in enumerate(text):
        if c in ".!?" and (i + 1 == len(text) or text[i + 1].isspace()) and i > 0:
            return text[: i + 1]
    return None


@dataclass
class Stages:
    """Median per-stage times (ms) for one reply, measured from end of speech."""
    hangover_ms: float
    vad_ms: float
    asr_ms: float
    llm_first_sentence_ms: float
    tts_first_chunk_ms: float

    def reply_latency_ms(self) -> float:
        """Time from the user's last speech sample to the first audio out."""
        return (self.hangover_ms + self.vad_ms + self.asr_ms
                + self.llm_first_sentence_ms + self.tts_first_chunk_ms)

    def slack_ms(self, target_ms: float) -> float:
        """Positive when the pipeline meets `target_ms`, negative when over."""
        return target_ms - self.reply_latency_ms()


def required_speedup(stages: Stages, target_ms: float) -> float:
    """Factor by which the post-hangover compute must shrink to hit target.

    Hangover is a policy choice, not compute, so it is held fixed. Returns
    inf if the hangover alone already exceeds the target.
    """
    compute = stages.reply_latency_ms() - stages.hangover_ms
    room = target_ms - stages.hangover_ms
    return float("inf") if room <= 0 else compute / room
