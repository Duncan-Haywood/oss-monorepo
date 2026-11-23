"""Milestone 7ak, post hoc (written after DK0-DK7 were scored): why do the yaw steps kill bolted-on flights at 20 deg?
Two probes on the `full` and `quiet+Y` arms: mixer_ideal=True (the clipped torque request is delivered with no polytope
scaling, so yaw cannot take roll/pitch authority), and yaw steps of 10 deg instead of 30 deg. Writes posthoc.json."""
import json, os, sys
from multiprocessing import Pool
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import run as R  # noqa: E402


def fly(arg):
    arm, probe = arg
    P = R.P
    if probe == "yaw10":
        P.YAW_REF_DEG = 10.0
    if probe == "ideal":
        orig = P.rollout
        P.rollout = lambda *a, **k: orig(*a, mixer_ideal=True, **k)
    return dict(arm=arm, probe=probe, dead=int(np.array(R.fly((arm, "bolted"))["dead"]).sum()))


if __name__ == "__main__":
    with Pool(4) as p:
        out = p.map(fly, [(a, pr) for a in ("full", "quiet+Y") for pr in ("ideal", "yaw10")], chunksize=1)
    json.dump(out, open(os.path.join(HERE, "posthoc.json"), "w"), indent=1)
    for o in out:
        print(o)
