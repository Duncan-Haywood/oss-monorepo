"""Score swe-errors' keyword error classifier against hand labels: confusion matrix, accuracy, Cohen's kappa, per-class precision and recall."""
import math
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(HERE.parent / "swe-errors" / "src"))
from swe_errors import classify  # noqa: E402

LABELS = ["collision", "timeout", "environment", "ci-or-tooling", "own-mistake", "other"]


def read_tsv(path):
    return [line.rstrip("\n").split("\t", 1) for line in open(path) if line.strip()]


def predict(text):
    """swe-errors' category, with its 'unclassified' bucket named 'other' so both use one label set."""
    c = classify(text)
    return "other" if c == "unclassified" else c


def wilson(k, n, z=1.96):
    if n == 0:
        return (0.0, 1.0)
    p = k / n
    d = 1 + z * z / n
    c = p + z * z / (2 * n)
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))
    return ((c - h) / d, (c + h) / d)


def confusion(pairs):
    """pairs of (hand, keyword) -> {hand: {keyword: count}}."""
    m = {a: {b: 0 for b in LABELS} for a in LABELS}
    for hand, kw in pairs:
        m[hand][kw] += 1
    return m


def cohen_kappa(pairs):
    n = len(pairs)
    po = sum(1 for a, b in pairs if a == b) / n
    pe = sum((sum(1 for a, _ in pairs if a == c) / n) * (sum(1 for _, b in pairs if b == c) / n) for c in LABELS)
    return (po - pe) / (1 - pe) if pe < 1 else 1.0


def per_class(pairs):
    """For each label: precision of the keyword rule (of entries it assigns, share the hand label agrees) and recall (of hand-labelled, share found)."""
    out = {}
    for c in LABELS:
        assigned = [(a, b) for a, b in pairs if b == c]
        truth = [(a, b) for a, b in pairs if a == c]
        tp = sum(1 for a, b in assigned if a == c)
        out[c] = {"assigned": len(assigned), "hand": len(truth), "tp": tp}
    return out
