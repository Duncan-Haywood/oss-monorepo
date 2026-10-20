"""Compare runs that record a deviation with runs that do not, within strata (standard library only)."""
import random
import statistics


def deviated(r):
    d = r.get("deviations")
    return bool(d) and isinstance(d, list)


def stratum(r):
    """Track and recording regime: cost tooling was absent before 2026-10-16, so never compare across it."""
    return (r.get("track") or "none", "late" if (r.get("date") or "") >= "2026-10-16" else "early")


def strata(runs, field):
    """{stratum: (values with deviation, values without)} for records that carry a numeric `field`."""
    out = {}
    for r in runs:
        v = r.get(field)
        if isinstance(v, bool) or not isinstance(v, (int, float)):
            continue
        out.setdefault(stratum(r), ([], []))[0 if deviated(r) else 1].append(float(v))
    return out


def usable(groups, min_each=3):
    return {k: g for k, g in groups.items() if len(g[0]) >= min_each and len(g[1]) >= min_each}


def stat(groups):
    """Mean over strata of (median with - median without), weighted by the smaller arm's size."""
    num = den = 0.0
    for a, b in groups.values():
        w = min(len(a), len(b))
        num += w * (statistics.median(a) - statistics.median(b))
        den += w
    return num / den if den else 0.0


def log_ratio_stat(groups):
    import math
    num = den = 0.0
    for a, b in groups.values():
        ma, mb = statistics.median(a), statistics.median(b)
        if ma <= 0 or mb <= 0:
            continue
        w = min(len(a), len(b))
        num += w * math.log(ma / mb)
        den += w
    return num / den if den else 0.0


def perm_test(groups, fn=log_ratio_stat, n=5000, seed=0):
    """Two-sided permutation p-value: shuffle the deviation label inside each stratum."""
    rng = random.Random(seed)
    obs = fn(groups)
    hits = 0
    for _ in range(n):
        g = {}
        for k, (a, b) in groups.items():
            pool = a + b
            rng.shuffle(pool)
            g[k] = (pool[:len(a)], pool[len(a):])
        if abs(fn(g)) >= abs(obs) - 1e-12:
            hits += 1
    return obs, (hits + 1) / (n + 1)


def partial_table(runs):
    """{stratum: [partial with, n with, partial without, n without]}."""
    out = {}
    for r in runs:
        row = out.setdefault(stratum(r), [0, 0, 0, 0])
        i = 0 if deviated(r) else 2
        row[i + 1] += 1
        row[i] += r.get("outcome") == "partial"
    return out


def partial_stat(table):
    num = den = 0.0
    for pa, na, pb, nb in table.values():
        if na and nb:
            w = min(na, nb)
            num += w * (pa / na - pb / nb)
            den += w
    return num / den if den else 0.0


def partial_perm(runs, n=5000, seed=0):
    rng = random.Random(seed)
    by = {}
    for r in runs:
        by.setdefault(stratum(r), []).append((deviated(r), r.get("outcome") == "partial"))
    def st(b):
        t = {}
        for k, items in b.items():
            row = [0, 0, 0, 0]
            for d, p in items:
                i = 0 if d else 2
                row[i + 1] += 1
                row[i] += p
            t[k] = row
        return partial_stat(t)
    obs = st(by)
    hits = 0
    for _ in range(n):
        sh = {}
        for k, items in by.items():
            labs = [d for d, _ in items]
            rng.shuffle(labs)
            sh[k] = [(l, p) for l, (_, p) in zip(labs, items)]
        if abs(st(sh)) >= abs(obs) - 1e-12:
            hits += 1
    return obs, (hits + 1) / (n + 1)
