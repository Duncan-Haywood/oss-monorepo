"""Block-stitching generators for the webcam-signal imitation game.

Builds on ../mimic-webcam (data windows, feature groups, reference detector).
mimic-webcam found that stitching 2.5 s segments from random training windows is
still caught (AUROC 0.98) while replaying whole windows is not (0.61). This asks
why: the joins, or mixing different people in one window?

  random     blocks from random windows (the mimic-webcam baseline, any block length)
  person     every block of a window comes from windows of one training person
  match      each next block is the candidate (of K random ones) whose first frame
             is closest to the previous block's last frame (a join-aware, motion-graph
             style continuation); K candidates drawn from any person
  person+match  both
All copy real frames: these are ceilings that show where detection comes from,
not generators that invent signal.
"""
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "mimic-webcam"))
import signals as S  # noqa: E402

NCH = S.NCH
MODES = ("random", "person", "match", "person+match")


def _scale(W):
    return np.maximum(W.reshape(-1, NCH).std(0), 1e-6)


def stitch(W, person, n, rng, seg=25, mode="random", k=16, T=None):
    T = T or W.shape[1]
    same = "person" in mode
    match = "match" in mode
    sc = _scale(W)
    people = np.unique(person)
    by_person = {p: np.flatnonzero(person == p) for p in people}
    out = np.empty((n, T, NCH))
    for i in range(n):
        pool = by_person[rng.choice(people)] if same else np.arange(len(W))
        prev = None
        for s in range(0, T, seg):
            ln = min(seg, T - s)
            starts = rng.integers(0, W.shape[1] - ln + 1, size=k if match and prev is not None else 1)
            wins = pool[rng.integers(len(pool), size=len(starts))]
            if match and prev is not None:
                d = (((W[wins, starts] - prev) / sc) ** 2).sum(1)
                j = int(np.argmin(d))
            else:
                j = 0
            out[i, s:s + ln] = W[wins[j], starts[j]:starts[j] + ln]
            prev = out[i, s + ln - 1]
    return out
