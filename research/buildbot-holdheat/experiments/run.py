"""Continuous-torque reading of the G1 hold poses of buildbot-payload. Deterministic, ~1 min."""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "buildbot-payload" / "src"))
sys.path.insert(0, str(HERE.parent / "src"))
sys.path.insert(0, str(HERE.parents[1] / "buildbot-payload" / "experiments"))
import numpy as np  # noqa: E402
from buildbot_payload import fetch, model as M  # noqa: E402
from buildbot_holdheat import hold_time, loss_ratio  # noqa: E402
import run as P  # noqa: E402  (buildbot-payload's task list)

RHO = [0.25, 0.33, 0.4, 0.5, 0.6]


def main():
    fetch.model_path("g1")
    r = M.load("g1")
    d0 = M.standing(r)
    lim = M.torque_limits(r.model)
    out = {"menagerie_commit": fetch.COMMIT, "rho": RHO, "tasks": [], "sweep": []}
    print("buildbot-holdheat: G1 hold poses of buildbot-payload, joint torque as a fraction u of peak")
    print(f"Menagerie {fetch.COMMIT[:12]}; hold time in units of the thermal time constant, inf = sustainable at that continuous/peak ratio")
    print()
    print("A. Tasks (palm grip), loaded at the top of the mass range")
    for task, (lo, hi), z, x, src in P.TASKS:
        ok, p, s = M.check(r, d0, (x, z), hi)
        _, _, s0 = M.check(r, d0, (x, z), 0.0)
        u = s.ratio[np.isfinite(lim)]
        u0 = s0.ratio[np.isfinite(lim)]
        row = {"task": task, "kg": hi, "z": z, "x": x, "pose_ok": bool(p.ok), "umax": float(s.ratio.max()),
               "joint": s.worst, "umax_unloaded": float(s0.ratio.max()), "loss_x": float(loss_ratio(u, u0)),
               "hold": {}}
        for rho in RHO:
            t = hold_time(float(s.ratio.max()), rho)
            row["hold"][str(rho)] = None if t == float("inf") else t
        out["tasks"].append(row)
        if not p.ok:
            print(f"   {task}: {hi:.1f} kg at z {z}, x {x}: pose unreachable")
            continue
        h = "  ".join(f"{rho}:{'inf' if row['hold'][str(rho)] is None else format(row['hold'][str(rho)], '.2f')}" for rho in RHO)
        print(f"   {task}: {hi:.1f} kg z {z} x {x}: u_max {row['umax']:.2f} ({s.worst}); unloaded {row['umax_unloaded']:.2f}; "
              f"loss x{row['loss_x']:.2f}; hold/tau by rho {h}")
    print()
    print("B. Load sweep at the stud carry pose (z 0.6, x 0.3): kg, u_max, binding joint, hold/tau at each rho")
    for kg in [0, 1, 2, 3, 3.8, 4.5]:
        ok, p, s = M.check(r, d0, (0.3, 0.6), kg)
        u = float(s.ratio.max())
        hold = {str(rho): (None if hold_time(u, rho) == float("inf") else hold_time(u, rho)) for rho in RHO}
        out["sweep"].append({"kg": kg, "umax": u, "joint": s.worst, "hold": hold})
        h = "  ".join(f"{rho}:{'inf' if hold[str(rho)] is None else format(hold[str(rho)], '.2f')}" for rho in RHO)
        print(f"   {kg:>4} kg  u_max {u:.2f} ({s.worst})  {h}")
    print()
    print("C. Sustainable load at the stud carry pose (u_max = rho), bisected; kg")
    out["sustain"] = {}
    for rho in RHO:
        lo, hi = 0.0, 10.0
        if M.check(r, d0, (0.3, 0.6), 0.0)[2].ratio.max() > rho:
            out["sustain"][str(rho)] = None
            print(f"   rho {rho}: none (the unloaded pose is already above it)")
            continue
        while hi - lo > 0.05:
            mid = (lo + hi) / 2
            if M.check(r, d0, (0.3, 0.6), mid)[2].ratio.max() <= rho:
                lo = mid
            else:
                hi = mid
        out["sustain"][str(rho)] = round(lo, 2)
        print(f"   rho {rho}: {lo:.2f} kg")
    (HERE / "results.json").write_text(json.dumps(out, indent=1))


if __name__ == "__main__":
    main()
