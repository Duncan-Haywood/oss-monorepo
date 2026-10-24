"""Reaching tasks: one arm at a table, both arms at a table, and whole-body mobile reaching.

Targets are drawn by sampling a random joint configuration and taking its tool-centre
point, so every target is reachable and lies in the arm's real workspace (no point clouds
that the kinematics cannot reach). Configurations that collide with the robot itself or
the table are rejected.
"""
from __future__ import annotations

import math

import mujoco
import numpy as np

from .core import HomebotEnv, arm_joint_names

TABLE_TOP = 0.75
SUCCESS = 0.03  # m


def _target_body(name: str, rgba: str) -> str:
    return (f'<body name="{name}" mocap="true" pos="0 0 -1">'
            f'<site name="{name}" type="sphere" size="0.018" rgba="{rgba}" group="1"/></body>')


class _ReachMixin:
    arms = ("r",)
    sample_ranges = {
        "shoulder_pitch": (0.0, 1.75), "shoulder_roll": (0.0, 0.9), "upper_arm_yaw": (-1.0, 1.0),
        "elbow": (0.2, 2.0), "forearm_roll": (-1.5, 1.5), "wrist_pitch": (-1.2, 1.2), "wrist_roll": (-1.5, 1.5),
    }

    def _extra_world(self):
        return "".join(_target_body(f"target_{s}", "0.9 0.1 0.1 0.6" if s == "r" else "0.1 0.3 0.9 0.6")
                       for s in self.arms)

    def _tcp_names(self):
        return [f"{s}_tcp" for s in self.arms]

    def _hand_names(self):
        return [f"{s}_hand" for s in self.arms]

    def _valid(self, tcp_pos) -> bool:
        if self.self_contacts() > 0 or self.world_contacts() > 0:
            return False
        for p in tcp_pos:
            if 0.10 < p[0] < 0.74 and abs(p[1]) < 0.47 and p[2] < TABLE_TOP + 0.04:
                return False
        return True

    def _sample_arm_targets(self, extra=None) -> list[np.ndarray]:
        m, d = self.model, self.data
        q0 = d.qpos.copy()
        rng = self._np_random
        for _ in range(200):
            for s in self.arms:
                for j, (lo, hi) in self.sample_ranges.items():
                    d.qpos[self.jnt[f"{s}_{j}"][0]] = rng.uniform(lo, hi)
            if extra is not None:
                extra(d)
            mujoco.mj_kinematics(m, d)
            mujoco.mj_collision(m, d)
            tcps = [d.site_xpos[i].copy() for i in self.tcp_sites]
            if self._valid(tcps):
                break
        d.qpos[:] = q0
        return tcps


class ArmReach(_ReachMixin, HomebotEnv):
    """One 7-DOF arm on its carriage at a table edge: put the gripper centre on a target."""

    variant = "arm"
    controlled = arm_joint_names(("r",))
    episode_steps = 100

    def _home_pose(self):
        return {"r_shoulder_pitch": 0.3, "r_elbow": 1.3}

    def _sample_task(self):
        self.goals = self._sample_arm_targets()
        for s, g in zip(self.arms, self.goals):
            self.data.mocap_pos[self.model.body(f"target_{s}").mocapid[0]] = g

    def _task_obs(self):
        out = []
        for i, g in enumerate(self.goals):
            p = self.tcp(i)
            out += [g - p, p - np.array([0.0, 0.0, 1.0])]
        return np.concatenate(out)

    def _reward(self, a):
        dists = np.array([np.linalg.norm(self.goals[i] - self.tcp(i)) for i in range(len(self.goals))])
        contacts = self.self_contacts() + self.world_contacts()
        r = -dists.sum() - 0.002 * float(np.sum(a ** 2)) - 0.05 * min(contacts, 5)
        r += 0.05 * float(np.sum(dists < SUCCESS))
        info = {"distance": float(dists.max()), "is_success": bool(np.all(dists < SUCCESS)), "contacts": contacts}
        return r, False, info


class BimanualReach(ArmReach):
    """Both arms and the head on the carriage at a table: two targets at once."""

    variant = "torso"
    arms = ("r", "l")
    controlled = arm_joint_names(("r", "l"))

    def _home_pose(self):
        return {"r_shoulder_pitch": 0.3, "r_elbow": 1.3, "l_shoulder_pitch": 0.3, "l_elbow": 1.3}


class MobileReach(_ReachMixin, HomebotEnv):
    """Full robot on the floor: drive the omni base, raise the lift and reach a point in the room."""

    variant = "mobile"
    base_mode = "planar"
    arms = ("r",)
    controlled = arm_joint_names(("r",)) + ("lift",)
    base_action = True
    episode_steps = 250

    def __init__(self, *args, terminate_on_tip: bool = True, **kw):
        self.terminate_on_tip = terminate_on_tip
        super().__init__(*args, **kw)


    def _valid(self, tcp_pos):
        return self.self_contacts() == 0 and self.world_contacts() == 0 and all(p[2] > 0.15 for p in tcp_pos)

    def _home_pose(self):
        return {"lift": 0.25, "r_shoulder_pitch": 0.3, "r_elbow": 1.3, "l_shoulder_pitch": 0.0, "l_elbow": 0.4}

    def _sample_task(self):
        rng = self._np_random
        lift_q = self.jnt["lift"][0]

        def extra(d):
            d.qpos[lift_q] = rng.uniform(0.0, self.robot.lift.travel)

        g = self._sample_arm_targets(extra)[0]
        # move the target out into the room: random bearing and distance from the start pose
        r, th = rng.uniform(0.3, 1.2), rng.uniform(-math.pi, math.pi)
        yaw = rng.uniform(-math.pi, math.pi)
        c, s = math.cos(yaw), math.sin(yaw)
        g = np.array([c * g[0] - s * g[1] + r * math.cos(th), s * g[0] + c * g[1] + r * math.sin(th), g[2]])
        self.goals = [g]
        self.data.mocap_pos[self.model.body("target_r").mocapid[0]] = g
        self._prev_base_v = np.zeros(3)

    def _base_frame(self):
        x, y, yaw = self.base_pose()
        c, s = math.cos(yaw), math.sin(yaw)
        Rt = np.array([[c, s, 0], [-s, c, 0], [0, 0, 1.0]])
        return np.array([x, y, 0.0]), Rt

    def _task_obs(self):
        p0, Rt = self._base_frame()
        g = self.goals[0]
        tcp = self.tcp(0)
        v = self.base_velocity()
        vb = Rt @ np.array([v[0], v[1], 0.0])
        return np.concatenate([Rt @ (g - tcp), Rt @ (g - p0), Rt @ (tcp - p0), [vb[0], vb[1], v[2]]])

    def support_margin(self) -> float:
        """Distance (m) of the zero-moment point inside the wheel triangle (negative = tipping).

        Point-mass ZMP: COM projection shifted by -(h/g) * base acceleration. The planar
        twin cannot tip, so this is checked analytically and ends the episode instead.
        """
        d, b = self.data, self.robot.base
        p0, Rt = self._base_frame()
        com = Rt @ (d.subtree_com[self.model.body("base").id] - p0)
        v = self.base_velocity()
        acc = (v - self._prev_base_v) / self.dt
        self._prev_base_v = v.copy()
        ab = Rt @ np.array([acc[0], acc[1], 0.0])
        zmp = com[:2] - com[2] / 9.81 * ab[:2]
        return support_margin_2d(zmp, b.wheel_distance, b.wheel_angles)

    def _reward(self, a):
        dist = float(np.linalg.norm(self.goals[0] - self.tcp(0)))
        contacts = self.self_contacts() + self.world_contacts()
        margin = self.support_margin()
        # planar twin: tipping is predicted from the ZMP; roller twin: the base really tilts
        tipped = margin < 0.0 if self.base_mode == "planar" else self.base_tilt() > 0.17
        r = -dist - 0.002 * float(np.sum(a ** 2)) - 0.05 * min(contacts, 5) + 0.05 * (dist < SUCCESS)
        if tipped:
            r -= 10.0
        info = {"distance": dist, "is_success": dist < SUCCESS, "contacts": contacts, "support_margin": margin,
                "tipped": bool(tipped)}
        return r, bool(tipped and self.terminate_on_tip), info


class MobileReachRollers(MobileReach):
    """The same task on the roller-wheel twin: free-floating base on three omni wheels with
    20 passive rollers each, driven through the kiwi inverse kinematics. Slower (1 ms steps);
    used to evaluate policies trained on the planar twin."""

    base_mode = "free"
    default_timestep = 0.001


def support_margin_2d(p, wheel_distance, wheel_angles) -> float:
    """Signed distance of ``p`` from the edges of the wheel-contact triangle (positive inside)."""
    pts = [np.array([wheel_distance * math.cos(t), wheel_distance * math.sin(t)]) for t in wheel_angles]
    best = math.inf
    for i in range(3):
        a, b = pts[i], pts[(i + 1) % 3]
        e = b - a
        n = np.array([-e[1], e[0]]) / np.linalg.norm(e)  # left normal (triangle is counter-clockwise)
        best = min(best, float(np.dot(p - a, n)))
    return best
