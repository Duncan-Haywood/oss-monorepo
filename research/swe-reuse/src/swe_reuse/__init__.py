"""Reference graph of the research portfolio's project READMEs (stdlib only)."""
import math
import re


def prefix(slug):
    """Track prefix: the slug up to its first hyphen."""
    return slug.split("-", 1)[0]


def mentions(text, slugs, self_slug):
    """Slugs (other than self_slug) that text names as a whole token, e.g. `../swe-ledger` or `swe-ledger`."""
    out = set()
    for s in slugs:
        if s == self_slug:
            continue
        if re.search(r"(?<![A-Za-z0-9_-])" + re.escape(s) + r"(?![A-Za-z0-9_-])", text):
            out.add(s)
    return out


def edges(refs, created):
    """Backward edges (citer, cited) where cited was created strictly before citer.

    refs: {citer: set(cited)}; created: {slug: sortable timestamp}. Ties and forward references are dropped.
    """
    return sorted((a, b) for a, bs in refs.items() for b in bs if a in created and b in created and created[b] < created[a])


def wilson(k, n, z=1.96):
    if n == 0:
        return (0.0, 1.0)
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return (max(0.0, c - h), min(1.0, c + h))


def expected_same_prefix(edge_list, created):
    """Expected number of same-prefix edges if every citer had cited uniformly among the earlier projects it could cite.

    Each citer contributes (its edge count) x (share of earlier projects that share its prefix).
    """
    order = sorted(created, key=lambda s: created[s])
    exp = 0.0
    cnt = {}
    for a, _ in edge_list:
        cnt[a] = cnt.get(a, 0) + 1
    for a, k in cnt.items():
        earlier = [s for s in order if created[s] < created[a]]
        if earlier:
            exp += k * sum(1 for s in earlier if prefix(s) == prefix(a)) / len(earlier)
    return exp


def gini(values):
    v = sorted(values)
    n, tot = len(v), sum(v)
    if n == 0 or tot == 0:
        return 0.0
    return sum((2 * (i + 1) - n - 1) * x for i, x in enumerate(v)) / (n * tot)
