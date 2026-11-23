"""Milestone 7al: how large a start offset do the retrained designs survive at a 45 deg tilt-command limit, and does milestone
7l's acceleration cap close that region?

Milestone 7ak found the `integ retrained` designs' deaths at 45 deg are carried by the 0.5 m start offset alone. Here the offset's
half-width is scaled by s (poshold.OFFSET = 0.5 s; the same uniform draws, so each flight's offset moves along a fixed ray) on the
`retrained` and `1.25x` sets (milestone 12g's `above` designs, ten seeds each, 64 held-out flights of seed 9999, lever 0, 18 s).
Arms: quiet+O (7ak's: wind, step, turbulence, sensor noise and yaw steps off) and full, at every s; the same with 7l's cap
(perr_max = A_P / kp per design, A_P = 3.5 m/s^2) at s = 1 and 2. Predictions RA0-RA5 in ../../LOG.md, committed before this file.
"""
import json, os, sys, time
from multiprocessing import Pool
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "m7ak_excite"))
import run as K  # noqa: E402  (7ak: its fly() reads ARMS, SETCAP and wraps poshold.reference)

P, M7 = K.P, K.M7
SCALES = [0.02, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.8, 1.0, 1.25, 1.5, 2.0]
CAP_SCALES = [1.0, 2.0]
SETS = ["retrained", "1.25x"]
A_P = 3.5                                                    # m/s^2, milestone 7l's cap
OFF0 = P.OFFSET


def fly(arg):
    arm, st, s, cap = arg
    P.OFFSET = OFF0 * s                                      # this worker only; reference() reads it at call time
    if cap:
        conds, idx = K.conds_by_set()
        _, g, _ = M7.sizes([conds[i] for i in idx[st]])
        orig = P.rollout
        P.rollout = lambda *a, **k: orig(*a, perr_max=(A_P / g[:, 6])[:, None, None], **k)
    try:
        r = K.fly((arm, st))
    finally:
        if cap:
            P.rollout = orig
        P.OFFSET = OFF0
    return dict(arm=arm, set=st, s=s, cap=cap, dead=r["dead"])


def offsets_and_kp():
    """Each flight's unscaled offset (E, 2) and each design's position kp, per set."""
    off = P.reference(M7.TEST_EP, M7.TEST_SEED, M7.STEPS18)[5]
    conds, idx = K.conds_by_set()
    kp = {st: M7.sizes([conds[i] for i in idx[st]])[1][:, 6].tolist() for st in SETS}
    return off.tolist(), kp


def main():
    t0 = time.time()
    tasks = [(a, st, s, False) for a in ("quiet+O", "full") for st in SETS for s in SCALES]
    tasks += [(a, st, s, True) for a in ("quiet+O", "full") for st in SETS for s in CAP_SCALES]
    with Pool(4) as p:
        out = p.map(fly, tasks, chunksize=1)
    off, kp = offsets_and_kp()
    json.dump(dict(scales=SCALES, cap_scales=CAP_SCALES, a_p=A_P, offset0=OFF0, off=off, kp=kp, runs=out,
                   wall_s=time.time() - t0), open(os.path.join(HERE, "results.json"), "w"))
    print(f"wall time {time.time() - t0:.0f} s")


if __name__ == "__main__":
    main()
