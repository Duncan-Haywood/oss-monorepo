"""Step 3l, post hoc (written after the first score): are the mixed-noise failures an artefact of drawing the
shared stretch from all of a type's files while each device's independent stretch comes from its own half?

If the shared stretch and the other device's independent stretch come from the same recording, device a's
shared component and device b's independent one are copies of each other at an arbitrary lag, and GCC can
lock onto that lag. For each window of one chunk (room 0.2 s, step 3l's draws regenerated exactly) this
records the peak normalised cross-correlation between the four noise components that should be
unrelated (a shared x b independent, a independent x b shared, a independent x b independent) and joins it
to step 3l's failure label.

    python experiments/gate/noisemix_crossdraw.py <MS-SNSD root> <windows_l.npz> [--chunks 2]
"""
import os
import sys
from concurrent.futures import ProcessPoolExecutor

import numpy as np
from scipy.signal import fftconvolve

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import noisemix as NM  # noqa: E402

TYPES = NM.TYPES


def xpeak(x, y):
    """Peak of |normalised cross-correlation| over all lags."""
    x = (x - x.mean()) / (np.linalg.norm(x - x.mean()) + 1e-20)
    y = (y - y.mean()) / (np.linalg.norm(y - y.mean()) + 1e-20)
    return float(np.max(np.abs(fftconvolve(x, y[::-1]))))


def chunk(args):
    root, rt, c = args
    captured = []

    def fake_gcc(a, b, **kw):
        return 0.0, 0.0

    NM.gcc = fake_gcc
    orig_mix = NM.mix

    def spy(x0, s, ind, sh, rho):
        if rho == 0.25:
            captured.append((ind.copy(), sh.copy()))
        return orig_mix(x0, s, ind, sh, rho)

    NM.mix = spy
    NM.blind_snr_db = lambda x: 0.0
    NM.envelope_normalise = lambda x: x
    seed = 31000 + 1000 * NM.ROOMS.index(rt) + 100 * NM.LI + c
    trials = list(range(c, 1000, 8))
    rows = NM.run_chunk((root, rt, NM.L, trials, seed))
    out = []
    n = int(NM.L * NM.FS)
    for k in range(0, len(captured), 2):  # pairs (device a, device b) for one type, rho 0.25
        (ia, sa), (ib, sb) = captured[k], captured[k + 1]
        r = rows[(k // 2) * len(NM.RHOS) + 1]
        out.append([rt, r[1], r[3], xpeak(sa, ib), xpeak(ia, sb), xpeak(ia, ib)])
    return out


def main(root, path, n_chunks):
    with ProcessPoolExecutor(4) as ex:
        res = [r for rr in ex.map(chunk, [(root, 0.2, c) for c in range(n_chunks)]) for r in rr]
    res = np.array(res)
    d = NM.loadrows(path)
    bad = np.abs(d["err"] + d["ds"]) > NM.FRAME
    lab = {(int(t), int(ty)): b for t, ty, b, rt, rho in zip(d["trial"], d["type"], bad, d["rt"], d["rho"])
           if rt == 0.2 and rho == 0.25}
    print("room 0.2 s, rho 0.25: peak normalised cross-correlation of components that should be unrelated")
    print(f"{'type':21s} {'n':>4s} {'max(sh_a x ind_b, ind_a x sh_b) > 0.3':>40s} {'fail | >0.3':>12s} {'fail | <=0.3':>13s}"
          f" {'ind x ind > 0.3':>16s}")
    for ti, tn in enumerate(TYPES):
        m = res[:, 2] == ti
        if not m.any():
            continue
        cross = np.maximum(res[m, 3], res[m, 4])
        hi = cross > 0.3
        f = np.array([lab[(int(t), ti)] for t in res[m, 1]])
        fh = f[hi].mean() if hi.any() else float("nan")
        fl = f[~hi].mean() if (~hi).any() else float("nan")
        print(f"{tn:21s} {int(m.sum()):4d} {hi.mean():40.3f} {fh:12.3f} {fl:13.3f} {np.mean(res[m, 5] > 0.3):16.3f}")


if __name__ == "__main__":
    a = sys.argv
    main(a[1], a[2], int(a[a.index("--chunks") + 1]) if "--chunks" in a else 2)
