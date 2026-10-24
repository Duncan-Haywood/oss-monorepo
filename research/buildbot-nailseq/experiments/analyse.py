"""Fire the 62-nail schedule in sequence against the saved recoil traces (traces.npz).
`python3 experiments/analyse.py > results.txt` also writes results.json. NumPy only."""
import json
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
for rel in ("../src", "../../buildbot-custom/src", "../../buildbot-studfind/src"):
    sys.path.insert(0, str(HERE / rel))

from buildbot_nailseq import model as M

Z = np.load(HERE / "traces.npz")
META = json.loads((HERE / "traces.json").read_text())
V = [0.25, 0.5, 1.0, 2.0, 4.0]       # tip speed between nails, m/s (swept; no G1 figure found)
ACCS = [2.0, 10.0]                   # m/s^2 (swept; my choice)
EPS = [0.25e-3, 0.5e-3, 1e-3, 2e-3, 4e-3, float("inf")]
S_ROBOT = 0.9e-3                     # buildbot-fasten, G1 with 11-bit joint sensors
S_STUD = [0.0, 1.0e-3]            # stud-finding scatter, swept
T_FIRE = 0.1                         # s per nail to trigger and seat (my choice)
HAND_BASELINE_S = 372.0              # buildbot-taskbook minutes (an estimate, not a time study)


def trace(key):
    a = Z[key].astype(float)
    return {"t": a[:, 0], "dy": a[:, 2], "dz": a[:, 3], "wall": a[:, 4]}


def legs_summary(seq):
    out = {}
    for v in V:
        for a in ACCS:
            l = M.legs(seq, v, a)
            out[f"v{v}_a{a}"] = {"min_leg_s": min(l), "median_leg_s": float(np.median(l)), "travel_s": sum(l)}
    return out


def main():
    seq = M.sequence()
    rows, dwell = [], []
    keys = sorted(Z.files)
    for key in keys:
        h, f, d, J = key.split("_")
        tr = trace(key)
        for eps in EPS[:-1]:
            t0, _, _ = M.fire_time(tr, 0.0, eps)       # the dwell with no move at all
            dwell.append({"pose": h[1:], "f": int(f[1:]), "delay_ms": int(d[1:]), "J": float(J[1:]), "eps_mm": eps * 1e3, "dwell_s": t0})
        for v, ACC in [(v, a) for v in V for a in ACCS]:
            for eps in EPS:
                need = np.isfinite(eps)      # eps = inf is the "fire when the move ends" policy: no waiting
                tot, res = M.sheet_time(seq, v, ACC, tr, eps, T_FIRE, need_wall=need)
                # nails that would be fired with the nosepiece still off the wall (only when we do not wait for it)
                lost_end = tr["t"][np.flatnonzero(tr["wall"] <= 1e-9)[-1]] if (tr["wall"] <= 1e-9).any() else 0.0
                off_wall = int(sum(l < lost_end for l in M.legs(seq, v, ACC)[1:])) if not need else 0
                for ss in S_STUD:
                    p, miss = M.p_clean(seq, ss, S_ROBOT, res, trials=10000)
                    rows.append({"pose": h[1:], "f": int(f[1:]), "delay_ms": int(d[1:]), "J": float(J[1:]), "v": v, "acc": ACC,
                                 "eps_mm": eps * 1e3, "s_stud_mm": ss * 1e3, "sheet_s": tot,
                                 "off_wall": off_wall, "max_resid_mm": float(np.abs(res).max() * 1e3), "p_clean": p, "missed": miss})
    (HERE / "results.json").write_text(json.dumps({"rows": rows, "dwell": dwell, "legs": legs_summary(seq)}, indent=1, default=float))
    print("# pose f_hz delay_ms J_Ns v acc eps_mm s_stud_mm sheet_s max_resid_mm p_clean nails_missed off_wall_nails")
    for r in rows:
        print(f"{r['pose']} {r['f']} {r['delay_ms']} {r['J']} {r['v']} {r['acc']} {r['eps_mm']:.2f} {r['s_stud_mm']:.1f} "
              f"{r['sheet_s']:.1f} {r['max_resid_mm']:.2f} {r['p_clean']:.3f} {r['missed']:.2f} {r['off_wall']}")


if __name__ == "__main__":
    main()
