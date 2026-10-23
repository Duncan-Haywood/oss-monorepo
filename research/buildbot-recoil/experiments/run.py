"""Sweep the recoil impulse, the PD stiffness, the loop delay, the wall stiffness and the
preload on the Menagerie G1. `python3 experiments/run.py` writes results.json and results.txt."""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
for rel in ("../src", "../../buildbot-payload/src", "../../buildbot-fasten/src"):
    sys.path.insert(0, str(HERE / rel))

from buildbot_payload import model as P
from buildbot_recoil import model as R

IMPULSE = [0.25, 0.5, 1, 2, 4, 8]       # N s, swept: no source found
FREQ = [2, 4, 8, 12]                    # Hz, joint PD natural frequency, swept
DELAY = [0.0, 0.01, 0.02]               # s, loop delay, swept
KWALL = [2e4, 1e5, 1e6]                 # N/m
PRELOAD = [10, 30, 60]                  # N


def shot(s, robot, J, f, delay=0.0, k=1e5):
    c = 350.0 * (k / 1e5) ** 0.5            # damping ratio held at about 0.3
    base = R.fire(s, robot, 0.0, f, delay=delay, k_wall=k, c_wall=c)
    r = R.summarize(R.fire(s, robot, J, f, delay=delay, k_wall=k, c_wall=c), base)
    # a hold that drifts more than 2 mm from its pose in the last 0.3 s with no shot is unstable
    r["stable"] = bool(abs(base[-600:, 1:4]).max() < 2e-3)
    return r


def main():
    robot = P.load("g1")
    rows = []
    s = R.setup(robot, force=30.0)
    for f in FREQ:
        for dl in DELAY:
            for J in IMPULSE:
                rows.append({"group": "A", "preload": 30.0, "k": 1e5, "f": f, "delay": dl, "J": J, **shot(s, robot, J, f, dl)})
    for k in KWALL:
        for J in IMPULSE:
            rows.append({"group": "B", "preload": 30.0, "k": k, "f": 8, "delay": 0.01, "J": J, **shot(s, robot, J, 8, 0.01, k)})
    for F in PRELOAD:
        sF = R.setup(robot, force=float(F))
        for J in IMPULSE:
            rows.append({"group": "C", "preload": float(F), "k": 1e5, "f": 8, "delay": 0.01, "J": J, **shot(sF, robot, J, 8, 0.01)})
    (HERE / "results.json").write_text(json.dumps(rows, indent=1))
    lines = ["group preload k f_hz delay J_Ns peak_yz_mm peak_back_mm lost_ms settle_ms in_window stable"]
    for r in rows:
        lines.append(f"{r['group']} {r['preload']:.0f} {r['k']:.0e} {r['f']} {r['delay']} {r['J']} {r['peak_yz_mm']:.3f} "
                     f"{r['peak_back_mm']:.3f} {r['lost_s']*1e3:.1f} {r['settle_s']*1e3:.0f} {int(r['in_window'])} {int(r['stable'])}")
    (HERE / "results.txt").write_text("\n".join(lines) + "\n")
    lines += ["", "# largest swept impulse (N s) that keeps the tip within 3.9 mm (J_win) and keeps the wall contact (J_hold),"
              "# group A, stable holds only; '-' = even 0.25 N s fails or the hold is unstable"]
    lines.append("f_hz delay J_win J_hold")
    for f in FREQ:
        for dl in DELAY:
            g = [r for r in rows if r["group"] == "A" and r["f"] == f and r["delay"] == dl]
            if not g[0]["stable"]:
                lines.append(f"{f} {dl} - -")
                continue
            win = [r["J"] for r in g if r["in_window"] and r["settle_s"] < 1.4]
            hold = [r["J"] for r in g if r["lost_s"] == 0]
            lines.append(f"{f} {dl} {max(win) if win else '-'} {max(hold) if hold else '-'}")
    (HERE / "results.txt").write_text("\n".join(lines) + "\n")
    print(len(rows), "shots")


if __name__ == "__main__":
    main()
