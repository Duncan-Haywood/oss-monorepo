"""Exact hypervolume (to be maximised) of a point set under minimisation, by recursive slicing. Fine for tens of points."""


def dominated(a, b):
    """True if b dominates a (weakly better everywhere, strictly somewhere)."""
    return all(y <= x for x, y in zip(a, b)) and any(y < x for x, y in zip(a, b))


def nondominated(pts):
    pts = sorted(set(pts))
    return [p for p in pts if not any(dominated(p, q) for q in pts)]


def hypervolume(pts, ref):
    pts = [p for p in pts if all(x < r for x, r in zip(p, ref))]
    if not pts:
        return 0.0
    d = len(ref)
    if d == 1:
        return ref[0] - min(p[0] for p in pts)
    pts = sorted(pts, key=lambda p: p[-1])
    vol = 0.0
    for i, p in enumerate(pts):
        top = pts[i + 1][-1] if i + 1 < len(pts) else ref[-1]
        if top > p[-1]:
            vol += (top - p[-1]) * hypervolume([q[:-1] for q in pts[:i + 1]], ref[:-1])
    return vol
