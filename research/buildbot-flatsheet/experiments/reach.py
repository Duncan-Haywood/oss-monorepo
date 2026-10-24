"""Reach of a standing G1 pushing a nailer straight down onto a table: which (reach x, sideways dy, hand height z)
can it hold with its feet planted, a downward push of 0, 50 or 100 N, every joint inside its torque limit?

Writes reach.json. Deterministic. Several minutes on one CPU; run in the background.
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path[:0] = [str(ROOT / "buildbot-payload" / "src"), str(ROOT / "buildbot-fasten" / "src")]
import mujoco  # noqa: E402
import numpy as np  # noqa: E402
from buildbot_payload import fetch, model as P  # noqa: E402
from buildbot_fasten import model as F  # noqa: E402

TOOL_KG = 3.4                       # Metabo HPT NR90AES1, 7.5 lb (maker's listing, as buildbot-fasten)
XS = [round(0.1 * k, 1) for k in range(2, 9)]          # hands in front of the feet centre: 0.2 .. 0.8 m
ZS = [round(0.1 * k, 1) for k in range(4, 15)]         # hand height 0.4 .. 1.4 m
DYS = [round(0.1 * k, 1) for k in range(0, 9)]         # 0 .. 0.8 m to the left
NEEDS = [0.0, 50.0, 100.0]          # downward push (N); no maker figure found, swept as buildbot-fasten
MUS = [0.3, 0.6]


def cell(r, d0, x, z, dy, need, q_init):
    m = r.model
    p = P.pose(r, d0, (x, z), TOOL_KG, "palm", q_init, com_dx=0.0, dy=dy)
    if not p.ok:
        return {"ok": False, "why": "reach"}, q_init
    dd = mujoco.MjData(m)
    dd.qpos[:] = p.qpos
    mujoco.mj_kinematics(m, dd)
    if float(dd.xpos[1:, 2].min()) < -1e-3:      # a body origin below the floor: a folded pose the IK allows
        return {"ok": False, "why": "floor"}, q_init
    ext = np.array([0.0, 0.0, -need - TOOL_KG * P.G])      # push down on the table plus the tool's weight
    tau, ratio, f = F.ground_wrench(r, p.qpos, ext, "palm")
    fz, fx = f[2] + f[8], f[0] + f[6]
    k = int(np.argmax(ratio))
    jid = int(np.flatnonzero(m.jnt_dofadr == k)[0])
    joint = mujoco.mj_id2name(m, mujoco.mjtObj.mjOBJ_JOINT, jid)
    torque_ok = float(ratio.max()) <= 1.0 and min(f[2], f[8]) > 0
    res = {"ok": bool(torque_ok), "why": None if torque_ok else joint, "joint": joint,
           "ratio": float(ratio.max()), "slip_mu_min": (abs(fx) / fz if fz > 0 else None)}
    return res, p.qpos


def main():
    fetch.model_path("g1")
    r = P.load("g1")
    d0 = P.standing(r)
    out = {"menagerie_commit": fetch.COMMIT, "tool_kg": TOOL_KG, "xs": XS, "zs": ZS, "dys": DYS,
           "needs": NEEDS, "mus": MUS, "cells": []}
    for z in ZS:
        for x in XS:
            for need in NEEDS:
                q = None
                for dy in DYS:
                    res, q_new = cell(r, d0, x, z, dy, need, q)
                    if res["ok"]:
                        q = q_new
                    res.update(x=x, z=z, dy=dy, need=need)
                    out["cells"].append(res)
        print("done z", z, flush=True)
    out["mirror"] = []
    for z in ZS:
        for x in XS:
            for dy in DYS[1:]:
                res, _ = cell(r, d0, x, z, -dy, 50.0, None)
                res.update(x=x, z=z, dy=-dy, need=50.0)
                out["mirror"].append(res)
    Path(HERE / "reach.json").write_text(json.dumps(out, indent=1))
    print("wrote reach.json")


if __name__ == "__main__":
    main()
