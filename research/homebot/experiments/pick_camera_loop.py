"""Pick with the cube position from a rendered camera instead of the simulator.

The pick policies were trained on the simulator's cube pose plus a randomised error. Here the
pose comes from the perception pipeline (``homebot.perception``) running in the loop:

* a camera at the stage-B head's pose renders the arm scene (640x480, Gaussian pixel noise)
  every ``EVERY`` control steps (5 Hz), with a 30 mm ArUco marker on the cube's top face;
* the cube position is where the ray through the marker centre meets the cube-top plane, its
  yaw (modulo 90 deg) comes from the marker's edges on that plane;
* when the marker is not visible (hidden by the arm) the last estimate is kept;
* once the gripper servo reports holding something (jaws stopped but not fully closed, load at
  the torque limit) the cube is taken to move rigidly with the hand from its last estimated
  offset, as a real controller would assume.

Two cameras: one fixed rigidly at the head's pose (calibrated exactly), and the pan/tilt head,
whose pose the robot computes from the head servos' reported angles (one-tick quantisation and
up to 0.5 deg backlash in each joint, drawn per episode).

    MUJOCO_GL=egl PYTHONPATH=src python experiments/pick_camera_loop.py experiments/runs/ArmPick_dr_ent_s0 ...
    # -> results/pick_camera_loop.json
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
sys.path.insert(0, str(HERE))

import mujoco  # noqa: E402

import fiducial_pose as F  # noqa: E402
from homebot import perception as P  # noqa: E402
from homebot.envs import ArmPick  # noqa: E402
from homebot.envs.pick import NOMINAL, TABLE_TOP  # noqa: E402
from homebot.mjcf import build_xml  # noqa: E402

EVERY = 5  # control steps per camera frame (5 Hz at 25 Hz control)
WIDTH, HEIGHT = 640, 480


def _xyaxes(R: np.ndarray) -> str:
    return " ".join(f"{v:.9g}" for v in np.concatenate([R[:, 0], R[:, 1]]))


class CameraEstimator:
    """Cube pose for ``ArmPick.cube_estimator`` from a rendered camera and the gripper servo."""

    def __init__(self, env: ArmPick, png: str, head: bool, seed: int = 0, noise: float = 2.0,
                 every: int = EVERY, wrist: bool = False):
        self.env, self.head, self.noise, self.every, self.wrist = env, head, noise, every, wrist
        self.rng = np.random.default_rng(seed)
        # the stage-B head, aimed at the table
        self.mt = F.scene(png)
        self.dt = mujoco.MjData(self.mt)
        F.aim_head(self.mt, self.dt)
        self.head_true = {k: float(self.dt.joint(k).qpos[0]) for k in ("head_pan", "head_tilt")}
        cam_pos, cam_R = F.camera_pose(self.mt, self.dt)
        fovy = float(self.mt.cam_fovy[self.mt.camera("head_cam").id])
        # the env's arm scene with the label on the cube and a camera at the head's pose
        root = ET.fromstring(build_xml(env.robot, "arm", meshes=False, extra_world=env._extra_world()))
        asset = root.find("asset")
        ET.SubElement(asset, "texture", name="aruco", type="2d", file=png)
        ET.SubElement(asset, "material", name="aruco", texture="aruco")
        wb = root.find("worldbody")
        h = NOMINAL["size"] / 2
        cube = next(b for b in wb.iter("body") if b.get("name") == "cube")
        ET.SubElement(cube, "geom", name="label", type="box", size=f"{h} {h} 0.0005", pos=f"0 0 {h + 0.0005}",
                      material="aruco", contype="0", conaffinity="0", mass="0")
        ET.SubElement(wb, "camera", name="cam", pos=" ".join(f"{v:.9g}" for v in cam_pos), xyaxes=_xyaxes(cam_R),
                      fovy=f"{fovy:g}")
        self.mr = mujoco.MjModel.from_xml_string(ET.tostring(root, encoding="unicode"))
        assert self.mr.nq == env.model.nq
        self.dr = mujoco.MjData(self.mr)
        self.renderer = mujoco.Renderer(self.mr, HEIGHT, WIDTH)
        self.K = P.intrinsics(fovy, WIDTH, HEIGHT)
        self.K_wrist = P.intrinsics(float(self.mr.cam_fovy[self.mr.camera("r_wrist_cam").id]), WIDTH, HEIGHT)
        self.true_pose = (cam_pos, cam_R)
        self.stats = {"frames": 0, "detections": 0, "never_seen": 0, "episodes": 0}
        self.seen_history: list[bool] = []

    def _new_episode(self):
        # (the vectorised env resets as soon as an episode ends, so the previous one is booked here)
        if self.stats["episodes"] > 0:
            self.seen_history.append(bool(self.seen))
            self.stats["never_seen"] += int(not self.seen)
        self.stats["episodes"] += 1
        if self.head:
            tick = self.env.robot.servo.tick
            err = {k: round((v + self.rng.uniform(-F.BACKLASH, F.BACKLASH)) / tick) * tick
                   for k, v in self.head_true.items()}
            self.pose = F.camera_pose(self.mt, self.dt, err)
        else:
            self.pose = self.true_pose
        self.est, self.yaw, self.k, self.seen, self.offset = None, 0.0, 0, False, None

    def _frame(self, camera: str):
        self.renderer.update_scene(self.dr, camera=camera)
        img = self.renderer.render().astype(float)
        img = np.clip(img + self.rng.normal(0, self.noise, img.shape), 0, 255).astype(np.uint8)
        self.stats["frames"] += 1
        return P.detect(img)

    def _look(self):
        env = self.env
        self.dr.qpos[:] = env.data.qpos
        mujoco.mj_kinematics(self.mr, self.dr)
        mujoco.mj_camlight(self.mr, self.dr)
        corners, K, (p, R) = None, self.K, self.pose
        if self.wrist:  # the wrist camera first: it sees the cube while the hand hides it from the head
            corners = self._frame("r_wrist_cam")
            if corners is not None:  # its pose from the arm's forward kinematics
                c = self.dr.cam("r_wrist_cam")
                K, p, R = self.K_wrist, c.xpos.copy(), c.xmat.reshape(3, 3).copy()
        if corners is None:
            corners, K, (p, R) = self._frame("cam"), self.K, self.pose
        if corners is None:
            return
        self.stats["detections"] += 1
        top = TABLE_TOP + 2 * env.half + 0.001
        self.est = P.locate_on_plane(corners, K, p, R, top) - np.array([0.0, 0.0, env.half + 0.001])
        self.yaw = P.yaw_on_plane(corners, K, p, R, top)
        self.seen = True

    def __call__(self):
        env = self.env
        if env.t == 0:
            self._new_episode()
        Rh = env.data.xmat[env.model.body("r_hand").id].reshape(3, 3)
        if self.seen and env.holding():  # the cube moves with the hand, at the offset it had when the jaws closed
            if self.offset is None:
                self.offset = Rh.T @ (self.est - env.tcp(0))
            self.est = env.tcp(0) + Rh @ self.offset
        else:
            self.offset = None
            if self.k % self.every == 0:
                self._look()
        self.k += 1
        if self.est is None:  # not seen yet: the middle of the workspace
            return np.array([0.32, -0.18, TABLE_TOP + env.half]), 0.0
        return self.est.copy(), self.yaw


def evaluate(run: Path, gap: str, head: bool | None, png: str, episodes: int, seed: int = 10_000,
             every: int = EVERY, wrist: bool = False) -> dict:
    """Success over ``episodes``; ``head`` None = the simulator's cube pose (no camera)."""
    import torch
    from stable_baselines3 import PPO
    from stable_baselines3.common.vec_env import DummyVecEnv, VecNormalize

    torch.set_num_threads(1)
    model = PPO.load(run / "policy.zip", device="cpu")
    env = ArmPick(gap=gap, seed=0)
    cam = CameraEstimator(env, png, head, seed=seed, every=every, wrist=wrist) if head is not None else None
    env.cube_estimator = cam
    venv = VecNormalize.load(str(run / "vecnormalize.pkl"), DummyVecEnv([lambda: env]))
    venv.training = False
    # the same episode sequence as train.py's evaluation (seed once, episodes roll over), so the
    # cube placements match the privileged-state evaluation episode for episode
    succ = []
    venv.seed(seed)
    obs = venv.reset()
    while len(succ) < episodes:
        a, _ = model.predict(obs, deterministic=True)
        obs, _, d, info = venv.step(a)
        if d[0]:
            succ.append(bool(info[0]["is_success"]))
    s = np.mean(succ)
    out = {"episodes": episodes, "success_rate": float(s), "per_episode": [int(x) for x in succ],
           "success_ci95": float(1.96 * math.sqrt(max(s * (1 - s), 1e-12) / episodes))}
    if cam is not None:
        cam.renderer.close()
        seen = cam.seen_history[:episodes]
        ok_seen = [x for x, sn in zip(succ, seen) if sn]
        out.update(marker_never_seen=episodes - sum(seen), seen_per_episode=[int(x) for x in seen],
                   success_when_seen=float(np.mean(ok_seen)) if ok_seen else None,
                   detection_rate=cam.stats["detections"] / max(1, cam.stats["frames"]))
    return out


def main(runs, episodes=50, gaps=("nominal",)):
    out_path = HERE / "results" / "pick_camera_loop.json"
    out = json.loads(out_path.read_text()) if out_path.exists() else {}
    with tempfile.TemporaryDirectory() as tmp:
        import cv2

        png = str(Path(tmp) / "marker.png")
        cv2.imwrite(png, P.marker_image(0, 320))
        for run in map(Path, runs):
            res = out.setdefault(run.name, {})
            for gap in gaps:
                for cam_name, head in (("simulator_pose", None), ("fixed_camera", False), ("pan_tilt_head", True)):
                    r = evaluate(run, gap, head, png, episodes)
                    res.setdefault(gap, {})[cam_name] = r
                    extra = (f" (marker never seen {r['marker_never_seen']}, success when seen "
                             f"{r['success_when_seen']:.2f}, detected in {r['detection_rate'] * 100:.0f} % of frames)"
                             if head is not None else "")
                    print(f"{run.name:22s} {gap:12s} {cam_name:14s} success {r['success_rate']:.2f} "
                          f"± {r['success_ci95']:.2f}{extra}", flush=True)
                    out_path.write_text(json.dumps(out, indent=1))
    return out


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    gaps = next((a.split("=", 1)[1].split(",") for a in sys.argv[1:] if a.startswith("--gaps=")), ["nominal"])
    eps = next((int(a.split("=", 1)[1]) for a in sys.argv[1:] if a.startswith("--episodes=")), 50)
    main(args, episodes=eps, gaps=tuple(gaps))
