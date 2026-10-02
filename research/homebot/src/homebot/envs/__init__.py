"""Gymnasium environments for the homebot twin.

    import gymnasium as gym, homebot.envs
    env = gym.make("homebot/ArmReach-v0", randomize=homebot.envs.Randomization())
"""
from gymnasium.envs.registration import register

from .core import GAPS, Gap, HomebotEnv, Randomization
from .reach import ArmReach, BimanualReach, MobileReach, MobileReachRollers

ENVS = {"ArmReach": ArmReach, "BimanualReach": BimanualReach, "MobileReach": MobileReach,
        "MobileReachRollers": MobileReachRollers}

for _name, _cls in ENVS.items():
    register(id=f"homebot/{_name}-v0", entry_point=f"homebot.envs.reach:{_cls.__name__}",
             max_episode_steps=_cls.episode_steps)

__all__ = ["ENVS", "GAPS", "Gap", "HomebotEnv", "Randomization", "ArmReach", "BimanualReach", "MobileReach",
           "MobileReachRollers"]
