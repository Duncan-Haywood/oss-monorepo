"""Rank statistics and Pareto fronts, stdlib only."""


def ranks(xs):
    """Average ranks (1-based; ties share the mean rank)."""
    order = sorted(range(len(xs)), key=lambda i: xs[i])
    r = [0.0] * len(xs)
    i = 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and xs[order[j + 1]] == xs[order[i]]:
            j += 1
        for k in range(i, j + 1):
            r[order[k]] = (i + j) / 2 + 1
        i = j + 1
    return r


def pearson(a, b):
    n = len(a)
    ma, mb = sum(a) / n, sum(b) / n
    sa = sum((x - ma) ** 2 for x in a) ** 0.5
    sb = sum((y - mb) ** 2 for y in b) ** 0.5
    if sa == 0 or sb == 0:
        return float("nan")
    return sum((x - ma) * (y - mb) for x, y in zip(a, b)) / (sa * sb)


def spearman(a, b):
    return pearson(ranks(a), ranks(b))


def kendall(a, b):
    """Kendall tau-b."""
    n = len(a)
    c = d = ta = tb = 0
    for i in range(n):
        for j in range(i + 1, n):
            x, y = a[i] - a[j], b[i] - b[j]
            if x == 0 and y == 0:
                continue
            if x == 0:
                ta += 1
            elif y == 0:
                tb += 1
            elif (x > 0) == (y > 0):
                c += 1
            else:
                d += 1
    den = ((c + d + ta) * (c + d + tb)) ** 0.5
    return (c - d) / den if den else float("nan")


def pareto_idx(points):
    """Indices of non-dominated points (all objectives minimised); duplicates all kept."""
    out = []
    for i, p in enumerate(points):
        dom = any(all(q[k] <= p[k] for k in range(len(p))) and any(q[k] < p[k] for k in range(len(p)))
                  for j, q in enumerate(points) if j != i)
        if not dom:
            out.append(i)
    return out


def top_k_overlap(a, b, k):
    """Fraction of the k best (lowest) by a that are also among the k best by b."""
    ta = set(sorted(range(len(a)), key=lambda i: a[i])[:k])
    tb = set(sorted(range(len(b)), key=lambda i: b[i])[:k])
    return len(ta & tb) / k
