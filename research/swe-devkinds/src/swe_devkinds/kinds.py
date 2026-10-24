"""Classify recorded deviations by what they say, then compare kinds (standard library only)."""
import random

# Ordered: the first matching kind wins. Keyword rules, deliberately crude and fixed before looking at outcomes.
RULES = [
    ("tooling", ("fail", "unavailable", "broken", "timeout", "timed out", "error", "invalid", "denied", "403", "no access", "cannot", "could not", "couldn't", "stale", "shallow")),
    ("skipped", ("skip", "did not", "didn't", "not done", "not run", "omitted", "left for", "without", "no record", "deferred")),
    ("switched", ("instead", "switched", "picked", "chose", "took the", "rather than", "different", "redirect")),
]


def kind(why):
    w = (why or "").lower()
    for name, words in RULES:
        if any(x in w for x in words):
            return name
    return "other"


def kinds_of(run):
    """Set of kinds across a run's deviation entries (empty set when it recorded none)."""
    d = run.get("deviations")
    if not isinstance(d, list):
        return set()
    out = set()
    for e in d:
        out.add(kind(e.get("why") if isinstance(e, dict) else str(e)))
    return out


def rate_table(runs, pred):
    """{track: [hits with kind, n with kind, hits without, n without]}; 'without' = runs recording no deviation."""
    out = {}
    for r in runs:
        ks = kinds_of(r)
        row = out.setdefault(r.get("track") or "none", [0, 0, 0, 0])
        hit = bool(pred(r))
        if ks:
            continue
        row[2] += hit
        row[3] += 1
    return out


def kind_vs_none(runs, k, pred, n=5000, seed=0):
    """Track-stratified difference in rate (kind k minus no deviation); weights = smaller arm; permutation p."""
    strata = {}
    for r in runs:
        ks = kinds_of(r)
        if ks and k not in ks:
            continue
        arm = 0 if ks else 1
        strata.setdefault(r.get("track") or "none", ([], []))[arm].append(1 if pred(r) else 0)
    strata = {t: g for t, g in strata.items() if len(g[0]) >= 3 and len(g[1]) >= 3}

    def stat(g):
        num = den = 0.0
        for a, b in g.values():
            w = min(len(a), len(b))
            num += w * (sum(a) / len(a) - sum(b) / len(b))
            den += w
        return num / den if den else 0.0

    obs = stat(strata)
    rng = random.Random(seed)
    hits = 0
    for _ in range(n):
        g = {}
        for t, (a, b) in strata.items():
            pool = a + b
            rng.shuffle(pool)
            g[t] = (pool[:len(a)], pool[len(a):])
        hits += abs(stat(g)) >= abs(obs) - 1e-12
    return obs, (hits + 1) / (n + 1), sum(len(a) for a, _ in strata.values())
