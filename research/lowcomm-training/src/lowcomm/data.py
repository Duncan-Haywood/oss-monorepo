"""Character-level corpus and deterministic batch sampling."""
import numpy as np

__all__ = ["load_chars", "batch"]


def load_chars(path):
    text = open(path, encoding="utf-8").read()
    chars = sorted(set(text))
    idx = {c: i for i, c in enumerate(chars)}
    return np.array([idx[c] for c in text], dtype=np.int64), chars


def batch(data, seed, worker, step, B, T):
    """Batch for (seed, worker, step): independent of call order, so any trainer sees the same stream."""
    rng = np.random.default_rng([seed, worker, step])
    i = rng.integers(0, len(data) - T - 1, B)
    ix = i[:, None] + np.arange(T)
    return data[ix], data[ix + 1]
