"""Milestone 7ak: what kills the flights the describing function says survive? An excitation ablation at the two knees.

Milestone 7aj's describing function (DF) of the 20 deg tilt-command clip predicts the limit cycle's frequency and amplitude but
undercounts deaths near the knee (bolted-on at 20 deg: 4 predicted, 128 of 640 simulated; 1.25x at 45 deg: 285 against 535).
Here the episode's six excitation factors are switched off one at a time and all together, on the three `above` sets with
deaths near a knee (milestone 12g's designs, ten seeds each, 64 held-out flights of seed 9999, lever 0, 18 s):

  O  start offset, +-0.5 m per axis        (quiet keeps +-1 cm so an unstable hover has something to grow from)
  M  mean wind 3 m/s                        (rollout gust_mean = 0; the step, if on, is then from 0)
  W  wind step at 3 s, +-3 m/s             (rollout wind_step = 0)
  G  turbulence                             (rollout gust_std = 0, which also removes the random initial gust)
  S  sensor noise: position, velocity, gyro, angle
  Y  the +-30 deg yaw steps

O, S and Y are switched off by wrapping `poshold.reference` (rollout looks it up at call time); every other draw is unchanged.
Arms: full, full - X, quiet, quiet + X. Per flight: diverged (18 s), and if alive the worst-axis tilt amplitude
sqrt(2) std(theta) over t = 9-18 s, as 7aj measured it. Predictions DK0-DK7 in ../../LOG.md, committed before this file.
"""
import importlib.util, json, os, sys, time, warnings
from multiprocessing import Pool
import numpy as np

warnings.filterwarnings("ignore")
np.seterr(all="ignore")
HERE = os.path.dirname(os.path.abspath(__file__))
EXP = os.path.join(HERE, "..")
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
from codesign_cant import poshold as P  # noqa: E402

_spec = importlib.util.spec_from_file_location("m7aj", os.path.join(EXP, "m7aj_descfn", "run.py"))
M7 = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(M7)

FACTORS = "OMWGSY"
ARMS = {"full": set(FACTORS)}
ARMS.update({f"full-{x}": set(FACTORS) - {x} for x in FACTORS})
ARMS["quiet"] = set()
ARMS.update({f"quiet+{x}": {x} for x in FACTORS})
SETCAP = {"bolted": 20.0, "1.25x": 45.0, "retrained": 45.0}
QUIET_OFFSET = 0.02            # share of the 0.5 m offset kept when O is off (+-1 cm)
_REF = P.reference


def conds_by_set():
    conds, _ = M7.conditions()
    idx = {s: [i for i, c in enumerate(conds) if M7.SETS[c["label"]] == s] for s in SETCAP}
    return conds, idx


def fly(arg):
    arm, st = arg
    on = ARMS[arm]
    conds, idx = conds_by_set()
    cs = [conds[i] for i in idx[st]]

    def ref(episodes, seed, steps=None):
        yaw, gust_n, gyro_n, ang_n, u0, off, pn, vn, wsign = _REF(episodes, seed, steps)
        if "O" not in on:
            off = off * QUIET_OFFSET
        if "S" not in on:
            gyro_n, ang_n, pn, vn = (np.zeros_like(a) for a in (gyro_n, ang_n, pn, vn))
        if "Y" not in on:
            yaw = np.zeros_like(yaw)
        return yaw, gust_n, gyro_n, ang_n, u0, off, pn, vn, wsign

    P.reference = ref                                       # this worker only
    P.TILT_CMD_MAX = np.deg2rad(SETCAP[st])
    sz, g, kap = M7.sizes(cs)
    sp = M7.Spec(int(round(M7.T0 / M7.A.DT)))
    o = P.rollout(sz, g, kap, M7.TEST_EP, M7.TEST_SEED, dist_sign=P.cop_signs(1.0), lever_scale=0.0, ff=1.0, ff_mode="integ",
                  steps=M7.STEPS18, trace_tilt=sp,
                  gust_mean=3.0 if "M" in on else 0.0, wind_step=P.WIND_STEP if "W" in on else 0.0,
                  gust_std=4.0 if "G" in on else 0.0)
    th = np.stack(sp.rows, 0).astype(float)                  # (T, N, E, 2)
    amp = np.sqrt(2.0) * (th - th.mean(0)).std(0)            # (N, E, 2)
    dead = o["dead_ep"]
    amp = np.where(dead[:, :, None], np.nan, amp)
    return dict(arm=arm, set=st, dead=dead.astype(int).tolist(), amp_deg=np.round(np.rad2deg(amp), 4).tolist())


def main():
    t0 = time.time()
    conds, idx = conds_by_set()
    assert [len(idx[s]) for s in SETCAP] == [10, 10, 10]
    tasks = [(a, s) for a in ARMS for s in SETCAP]
    with Pool(4) as p:
        out = p.map(fly, tasks, chunksize=1)
    d12 = json.load(open(os.path.join(EXP, "m12g_ten_seeds_7c7d", "results.json")))["m7d"]
    stored = {t["cap"]: t["dead"] for t in d12["tilt"] if t["hz"] == 18}
    stored_set = {s: [stored[SETCAP[s]][i] for i in idx[s]] for s in SETCAP}
    json.dump(dict(arms={a: sorted(v) for a, v in ARMS.items()}, setcap=SETCAP, idx=idx, quiet_offset=QUIET_OFFSET,
                   runs=out, stored_dead=stored_set, wall_s=time.time() - t0),
              open(os.path.join(HERE, "results.json"), "w"))
    print(f"wall time {time.time() - t0:.0f} s")


if __name__ == "__main__":
    main()
