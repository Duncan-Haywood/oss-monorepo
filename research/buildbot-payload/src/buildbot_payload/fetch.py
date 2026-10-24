"""Fetch the Unitree models from MuJoCo Menagerie at a pinned commit.

The models are BSD-3-Clause (Unitree Robotics) and are not copied into this
repository; they are cloned into a cache directory on first use.
"""
import os
import subprocess
from pathlib import Path

MENAGERIE = "https://github.com/google-deepmind/mujoco_menagerie"
COMMIT = "cda5236f98383f6fbaa4820c6b18dba892cd087f"  # main on 2026-10-21
ROBOTS = {"g1": "unitree_g1/g1.xml", "h1": "unitree_h1/h1.xml"}


def cache_dir():
    return Path(os.environ.get("BUILDBOT_MENAGERIE",
                               Path.home() / ".cache" / "buildbot" / "menagerie"))


def model_path(robot):
    """Path to the robot's MJCF, cloning Menagerie (sparse, pinned) if needed."""
    root = cache_dir()
    path = root / ROBOTS[robot]
    if path.exists():
        return path
    root.parent.mkdir(parents=True, exist_ok=True)
    if not (root / ".git").exists():
        subprocess.run(["git", "clone", "-q", "--filter=blob:none", "--sparse", "--no-checkout",
                        MENAGERIE, str(root)], check=True)
    subprocess.run(["git", "-C", str(root), "sparse-checkout", "set",
                    *sorted({p.split("/")[0] for p in ROBOTS.values()})], check=True)
    subprocess.run(["git", "-C", str(root), "checkout", "-q", COMMIT], check=True)
    return path


def available(robot):
    try:
        return model_path(robot).exists()
    except (OSError, subprocess.CalledProcessError):
        return False
