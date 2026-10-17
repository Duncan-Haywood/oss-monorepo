"""Carry each free part of the toy gripper (pick -> lift above place) with (a) the shortest min-jerk move
and (b) the time-optimal bang-bang-in-path-acceleration move under the same joint torque limit.
Report the time saved and the jaw force each demands (bound m sqrt((g+a_z)^2+a_r^2)/(2 mu))."""
import json
import math
from robofab_armbang.geometry import GRIPPER, targets, min_link, best_base
from robofab_armbang.model import Arm, G, move, min_time
from robofab_armbang import topp

H, LAMBDA, M_GRIP, MU, DENSITY, BRANCH = 0.100, 1.0, 0.100, 0.5, 1240.0, -1
pts = targets()
L0 = min_link(H * 1000, pts, step=10.0, lo=40, hi=400) / 1000
mass = {n: DENSITY * (b[3] - b[0]) * (b[4] - b[1]) * (b[5] - b[2]) * 1e-9 for n, b in GRIPPER.items()}
print("# robofab-armbang: min-jerk vs time-optimal carry (pick -> lift above place), six free parts")
print(f"# shoulder {H} m, links l1=l2=L, link mass {LAMBDA} kg/m, gripper {M_GRIP} kg, mu {MU}, density {DENSITY}; all assumed")
print(f"# robofab-reach minimum link on this grid: {L0} m\n")
out = []
for scale in (1.0, 1.5, 2.5):
    L = round(L0 * scale, 3)
    base = best_base(L * 1000, L * 1000, H * 1000, pts, step=10.0)
    if base is None:
        continue
    for tau in (2.0, 5.0, 10.0):
        print(f"## L={L} m, torque limit {tau} N m")
        print(f"{'part':9s} {'T_mj s':>7s} {'T_opt s':>8s} {'saved':>6s} {'F_mj N':>7s} {'F_opt N':>8s} {'F ratio':>7s} {'peak tau/limit':>14s}")
        tot_mj = tot_opt = 0.0
        ok = True
        rows = []
        for n, p in pts.items():
            arm = Arm(L, L, LAMBDA * L, LAMBDA * L, M_GRIP + mass[n])
            qs = []
            for k in ("pick", "lift"):
                x, y, z = p[k]
                qs.append(arm.ik(math.hypot(x - base[0], y - base[1]) / 1000, z / 1000 - H, BRANCH))
            if None in qs:
                ok = False
                break
            tmj = min_time(arm, qs[0], qs[1], tau, dt=0.001)
            prof = topp.solve(arm, qs[0], qs[1], tau)
            if tmj is None or prof is None:
                ok = False
                break
            fmj = move(arm, qs[0], qs[1], tmj, mass=mass[n], mu=MU)["force"]
            fo = topp.wrist_force(arm, qs[0], qs[1], prof, mass[n], MU)
            pk = max(topp.peak_torque(arm, qs[0], qs[1], prof)) / tau
            tot_mj += tmj
            tot_opt += prof["T"]
            rows.append({"part": n, "T_minjerk": tmj, "T_opt": prof["T"], "F_minjerk": fmj, "F_opt": fo["force"], "peak_tau_over_limit": pk})
            print(f"{n:9s} {tmj:7.3f} {prof['T']:8.3f} {100*(1-prof['T']/tmj):5.0f}% {fmj:7.3f} {fo['force']:8.3f} {fo['force']/fmj:7.2f} {pk:14.3f}")
        if ok:
            print(f"total     {tot_mj:7.3f} {tot_opt:8.3f} {100*(1-tot_opt/tot_mj):5.0f}%\n")
            out.append({"L": L, "tau": tau, "total_minjerk": tot_mj, "total_opt": tot_opt, "parts": rows})
        else:
            print("  infeasible\n")
json.dump(out, open("experiments/results.json", "w"), indent=1)
