"""Block bootstrap of the project history behind the sequential track-allocation replay.

swe-decay replayed policies on one history, so its intervals covered only the policies' own
randomness. Here each track's ordered sequence is resampled in circular blocks (keeping local
order, and so local autocorrelation), the replay is repeated on every resampled history, and the
spread of the policy-minus-uniform difference across histories is the interval.
"""
import os, random, sys
_D = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(_D, "..", "..", "..", "swe-decay", "src"))
from swe_decay.seq import run_seq, hindsight, Uniform, Greedy, Thompson, KnapsackUCB  # noqa: F401


def block_resample(seq, block, rng):
    """Circular block bootstrap: same length as seq, built from random contiguous blocks."""
    n = len(seq); out = []
    while len(out) < n:
        s = rng.randrange(n)
        out.extend(seq[(s + i) % n] for i in range(block))
    return out[:n]


def resample_history(seqs, block, rng):
    return {a: block_resample(s, block, rng) for a, s in seqs.items()}


def percentile_ci(xs, lo=0.025, hi=0.975):
    s = sorted(xs); n = len(s)
    return s[int(lo * (n - 1))], s[int(round(hi * (n - 1)))]


def paired_diffs(policies, seqs, budget, reps, seeds, block, master=0):
    """Per history replicate: mean over `seeds` policy seeds of (policy value - uniform value).
    Returns {name: [diff per replicate]} and the per-replicate hindsight reference."""
    rng = random.Random(master)
    diffs = {p.name: [] for p in policies if p is not Uniform}; ref = []
    for _ in range(reps):
        h = resample_history(seqs, block, rng)
        cmax = max(c for s in h.values() for _, c in s)
        def val(cls):
            return sum(run_seq(cls, h, budget, s, cmax)[0] for s in range(seeds)) / seeds
        u = val(Uniform)
        for p in policies:
            if p is not Uniform:
                diffs[p.name].append(val(p) - u)
        ref.append(hindsight(h, budget))
    return diffs, ref
