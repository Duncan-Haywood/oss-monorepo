"""Per-person versus pooled generators for the webcam-signal imitation game.

Builds on ../mimic-webcam (windows, feature groups, parametric generator) and
../mimic-webcam-stitch (block stitching). Those found that copies of real frames
are caught mainly because they mix people, and that fitted parametric generators
are caught at AUROC ~1.0. This asks the converse: fit a generator on ONE
person's early windows and test it against that person's LATER windows. Does
personalising help, for copying generators and for a fitted parametric one?

Each person's windows are in time order; the first half is the fit split, the
second half the held-out real windows. Every generator sees only fit windows.
"""
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
for d in ("mimic-webcam", "mimic-webcam-stitch"):
    sys.path.insert(0, os.path.join(HERE, "..", d))
import signals as S  # noqa: E402
import stitch as T  # noqa: E402

NCH = S.NCH
# a reasonable fixed parametric program (not searched): window-level offsets,
# AR(1) memory, channel correlation, holds. Chosen from the genes mimic-webcam's
# loop most often kept; the point here is personal versus pooled fitting.
GENOME = {"level": "window", "amp_src": "window", "dyn": "ar1", "amp": 1.0, "rho_mult": 1.0,
          "cross": True, "hold": 0.5, "spike": 0.0, "decimals": None}
GENERATORS = ("own replay", "own stitch50", "own stitch50+match", "own param",
              "pooled replay", "pooled stitch50", "pooled stitch50+match", "pooled param")


def split_people(person, min_windows=12):
    """{person: (fit_idx, held_idx)}: first half of each person's windows (in file order) to fit."""
    out = {}
    for p in np.unique(person):
        idx = np.flatnonzero(person == p)
        if len(idx) >= min_windows:
            h = len(idx) // 2
            out[p] = (idx[:h], idx[h:])
    return out


def make(name, pool, n, rng):
    """n synthetic windows from a pool of real windows (and nothing else)."""
    kind = name.split(" ", 1)[1]
    if kind == "replay":
        return S.replay(pool, n, rng)
    if kind == "param":
        return S.generate(GENOME, S.Fit(pool), n, rng)
    mode = "match" if kind.endswith("+match") else "random"
    return T.stitch(pool, np.zeros(len(pool), int), n, rng, seg=50, mode=mode)


def build(X, person, seed, generators=GENERATORS):
    """Returns real fit windows, real held windows, owner ids, and per-generator
    (fake_fit, fake_held) windows with the owner each was made for."""
    rng = np.random.default_rng(seed)
    sp = split_people(person)
    ids = list(sp)
    own_fit = {p: X[sp[p][0]] for p in ids}
    real = {"fit": [], "held": [], "fit_owner": [], "held_owner": []}
    for p in ids:
        real["fit"].append(own_fit[p])
        real["held"].append(X[sp[p][1]])
        real["fit_owner"] += [p] * len(sp[p][0])
        real["held_owner"] += [p] * len(sp[p][1])
    real = {k: (np.vstack(v) if k in ("fit", "held") else np.array(v)) for k, v in real.items()}
    fakes = {}
    for g in generators:
        fa, fb, oa, ob = [], [], [], []
        for p in ids:
            if g.startswith("own"):
                pool = own_fit[p]
            else:
                pool = np.vstack([own_fit[q] for q in ids if q != p])
            na, nb = len(sp[p][0]), len(sp[p][1])
            fa.append(make(g, pool, na, rng))
            fb.append(make(g, pool, nb, rng))
            oa += [p] * na
            ob += [p] * nb
        fakes[g] = (np.vstack(fa), np.vstack(fb), np.array(oa), np.array(ob))
    return real, fakes


def profile(fg_real_fit, owners_fit, owners, groups=("level", "spread")):
    """Per-person profile: mean of the person's real fit-window features, one row per sample."""
    F = S.stack(fg_real_fit, groups)
    prof = {p: F[owners_fit == p].mean(0) for p in np.unique(owners_fit)}
    return np.array([prof[p] for p in owners])
