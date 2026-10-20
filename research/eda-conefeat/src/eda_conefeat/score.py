"""Score position-free structural features as predictors of 'Yosys proves this survivor equivalent'.

Pure stdlib. Rows come from experiments/features.jsonl. Evaluation is leave-one-line-out (the held-out mutant's whole
source line leaves training) to match eda-equivpredict / eda-equivinterval, so the numbers are comparable to its 92.6%."""
import json
import os

FEATS = os.path.join(os.path.dirname(__file__), "..", "..", "experiments", "features.jsonl")
NAMES = ("delta", "abs_delta", "cells", "miter", "same_types")


def load(path=FEATS):
    rows = [json.loads(l) for l in open(path) if l.strip()]
    for r in rows:
        r["line"] = int(r["id"].split("@")[1].split(":")[0])
        r["eq"] = r["formal"] == "equivalent"
        r["abs_delta"] = abs(r["delta"])
        r["same_types"] = int(r["same_types"])
    return rows


def auc(rows, f):
    """P(score of a random equivalent > score of a random non-equivalent), ties count half."""
    pos = [r[f] for r in rows if r["eq"]]; neg = [r[f] for r in rows if not r["eq"]]
    s = sum((p > n) + 0.5 * (p == n) for p in pos for n in neg)
    return s / (len(pos) * len(neg))


def best_split(train, f):
    """One-split rule on feature f: (threshold, sign) with fewest training errors; ties keep the first found."""
    vals = sorted({r[f] for r in train})
    cuts = [vals[0] - 1] + [(a + b) / 2 for a, b in zip(vals, vals[1:])]
    best = None
    for c in cuts:
        for sign in (1, -1):
            err = sum(((sign * (r[f] - c)) > 0) != r["eq"] for r in train)
            if best is None or err < best[0]:
                best = (err, c, sign)
    return best[1], best[2]


def loo_line(rows, f):
    """Leave-one-line-out accuracy of the best one-split rule on f; also returns the hit count."""
    hits = 0
    for r in rows:
        train = [t for t in rows if t["line"] != r["line"]]
        if not train:
            continue
        c, sign = best_split(train, f)
        hits += ((sign * (r[f] - c)) > 0) == r["eq"]
    return hits


def majority(rows):
    k = sum(r["eq"] for r in rows)
    return max(k, len(rows) - k) / len(rows)
