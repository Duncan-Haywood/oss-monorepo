"""Milestone 7e, follow-up (written after results.txt was read; milestone 7d's next step): score the constrained and unconstrained
designs with the tilt-command clip widened from 20 deg to 30, 45 and 59 deg (60 deg tilt counts as divergence), lever 0 and 1,
64 held-out episodes, both geometries. Milestone 7d found the 20 deg clip contains slow linear instabilities that diverge once it
is raised, so this asks whether training inside the linear margin removes that hidden risk. Reads results.json, writes tilt.txt."""
import json, os, sys
from multiprocessing import Pool
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "m6_poshold"))
import run as M6  # noqa: E402
P = M6.P
CAPS, LEVERS = (20.0, 30.0, 45.0, 59.0), (0.0, 1.0)
GEOMS = {"above": P.cop_signs(1.0), "below": P.cop_signs(-1.0)}
R = json.load(open(os.path.join(HERE, "results.json")))


def job(arg):
    cap, lev, g, lab = arg
    P.TILT_CMD_MAX = np.deg2rad(cap)        # module constant read by rollout at call time; this process only
    rs = sorted((r for r in R["runs"] if r["geom"] == g and r["label"] == lab), key=lambda r: r["seed"])
    J, sz, o = P.score(np.array([r["x"] for r in rs]), M6.TEST_EP, M6.TEST_SEED, parts=True, dist_sign=GEOMS[g], lever_scale=lev,
                       ff=1.0, ff_mode="integ", **M6.cond("aware"))
    return cap, lev, g, lab, [int(round(d * M6.TEST_EP)) for d in o["dead"]], float(np.mean(o["pos"])), float(np.mean(J))


if __name__ == "__main__":
    jobs = [(c, l, g, lab) for c in CAPS for l in LEVERS for g in GEOMS for lab in ("unconstrained", "constrained")]
    with Pool() as p:
        out = p.map(job, jobs, chunksize=1)
    L = ["Milestone 7e follow-up: tilt-command clip widened; diverged held-out episodes per seed (of 64), mean position RMS and mean J.", ""]
    for c, l, g, lab, nd, pos, J in out:
        L.append(f"tilt cap {c:4.0f} deg, lever {l:g}, {g:5s} {lab:13s}: diverged {sum(nd):3d} of {64 * len(nd)} {nd}; pos {pos:.3f} m; J {J:+.2f}")
    open(os.path.join(HERE, "tilt.txt"), "w").write("\n".join(L) + "\n")
    print("\n".join(L))
