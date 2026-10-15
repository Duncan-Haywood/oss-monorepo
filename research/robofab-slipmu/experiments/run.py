"""Does robofab-slipthresh's 'robust' loose threshold survive a different friction coefficient and a lift
acceleration? For each condition (mu in 0.3, 0.5, 0.8; upward gripper acceleration az in 0, 5 m/s^2) every
bar (20-60 mm) x 8 solver settings (condim 3/4, timeconst 0.002/0.008, impratio 1/10) x 13 geometric forces
(0.05..20 N) is simulated once, and the 16 rate thresholds (T in 0.5,1,3,10 s; tip bound 1,2,5,10 mm) are
applied. Spread = max/min over the 8 settings of the minimum holding force (failures at 20 N count as 20 N).
Writes results.txt / results.json. Uses 4 processes."""
import itertools
import json
import os
import sys
from multiprocessing import Pool

here = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(here, "..", "src"))
import mujoco  # noqa: E402
from robofab_slipmu.crit import min_grid_force, rate_hold  # noqa: E402
from robofab_slipmu.model import torque_bounds  # noqa: E402
from robofab_slipmu.sim import run  # noqa: E402

MUS = (0.3, 0.5, 0.8)
AZS = (0.0, 5.0)
LENS = (20, 30, 40, 60)
FORCES = [round(0.05 * (400 ** (i / 12)), 4) for i in range(13)]
SETTINGS = list(itertools.product((3, 4), (0.002, 0.008), (1.0, 10.0)))
TASKS = (0.5, 1.0, 3.0, 10.0)
TIPS = (1.0, 2.0, 5.0, 10.0)


def sim(job):
    mu, az, L, s = job
    return job, [run(L, f, mu, s[0], timeconst=s[1], impratio=s[2], az=az) for f in FORCES]


def analyse(mu, az, traj):
    rows = []
    for T, tip in itertools.product(TASKS, TIPS):
        worst, nfail, nbr, ncell, per_len, cells = 1.0, 0, 0, 0, {}, []
        for L in LENS:
            tb = torque_bounds(L, mu, az=az)
            mins = []
            for s in SETTINGS:
                m = min_grid_force([rate_hold(*tr, L, task_s=T, tip_mm=tip) for tr in traj[(L, s)]], FORCES)
                mins.append(m)
                ncell += 1
                nfail += m is None
                nbr += m is not None and tb["lower"] / 2 <= m <= tb["upper"] * 2
                cells.append(dict(L=L, condim=s[0], timeconst=s[1], impratio=s[2], min_force=m))
            v = [x if x is not None else 20.0 for x in mins]
            per_len[L] = max(v) / min(v)
            worst = max(worst, per_len[L])
        rows.append(dict(mu=mu, az=az, task_s=T, tip_mm=tip, worst_spread=worst, spread_by_L=per_len,
                         fail_cells=nfail, within_2x_bracket=nbr, cells=ncell, min_forces=cells))
    return rows


if __name__ == "__main__":
    jobs = [(mu, az, L, s) for mu in MUS for az in AZS for L in LENS for s in SETTINGS]
    with Pool(4) as p:
        res = dict(p.map(sim, jobs, chunksize=4))
    out = {"mujoco": mujoco.__version__, "forces": FORCES, "summary": []}
    lines = ["MuJoCo %s" % mujoco.__version__,
             "mu az T tip | spread (max/min over 8 settings) at L=20/30/40/60 | worst | cells failing at 20 N | cells within 2x of torque bracket (of 32)"]
    for mu, az in itertools.product(MUS, AZS):
        traj = {(L, s): res[(mu, az, L, s)] for L in LENS for s in SETTINGS}
        for r in analyse(mu, az, traj):
            out["summary"].append(r)
            lines.append("%.1f %3.1f %4.1f %4.1f | %s | %6.1f | %2d | %2d" % (
                mu, az, r["task_s"], r["tip_mm"], " ".join("%6.1f" % r["spread_by_L"][L] for L in LENS),
                r["worst_spread"], r["fail_cells"], r["within_2x_bracket"]))
    open(os.path.join(here, "results.txt"), "w").write("\n".join(lines) + "\n")
    json.dump(out, open(os.path.join(here, "results.json"), "w"), indent=1)
    print("\n".join(lines))
