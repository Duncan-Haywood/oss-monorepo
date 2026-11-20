"""Step 4a post hoc (written after the scored run): was the landmark baseline's 14-17% failure with no noise a
tuning artefact? Four landmark settings on a quarter of step 4a's windows (chunks 0 and 1 of each room, 250
trials, all 31 conditions replayed exactly as step 4a), scored the same way.

    python experiments/baselines/wang_sweep.py <MS-SNSD root> [--procs 4]   # writes wang_sweep_results.txt
"""
import os
import sys
from concurrent.futures import ProcessPoolExecutor

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "gate"))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
import noisetype as NT  # noqa: E402
from capture_sync.sync import gcc  # noqa: E402
from capture_sync import fingerprint as FP  # noqa: E402

VARIANTS = {"step4a (30/s, 15x15, fan 5)": dict(per_s=30.0, nbhd=(15, 15)),
            "100/s, 15x15": dict(per_s=100.0, nbhd=(15, 15)),
            "100/s, 7x7": dict(per_s=100.0, nbhd=(7, 7)),
            "200/s, 5x5, hop 4 ms": dict(per_s=200.0, nbhd=(5, 5), hop=64)}
_SIDE = []


def _rec(a, b, gamma=1.0, max_lag_s=1.0, centre_s=0.0):
    d, p = gcc(a, b, gamma=gamma, max_lag_s=max_lag_s, centre_s=centre_s)
    if gamma == 0.25:
        _SIDE.append([FP.landmarks(a, b, max_lag_s=max_lag_s, centre_s=centre_s, **kw)[0] - d
                      for kw in VARIANTS.values()])
    return d, p


def run_chunk(args):
    _SIDE.clear()
    NT.gcc = _rec
    rows = NT.run_chunk(args)
    return [r + s for r, s in zip(rows, _SIDE)]


def main(root, procs):
    L, LI = 2.0, NT.WINS.index(2.0)
    jobs = [(root, rt, L, list(range(c, 1000, 8)), 31000 + 1000 * ri + 100 * LI + c)
            for ri, rt in enumerate(NT.ROOMS) for c in (0, 1)]
    with ProcessPoolExecutor(procs) as ex:
        r = np.array([x for rr in ex.map(run_chunk, jobs) for x in rr], float)
    out = ["capture-sync step 4a post hoc: landmark settings, 2 s windows, chunks 0-1 of each room "
           f"({len(r)} windows); failure share (more than a 30 fps frame from the truth; no match fails)", ""]
    names = list(VARIANTS)
    for rt in NT.ROOMS:
        m0 = r[:, 0] == rt
        out.append(f"RT60 {rt}: " + " | ".join(names))
        for lab, m in [("none", m0 & (r[:, 4] == -1))] + [
                (f"sum of 10 types {s:+.0f} dB", None) for s in NT.LEVELS]:
            if m is not None:
                v = [float(np.mean(~(np.abs(r[m, 9] + r[m, 11 + i]) <= NT.FRAME))) for i in range(len(names))]
            else:
                s = float(lab.split()[-2])
                v = [sum(float(np.mean(~(np.abs(r[mm, 9] + r[mm, 11 + i]) <= NT.FRAME)))
                         for mm in [m0 & (r[:, 4] == k) & (r[:, 5] == s) for k in range(10)])
                     for i in range(len(names))]
            out.append(f"  {lab:24s} " + " ".join(f"{x:.3f}" for x in v))
    open(os.path.join(HERE, "wang_sweep_results.txt"), "w").write("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    a = sys.argv
    main(a[1], int(a[a.index("--procs") + 1]) if "--procs" in a else 4)
