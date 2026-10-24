"""Open the twin in MuJoCo's interactive viewer (printed-part meshes, home pose).

    PYTHONPATH=src python experiments/view.py [arm|torso|mobile] [--rollers]

Use the viewer's Control panel sliders to move the servos (targets in rad, lift in m).
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import mujoco  # noqa: E402
import mujoco.viewer  # noqa: E402

from homebot.mjcf import build_xml  # noqa: E402

variant = next((a for a in sys.argv[1:] if not a.startswith("-")), "mobile")
m = mujoco.MjModel.from_xml_string(build_xml(variant=variant, meshes=True,
                                             base_mode="free" if "--rollers" in sys.argv else "planar"))
d = mujoco.MjData(m)
mujoco.mj_resetDataKeyframe(m, d, 0)
mujoco.viewer.launch(m, d)
