import numpy as np
import pytest
from gymnasium.utils.env_checker import check_env

from homebot.envs import ENVS, GAPS, Randomization
from homebot.envs.reach import support_margin_2d


@pytest.mark.parametrize("name", list(ENVS))
def test_gym_api(name):
    env = ENVS[name](randomize=Randomization(), seed=0)
    check_env(env, skip_render_check=True)


@pytest.mark.parametrize("name", list(ENVS))
def test_seeded_reset_is_deterministic(name):
    a = ENVS[name](seed=0)
    b = ENVS[name](seed=0)
    oa, _ = a.reset(seed=5)
    ob, _ = b.reset(seed=5)
    assert np.allclose(oa, ob)
    for _ in range(5):
        act = np.full(a.action_space.shape, 0.3, np.float32)
        oa, ra, *_ = a.step(act)
        ob, rb, *_ = b.step(act)
    assert np.allclose(oa, ob) and ra == rb


def test_randomization_changes_the_twin():
    env = ENVS["ArmReach"](randomize=Randomization(), seed=0)
    kp = []
    for s in range(5):
        env.reset(seed=s)
        kp.append(env.model.actuator_gainprm[env.ctrl_idx[0], 0])
    assert np.std(kp) > 0


def test_gap_latency_delays_actions():
    env = ENVS["ArmReach"](gap="latency_120ms", seed=0)
    env.reset(seed=0)
    t0 = env.target.copy()
    env.step(np.ones(env.action_space.shape))
    assert np.allclose(env.target, t0)  # still the delayed zero action
    assert GAPS["latency_120ms"].latency == 3


def test_targets_are_reachable_and_off_the_table():
    env = ENVS["ArmReach"](seed=0)
    for s in range(20):
        env.reset(seed=s)
        g = env.goals[0]
        assert np.linalg.norm(g - env.data.body("r_shoulder").xpos) < 0.55
        assert not (0.10 < g[0] < 0.74 and abs(g[1]) < 0.47 and g[2] < 0.79)


def test_support_margin_triangle():
    R, ang = 0.2, (0.0, 2 * np.pi / 3, 4 * np.pi / 3)
    assert support_margin_2d(np.zeros(2), R, ang) == pytest.approx(R / 2)
    assert support_margin_2d(np.array([-0.15, 0.0]), R, ang) < 0
    assert support_margin_2d(np.array([0.19, 0.0]), R, ang) > 0


def test_base_acceleration_is_ramped():
    env = ENVS["MobileReach"](seed=0)
    env.reset(seed=0)
    a = np.zeros(env.action_space.shape)
    a[-3] = 1.0
    env.step(a)
    assert env.base_cmd[0] == pytest.approx(env.robot.base.max_accel * env.dt)


def test_mass_randomisation_keeps_com_consistent():
    """Scaled masses must not corrupt subtree_com (MuJoCo caches subtree masses)."""
    import mujoco

    env = ENVS["MobileReach"](gap="heavy", seed=0)
    env.reset(seed=1)
    m, d = env.model, env.data
    d.qpos[env.jnt["base_x"][0]] = 1.5  # far from the origin, where a stale scale shows most
    mujoco.mj_forward(m, d)
    base = m.body("base").id
    ids = [i for i in range(m.nbody) if i == base or any(
        p == base for p in _ancestors(m, i))]
    M = sum(m.body_mass[i] for i in ids)
    com = sum(m.body_mass[i] * d.xipos[i] for i in ids) / M
    assert np.allclose(d.subtree_com[base], com, atol=1e-9)
    assert m.body_subtreemass[base] == pytest.approx(M)


def _ancestors(m, i):
    while i:
        i = m.body_parentid[i]
        yield i
