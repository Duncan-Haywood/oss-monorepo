"""Every pump-10 schedule with at most two cyclic runs of on-hours (as in infra-pumpsched): 21,806 masks."""
import itertools

import numpy as np


def runs_masks():
    out = {tuple([False] * 24), tuple([True] * 24)}
    for k in (2, 4):  # k boundaries on the 24-hour circle: k/2 runs
        for cuts in itertools.combinations(range(24), k):
            m = np.zeros(24, bool)
            for a, b in zip(cuts[0::2], cuts[1::2]):
                m[a:b] = True
            out.add(tuple(bool(x) for x in m))
            out.add(tuple(bool(x) for x in ~m))
    return sorted(out)
