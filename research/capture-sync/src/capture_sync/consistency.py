"""Multi-recording consistency for audio sync (milestone 4, step 4c).

Kammerl et al. (2014) synchronise many uploads at once: every pair is correlated, and a global step makes the
pairwise offsets agree before any recording is placed on the common timeline. Their exact global step could not
be read from this session (only the abstract), so two standard ways of doing it are implemented here, both on
the same interface: N devices, one pairwise estimate per unordered pair (i < j), est[i, j] the offset of j
relative to i in seconds (nan if the method returned none) and conf[i, j] that method's own confidence.

  * direct: device j placed by its own pair with the anchor, t_j = est[0, j] (what a pairwise system does).
  * mst:    the maximum-confidence spanning tree (Kruskal), offsets summed along its paths from the anchor.
            Only the order of the confidences matters, so methods whose confidences live on different scales
            are treated alike.
  * trim:   least squares over all pairs (t_0 = 0), then the pair with the largest residual is dropped while it
            exceeds `tol` and the remaining pairs still connect every device; confidences are not used.
            A device is flagged *consistent* when the final fit has every residual within `tol` and both it and
            the anchor keep at least two pairs, so each sits in a closed loop: a ground-truth-free check.
"""
import numpy as np


def _connected(n, edges):
    parent = list(range(n))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for i, j in edges:
        parent[find(i)] = find(j)
    return len({find(x) for x in range(n)}) == 1


def _lsq(n, edges, y):
    A = np.zeros((len(edges), n - 1))
    for r, (i, j) in enumerate(edges):
        if j > 0:
            A[r, j - 1] += 1.0
        if i > 0:
            A[r, i - 1] -= 1.0
    t = np.linalg.lstsq(A, y, rcond=None)[0]
    t = np.concatenate(([0.0], t))
    return t, y - (t[[j for _, j in edges]] - t[[i for i, _ in edges]])


def direct(est):
    return np.array([0.0] + [est[0, j] for j in range(1, est.shape[0])])


def mst(est, conf):
    """Offsets along the maximum-confidence spanning tree; nan for a device the valid pairs cannot reach."""
    n = est.shape[0]
    cand = sorted(((conf[i, j], i, j) for i in range(n) for j in range(i + 1, n) if np.isfinite(est[i, j])),
                  key=lambda c: -c[0] if np.isfinite(c[0]) else np.inf)
    parent = list(range(n))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    adj = {k: [] for k in range(n)}
    for _, i, j in cand:
        ri, rj = find(i), find(j)
        if ri != rj:
            parent[ri] = rj
            adj[i].append((j, est[i, j]))
            adj[j].append((i, -est[i, j]))
    t = np.full(n, np.nan)
    t[0] = 0.0
    stack = [0]
    while stack:
        u = stack.pop()
        for v, d in adj[u]:
            if np.isnan(t[v]):
                t[v] = t[u] + d
                stack.append(v)
    return t


def trim(est, tol):
    """(offsets, consistent flags, number of pairs kept). Offsets nan where the valid pairs do not connect."""
    n = est.shape[0]
    edges = [(i, j) for i in range(n) for j in range(i + 1, n) if np.isfinite(est[i, j])]
    if not _connected(n, edges):
        return np.full(n, np.nan), np.zeros(n, bool), len(edges)
    while True:
        y = np.array([est[i, j] for i, j in edges])
        t, res = _lsq(n, edges, y)
        order = np.argsort(-np.abs(res))
        if np.abs(res[order[0]]) <= tol:
            break
        for r in order:
            if np.abs(res[r]) <= tol:
                r = None
                break
            rest = edges[:r] + edges[r + 1:]
            if _connected(n, rest):
                break
        else:
            r = None
        if r is None:
            break
        edges = edges[:r] + edges[r + 1:]
    deg = np.zeros(n, int)
    for i, j in edges:
        deg[i] += 1
        deg[j] += 1
    ok = bool(np.all(np.abs(res) <= tol))
    flag = ok & (deg >= 2) & (deg[0] >= 2)
    flag[0] = False
    return t, flag, len(edges)
