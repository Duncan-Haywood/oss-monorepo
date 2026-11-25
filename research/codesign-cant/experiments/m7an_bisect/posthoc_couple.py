"""Milestone 7an post hoc (written after RC0-RC6 were scored): is the x/y asymmetry of the critical radius the cant's side force?
The same bisection in quiet+O at 0, 45, 90 and 135 deg with the side force switched off (couple=False, an ablation the real
vehicle cannot make). Writes posthoc_couple.json."""
import json, os, sys
from multiprocessing import Pool
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import run as R  # noqa: E402

_setup = R.setup


def setup_nocouple():
    ds, g, c, D, sz = _setup()
    c = dict(c, couple=False)
    return ds, g, c, D, sz


def task(th):
    R.setup = setup_nocouple
    out = R.bisect(("quiet+O", th))
    return dict(th=th, rc=out["rc"])


if __name__ == "__main__":
    with Pool(4) as p:
        out = p.map(task, [0.0, 45.0, 90.0, 135.0], chunksize=1)
    json.dump(dict(runs=out), open(os.path.join(HERE, "posthoc_couple.json"), "w"))
    for o in out:
        rc = np.array(o["rc"]); print(o["th"], "median r_c", float(np.median(np.where(rc < 0, 3.0, rc))), "censored", int((rc < 0).sum()))
    print("DONE")
