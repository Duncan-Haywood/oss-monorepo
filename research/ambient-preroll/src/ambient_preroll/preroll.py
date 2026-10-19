"""Pre-roll: a ring buffer holding the last `preroll` frames, flushed when the gate opens, so the
audio just before the gate opened is sent too. A frame is sent if the gate is open on it or on any
of the next `preroll` frames (a backward dilation of the gate output); the buffer costs
`preroll` x 640 bytes of RAM (320 int16 samples per 20 ms frame)."""
import numpy as np

FRAME_BYTES = 640
ONSET_SPAN = 25      # frames (500 ms) after an utterance's first active frame: the "onset"
MERGE_GAP = 25       # active runs closer than this (500 ms) are one utterance


def sent_mask(open_, preroll):
    """Frames sent when a `preroll`-frame ring buffer is flushed on every gate opening."""
    if preroll <= 0:
        return open_.copy()
    n = len(open_)
    csum = np.concatenate([[0], np.cumsum(open_.astype(np.int64))])
    hi = np.minimum(n, np.arange(n) + preroll + 1)
    return (csum[hi] - csum[np.arange(n)]) > 0


def utterance_starts(active, gap=MERGE_GAP):
    """First active frame of each utterance: active runs separated by >= `gap` quiet frames."""
    idx = np.flatnonzero(active)
    if len(idx) == 0:
        return idx
    return idx[np.concatenate([[True], np.diff(idx) >= gap])]


def onset_scores(sent, active, span=ONSET_SPAN):
    """-> (onset recall, share of utterances with no onset frame lost, n utterances).
    Onset recall: sent share of the active frames in the first `span` frames of each utterance."""
    starts = utterance_starts(active)
    hit = tot = clean = 0
    for s in starts:
        sel = active[s:s + span]
        h = int(sent[s:s + span][sel].sum())
        hit += h
        tot += int(sel.sum())
        clean += h == int(sel.sum())
    if len(starts) == 0:
        return float("nan"), float("nan"), 0
    return hit / tot, clean / len(starts), len(starts)


def onset_lag(open_, active, search=50):
    """Per utterance: frames from its first active frame until the gate is open on it, looking up
    to `search` frames ahead (0 when already open). Capped at `search`. Returns an int array."""
    out = []
    for s in utterance_starts(active):
        w = open_[s:s + search + 1]
        out.append(int(np.argmax(w)) if w.any() else search)
    return np.array(out, dtype=int)
