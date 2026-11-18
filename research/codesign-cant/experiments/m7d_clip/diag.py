"""Milestone 7d, post hoc (written after results.txt was read): is the 20 deg tilt-command clip what bounds the instability?

results.txt showed the attitude integrator never at its clip, removing either clip changed nothing, and the one saturation active
in the unstable designs was the tilt command (TILT_CMD_MAX = 20 deg; 73% of alive steps bolted-on, 13-24% at 1.25x the ceiling).
Here all four sets (integrator and feed-forward clips at their defaults) are re-run with the tilt-command clip
at 20, 30, 45 and 59 deg (60 deg tilt counts as divergence), 6 and 18 s, lever 0, on the 64 held-out episodes. Also reported:
RMS of the roll/pitch tilt over the episode as a sign of a bounded oscillation. Writes diag.txt.
"""
import os, sys
from multiprocessing import Pool
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import run as R  # noqa: E402
from codesign_cant import aero as A, poshold as P  # noqa: E402

CAPS = (20.0, 30.0, 45.0, 59.0)
SETS = ("bolted", "1.25x", "0.8x", "retrained")


def job(arg):
    cap, hz = arg
    P.TILT_CMD_MAX = np.deg2rad(cap)                       # module constant read by rollout at call time; this process only
    conds = [c for c in R.conditions() if R.SETS[c["label"]] in SETS]
    sz, g, kap = R.sizes(conds)
    diag = {}
    o = P.rollout(sz, g, kap, R.TEST_EP, R.TEST_SEED, dist_sign=P.cop_signs(1.0), lever_scale=0.0, ff=1.0, ff_mode="integ",
                  steps=R.HORIZONS[hz], diag=diag)
    return cap, hz, [R.SETS[c["label"]] for c in conds], o["dead_ep"], o["pos_ep"], o["att"], diag["tilt_at_clip"]


def main():
    with Pool() as p:
        outs = p.map(job, [(c, h) for c in CAPS for h in R.HORIZONS], chunksize=1)
    L = ["Milestone 7d post hoc: tilt-command clip widened (integrator and feed-forward clips at their defaults), lever 0, 64 held-out episodes.",
         "dead = diverged episodes per design (of 64); pos = median episode position RMS (m); att = mean roll/pitch tracking RMS (deg);",
         "tilt = median share of alive steps with the tilt command at its clip.", ""]
    for s in SETS:
        L.append(f"[{s}]")
        for cap, hz, labels, dead, pos, att, tilt in outs:
            i = [k for k, l in enumerate(labels) if l == s]
            L.append(f"  clip {cap:4.0f} deg, {hz:2d} s: dead {dead[i].sum(1).tolist()} (total {int(dead[i].sum())}); pos {np.median(pos[i]):.3f}; "
                     f"att {np.mean(att[i]):.2f}; tilt {np.median(tilt[i]):.3f}")
        L.append("")
    open(os.path.join(HERE, "diag.txt"), "w").write("\n".join(L) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    main()
