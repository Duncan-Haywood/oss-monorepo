"""Render the README images of the twin (printed-part meshes, servos dark grey).

    MUJOCO_GL=egl PYTHONPATH=src python experiments/render.py   # or MUJOCO_GL=osmesa
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

os.environ.setdefault("MUJOCO_GL", "egl")
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))

import mujoco  # noqa: E402

from homebot.mjcf import build_xml  # noqa: E402
from homebot.render import montage, save_png, snapshot  # noqa: E402

OUT = HERE.parent / "hardware" / "renders"


def shot(variant, pose, views, size=(720, 720), name="x", base_mode="planar"):
    m = mujoco.MjModel.from_xml_string(build_xml(variant=variant, base_mode=base_mode, meshes=True))
    d = mujoco.MjData(m)
    mujoco.mj_resetDataKeyframe(m, d, 0)
    for k, v in pose.items():
        d.joint(k).qpos[0] = v
        if k.endswith("_gripper"):  # the second jaw is geared to the first
            d.joint(k + "_follow").qpos[0] = v
    mujoco.mj_forward(m, d)
    ims = [snapshot(m, d, size[0], size[1], az, el, distance=dist, lookat=look, groups=(0, 1, 2))
           for az, el, dist, look in views]
    img = montage(ims, cols=len(ims))
    save_png(img, OUT / f"{name}.png")
    return img


def closeup(name="hand_elbow", size=(560, 560)):
    """The v2 parts: parallel gripper (hanging, front and from below) and the geared elbow."""
    m = mujoco.MjModel.from_xml_string(build_xml(variant="arm", meshes=True, scene="none"))
    d = mujoco.MjData(m)
    ims = []
    for pose, views in (({"r_gripper": 0.016, "r_gripper_follow": 0.016}, [(90, 8, 0.22), (130, -35, 0.24)]),
                        ({"r_elbow": 0.7}, [(90, 0, 0.3)])):
        mujoco.mj_resetData(m, d)
        for k, v in pose.items():
            d.joint(k).qpos[0] = v
        mujoco.mj_forward(m, d)
        hand = d.body("r_hand").xpos.copy() - [0, 0, 0.05]
        look = hand if "r_gripper" in pose else d.body("r_forearm").xpos.copy()
        ims += [snapshot(m, d, *size, az, el, distance=dist, lookat=look, groups=(0, 1, 2)) for az, el, dist in views]
    save_png(montage(ims, cols=len(ims)), OUT / f"{name}.png")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    reach = {"lift": 0.32, "r_shoulder_pitch": 1.2, "r_shoulder_roll": 0.15, "r_elbow": 0.5, "r_wrist_pitch": -0.2,
             "r_gripper": 0.02, "l_shoulder_pitch": 0.6, "l_shoulder_roll": 0.2, "l_elbow": 1.5, "l_forearm_roll": 0.8,
             "head_pan": -0.2, "head_tilt": 0.7}
    shot("mobile", reach, [(145, -12, 2.0, (0.1, 0, 0.62)), (215, -18, 2.0, (0.1, 0, 0.62))], name="mobile")
    arm = {"r_shoulder_pitch": 0.9, "r_shoulder_roll": 0.2, "r_upper_arm_yaw": -0.3, "r_elbow": 1.0,
           "r_wrist_pitch": 0.4, "r_gripper": 0.022}
    shot("arm", arm, [(140, -15, 0.85, (0.12, -0.2, 0.95)), (230, -10, 0.85, (0.12, -0.2, 0.95))], name="arm")
    torso = {"r_shoulder_pitch": 1.1, "r_elbow": 0.9, "r_wrist_pitch": 0.3, "l_shoulder_pitch": 1.1,
             "l_elbow": 0.9, "l_wrist_pitch": 0.3, "r_gripper": 0.015, "l_gripper": 0.015, "head_tilt": 0.8}
    shot("torso", torso, [(160, -25, 1.5, (0.2, 0, 0.95))], size=(960, 720), name="torso")
    shot("mobile", {"lift": 0.25}, [(30, -8, 0.75, (0, 0, 0.08)), (120, -20, 0.8, (0, 0, 0.12))], name="base",
         base_mode="free")
    closeup()


if __name__ == "__main__":
    main()
