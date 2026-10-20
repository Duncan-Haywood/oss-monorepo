"""Write experiments/blocked_push.svg: peak and steady contact force of a blocked feeding arm, parsed from results.txt.

    python experiments/figure.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()
xs, ys = table(TEXT, "# Sweep 1", 0, [1, 2, 3])
write_lines(HERE, "blocked_push.svg", "Blocked feeding arm: MuJoCo contact force against approach speed",
            "Line plot against approach speed in metres per second of the controller push KP times LEAD times speed, MuJoCo's steady force which equals it, and MuJoCo's peak force which is 1.84 times higher",
            "approach speed (m/s)", "contact force (N)",
            [("controller push", xs, ys[0]), ("MuJoCo peak", xs, ys[1]), ("MuJoCo steady", xs, ys[2])])
