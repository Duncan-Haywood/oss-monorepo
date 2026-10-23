"""A session-agent coder on real GoEmotions comments: sample, confusion and estimator comparison.

Stdlib only. Reuses `../qual-real/qualreal.py` (loader, naive Bayes, lexicon) and the estimators of
`../qual-correction/qualml.py`. No comment text is stored: `agent_codes.json` maps comment id to the 0/1
code the session agent assigned.
"""
import json
import random
import statistics
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "qual-real"))
import qualreal as r  # noqa: E402
q = r.q

SPLIT_SEED, SAMPLE_SEED, SAMPLE_N = 20261020, 20261023, 300


def split(ex):
    """The qual-real split: 40% train the coder, the rest is the corpus."""
    rng = random.Random(SPLIT_SEED)
    order = list(range(len(ex)))
    rng.shuffle(order)
    cut = int(0.4 * len(ex))
    return [ex[i] for i in order[:cut]], [ex[i] for i in order[cut:]]


def sample_corpus(test, n=SAMPLE_N, seed=SAMPLE_SEED):
    rng = random.Random(seed)
    return [test[i] for i in sorted(rng.sample(range(len(test)), n))]


def wilson(k, n, z=q.Z95):
    if n == 0:
        return (0.0, 1.0)
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * ((p * (1 - p) / n + z * z / (4 * n * n)) ** 0.5) / d
    return (c - h, c + h)


def mcnemar_exact(b, c):
    """Two-sided exact p for discordant counts b, c (coder A right/B wrong, and the reverse)."""
    from math import comb
    n = b + c
    if n == 0:
        return 1.0
    k = min(b, c)
    return min(1.0, 2 * sum(comb(n, i) for i in range(k + 1)) / 2 ** n)


def draws(llm, human, members_all, n_gold, reps, rng):
    """Per-estimator (estimate, se) lists for prevalence over `reps` random hand-coded samples."""
    n = len(human)
    out = {"naive": [], "human": [], "ppi": []}
    for _ in range(reps):
        gold = rng.sample(range(n), n_gold)
        e = r.estimates(llm, human, gold, members_all)
        for k, v in e.items():
            out[k].append(v)
    return out


def summarise(rows, truth):
    ests = [e[0] for e in rows]
    return (statistics.fmean(ests), statistics.fmean(q.covers(e, truth) for e in rows),
            statistics.fmean(2 * q.Z95 * e[1] for e in rows))
