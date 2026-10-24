"""Shared machinery of the homebot Gymnasium environments.

Control runs at ``control_hz`` (25 Hz by default, about what a 1 Mbps bus sustains for a
sync-write plus a sync-read of ~20 servos), physics at 500 Hz. Policies command joint
*targets* through the servo model of ``homebot.servo``, exactly what the real driver sends
(goal positions), so the same action interface runs on hardware.

Domain randomisation (``Randomization``) perturbs the twin per episode: servo gain, back-EMF
damping, Coulomb friction, reflected inertia, link masses, a payload in the hand, action
latency and encoder noise. ``GAPS`` lists fixed perturbations used to stress-test policies
("is the twin wrong in a way that matters?").
"""
from __future__ import annotations

import math
from collections import deque
from dataclasses import dataclass

import gymnasium as gym
import mujoco
import numpy as np

from ..mjcf import build_xml
from ..params import ARM_JOINTS, DEFAULT, Robot


@dataclass(frozen=True)
class Randomization:
    """Per-episode multiplicative ranges (log-uniform) and additive ranges (uniform)."""

    kp: tuple[float, float] = (0.6, 1.6)
    damping: tuple[float, float] = (0.75, 1.3)
    friction: tuple[float, float] = (0.4, 2.5)
    armature: tuple[float, float] = (0.6, 1.6)
    mass: tuple[float, float] = (0.85, 1.2)
    payload: tuple[float, float] = (0.0, 0.15)  # kg added at each tool centre point
    latency: tuple[int, int] = (0, 2)  # control steps of action delay
    obs_noise: float = 0.003  # rad at the servo output shaft (plus 1-tick quantisation)
    gravity_tilt: float = 0.0  # rad, floor tilt (mobile)
    # object tasks (ArmPick)
    object_size: tuple[float, float] = (0.030, 0.050)  # m, cube edge
    object_mass: tuple[float, float] = (0.03, 0.20)  # kg
    object_friction: tuple[float, float] = (0.3, 0.8)
    pad_friction: tuple[float, float] = (0.65, 1.25)  # multiplies the TPU pad estimate
    object_pose_noise: float = 0.005  # m, error of the object position estimate (camera/fiducial)
    # camera observation model (off by default; ArmPick only): the object estimate refreshes every
    # 1-5 control steps, is held while the hand is over the object or a frame drops out, sits on
    # the table plane, and follows the hand once the gripper servo reports a hold
    camera_model: bool = False
    camera_period: tuple[int, int] = (1, 5)  # control steps between camera frames
    occlusion_radius: tuple[float, float] = (0.06, 0.15)  # m, hand-to-object horizontal distance
    frame_dropout: tuple[float, float] = (0.0, 0.5)  # probability that a frame finds no marker


@dataclass(frozen=True)
class Gap:
    """A fixed perturbation of the twin (one 'real robot')."""

    kp: float = 1.0
    damping: float = 1.0
    friction: float = 1.0
    armature: float = 1.0
    mass: float = 1.0
    payload: float = 0.0
    latency: int = 0
    obs_noise: float = 0.0
    # object tasks
    pad_friction: float = 1.0
    object_mass: float | None = None  # kg; None = the task's nominal object
    object_pose_noise: float = 0.0
    camera_period: int = 0  # >0: the camera observation model, one frame per this many steps
    occlusion_radius: float = 0.10
    frame_dropout: float = 0.0


GAPS = {
    "nominal": Gap(),
    "soft_servo": Gap(kp=0.5),
    "stiff_servo": Gap(kp=2.0),
    "sticky": Gap(friction=3.0),
    "heavy": Gap(mass=1.25, payload=0.2),
    "latency_40ms": Gap(latency=1),
    "latency_80ms": Gap(latency=2),
    "latency_120ms": Gap(latency=3),  # outside the randomised range (0-2 control steps)
    "noisy": Gap(obs_noise=0.01),
    "combined": Gap(kp=0.6, friction=2.0, mass=1.15, payload=0.1, latency=2, obs_noise=0.005),
}

# Extra perturbations for tasks that hold an object (the reach gaps above, plus these).
OBJECT_GAPS = {
    "slippery_pads": Gap(pad_friction=0.55),  # worn or dusty TPU, a glossy object
    "heavy_object": Gap(object_mass=0.30),  # outside the randomised range (30-200 g)
    "pose_error_10mm": Gap(object_pose_noise=0.010),  # outside the randomised 5 mm
    # the object pose from a head camera at 5 Hz, held while the hand hides the object
    # (Randomization.camera_model; compare experiments/pick_camera_loop.py, which renders it)
    "camera_5hz": Gap(object_pose_noise=0.004, camera_period=5, occlusion_radius=0.10),
}


class HomebotEnv(gym.Env):
    """Base class: builds the model, maps actions to servo targets, applies randomisation.

    Subclasses define ``controlled`` (joint names the policy moves), ``_sample_task``,
    ``_task_obs``, ``_reward`` and optionally ``_extra_world``.
    """

    metadata = {"render_modes": ["rgb_array"], "render_fps": 25}

    variant = "arm"
    base_mode = "planar"
    controlled: tuple[str, ...] = ()
    episode_steps = 100
    max_delta = 0.08  # rad per control step at |a| = 1 (2 rad/s at 25 Hz)
    joint_delta: dict[str, float] = {}  # per-joint step (e.g. metres for a gripper), default max_delta
    base_action = False  # last three action dims command the base twist (vx, vy, wz), body frame
    default_timestep = 0.002

    def __init__(self, robot: Robot = DEFAULT, control_hz: float = 25.0, timestep: float | None = None,
                 randomize: Randomization | None = None, gap: Gap | str | None = None,
                 render_mode: str | None = None, seed: int | None = None):
        self.robot = robot
        self.render_mode = render_mode
        self.randomize = randomize
        self.gap = GAPS[gap] if isinstance(gap, str) else gap
        timestep = timestep or self.default_timestep
        xml = build_xml(robot, self.variant, self.base_mode, meshes=False, timestep=timestep,
                        extra_world=self._extra_world())
        self.model = mujoco.MjModel.from_xml_string(xml)
        self.data = mujoco.MjData(self.model)
        self.n_sub = max(1, int(round(1.0 / (control_hz * timestep))))
        self.dt = self.n_sub * timestep
        m = self.model
        # nominal copies for randomisation
        self._nom = {
            "gain": m.actuator_gainprm.copy(), "bias": m.actuator_biasprm.copy(),
            "damping": m.dof_damping.copy(), "friction": m.dof_frictionloss.copy(),
            "armature": m.dof_armature.copy(), "mass": m.body_mass.copy(), "inertia": m.body_inertia.copy(),
        }
        self.act_id = {m.actuator(i).name: i for i in range(m.nu)}
        self.jnt = {}
        for i in range(m.njnt):
            n = m.joint(i).name
            self.jnt[n] = (m.jnt_qposadr[i], m.jnt_dofadr[i], m.jnt_range[i].copy())
        self.ctrl_names = [n for n in self.controlled if n in self.act_id and not n.startswith("base_")]
        self.ctrl_idx = np.array([self.act_id[n] for n in self.ctrl_names], int)
        self.ctrl_q = np.array([self.jnt[n][0] for n in self.ctrl_names], int)
        self.ctrl_v = np.array([self.jnt[n][1] for n in self.ctrl_names], int)
        self.ctrl_lo = np.array([self.jnt[n][2][0] for n in self.ctrl_names])
        self.ctrl_hi = np.array([self.jnt[n][2][1] for n in self.ctrl_names])
        from ..hardware.robot import joint_ratio

        # per joint: step size of a full action, how far the target may lead the joint, and the
        # encoder resolution in joint units
        self.ctrl_delta = np.array([self.joint_delta.get(n, self.max_delta) for n in self.ctrl_names])
        self.ctrl_window = 5.0 * self.ctrl_delta
        self.ctrl_ratio = np.array([joint_ratio(robot, n) for n in self.ctrl_names])
        self.ctrl_res = robot.servo.tick / self.ctrl_ratio
        self.tcp_sites = [m.site(s).id for s in self._tcp_names() if mujoco.mj_name2id(m, mujoco.mjtObj.mjOBJ_SITE, s) >= 0]
        self.hand_bodies = [m.body(b).id for b in self._hand_names() if mujoco.mj_name2id(m, mujoco.mjtObj.mjOBJ_BODY, b) >= 0]
        self.n_base = 3 if self.base_action else 0
        self.n_act = len(self.ctrl_names) + self.n_base
        self.action_space = gym.spaces.Box(-1.0, 1.0, (self.n_act,), np.float32)
        if self.base_action and self.base_mode == "free":
            self.wheel_ids = np.array([self.act_id[f"wheel_{i}"] for i in range(3)])
        self._np_random, _ = gym.utils.seeding.np_random(seed)
        self._latency = 0
        self._obs_noise = 0.0
        self._queue: deque = deque()
        self.home = self._home_pose()
        self.reset(seed=seed)
        obs = self._obs()
        self.observation_space = gym.spaces.Box(-np.inf, np.inf, obs.shape, np.float32)
        self._renderer = None

    # ----------------------------------------------------------------------------- hooks
    def _extra_world(self) -> str:
        return ""

    def _tcp_names(self):
        return ["r_tcp", "l_tcp"]

    def _hand_names(self):
        return ["r_hand", "l_hand"]

    def _home_pose(self) -> dict[str, float]:
        return {}

    def _sample_task(self):
        raise NotImplementedError

    def _task_obs(self) -> np.ndarray:
        raise NotImplementedError

    def _reward(self, action) -> tuple[float, bool, dict]:
        raise NotImplementedError

    # ----------------------------------------------------------------------------- dynamics
    def _apply_params(self, kp=1.0, damping=1.0, friction=1.0, armature=1.0, mass=1.0, payload=0.0,
                      per_dof: np.ndarray | None = None):
        m, nom = self.model, self._nom
        m.actuator_gainprm[:] = nom["gain"]
        m.actuator_biasprm[:] = nom["bias"]
        for i in range(m.nu):
            if m.actuator_biastype[i] == mujoco.mjtBias.mjBIAS_AFFINE and m.actuator_gaintype[i] == mujoco.mjtGain.mjGAIN_FIXED \
                    and nom["bias"][i, 1] != 0:  # position actuators: gain kp, bias -kp*q
                m.actuator_gainprm[i, 0] = nom["gain"][i, 0] * kp
                m.actuator_biasprm[i, 1] = nom["bias"][i, 1] * kp
        scale = np.ones(m.nv) if per_dof is None else per_dof
        drv = nom["damping"] > 0
        m.dof_damping[:] = nom["damping"] * np.where(drv, damping * scale, 1.0)
        m.dof_frictionloss[:] = nom["friction"] * friction
        m.dof_armature[:] = nom["armature"] * armature
        m.body_mass[:] = nom["mass"] * mass
        m.body_inertia[:] = nom["inertia"] * mass
        for b in self.hand_bodies:
            m.body_mass[b] += payload
            m.body_inertia[b] += payload * 0.03 ** 2
        self._refresh_subtree_mass()

    def _refresh_subtree_mass(self):
        # MuJoCo precomputes subtree masses at compile time and divides by them in
        # mj_comPos, so after changing body_mass they must be refreshed or every
        # subtree_com (and the tip-over check built on it) is scaled by the mass change.
        m = self.model
        sub = m.body_mass.copy()
        for i in range(m.nbody - 1, 0, -1):
            sub[m.body_parentid[i]] += sub[i]
        m.body_subtreemass[:] = sub

    def _randomise(self):
        rng = self._np_random
        if self.gap is not None:
            g = self.gap
            self._apply_params(g.kp, g.damping, g.friction, g.armature, g.mass, g.payload)
            self._latency, self._obs_noise = g.latency, g.obs_noise
            return
        if self.randomize is None:
            self._apply_params()
            self._latency, self._obs_noise = 0, 0.0
            return
        R = self.randomize

        def lu(lo_hi):
            lo, hi = lo_hi
            return float(math.exp(rng.uniform(math.log(lo), math.log(hi))))

        per_dof = np.exp(rng.normal(0.0, 0.1, self.model.nv))  # unit-to-unit servo spread
        self._apply_params(lu(R.kp), lu(R.damping), lu(R.friction), lu(R.armature), lu(R.mass),
                           float(rng.uniform(*R.payload)), per_dof)
        self._latency = int(rng.integers(R.latency[0], R.latency[1] + 1))
        self._obs_noise = R.obs_noise

    # ----------------------------------------------------------------------------- gym API
    def reset(self, *, seed=None, options=None):
        if seed is not None:
            self._np_random, _ = gym.utils.seeding.np_random(seed)
        m, d = self.model, self.data
        mujoco.mj_resetData(m, d)
        self._randomise()
        for n, v in self.home.items():
            if n in self.jnt:
                d.qpos[self.jnt[n][0]] = v
        d.ctrl[:] = 0.0
        for n, i in self.act_id.items():
            if n in self.jnt and m.actuator_biastype[i] == mujoco.mjtBias.mjBIAS_AFFINE and self._nom["bias"][i, 1] != 0:
                d.ctrl[i] = d.qpos[self.jnt[n][0]]
        self._sample_task()
        mujoco.mj_forward(m, d)
        self.target = d.ctrl[self.ctrl_idx].copy()
        self.prev_action = np.zeros(self.n_act)
        self.base_cmd = np.zeros(3)
        self._queue = deque([np.zeros(self.n_act)] * self._latency)
        self.t = 0
        return self._obs(), {}

    def _joint_obs(self):
        d = self.data
        q = d.qpos[self.ctrl_q].copy()
        if self._obs_noise > 0:  # encoder-level noise, reduced by any gearing to the joint
            q += self._np_random.normal(0, 1.0, q.shape) * self._obs_noise / self.ctrl_ratio
        q = np.round(q / self.ctrl_res) * self.ctrl_res
        v = d.qvel[self.ctrl_v]
        return q, v

    def _obs(self):
        q, v = self._joint_obs()
        mid = (self.ctrl_lo + self.ctrl_hi) / 2
        half = np.maximum((self.ctrl_hi - self.ctrl_lo) / 2, 1e-3)
        qn = np.where(np.isfinite(mid), (q - mid) / half, 0.0)
        return np.concatenate([qn, 0.1 * v, self.prev_action, self._task_obs()]).astype(np.float32)

    def _apply_action(self, a):
        """Delta-position targets for joint servos; body-frame twist for the base."""
        d = self.data
        n = len(self.ctrl_names)
        if n:
            self.target = self.joint_targets(self.target, d.qpos[self.ctrl_q], a[:n])
            d.ctrl[self.ctrl_idx] = self.target
        if self.n_base:
            b = self.robot.base
            want = np.array([a[-3] * b.max_speed, a[-2] * b.max_speed, a[-1] * b.max_yaw_rate])
            step = np.array([b.max_accel, b.max_accel, b.max_yaw_accel]) * self.dt
            self.base_cmd = self.base_cmd + np.clip(want - self.base_cmd, -step, step)
            vx, vy, wz = self.base_cmd
            if self.base_mode == "planar":
                yaw = self.base_pose()[2]
                c, s = math.cos(yaw), math.sin(yaw)
                d.ctrl[self.act_id["base_x"]] = c * vx - s * vy
                d.ctrl[self.act_id["base_y"]] = s * vx + c * vy
                d.ctrl[self.act_id["base_yaw"]] = wz
            else:
                from ..hardware.robot import kiwi_wheel_speeds

                d.ctrl[self.wheel_ids] = kiwi_wheel_speeds(self.robot, vx, vy, wz)

    def joint_targets(self, target, q, a) -> np.ndarray:
        """Servo targets from the joint part of an action (the same rule runs on hardware,
        ``homebot.hardware.robot.policy_loop``): increments of ``ctrl_delta`` that may lead the
        measured position by at most ``ctrl_window``, inside the joint range."""
        tgt = np.asarray(target, float) + np.asarray(a, float) * self.ctrl_delta
        tgt = np.clip(tgt, q - self.ctrl_window, q + self.ctrl_window)
        return np.clip(tgt, self.ctrl_lo, self.ctrl_hi)

    def base_pose(self) -> np.ndarray:
        """(x, y, yaw) of the base in the world."""
        d = self.data
        if self.base_mode == "planar":
            return np.array([d.qpos[self.jnt[n][0]] for n in ("base_x", "base_y", "base_yaw")])
        a = self.jnt["base_free"][0]
        w, x, y, z = d.qpos[a + 3:a + 7]
        return np.array([d.qpos[a], d.qpos[a + 1], math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z))])

    def base_velocity(self) -> np.ndarray:
        """(vx, vy, wz): world-frame linear velocity and yaw rate of the base."""
        d = self.data
        if self.base_mode == "planar":
            return np.array([d.qvel[self.jnt[n][1]] for n in ("base_x", "base_y", "base_yaw")])
        v = self.jnt["base_free"][1]
        return np.array([d.qvel[v], d.qvel[v + 1], d.qvel[v + 5]])

    def base_tilt(self) -> float:
        if self.base_mode == "planar":
            return 0.0
        a = self.jnt["base_free"][0]
        return 2 * math.asin(min(1.0, float(np.linalg.norm(self.data.qpos[a + 4:a + 6]))))

    def step(self, action):
        a = np.clip(np.asarray(action, float), -1.0, 1.0)
        self._queue.append(a)
        a_now = self._queue.popleft()
        self._apply_action(a_now)
        mujoco.mj_step(self.model, self.data, self.n_sub)
        self.t += 1
        reward, terminated, info = self._reward(a)
        self.prev_action = a
        truncated = self.t >= self.episode_steps
        return self._obs(), float(reward), bool(terminated), bool(truncated), info

    def render(self):
        from ..render import snapshot

        return snapshot(self.model, self.data, 480, 480, 150, -20, distance=1.4)

    # ----------------------------------------------------------------------------- helpers
    def tcp(self, i=0) -> np.ndarray:
        return self.data.site_xpos[self.tcp_sites[i]].copy()

    def self_contacts(self) -> int:
        """Number of contacts between robot bodies (not with world geoms)."""
        d, m = self.data, self.model
        n = 0
        for i in range(d.ncon):
            c = d.contact[i]
            b1, b2 = m.geom_bodyid[c.geom1], m.geom_bodyid[c.geom2]
            if b1 != 0 and b2 != 0 and m.body_rootid[b1] == m.body_rootid[b2]:
                n += 1
        return n

    def world_contacts(self) -> int:
        """Contacts between the robot and world geoms (floor, table), wheel rollers excepted."""
        d, m = self.data, self.model
        if not hasattr(self, "_roller_bodies"):
            self._roller_bodies = {i for i in range(m.nbody) if "_roller_" in m.body(i).name}
        n = 0
        for i in range(d.ncon):
            c = d.contact[i]
            b1, b2 = m.geom_bodyid[c.geom1], m.geom_bodyid[c.geom2]
            if (b1 == 0) != (b2 == 0) and b1 not in self._roller_bodies and b2 not in self._roller_bodies:
                n += 1
        return n


def arm_joint_names(sides=("r",), include_gripper=False) -> tuple[str, ...]:
    js = ARM_JOINTS if include_gripper else ARM_JOINTS[:-1]
    return tuple(f"{s}_{j}" for s in sides for j in js)
