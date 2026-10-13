"""Carry each free part of the toy gripper from its tray pick point to the lift point above its place
point with a joint-space min-jerk move. Report (1) the torque-limited carry time, (2) the jaw force
that move demands, and (3) the shortest carry time a given jaw force would allow."""
import json
import math
from robofab_armaccel.geometry import GRIPPER, targets, min_link, best_base
from robofab_armaccel.model import Arm, G, move, min_time

H = 0.100          # shoulder height above the table, m (as robofab-reach)
LAMBDA = 1.0       # link mass per length, kg/m (assumed)
M_GRIP = 0.100     # gripper mass at the wrist, kg (assumed)
MU = 0.5
DENSITY = 1240.0   # kg/m^3, as robofab-graspmove (assumed)
BRANCH = -1        # elbow-up
pts = targets()
L0 = min_link(H * 1000, pts, step=10.0, lo=40, hi=400) / 1000
mass = {n: DENSITY * (b[3] - b[0]) * (b[4] - b[1]) * (b[5] - b[2]) * 1e-9 for n, b in GRIPPER.items()}
out = {"min_link_m": L0}
print("# robofab-armaccel: carry legs (pick -> lift above place) of the 6 free parts, min-jerk joint moves")
print(f"# shoulder height {H} m, links l1=l2=L, link mass {LAMBDA} kg/m, gripper {M_GRIP} kg, mu {MU}, density {DENSITY}; all assumed")
print(f"# robofab-reach minimum link on this grid: {L0} m\n")


def leg(arm, base, p, a, b):
    """Joint configurations for the wrist going from point a to b of part p (mm, table frame)."""
    qs = []
    for k in (a, b):
        x, y, z = p[k]
        r = math.hypot(x - base[0], y - base[1]) / 1000
        q = arm.ik(r, z / 1000 - H, BRANCH)
        if q is None:
            return None
        qs.append(q)
    return qs


rows = []
for scale in (1.0, 1.5, 2.5):
    L = round(L0 * scale, 3)
    base = best_base(L * 1000, L * 1000, H * 1000, pts, step=10.0)
    if base is None:
        continue
    arm_m = LAMBDA * L
    print(f"## Arm L={L} m ({scale} x minimum), base at {base} mm, link mass {arm_m:.3f} kg")
    for tau in (2.0, 5.0, 10.0):
        tot = 0.0
        worst = 0.0
        ok = True
        per = []
        for n, p in pts.items():
            arm = Arm(L, L, arm_m, arm_m, M_GRIP + mass[n])
            qs = leg(arm, base, p, "pick", "lift")
            if qs is None:
                ok = False
                break
            T = min_time(arm, qs[0], qs[1], tau)
            if T is None:
                ok = False
                break
            r = move(arm, qs[0], qs[1], T, mass=mass[n], mu=MU)
            per.append((n, T, r))
            tot += T
            worst = max(worst, r["force"])
        if not ok:
            print(f"  torque limit {tau:4.1f} N m: infeasible (gravity alone exceeds it, or a target is unreachable)")
            rows.append({"L": L, "tau": tau, "feasible": False})
            continue
        print(f"  torque limit {tau:4.1f} N m: total carry time {tot:.2f} s; peak jaw force over all parts {worst:.3f} N")
        for n, T, r in per:
            static = mass[n] * G / (2 * MU)
            print(f"      {n:9s} m={mass[n]*1000:5.2f} g  T={T:.2f} s  a_up={r['az_up']:6.1f} a_rad={r['ar']:6.1f} m/s^2  jaw force {r['force']:.3f} N (static {static:.3f} N, x{r['force']/static:.1f})")
        rows.append({"L": L, "tau": tau, "feasible": True, "total_s": tot, "peak_force_N": worst,
                     "parts": {n: {"T": T, "force": r["force"], "az_up": r["az_up"], "ar": r["ar"]} for n, T, r in per}})
    print()

# grip-limited carry time: shortest T with required jaw force <= F, vs torque-limited T, for the cover and the link
L = round(L0 * 1.5, 3)
base = best_base(L * 1000, L * 1000, H * 1000, pts, step=10.0)
print(f"## Grip-limited vs torque-limited carry time (L={L} m, torque limit 5 N m)")
print(f"{'part':8s} {'F_jaw N':>8s} {'T_grip s':>9s} {'T_torque s':>10s}")
grip_rows = []
for n in ("cover", "link"):
    arm = Arm(L, L, LAMBDA * L, LAMBDA * L, M_GRIP + mass[n])
    qs = leg(arm, base, pts[n], "pick", "lift")
    t_tq = min_time(arm, qs[0], qs[1], 5.0)
    for F in (0.02, 0.05, 0.1, 0.2, 0.3, 0.5):
        T, t = None, 0.01
        while t <= 10.0:
            if move(arm, qs[0], qs[1], t, n=100, mass=mass[n], mu=MU)["force"] <= F:
                T = round(t, 10)
                break
            t += 0.01
        print(f"{n:8s} {F:8.2f} {('none' if T is None else f'{T:.2f}'):>9s} {t_tq:10.2f}")
        grip_rows.append({"part": n, "F": F, "T_grip": T, "T_torque": t_tq})
out["rows"], out["grip"] = rows, grip_rows
json.dump(out, open("experiments/results.json", "w"), indent=1)
