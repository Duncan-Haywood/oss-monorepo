"""(robofab-mujocotorque) The nine torque- and jaw-bound rows of robofab-torquebound (3 arm sizes x jaw cap k = 2 / 5 / none, six
printed parts each, no speed limit, 5 N m torque limit). For each part the best trapezoid (fine 14-value ramp grid, 160 extra
samples per ramp) and the time-optimal profile (n = 1600) are re-evaluated with MuJoCo inverse dynamics at 4,000 samples along the
move (plus the ramp corners). Reported per profile: peak |torque| by the hand-written model, by MuJoCo, and the largest difference
at any sample. Then each profile is replayed open loop in MuJoCo with the planned torque; reported: largest joint-angle deviation
and end-point error."""
import json
import math
from robofab_mujocotorque.geometry import GRIPPER, targets, min_link, best_base
from robofab_mujocotorque.model import Arm, G
from robofab_mujocotorque.mj import MjArm, replay
from robofab_mujocotorque import topp, trap

FR = (0.002, 0.005, 0.01, 0.015, 0.02, 0.03, 0.05, 0.075, 0.1, 0.15, 0.2, 0.3, 0.4, 0.5)
H, LAMBDA, M_GRIP, MU, DENSITY, BRANCH, TAU = 0.100, 1.0, 0.100, 0.5, 1240.0, -1, 5.0
NS = 4000


def trap_plan(qa, qb, T, f):
    dq = (qb[0] - qa[0], qb[1] - qa[1])
    xs = sorted([(k + 0.5) / NS for k in range(NS)] + [0.0, f * 0.999999, f, 1 - f, 1 - f * 0.999999, 1.0])
    ts, qs, qds, qdds = [], [], [], []
    for x in xs:
        p, v, a = trap.trap(x, f)
        ts.append(x * T)
        qs.append((qa[0] + dq[0] * p, qa[1] + dq[1] * p))
        qds.append((dq[0] * v / T, dq[1] * v / T))
        qdds.append((dq[0] * a / T ** 2, dq[1] * a / T ** 2))
    return ts, qs, qds, qdds


def opt_plan(qa, qb, prof):
    dq = (qb[0] - qa[0], qb[1] - qa[1])
    ds, u, sdd = prof["ds"], prof["u"], prof["sdd"]
    ts, qs, qds, qdds, t = [], [], [], [], 0.0
    for k in range(prof["n"] + 1):
        if k:
            den = math.sqrt(u[k - 1]) + math.sqrt(u[k])
            t += 2 * ds / den if den > 0 else 0.0
        sd = math.sqrt(u[k])
        ts.append(t)
        qs.append((qa[0] + k * ds * dq[0], qa[1] + k * ds * dq[1]))
        qds.append((dq[0] * sd, dq[1] * sd))
        qdds.append((dq[0] * sdd[k], dq[1] * sdd[k]))
    return ts, qs, qds, qdds


def compare(arm, mj, plan):
    ts, qs, qds, qdds = plan
    pk_h = pk_m = diff = 0.0
    for q, qd, qdd in zip(qs, qds, qdds):
        th, tm = arm.torque(q, qd, qdd), mj.torque(q, qd, qdd)
        pk_h = max(pk_h, abs(th[0]), abs(th[1]))
        pk_m = max(pk_m, abs(tm[0]), abs(tm[1]))
        diff = max(diff, abs(th[0] - tm[0]), abs(th[1] - tm[1]))
    return pk_h, pk_m, diff


pts = targets()
L0 = min_link(H * 1000, pts, step=10.0, lo=40, hi=400) / 1000
mass = {n: DENSITY * (b[3] - b[0]) * (b[4] - b[1]) * (b[5] - b[2]) * 1e-9 for n, b in GRIPPER.items()}
print("# robofab-mujocotorque: hand-written torques vs MuJoCo inverse dynamics along the best trapezoid and the time-optimal profile")
print("# peak = peak |torque| (N m) over joints; diff = largest hand-vs-MuJoCo difference at any sample; dev = replay joint-angle deviation (rad); end = replay end-point error (mm)\n")
out = []
for scale in (1.0, 1.5, 2.5):
    L = round(L0 * scale, 3)
    base = best_base(L * 1000, L * 1000, H * 1000, pts, step=10.0)
    if base is None:
        continue
    print(f"## L={L} m")
    print(f"{'k':>4s} {'part':>10s} {'prof':>5s} {'T':>7s} {'peak_h':>8s} {'peak_mj':>8s} {'diff':>9s} {'dev':>9s} {'end_mm':>8s}")
    for k in (2.0, 5.0, math.inf):
        for nm, p in pts.items():
            arm = Arm(L, L, LAMBDA * L, LAMBDA * L, M_GRIP + mass[nm])
            q = [arm.ik(math.hypot(p[kk][0] - base[0], p[kk][1] - base[1]) / 1000, p[kk][2] / 1000 - H, BRANCH) for kk in ("pick", "lift")]
            if None in q:
                continue
            qa, qb = q
            cap = None if math.isinf(k) else k * mass[nm] * G / (2 * MU)
            prof = topp.solve(arm, qa, qb, TAU, n=1600, jaw_cap=cap, mass=mass[nm], mu=MU, wmax=None)
            bt = trap.best_trap(arm, qa, qb, TAU, mass[nm], cap if cap else 1e9, MU, wmax=None, fracs=FR, ramp_samples=160)
            if prof is None or bt is None:
                continue
            mj = MjArm(arm)
            for label, plan, T in (("trap", trap_plan(qa, qb, *bt), bt[0]), ("opt", opt_plan(qa, qb, prof), prof["T"])):
                ph, pm, df = compare(arm, mj, plan)
                dev, end = replay(mj, *plan, arm)
                row = {"L": L, "k": None if math.isinf(k) else k, "part": nm, "profile": label, "T": T,
                       "peak_hand": ph, "peak_mujoco": pm, "max_diff": df, "replay_dev_rad": dev, "replay_end_mm": end * 1e3}
                out.append(row)
                print(f"{'inf' if math.isinf(k) else k:>4} {nm:>10s} {label:>5s} {T:7.4f} {ph:8.4f} {pm:8.4f} {df:9.2e} {dev:9.2e} {end*1e3:8.3f}", flush=True)
    print()
json.dump(out, open("experiments/results.json", "w"), indent=1)
