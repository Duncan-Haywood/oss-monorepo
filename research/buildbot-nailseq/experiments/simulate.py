"""Fire the G1 hold model of buildbot-recoil at several recoil impulses, loop settings and hold heights,
and save each shot's tip offset (relative to the no-shot run) and wall force. Needs MuJoCo and network (Menagerie clone).
`python3 experiments/simulate.py` writes traces.npz (1 ms samples) and traces.json (the keys' meaning)."""
import json
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
for rel in ("../src", "../../buildbot-payload/src", "../../buildbot-fasten/src", "../../buildbot-recoil/src"):
    sys.path.insert(0, str(HERE / rel))

from buildbot_payload import model as P
from buildbot_recoil import model as R

IMPULSE = [0.25, 0.5, 1.0, 2.0, 4.0]          # N s, swept (buildbot-recoil: no source found)
LOOPS = [(4, 0.01), (8, 0.01), (8, 0.0)]      # (bandwidth Hz, delay s), swept
HEIGHTS = [0.8, 1.0, 1.2]                     # hand height above the ground (m); forward reach 0.35 m
T_END = 1.5


def main():
    robot = P.load("g1")
    arrays, meta = {}, []
    for h in HEIGHTS:
        try:
            s = R.setup(robot, hand_xz=(0.35, h), force=30.0)
        except ValueError as e:
            meta.append({"height": h, "feasible": False, "why": str(e)})
            continue
        meta.append({"height": h, "feasible": True})
        for f, dl in LOOPS:
            base = R.fire(s, robot, 0.0, f, delay=dl, t_end=T_END)
            stable = bool(abs(base[-600:, 1:4]).max() < 2e-3)
            meta.append({"height": h, "f": f, "delay": dl, "stable": stable})
            for J in IMPULSE:
                o = R.fire(s, robot, J, f, delay=dl, t_end=T_END)
                d = (o[:, 1:4] - base[:, 1:4])[::2]      # 1 ms samples
                key = f"h{h}_f{f}_d{int(dl*1e3)}_J{J}"
                arrays[key] = np.column_stack([o[::2, 0], d, o[::2, 4]]).astype(np.float32)   # t, dx, dy, dz, wall
    np.savez_compressed(HERE / "traces.npz", **arrays)
    (HERE / "traces.json").write_text(json.dumps({"columns": ["t_s", "dx_m", "dy_m", "dz_m", "wall_N"], "runs": meta}, indent=1))
    print(len(arrays), "traces")


if __name__ == "__main__":
    main()
