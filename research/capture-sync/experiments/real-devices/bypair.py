"""Step 1 follow-up: which phone pairs fail as recorded with PHAT in the 200 ms room, and at what lag.

    python experiments/real-devices/bypair.py <LibriWASN root> [room]

Same reference lines and window rules as run.py, 4 s windows, recordings as published, 20 times per
pair per session; prints the failure share per pair for gamma 1 and 0.25 and the most common wrong lags.
"""
import itertools
import os
import sys
from collections import Counter

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
import run  # noqa: E402
from capture_sync import FS, gcc, coarse_offset, reference_line, line_at  # noqa: E402

root = sys.argv[1]
room = sys.argv[2] if len(sys.argv) > 2 else "200"
L, N = 4.0, 20
fails = {}
lags = {}
for k, (sess, paths) in enumerate(run.sessions(root, room)):
    rng = np.random.default_rng(7000 + k)
    x = {p: run.load(paths[p]) for p in run.PHONES}
    for a, b in itertools.combinations(run.PHONES, 2):
        d0, _ = coarse_offset(x[a], x[b])
        ref = reference_line(x[a], x[b], d0, gamma=1.0)
        dur = min(len(x[a]), len(x[b])) / FS
        for _ in range(N):
            t = float(rng.uniform(2.0, dur - 8.0))
            u = float(rng.uniform(-run.PRIOR, run.PRIOR))
            truth = line_at(ref, t + L / 2)
            g_ = int(run.SEARCH * FS)
            i0, n = int(t * FS), int(L * FS)
            j0 = int(round((t + truth + u) * FS)) - g_
            wa, wb = x[a][i0:i0 + n], x[b][j0:j0 + n + 2 * g_]
            for g in (1.0, 0.25):
                d, _ = gcc(wa, wb, gamma=g, max_lag_s=run.SEARCH, centre_s=run.SEARCH)
                e = truth + u + d - run.SEARCH - truth
                bad = abs(e) > run.FRAME
                fails.setdefault((a, b, g), []).append(bad)
                if bad:
                    lags.setdefault((a, b, g), []).append(round(e + truth, 2))
print(f"room {room}, recordings as published, {L} s windows, {N} times x 10 sessions per pair")
for a, b in itertools.combinations(run.PHONES, 2):
    f1, f2 = np.mean(fails[(a, b, 1.0)]), np.mean(fails[(a, b, 0.25)])
    common = Counter(lags.get((a, b, 1.0), [])).most_common(3)
    print(f"{a:8s}-{b:8s} PHAT {f1:.3f}  gamma0.25 {f2:.3f}  PHAT wrong peaks at (s, count): {common}")
