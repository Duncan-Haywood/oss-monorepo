"""Within-person agreement of a binary item asked twice (test-retest), numpy only."""
import numpy as np


def agreement(a, b, w):
    """Weighted 2x2 summary of indicators a (first wave) and b (later wave), rows with both observed.

    Returns p1 = P(a), p2 = P(b), net = p2 - p1, gross = P(a != b), stay = P(b | a), kappa (Cohen's, weighted).
    Symmetric reporting noise gives gross > 0 with net near 0; a real flow or a drift in reporting moves net.
    """
    a = np.asarray(a, float)
    b = np.asarray(b, float)
    w = np.asarray(w, float)
    m = ~np.isnan(a) & ~np.isnan(b) & (w > 0)
    a, b, w = a[m], b[m], w[m]
    W = w.sum()
    p1 = (w * a).sum() / W
    p2 = (w * b).sum() / W
    po = (w * (a == b)).sum() / W
    pe = p1 * p2 + (1 - p1) * (1 - p2)
    kappa = (po - pe) / (1 - pe) if pe < 1 else np.nan
    stay = (w * a * b).sum() / (w * a).sum() if (w * a).sum() > 0 else np.nan
    return dict(p1=p1, p2=p2, net=p2 - p1, gross=1 - po, stay=stay, kappa=kappa, n=int(m.sum()))
