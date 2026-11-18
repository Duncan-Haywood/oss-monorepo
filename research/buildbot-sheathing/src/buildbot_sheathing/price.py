"""Milestone 13: what the single-2x remedies cost, per clean sheet, on measured studs.

Milestone 12 scored four remedies on the clean-sheet rate (per-nail reads, a mid push, a slide and
a shim); milestone 7 priced pipelines that had none of them. This module adds the seconds each
remedy takes to milestone 7's cost model (`cost.robot_cost`), so a pipeline's dollars per clean
sheet include its own sensing and handling time as well as the re-drive of every missed nail.

Sensing hardware for the stud reads:

* ``point``: one read at a time, milestone 7's t_read each (three reads: 3 a stud; dense: 17 a stud;
  local: 17 on the new joint stud and 7 on each of the two new field studs).
* ``line``: a line laser swept along each of the three new studs, 3 x stud length / v. Only dense and
  local reads use it; a three-read pipeline keeps its point reads.

Both sheet edges are read after tacking (2 point reads); the slide and shim add 2 more edge reads
(the shim reads the left edge at the two end joint-nail heights, milestone 10) and their own handling
seconds. The mid push adds its seconds (milestone 9). Units: metres, seconds, dollars.
"""
import numpy as np

from .asbuilt import STUD_LEN, U_FIELD, U_JOINT
from . import cost as K

NEW_STUDS = 3                  # per sheet in a row: one joint stud and two field studs are new
EDGE_READS = 2
SHIM_READS = 2
POLICY_READS = {"three": 3 * NEW_STUDS, "dense": len(U_JOINT) * NEW_STUDS,
                "local": len(U_JOINT) + 2 * len(U_FIELD)}


def stud_reads(policy):
    """Point reads of the three new studs a sheet."""
    return POLICY_READS[policy]


def sweep_seconds(v, n_studs=NEW_STUDS, length=STUD_LEN):
    """Seconds to sweep a line laser along ``n_studs`` studs at ``v`` m/s."""
    return n_studs * length / np.asarray(v, float)


def reads_spec(policy, hw, slide_shim, push, t):
    """Milestone 7's ``reads`` argument for one pipeline: point reads ``n`` (each t_read), ledger on,
    and ``extra`` seconds (sweep, push, slide and shim). ``t`` holds arrays t_push, t_ss and v."""
    if hw == "line" and policy == "three":
        raise ValueError("a three-read pipeline uses point reads")
    n = EDGE_READS + (SHIM_READS if slide_shim else 0)
    extra = 0.0
    if hw == "point":
        n += stud_reads(policy)
    elif hw == "line":
        extra = extra + sweep_seconds(t["v"])
    else:
        raise ValueError(hw)
    if push:
        extra = extra + t["t_push"]
    if slide_shim:
        extra = extra + t["t_ss"]
    return {"n": n, "ledger": True, "extra": extra}


def draw_times(n, seed=29):
    """The unsourced seconds of milestone 13, swept: push U(10, 40) s (milestone 9's range), slide and
    shim U(5, 30) s, line-laser speed log-uniform 0.05-0.5 m/s."""
    rng = np.random.default_rng(seed)
    return {"t_push": rng.uniform(10.0, 40.0, n), "t_ss": rng.uniform(5.0, 30.0, n),
            "v": np.exp(rng.uniform(np.log(0.05), np.log(0.5), n))}


def pipeline_cost(p, t, volume, missed, policy, hw, slide_shim, push, doubled=False, cls="base"):
    """Dollars per clean sheet (arrays over draws) for one pipeline."""
    return K.robot_cost(cls, p, volume, missed, reads_spec(policy, hw, slide_shim, push, t), doubled)


def breakeven_per_nail(c_doubled, c_single, missed_single, missed_doubled=0.0):
    """Extra dollars a missed nail must cost, beyond its re-drive, for doubled joints to tie."""
    return (np.asarray(c_doubled) - np.asarray(c_single)) / (np.asarray(missed_single) - missed_doubled)
