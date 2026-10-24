"""Sideways reach of a standing G1 with a nailer: which (sideways dy, height z) tool points can it hold
and push into a wall from one stance? Feet planted, whole-body IK, torque limits, no slipping.

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
XS = [0.3, 0.4, 0.5]                # tool in front of the feet centre (m)
ZS = [round(0.1 * k, 1) for k in range(17)]            # 0 .. 1.6 m
DYS = [round(0.1 * k, 1) for k in range(0, 9)]       # 0 .. 0.8 m to the left
NEEDS = [0.0, 50.0, 100.0]          # push into the wall (N); no maker figure found, swept as buildbot-fasten
MUS = [0.3, 0.6]


def cell(r, d0, x, z, dy, need, q_init):
    m = r.model
    weight = (float(m.body_subtreemass[1]) + TOOL_KG) * P.G
    p = P.pose(r, d0, (x, z), TOOL_KG, "palm", q_init, com_dx=need * z / weight, dy=dy)
    if not p.ok:
        return {"ok": False, "why": "reach"}, q_init
    dd = mujoco.MjData(m)
    dd.qpos[:] = p.qpos
    mujoco.mj_kinematics(m, dd)
    if float(dd.xpos[1:, 2].min()) < -1e-3:      # a body origin below the floor: a folded pose the IK allows
        return {"ok": False, "why": "floor"}, q_init
    ext = np.array([-need, 0.0, -TOOL_KG * P.G])
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
    for x in XS:
        for z in ZS:
            for need in NEEDS:
                q = None
                for dy in DYS:
                    res, q_new = cell(r, d0, x, z, dy, need, q)
                    if res["ok"]:
                        q = q_new
                    res.update(x=x, z=z, dy=dy, need=need)
                    out["cells"].append(res)
        print("done x", x, flush=True)
    # mirror check: the same cells to the right at one reach and one need
    out["mirror"] = []
    for z in ZS:
        for dy in DYS[1:]:
            res, _ = cell(r, d0, 0.4, z, -dy, 50.0, None)
            res.update(x=0.4, z=z, dy=-dy, need=50.0)
            out["mirror"].append(res)
    Path(HERE / "reach.json").write_text(json.dumps(out, indent=1))
    print("wrote reach.json")


if __name__ == "__main__":
    main()
