"""Picking: one arm at the table edge grasps a cube with the parallel gripper and lifts it.

The policy moves the seven arm joints and the gripper by increments of their servo targets
(as in the reach tasks; up to 4 mm of jaw travel per step, the servo itself moves about
0.7 mm per step), starting with the gripper open. It observes its joints, the gripper servo's
load (the STS3215 reports it) and an estimate of the cube's position and yaw, as a camera with
a fiducial on the cube would give (``homebot.perception``, ``experiments/fiducial_pose.py``);
there is no touch sensing. Domain randomisation adds cube size, mass and friction, pad
friction and a 5 mm error on the cube position to the servo randomisation of the reach tasks.

Success: at the end of the episode the cube is at least 5 cm above the table and held
between the two jaws.
"""
from __future__ import annotations

import math

import numpy as np

from .core import GAPS, OBJECT_GAPS, HomebotEnv, arm_joint_names

TABLE_TOP = 0.75
HOLD_OPENING = 0.004  # m per jaw: the gripper holds something if it stopped wider than this ...
HOLD_SPEED = 0.002  # m/s ... and its servo load is at least HOLD_LOAD of the force limit
HOLD_LOAD = 0.5
LIFT = 0.08  # m, the lift the reward asks for
SUCCESS_LIFT = 0.05  # m
NOMINAL = {"size": 0.04, "mass": 0.06, "friction": 0.5}
SPAWN = {"x": (0.24, 0.40), "y": (-0.32, -0.04), "yaw": (-math.pi / 4, math.pi / 4)}


def _cube_xml(half: float) -> str:
    return (f'<body name="cube" pos="0.3 -0.2 {TABLE_TOP + half}"><freejoint name="cube"/>'
            f'<geom name="cube" type="box" size="{half} {half} {half}" mass="{NOMINAL["mass"]}" '
            f'rgba="0.2 0.5 0.9 1" friction="{NOMINAL["friction"]} 0.005 0.0001" condim="4"/></body>')


class ArmPick(HomebotEnv):
    """One 7-DOF arm and its parallel gripper: grasp a cube on the table and lift it 8 cm."""

    variant = "arm"
    controlled = arm_joint_names(("r",), include_gripper=True)
    joint_delta = {"r_gripper": 0.004}
    episode_steps = 150
    gaps = {**GAPS, **OBJECT_GAPS}

    def _extra_world(self):
        return _cube_xml(NOMINAL["size"] / 2)

    def _tcp_names(self):
        return ["r_tcp"]

    def _hand_names(self):
        return []  # the cube is the payload

    def _home_pose(self):
        g = self.robot.arm.gripper
        return {"r_shoulder_pitch": 0.3, "r_elbow": 1.3, "r_gripper": g.stroke * 0.95,
                "r_gripper_follow": g.stroke * 0.95}

    # ------------------------------------------------------------------ setup
    def _ids(self):
        if hasattr(self, "_cube_geom"):
            return
        m = self.model
        self._cube_body = m.body("cube").id
        self._cube_geom = m.geom("cube").id
        self._cube_q = m.joint("cube").qposadr[0]
        self._pads = [m.geom(f"r_{j}_pad").id for j in ("jaw", "jaw2")]
        self._jaw_bodies = [m.body("r_jaw").id, m.body("r_jaw2").id]
        self._grip_act = m.actuator("r_gripper").id
        self._grip_max = float(m.actuator_forcerange[self._grip_act, 1])
        self._nom_obj = {"size": m.geom_size[self._cube_geom].copy(), "mass": float(m.body_mass[self._cube_body]),
                         "friction": m.geom_friction[self._cube_geom].copy(),
                         "pad_friction": m.geom_friction[self._pads].copy()}

    def _set_object(self, size: float, mass: float, friction: float, pad_scale: float):
        m = self.model
        h = size / 2
        g = self._cube_geom
        m.geom_size[g] = [h, h, h]
        m.geom_rbound[g] = h * math.sqrt(3)
        m.geom_aabb[g] = [0, 0, 0, h, h, h]
        m.body_mass[self._cube_body] = mass
        m.body_inertia[self._cube_body] = 2.0 / 3.0 * mass * h * h
        m.geom_friction[g, 0] = friction
        m.geom_friction[self._pads, 0] = self._nom_obj["pad_friction"][:, 0] * pad_scale
        self._refresh_subtree_mass()
        self.half = h

    def _randomise(self):
        super()._randomise()
        self._ids()
        rng = self._np_random
        size, mass, fric, pad, noise = NOMINAL["size"], NOMINAL["mass"], NOMINAL["friction"], 1.0, 0.0
        if self.gap is not None:
            pad = self.gap.pad_friction
            mass = self.gap.object_mass if self.gap.object_mass is not None else mass
            noise = self.gap.object_pose_noise
        elif self.randomize is not None:
            R = self.randomize
            size = rng.uniform(*R.object_size)
            mass = math.exp(rng.uniform(math.log(R.object_mass[0]), math.log(R.object_mass[1])))
            fric = rng.uniform(*R.object_friction)
            pad = math.exp(rng.uniform(math.log(R.pad_friction[0]), math.log(R.pad_friction[1])))
            noise = R.object_pose_noise
        self._set_object(size, mass, fric, pad)
        self._pose_noise = noise
        self._camera = None
        R = self.randomize
        if self.gap is not None and self.gap.camera_period > 0:
            self._camera = {"period": self.gap.camera_period, "radius": self.gap.occlusion_radius,
                            "dropout": self.gap.frame_dropout}
        elif self.gap is None and R is not None and R.camera_model:
            self._camera = {"period": int(rng.integers(R.camera_period[0], R.camera_period[1] + 1)),
                            "radius": rng.uniform(*R.occlusion_radius), "dropout": rng.uniform(*R.frame_dropout)}

    def _sample_task(self):
        rng = self._np_random
        d = self.data
        x, y = rng.uniform(*SPAWN["x"]), rng.uniform(*SPAWN["y"])
        yaw = rng.uniform(*SPAWN["yaw"])
        a = self._cube_q
        d.qpos[a:a + 3] = [x, y, TABLE_TOP + self.half]
        d.qpos[a + 3:a + 7] = [math.cos(yaw / 2), 0.0, 0.0, math.sin(yaw / 2)]
        self.rest_z = TABLE_TOP + self.half
        # the estimate of the cube pose is biased per episode (calibration error) plus jitter
        self._pose_bias = rng.normal(0.0, self._pose_noise, 3) if self._pose_noise > 0 else np.zeros(3)
        self.max_lift = 0.0
        self._cam_est, self._cam_yaw, self._cam_offset = None, 0.0, None

    # ------------------------------------------------------------------ observation
    def cube_pos(self) -> np.ndarray:
        return self.data.qpos[self._cube_q:self._cube_q + 3].copy()

    def cube_yaw(self) -> float:
        w, x, y, z = self.data.qpos[self._cube_q + 3:self._cube_q + 7]
        return math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z))

    # An external estimator (e.g. a camera, experiments/pick_camera_loop.py) can replace the
    # simulator's cube pose: a callable returning (position, yaw), called once per observation.
    cube_estimator = None

    def holding(self) -> bool:
        """What the gripper servo can tell: jaws stopped short of closed, load at the limit."""
        qa, va = self.jnt["r_gripper"][0], self.jnt["r_gripper"][1]
        load = abs(float(self.data.actuator_force[self._grip_act])) / self._grip_max
        return (float(self.data.qpos[qa]) > HOLD_OPENING and abs(float(self.data.qvel[va])) < HOLD_SPEED
                and load > HOLD_LOAD)

    def _camera_estimate(self):
        """The cube pose as a camera pipeline would deliver it (see Randomization.camera_model):
        refreshed at the camera rate unless the hand hides the cube or the frame drops out, placed
        on the table plane, and carried with the hand while the gripper holds something."""
        c, rng = self._camera, self._np_random
        Rh = self.data.xmat[self.model.body("r_hand").id].reshape(3, 3)
        tcp = self.tcp(0)
        if self._cam_est is not None and self.holding():
            if self._cam_offset is None:
                self._cam_offset = Rh.T @ (self._cam_est - tcp)
            self._cam_est = tcp + Rh @ self._cam_offset
            return self._cam_est.copy(), self._cam_yaw
        self._cam_offset = None
        cube = self.cube_pos()
        hidden = (np.hypot(*(tcp[:2] - cube[:2])) < c["radius"] and tcp[2] > cube[2]) or rng.random() < c["dropout"]
        if self._cam_est is None or (self.t % c["period"] == 0 and not hidden):
            est = cube + self._pose_bias + rng.normal(0.0, 0.3 * self._pose_noise, 3)
            est[2] = self.rest_z + self._pose_bias[2]  # the marker is located on the table plane
            self._cam_est, self._cam_yaw = est, self.cube_yaw()
        return self._cam_est.copy(), self._cam_yaw

    def _task_obs(self):
        d = self.data
        tcp = self.tcp(0)
        if self.cube_estimator is not None:
            est, yaw = self.cube_estimator()
        elif self._camera is not None:
            est, yaw = self._camera_estimate()
        else:
            est = self.cube_pos() + self._pose_bias
            if self._pose_noise > 0:
                est = est + self._np_random.normal(0.0, 0.3 * self._pose_noise, 3)
            yaw = self.cube_yaw()
        Rh = d.xmat[self.model.body("r_hand").id].reshape(3, 3)
        load = d.actuator_force[self._grip_act] / self._grip_max
        ref = np.array([0.32, -0.18, TABLE_TOP])
        return np.concatenate([est - tcp, est - ref, tcp - ref, Rh[:, 0], Rh[:, 2],
                               [math.sin(4 * yaw), math.cos(4 * yaw), load]])

    # ------------------------------------------------------------------ reward
    def _touching(self) -> tuple[bool, bool]:
        """Is each jaw (pad or finger) in contact with the cube?"""
        d, m = self.data, self.model
        hit = [False, False]
        for i in range(d.ncon):
            c = d.contact[i]
            g1, g2 = c.geom1, c.geom2
            if self._cube_geom not in (g1, g2):
                continue
            other = g2 if g1 == self._cube_geom else g1
            b = m.geom_bodyid[other]
            for k, jb in enumerate(self._jaw_bodies):
                if b == jb:
                    hit[k] = True
        return hit[0], hit[1]

    def robot_world_contacts(self) -> int:
        """Contacts between the robot and the table or floor (the cube resting on the table is
        not one)."""
        d, m = self.data, self.model
        n = 0
        for i in range(d.ncon):
            c = d.contact[i]
            b1, b2 = m.geom_bodyid[c.geom1], m.geom_bodyid[c.geom2]
            if self._cube_body in (b1, b2):
                continue
            if (b1 == 0) != (b2 == 0):
                n += 1
        return n

    def _reward(self, a):
        tcp, cube = self.tcp(0), self.cube_pos()
        dist = float(np.linalg.norm(cube - tcp))
        left, right = self._touching()
        grasped = left and right
        lift = float(cube[2] - self.rest_z)
        self.max_lift = max(self.max_lift, lift)
        success = grasped and lift >= SUCCESS_LIFT
        table = self.robot_world_contacts()
        r = 1.0 - math.tanh(10.0 * dist)
        r += 0.25 * (left + right)
        r += 2.0 * grasped * min(max(lift, 0.0) / LIFT, 1.0)
        r += 1.0 * success
        r -= 0.002 * float(np.sum(a ** 2)) + 0.02 * min(table, 5) + 0.05 * min(self.self_contacts(), 5)
        dropped = cube[2] < TABLE_TOP - 0.05 or np.hypot(cube[0] - 0.32, cube[1] + 0.18) > 0.45
        if dropped:
            r -= 5.0
        info = {"is_success": bool(success), "distance": dist, "lift": lift, "max_lift": self.max_lift,
                "grasped": bool(grasped), "dropped": bool(dropped)}
        return r, bool(dropped), info
