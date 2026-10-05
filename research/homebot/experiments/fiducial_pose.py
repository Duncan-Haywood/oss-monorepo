"""Is the pick task's 5 mm cube-position error realistic? Locate the cube with the head camera.

A 40 mm cube with a 30 mm ArUco marker (4x4_50) printed on its top face sits at random on the
table in front of the two-arm build (stage B). The head camera (60 deg vertical field of view,
on the pan/tilt head at ~1.15 m) renders the scene with Gaussian pixel noise; the marker is
detected and the cube located with ``homebot.perception``:

* ``plane``: the ray through the marker centre meets the plane of the cube's top face;
* ``pnp``: the full marker pose from its corners, no plane assumption.

Errors are horizontal (the pick policy's observation error that matters most), plus the
height error of PnP.

The camera's pose in the robot frame comes from the head's forward kinematics, either with the
true head angles or with the angles the servos would report: quantised to one encoder tick and
off by up to the datasheet backlash (0.5 deg) in each joint. Lens distortion, calibration error
and lighting are not modelled, so these are lower bounds on the real error.

    MUJOCO_GL=egl PYTHONPATH=src python experiments/fiducial_pose.py   # ~3 min -> results/fiducial_pose.json
"""
from __future__ import annotations

import json
import math
import os
import sys
import tempfile
import xml.etree.ElementTree as ET
from pathlib import Path

import numpy as np

os.environ.setdefault("MUJOCO_GL", "egl")
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))

import mujoco  # noqa: E402

from homebot import perception as P  # noqa: E402
from homebot.mjcf import build_xml  # noqa: E402
from homebot.params import DEFAULT  # noqa: E402

TABLE_TOP = 0.75
CUBE = 0.040
MARKER = 0.030  # black square; the printed label is the cube face (40 mm) with a white quiet zone
LOOK_AT = np.array([0.32, 0.0, TABLE_TOP])
BACKLASH = math.radians(0.5)


def scene(marker_png: str) -> mujoco.MjModel:
    root = ET.fromstring(build_xml(DEFAULT, "torso", meshes=True))
    asset = root.find("asset")
    ET.SubElement(asset, "texture", name="aruco", type="2d", file=marker_png)
    ET.SubElement(asset, "material", name="aruco", texture="aruco")
    vis = root.find("visual").find("global")
    vis.set("offwidth", "1280")
    vis.set("offheight", "960")
    wb = root.find("worldbody")
    h = CUBE / 2
    body = ET.SubElement(wb, "body", name="cube", mocap="true", pos=f"0.3 0 {TABLE_TOP + h}")
    ET.SubElement(body, "geom", type="box", size=f"{h} {h} {h}", rgba="0.2 0.5 0.9 1", contype="0", conaffinity="0")
    ET.SubElement(body, "geom", name="label", type="box", size=f"{h} {h} 0.0005", pos=f"0 0 {h + 0.0005}",
                  material="aruco", contype="0", conaffinity="0")
    return mujoco.MjModel.from_xml_string(ET.tostring(root, encoding="unicode"))


def _fk(m, d) -> None:
    mujoco.mj_kinematics(m, d)
    mujoco.mj_camlight(m, d)  # camera poses are not part of mj_kinematics


def aim_head(m, d) -> None:
    """Pan and tilt so the camera's optical axis passes through LOOK_AT."""
    for _ in range(50):
        _fk(m, d)
        c = d.cam("head_cam")
        p, R = c.xpos, c.xmat.reshape(3, 3)
        v = LOOK_AT - p
        fwd = -R[:, 2]
        # small corrections: pan about z, tilt about the camera's x (positive tilt looks down)
        dpan = math.atan2(v[1], v[0]) - math.atan2(fwd[1], fwd[0])
        dtilt = math.atan2(-v[2], np.hypot(v[0], v[1])) - math.atan2(-fwd[2], np.hypot(fwd[0], fwd[1]))
        d.joint("head_pan").qpos[0] += dpan
        d.joint("head_tilt").qpos[0] += dtilt
        if abs(dpan) + abs(dtilt) < 1e-6:
            break
    _fk(m, d)


def camera_pose(m, d, head: dict | None = None):
    """Camera position and rotation, optionally from other head angles than the true ones."""
    if head is None:
        c = d.cam("head_cam")
        return c.xpos.copy(), c.xmat.reshape(3, 3).copy()
    d2 = mujoco.MjData(m)
    d2.qpos[:] = d.qpos
    for k, v in head.items():
        d2.joint(k).qpos[0] = v
    _fk(m, d2)
    c = d2.cam("head_cam")
    return c.xpos.copy(), c.xmat.reshape(3, 3).copy()


def run(n=200, seed=0, resolutions=((1280, 720), (640, 480)), noise=2.0):
    rng = np.random.default_rng(seed)
    with tempfile.TemporaryDirectory() as tmp:
        import cv2

        png = str(Path(tmp) / "marker.png")
        cv2.imwrite(png, P.marker_image(0, 320))
        m = scene(png)
        d = mujoco.MjData(m)
        aim_head(m, d)
        head_true = {k: float(d.joint(k).qpos[0]) for k in ("head_pan", "head_tilt")}
        fovy = float(m.cam_fovy[m.camera("head_cam").id])
        tick = DEFAULT.servo.tick
        out = {"head_pan_rad": head_true["head_pan"], "head_tilt_rad": head_true["head_tilt"], "fovy_deg": fovy,
               "camera_height_m": float(d.cam("head_cam").xpos[2]), "conditions": {}}
        samples = []
        for _ in range(n):
            x, y = rng.uniform(0.24, 0.40), rng.uniform(-0.32, 0.32)
            yaw = rng.uniform(-math.pi / 4, math.pi / 4)
            err = {k: round((v + rng.uniform(-BACKLASH, BACKLASH)) / tick) * tick for k, v in head_true.items()}
            samples.append((x, y, yaw, err))
        top = TABLE_TOP + CUBE + 0.001  # label surface
        for w, h in resolutions:
            K = P.intrinsics(fovy, w, h)
            res = {"detected": 0, "undetected_x": [], "plane_true_head": [], "pnp_true_head": [],
                   "pnp_height_true_head": [], "plane_encoder_head": [], "pnp_encoder_head": [],
                   "pnp_height_encoder_head": []}
            with mujoco.Renderer(m, h, w) as r:
                for x, y, yaw, err in samples:
                    mid = m.body("cube").mocapid[0]
                    d.mocap_pos[mid] = [x, y, TABLE_TOP + CUBE / 2]
                    d.mocap_quat[mid] = [math.cos(yaw / 2), 0, 0, math.sin(yaw / 2)]
                    _fk(m, d)
                    r.update_scene(d, camera="head_cam")
                    img = r.render().astype(float)
                    img = np.clip(img + rng.normal(0, noise, img.shape), 0, 255).astype(np.uint8)
                    corners = P.detect(img)
                    if corners is None:
                        res["undetected_x"].append(x)
                        continue
                    res["detected"] += 1
                    truth = np.array([x, y, top])
                    for tag, head in (("true_head", None), ("encoder_head", err)):
                        p, R = camera_pose(m, d, head)
                        e1 = P.locate_on_plane(corners, K, p, R, top) - truth
                        e2 = P.locate_pnp(corners, K, p, R, MARKER) - truth
                        res[f"plane_{tag}"].append(float(np.hypot(e1[0], e1[1])))  # horizontal error
                        res[f"pnp_{tag}"].append(float(np.hypot(e2[0], e2[1])))
                        res[f"pnp_height_{tag}"].append(float(abs(e2[2])))
            summary = {"images": n, "detected": res["detected"],
                       "undetected_x_m": sorted(round(v, 3) for v in res.pop("undetected_x"))}
            for k, v in res.items():
                if isinstance(v, list) and v:
                    a = np.array(v) * 1000
                    summary[k + "_mm"] = {"median": float(np.median(a)), "p90": float(np.percentile(a, 90)),
                                          "max": float(a.max())}
            out["conditions"][f"{w}x{h}"] = summary
            print(f"{w}x{h}: detected {res['detected']}/{n}", flush=True)
            for k in ("plane_true_head", "pnp_true_head", "pnp_height_true_head", "plane_encoder_head",
                      "pnp_encoder_head", "pnp_height_encoder_head"):
                s = summary.get(k + "_mm")
                if s:
                    print(f"  {k:20s} median {s['median']:.1f} mm, p90 {s['p90']:.1f} mm, max {s['max']:.1f} mm")
    (HERE / "results" / "fiducial_pose.json").write_text(json.dumps(out, indent=1))
    return out


if __name__ == "__main__":
    run()
