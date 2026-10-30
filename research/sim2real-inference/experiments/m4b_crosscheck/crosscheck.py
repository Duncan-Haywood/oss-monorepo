"""Milestone 4b: cross-check the PDF-transcribed SIMPLER tables (../m4_simpler/data.py) against the authors' own
REAL_PERF / SIMPLER_PERF dicts (simpler_env/utils/metrics.py, copied to upstream_perf.py).
python3 crosscheck.py -> results/crosscheck.txt, and results/sensitivity.txt (m4 analysis re-run on the upstream values)."""
import os, sys, importlib.util
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "m4_simpler"))
import data
from upstream_perf import REAL_PERF, SIMPLER_PERF

TASK = {("google", "pick_coke_can"): "google_robot_pick_coke_can", ("google", "move_near"): "google_robot_move_near",
        ("google", "open_drawer"): "google_robot_open_drawer", ("google", "close_drawer"): "google_robot_close_drawer",
        ("widowx", "spoon_on_towel"): "widowx_spoon_on_towel", ("widowx", "carrot_on_plate"): "widowx_carrot_on_plate",
        ("widowx", "stack_blocks"): "widowx_stack_cube", ("widowx", "eggplant_basket"): "widowx_put_eggplant_in_basket"}
POL = {"RT-1 (Converged)": "rt-1-converged", "RT-1 (15%)": "rt-1-15pct", "RT-1-X": "rt-1-x", "RT-2-X": "rt-2-x",
       "Octo-Base": "octo-base", "RT-1 (Begin)": "rt-1-begin", "Octo-Small": "octo-small"}

def compare():
    diffs, n = [], 0
    for robot, task, p, nr, real, sim in data.rows():
        t, q = TASK[(robot, task)], POL[p]
        for kind, ours, up in (("real", real, REAL_PERF[t][q]), ("sim", sim, SIMPLER_PERF[t][q])):
            n += 1
            if abs(ours - up) > 0.0006:
                diffs.append((task, p, kind, ours, up))
    return n, diffs

def main():
    n, diffs = compare()
    lines = ["compared %d values (36 cells x real, sim); tolerance 0.0006" % n, "differences: %d" % len(diffs)]
    lines += ["  %-16s %-17s %-4s ours %.3f upstream %.3f" % d for d in diffs]
    used = {TASK[k] for k in TASK}
    extra = [t for t in REAL_PERF if t not in used]
    lines.append("upstream tasks not in m4: " + ", ".join(extra))
    open(os.path.join(HERE, "results", "crosscheck.txt"), "w").write("\n".join(lines) + "\n")
    print("\n".join(lines))

if __name__ == "__main__":
    main()
