"""Classify the free-text `errors` field of run records and compare runs with and without errors."""
import json
import math
import random
import re

# Ordered: the first matching rule wins. Keyword rules, deliberately crude and inspectable.
RULES = [
    ("collision", r"collid|collision|duplicat|parallel|sibling|superseded|claimed|race|conflict|stale|merged first|landed first"),
    ("timeout", r"timeout|timed out|killed|exceeded the|too long|ran out"),
    ("environment", r"pip|python3?\b|interpreter|install|shallow|unshallow|not found|no module|missing|path\b|proxy|403|network|sandbox|permission"),
    ("ci-or-tooling", r"\bci\b|workflow|check run|lint|build\.py|verify|gate|hook|mcp|api|rate limit|starv"),
    ("own-mistake", r"wrong|initially|first (pass|run|draft|idea|attempt)|fixed|bug|undercount|mistake|typo|incorrect|failed|fail"),
]


def classify(text):
    t = text.lower()
    for name, pat in RULES:
        if re.search(pat, t):
            return name
    return "unclassified"


def load(path):
    with open(path) as f:
        return [json.loads(line) for line in f if line.strip()]


def wilson(k, n, z=1.96):
    if n == 0:
        return (0.0, 0.0)
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return (c - h, c + h)


def median(xs):
    s = sorted(xs)
    n = len(s)
    return s[n // 2] if n % 2 else (s[n // 2 - 1] + s[n // 2]) / 2


def category_counts(runs):
    out = {}
    for r in runs:
        for e in r.get("errors") or []:
            c = classify(e)
            out[c] = out.get(c, 0) + 1
    return out


def error_share(runs):
    """(runs with at least one error, runs)."""
    return sum(1 for r in runs if r.get("errors")), len(runs)


def partial_rate(runs):
    return sum(1 for r in runs if r.get("outcome") == "partial"), len(runs)


def boot_median_diff(a, b, reps=2000, seed=1):
    """Median(a) - median(b) with a 95% percentile bootstrap interval."""
    rng = random.Random(seed)
    ds = sorted(median([rng.choice(a) for _ in a]) - median([rng.choice(b) for _ in b]) for _ in range(reps))
    return median(a) - median(b), ds[int(0.025 * reps)], ds[int(0.975 * reps) - 1]
