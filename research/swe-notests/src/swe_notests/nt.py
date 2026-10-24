"""Compare runs that add no tests with runs that add some, within strata (standard library only)."""
import math
import random
import statistics


def has_count(r):
    v = r.get("tests_added")
    return isinstance(v, int) and not isinstance(v, bool) and v >= 0


def no_tests(r):
    return r["tests_added"] == 0


def stratum(r):
    """Track and recording regime: cost tooling was absent before 2026-10-16, so never compare across it."""
    return (r.get("track") or "none", "late" if (r.get("date") or "") >= "2026-10-16" else "early")


def partial_table(runs):
    """{stratum: [partial with no tests, n no tests, partial with tests, n with tests]}."""
    out = {}
    for r in runs:
        if not has_count(r):
            continue
        row = out.setdefault(stratum(r), [0, 0, 0, 0])
        i = 0 if no_tests(r) else 2
        row[i + 1] += 1
        row[i] += r.get("outcome") == "partial"
    return out


def partial_stat(table):
    """Mean over strata of (partial share without tests - with tests), weighted by the smaller arm."""
    num = den = 0.0
    for pa, na, pb, nb in table.values():
        if na and nb:
            w = min(na, nb)
            num += w * (pa / na - pb / nb)
            den += w
    return num / den if den else 0.0


def _table_from(by):
    t = {}
    for k, items in by.items():
        row = [0, 0, 0, 0]
        for z, p in items:
            i = 0 if z else 2
            row[i + 1] += 1
            row[i] += p
        t[k] = row
    return t


def partial_perm(runs, n=5000, seed=0):
    """Two-sided permutation p for the pooled partial-share difference; labels shuffled inside strata."""
    rng = random.Random(seed)
    by = {}
    for r in runs:
        if has_count(r):
            by.setdefault(stratum(r), []).append((no_tests(r), r.get("outcome") == "partial"))
    obs = partial_stat(_table_from(by))
    hits = 0
    for _ in range(n):
        sh = {}
        for k, items in by.items():
            labs = [z for z, _ in items]
            rng.shuffle(labs)
            sh[k] = [(l, p) for l, (_, p) in zip(labs, items)]
        if abs(partial_stat(_table_from(sh))) >= abs(obs) - 1e-12:
            hits += 1
    return obs, (hits + 1) / (n + 1)


def cost_strata(runs, field="cost_usd"):
    out = {}
    for r in runs:
        v = r.get(field)
        if not has_count(r) or isinstance(v, bool) or not isinstance(v, (int, float)) or v <= 0:
            continue
        out.setdefault(stratum(r), ([], []))[0 if no_tests(r) else 1].append(float(v))
    return out


def usable(groups, min_each=3):
    return {k: g for k, g in groups.items() if len(g[0]) >= min_each and len(g[1]) >= min_each}


def log_ratio_stat(groups):
    num = den = 0.0
    for a, b in groups.values():
        w = min(len(a), len(b))
        num += w * math.log(statistics.median(a) / statistics.median(b))
        den += w
    return num / den if den else 0.0


def cost_perm(groups, n=5000, seed=0):
    rng = random.Random(seed)
    obs = log_ratio_stat(groups)
    hits = 0
    for _ in range(n):
        g = {}
        for k, (a, b) in groups.items():
            pool = a + b
            rng.shuffle(pool)
            g[k] = (pool[:len(a)], pool[len(a):])
        if abs(log_ratio_stat(g)) >= abs(obs) - 1e-12:
            hits += 1
    return obs, (hits + 1) / (n + 1)
