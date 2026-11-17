"""Robots in the corridor twin (milestone 5): four passing-side policies and the human-cost measures.

A robot is an agent of the same operational model as the people (same body radius, the proposal's
choice), with a desired speed capped at ROBOT_SPEED and no human side bias: its steering target
comes from one of four policies instead.

- "crowd": hold the crowd's side, a lane a quarter of the width from the wall on its own right.
- "opposite": hold the other side, a quarter of the width from the wall on its own left.
- "adapt": follow the local majority, aim at the mean lateral position of the people walking its
  way within ADAPT_RANGE ahead or behind; keep its current line when there are none.
- "goal": a lateral goal, an exit at the far end a quarter of the width from a wall, drawn 50/50
  per entry, approached as the goal-driven people of milestones 3 and 4 approach theirs.

Human cost, measured inside the middle 8 m (sftwin.SECTION_HALF): a *pass* is a robot and a person
walking opposite ways whose along-corridor order flips while the robot is in the section; its
*clearance* is the smallest centre distance while they were within PASS_WINDOW of each other, less
two body radii, and a pass is *close* when the clearance is under CLOSE_GAP (the proposal's 0.5 m).
The same tracker counts person-person passes, the reference rate of a crowd with no robots.

Pure numpy; sftwin.simulate calls these when robots > 0.
"""
from __future__ import annotations

import numpy as np

# MiR250 (Mobile Industrial Robots) manual, "Payload distribution": the robot is rated in two
# speed configurations, 1.2 m/s and 2.0 m/s, no incline. 1.2 m/s, the lower, is used as the
# corridor cap; it is below the people's mean desired speed (1.34 m/s, Weidmann 1993).
ROBOT_SPEED = 1.2      # m/s
POLICIES = ("crowd", "opposite", "adapt", "goal")
LANE_FRAC = 0.25       # lane line for "crowd" and "opposite", fraction of the width from a wall
GOAL_FRAC = 0.25       # exit for "goal", as the assigned exits of milestones 4a to 4d
ADAPT_RANGE = 4.0      # m, ahead or behind, for "adapt"
TARGET_AHEAD = 2.0     # m, as sftwin.TARGET_AHEAD
PASS_WINDOW = 2.0      # m, along the corridor
CLOSE_GAP = 0.5        # m, surface to surface
# Milestone 6f: the two ways a robot differs from a person, each switchable. HUMAN as the policy keeps
# the people's steering rule (sftwin.steer_targets, side bias included) for the robots; PEOPLE_SPEED as
# robot_speed draws each robot entry's desired speed as a person's (sftwin.desired_speeds).
HUMAN = "human"
PEOPLE_SPEED = "people"


def lane_y(d, width, side):
    """Lateral line a quarter-width from the wall on the robot's right (side=+1) or left (-1).

    Heading +x the right is small y (sftwin.right_offset)."""
    right_wall_near = np.where(d > 0, LANE_FRAC * width, (1 - LANE_FRAC) * width)
    return right_wall_near if side > 0 else width - right_wall_near


def robot_targets(pos, dirs, goal_y, is_robot, policy, width, length, radius):
    """Steering targets (tx, ty) for the robots among the agents (rows where is_robot).

    pos: (n, 2) all agents; dirs: (n,); goal_y: (n,) a robot's exit for policy "goal" (nan else).
    Returns arrays over the robot rows only, in their order.
    """
    if isinstance(policy, LearnedLateral):
        return policy.targets(pos, dirs, is_robot, width, length, radius)
    if policy not in POLICIES:
        raise ValueError(f"policy must be one of {POLICIES}")
    r = np.nonzero(is_robot)[0]
    x, y, d = pos[r, 0], pos[r, 1], dirs[r]
    tx = x + d * TARGET_AHEAD
    if policy == "crowd":
        ty = lane_y(d, width, +1)
    elif policy == "opposite":
        ty = lane_y(d, width, -1)
    elif policy == "adapt":
        ty = y.copy()
        hum = ~is_robot
        for k, i in enumerate(r):
            m = hum & (dirs == dirs[i]) & (np.abs(pos[:, 0] - pos[i, 0]) <= ADAPT_RANGE)
            if m.any():
                ty[k] = pos[m, 1].mean()
    else:
        end = np.where(d > 0, length, 0.0)
        dist = np.maximum((end - x) * d, TARGET_AHEAD)
        ty = y + (goal_y[r] - y) * TARGET_AHEAD / dist
    tx = np.clip(tx, -1.4, length + 1.4)
    ty = np.clip(ty, radius + 0.05, width - radius - 0.05)
    return tx, ty


class LearnedLateral:
    """A parametric lateral-target policy, trained per crowd family in milestone 6b.

    Features per robot, in half-widths toward the robot's own right (sftwin.right_offset; +1 is the
    right wall, 0 the centre line): its own offset u; m_same, the mean offset of people walking its
    way within ADAPT_RANGE ahead or behind (u when there are none); m_opp, the mean offset (in the
    robot's frame) of oncoming people within ADAPT_RANGE ahead (0 when none); f_opp, their count / 4.
    The target offset is OFFSET_MAX * tanh(theta . [1, m_same, m_opp, f_opp, u]); the steering
    target sits TARGET_AHEAD ahead at that offset. The family contains "crowd" (theta = [atanh(0.5 /
    OFFSET_MAX), 0, 0, 0, 0], a quarter-width from the right wall), "opposite" (minus that) and a
    smooth version of "adapt" (weight on m_same), so training can recover any of them.
    """
    OFFSET_MAX = 0.9
    N_PARAMS = 5

    def __init__(self, theta):
        self.theta = np.asarray(theta, dtype=float)
        if self.theta.shape != (self.N_PARAMS,):
            raise ValueError(f"theta needs {self.N_PARAMS} values")

    @classmethod
    def crowd(cls):
        return cls([np.arctanh(2 * LANE_FRAC / cls.OFFSET_MAX), 0, 0, 0, 0])

    def features(self, pos, dirs, is_robot, width):
        half = width / 2.0
        off = -dirs * (pos[:, 1] - half) / half          # each agent's offset toward its own right
        r = np.nonzero(is_robot)[0]
        hum = ~is_robot
        out = np.zeros((len(r), self.N_PARAMS))
        for k, i in enumerate(r):
            d = dirs[i]
            u = off[i]
            dx = (pos[:, 0] - pos[i, 0]) * d              # ahead > 0
            same = hum & (dirs == d) & (np.abs(dx) <= ADAPT_RANGE)
            opp = hum & (dirs != d) & (dx > 0) & (dx <= ADAPT_RANGE)
            m_same = off[same].mean() if same.any() else u
            m_opp = -off[opp].mean() if opp.any() else 0.0   # their offset, seen in the robot's frame
            out[k] = (1.0, m_same, m_opp, opp.sum() / 4.0, u)
        return r, out

    def targets(self, pos, dirs, is_robot, width, length, radius):
        r, f = self.features(pos, dirs, is_robot, width)
        u_star = self.OFFSET_MAX * np.tanh(f @ self.theta)
        d = dirs[r]
        half = width / 2.0
        tx = np.clip(pos[r, 0] + d * TARGET_AHEAD, -1.4, length + 1.4)
        ty = np.clip(half - d * u_star * half, radius + 0.05, width - radius - 0.05)
        return tx, ty


def robot_goal(rng, width):
    return width * (GOAL_FRAC if rng.random() < 0.5 else 1.0 - GOAL_FRAC)


class PassTracker:
    """Counts opposite-direction passes and their clearance, robot-person and person-person."""

    def __init__(self, lo_x, hi_x, radius):
        self.lo_x, self.hi_x, self.radius = lo_x, hi_x, radius
        self.state = {}            # (a, b) -> [ahead distance last frame, min centre distance]
        self.rp, self.pp = [], []  # clearances of completed passes

    def update(self, ids, pos, dirs, is_robot):
        """ids: agent ids; pos (n, 2); dirs (n,); is_robot (n,) bool. Call once per record frame."""
        n = len(ids)
        if n < 2:
            return
        dx = pos[:, 0][None, :] - pos[:, 0][:, None]        # x_j - x_i
        dist = np.hypot(dx, pos[:, 1][None, :] - pos[:, 1][:, None])
        opp = (dirs[:, None] > 0) & (dirs[None, :] < 0)     # i heading +x, j heading -x: each pair once
        near = opp & (np.abs(dx) <= PASS_WINDOW)
        seen = set()
        for i, j in zip(*np.nonzero(near)):
            key = (ids[i], ids[j])
            seen.add(key)
            ahead = dx[i, j]                                 # j ahead of i while > 0
            st = self.state.get(key)
            if st is None:
                self.state[key] = [ahead, dist[i, j]]
                continue
            st[1] = min(st[1], dist[i, j])
            if st[0] > 0 >= ahead:
                rx = pos[i, 0] if is_robot[i] else pos[j, 0]
                if self.lo_x <= rx <= self.hi_x and not (is_robot[i] and is_robot[j]):
                    gap = st[1] - 2 * self.radius
                    (self.rp if (is_robot[i] or is_robot[j]) else self.pp).append(gap)
                st[1] = dist[i, j]
            st[0] = ahead
        for key in [k for k in self.state if k not in seen]:
            del self.state[key]

    def summary(self):
        def rate(v):
            return sum(g < CLOSE_GAP for g in v) / len(v) if v else float("nan")
        return dict(rp_passes=len(self.rp), rp_close=rate(self.rp),
                    rp_gap=float(np.median(self.rp)) if self.rp else float("nan"),
                    pp_passes=len(self.pp), pp_close=rate(self.pp))
