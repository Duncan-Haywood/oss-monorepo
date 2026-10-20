"""Least-squares power-law fit cells ~ c * W^p on the log-log scale."""
import math


def power_fit(ws, ys):
    """Return (p, c, r2) for y = c * w**p; needs >= 2 points with y > 0."""
    pts = [(math.log(w), math.log(y)) for w, y in zip(ws, ys) if y > 0]
    n = len(pts)
    if n < 2:
        raise ValueError("need two positive points")
    mx, my = sum(x for x, _ in pts) / n, sum(y for _, y in pts) / n
    sxx = sum((x - mx) ** 2 for x, _ in pts)
    sxy = sum((x - mx) * (y - my) for x, y in pts)
    syy = sum((y - my) ** 2 for _, y in pts)
    p = sxy / sxx
    r2 = 1.0 if syy == 0 else sxy * sxy / (sxx * syy)
    return p, math.exp(my - p * mx), r2
